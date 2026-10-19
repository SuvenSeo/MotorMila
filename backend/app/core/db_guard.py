"""Database outage handling: circuit breaker + error classification.

Why: when Neon is unreachable (free-tier quota / egress block) every request
used to spend the full libpq connect timeout on a dead database and then
surface as HTTP 500 "Internal server error". Clients and monitors could not
tell an outage from a bug, auth-gated calls burned ~1.5 s before a 401, and
the single cpu-basic worker was saturated by doomed connects.

This module provides:

* ``breaker`` - a tiny thread-safe circuit breaker. After a connect failure
  the circuit opens for ``DB_BREAKER_OPEN_SECONDS`` (default 15 s); while it
  is open, connects fail immediately with :class:`DatabaseUnavailable`
  instead of waiting for a socket timeout. After the open window exactly one
  "half-open" trial connect is allowed; success closes the circuit.
* ``is_db_unavailable_error(exc)`` - classifies connection-type failures
  (as opposed to query bugs such as "no such table") so the global exception
  handler can answer 503 + ``Retry-After`` for outages and keep 500 for bugs.

The breaker is installed on Postgres engines by ``db.session._make_engine``
via the ``do_connect`` event; SQLite engines (tests, failover file) never use
it.
"""

from __future__ import annotations

import contextvars
import os
import threading
import time
from contextlib import contextmanager
from typing import Optional


class DatabaseUnavailable(RuntimeError):
    """Raised when the primary database is known to be unreachable."""


def _env_float(name: str, default: float, minimum: float) -> float:
    raw = os.getenv(name, "").strip()
    try:
        return max(minimum, float(raw)) if raw else default
    except ValueError:
        return default


def retry_after_seconds() -> int:
    return int(_env_float("DB_RETRY_AFTER_SECONDS", 30, 1))


def connect_timeout_seconds() -> int:
    """libpq connect_timeout for remote Postgres (integer seconds, >= 1)."""
    return int(_env_float("DB_CONNECT_TIMEOUT_SECONDS", 3, 1))


# Bypass flag: the health probe and the failover monitor must test the real
# database even while the circuit is open, otherwise they could never observe
# recovery.
_bypass: contextvars.ContextVar[bool] = contextvars.ContextVar("db_breaker_bypass", default=False)


@contextmanager
def bypass_breaker():
    token = _bypass.set(True)
    try:
        yield
    finally:
        _bypass.reset(token)


class CircuitBreaker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._open_until = 0.0
        self._trial_in_flight = False
        self._consecutive_failures = 0
        self._last_error: Optional[str] = None
        self._last_failure_at: Optional[float] = None
        self._last_success_at: Optional[float] = None

    @staticmethod
    def open_seconds() -> float:
        return _env_float("DB_BREAKER_OPEN_SECONDS", 15, 1)

    def enabled(self) -> bool:
        return os.getenv("DB_BREAKER_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}

    def is_open(self, now: Optional[float] = None) -> bool:
        now = time.time() if now is None else now
        with self._lock:
            return self._consecutive_failures > 0 and now < self._open_until

    def before_connect(self, now: Optional[float] = None) -> bool:
        """Return True when this connect may proceed and is a half-open trial.

        Raises DatabaseUnavailable when the circuit is open (or a trial is
        already running).
        """
        if not self.enabled() or _bypass.get():
            return False
        now = time.time() if now is None else now
        with self._lock:
            if self._consecutive_failures == 0:
                return False
            if now < self._open_until or self._trial_in_flight:
                raise DatabaseUnavailable(
                    "Database temporarily unavailable (circuit open): "
                    + (self._last_error or "previous connect failed")
                )
            self._trial_in_flight = True
            return True

    def record_success(self) -> None:
        with self._lock:
            self._consecutive_failures = 0
            self._open_until = 0.0
            self._trial_in_flight = False
            self._last_success_at = time.time()

    def record_failure(self, exc: BaseException) -> None:
        with self._lock:
            self._consecutive_failures += 1
            self._trial_in_flight = False
            now = time.time()
            self._last_failure_at = now
            # Keep the message short and credential-free (libpq errors carry
            # host names but never passwords).
            self._last_error = (str(exc).strip().splitlines() or [type(exc).__name__])[0][:200]
            self._open_until = now + self.open_seconds()

    def reset(self) -> None:
        with self._lock:
            self._open_until = 0.0
            self._trial_in_flight = False
            self._consecutive_failures = 0
            self._last_error = None

    def snapshot(self) -> dict:
        now = time.time()
        with self._lock:
            open_ = self._consecutive_failures > 0 and now < self._open_until
            return {
                "state": "open" if open_ else ("half_open" if self._consecutive_failures else "closed"),
                "consecutive_failures": self._consecutive_failures,
                "last_error": self._last_error,
                "retry_in_seconds": max(0, int(self._open_until - now)) if open_ else 0,
            }


breaker = CircuitBreaker()


_CONNECTION_ERROR_MARKERS = (
    "could not connect",
    "connection refused",
    "connection timed out",
    "timeout expired",
    "could not translate host name",
    "server closed the connection",
    "terminating connection",
    "connection to server",
    "connection reset",
    "connection not open",
    "ssl syscall error",
    "ssl connection has been closed",
    "too many connections",
    "remaining connection slots",
    "exceeded the data transfer quota",
    "data transfer quota",
    "compute time quota",
    "endpoint is disabled",
    "your account or project has exceeded",
    "the database system is starting up",
    "the database system is shutting down",
    "network is unreachable",
    "no route to host",
    "name or service not known",
    "temporary failure in name resolution",
    "circuit open",
)


def is_db_unavailable_error(exc: BaseException) -> bool:
    """True for connection/outage failures; False for query bugs."""
    if isinstance(exc, DatabaseUnavailable):
        return True
    try:
        from sqlalchemy import exc as sa_exc
    except Exception:  # pragma: no cover
        return False

    if isinstance(exc, sa_exc.TimeoutError):  # pool checkout timeout
        return True
    if isinstance(exc, sa_exc.DBAPIError):
        if getattr(exc, "connection_invalidated", False):
            return True
        orig = getattr(exc, "orig", None)
        if isinstance(orig, DatabaseUnavailable):
            return True
        if isinstance(exc, (sa_exc.OperationalError, sa_exc.InterfaceError)):
            message = f"{exc} {orig or ''}".lower()
            return any(marker in message for marker in _CONNECTION_ERROR_MARKERS)
        return False
    # Raw driver errors that escaped SQLAlchemy wrapping.
    name = type(exc).__name__
    if name in {"OperationalError", "InterfaceError"}:
        message = str(exc).lower()
        return any(marker in message for marker in _CONNECTION_ERROR_MARKERS)
    return False


def find_db_unavailable(exc: BaseException) -> Optional[BaseException]:
    """Walk the exception chain looking for an outage-type failure."""
    seen = set()
    current: Optional[BaseException] = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if is_db_unavailable_error(current):
            return current
        current = current.__cause__ or current.__context__
    return None


def install_breaker(engine) -> None:
    """Attach the circuit breaker to a (Postgres) SQLAlchemy engine."""
    from sqlalchemy import event

    @event.listens_for(engine, "do_connect")
    def _guarded_connect(dialect, conn_rec, cargs, cparams):  # noqa: ANN001
        breaker.before_connect()
        try:
            conn = dialect.connect(*cargs, **cparams)
        except Exception as exc:
            breaker.record_failure(exc)
            raise
        breaker.record_success()
        return conn
