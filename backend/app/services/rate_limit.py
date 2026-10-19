"""Rate limiting for Motormila API.

Supports two backends:
  1. Redis sliding-window (multi-worker, survives restarts)
  2. In-memory sliding-window (fallback when REDIS_URL is not set)

Both expose the same `RateLimiter` class so callers don't need to care.
Used as a FastAPI dependency: Depends(rate_limiter_instance)
"""

from __future__ import annotations

import hashlib
import itertools
import os
import sys
import threading
import time
from collections.abc import Callable
from typing import Any

import structlog
from fastapi import HTTPException, Request

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Redis singleton (lazy init, sync client)
# ---------------------------------------------------------------------------

_redis_client: Any | None = None
_redis_initialized = False


def _get_redis():
    """Return a sync Redis connection, or None if REDIS_URL is unset."""
    global _redis_client, _redis_initialized

    if _redis_initialized:
        return _redis_client

    _redis_initialized = True
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        logger.info("rate_limiter_backend", backend="in-memory", reason="REDIS_URL not set")
        return None

    try:
        import redis

        _redis_client = redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        # Verify connectivity
        _redis_client.ping()
        logger.info("rate_limiter_backend", backend="redis", url_prefix=redis_url[:25] + "...")
        return _redis_client
    except Exception as exc:
        logger.warning("rate_limiter_redis_unavailable", error=str(exc))
        _redis_client = None
        return None


# ---------------------------------------------------------------------------
# Client key derivation (shared by both backends)
# ---------------------------------------------------------------------------

def _client_key(request: Request) -> str:
    """Derive a per-client key from IP only.

    User-Agent is deliberately NOT part of the key: rotating UA strings used
    to multiply every limit (e.g. unlimited login brute-force buckets).
    Uses the RIGHTMOST X-Forwarded-For hop (appended by the nearest trusted
    proxy) — leftmost entries are client-supplied and could be forged.
    """
    forwarded_for = str(request.headers.get("x-forwarded-for") or "")
    last_hop = forwarded_for.rsplit(",", 1)[-1].strip()
    client_host = getattr(getattr(request, "client", None), "host", None)
    ip = last_hop or str(client_host or "unknown")
    return ip


def _session_identity(request: Request) -> str | None:
    """Stable hash of the signed-in account when the request carries a valid token.

    Lets per-user buckets follow the account instead of the IP (many users
    share a carrier NAT / the Vercel proxy egress IP). Imported lazily: the
    auth module itself imports this module.
    """
    try:
        headers = getattr(request, "headers", None) or {}
        auth_value = str(headers.get("authorization") or "")
        token = auth_value[7:].strip() if auth_value.lower().startswith("bearer ") else ""
        if not token:
            cookies = getattr(request, "cookies", None) or {}
            token = str(cookies.get("mm_session") or "").strip()
        if not token:
            return None
        from app.api.v1.endpoints.auth import verify_token

        payload = verify_token(token)
        email = str((payload or {}).get("email") or "").strip().lower()
        if not email:
            return None
        return hashlib.sha256(email.encode()).hexdigest()[:24]
    except Exception:
        return None


def user_or_ip_key(request: Request) -> str:
    """Per-account bucket for signed-in callers, per-IP otherwise."""
    identity = _session_identity(request)
    if identity:
        return f"u:{identity}"
    return f"ip:{_client_key(request)}"


# ---------------------------------------------------------------------------
# Redis sliding-window limiter (sync, used from FastAPI dependency threads)
# ---------------------------------------------------------------------------

_SLIDING_WINDOW_SCRIPT = """
local key       = KEYS[1]
local limit     = tonumber(ARGV[1])
local window    = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])

-- Evict entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

local count = redis.call('ZCARD', key)

if count < limit then
    -- Allow: record this request with a unique score (timestamp + random tiebreaker)
    redis.call('ZADD', key, now, tostring(now) .. '.' .. tostring(math.random(100000)))
    redis.call('EXPIRE', key, window)
    return {count + 1, limit, 0}
else
    -- Block: find oldest entry to compute retry-after
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = 0
    if oldest[2] then
        retry_after = math.ceil(tonumber(oldest[2]) + window - now)
    else
        retry_after = window
    end
    return {count, limit, retry_after}
end
"""


class _RedisRateLimiter:
    """Sliding-window rate limiter backed by Redis sorted sets.

    Key structure: rl:{tier}:{identifier}:{window_bucket}
    Uses Lua script for atomic check-and-increment.
    """

    def __init__(self, redis_client) -> None:
        self._redis = redis_client
        self._script_sha: str | None = None

    def _ensure_script(self) -> str:
        if self._script_sha is None:
            self._script_sha = self._redis.script_load(_SLIDING_WINDOW_SCRIPT)
        return self._script_sha

    def check(
        self,
        key: str,
        *,
        limit: int,
        window: int,
        now: float | None = None,
    ) -> dict[str, Any]:
        now = time.time() if now is None else now
        bucket = int(now // window)
        redis_key = f"rl:{key}:{bucket}"

        sha = self._ensure_script()
        result = self._redis.evalsha(
            sha,
            1,           # number of KEYS
            redis_key,   # KEYS[1]
            limit,       # ARGV[1]
            window,      # ARGV[2]
            now,         # ARGV[3]
        )

        count, allowed_limit, retry_after = result
        return {
            "allowed": retry_after == 0,
            "limit": allowed_limit,
            "remaining": max(0, allowed_limit - count),
            "reset": int(now + retry_after) if retry_after > 0 else int(now) + window,
            "retry_after": retry_after,
        }


# ---------------------------------------------------------------------------
# In-memory sliding-window limiter (fallback)
# ---------------------------------------------------------------------------

class _InMemoryRateLimiter:
    """Per-process sliding-window rate limiter.

    Does NOT share state across workers or survive restarts.
    """

    def __init__(self) -> None:
        self._buckets: dict[str, list[float]] = {}

    def check(
        self,
        key: str,
        *,
        limit: int,
        window: int,
        now: float | None = None,
    ) -> dict[str, Any]:
        now = time.time() if now is None else now
        cutoff = now - window

        hits = [t for t in self._buckets.get(key, []) if t >= cutoff]

        if len(hits) >= limit:
            oldest = hits[0] if hits else now
            retry_after = int(oldest + window - now) + 1
            return {
                "allowed": False,
                "limit": limit,
                "remaining": 0,
                "reset": int(oldest + window),
                "retry_after": retry_after,
            }

        hits.append(now)
        self._buckets[key] = hits

        # Periodic stale-key cleanup
        if len(self._buckets) > 500:
            stale = [k for k, v in self._buckets.items() if not any(t >= cutoff for t in v)]
            for k in stale[:200]:
                self._buckets.pop(k, None)

        return {
            "allowed": True,
            "limit": limit,
            "remaining": max(0, limit - len(hits)),
            "reset": int(now) + window,
            "retry_after": 0,
        }


# ---------------------------------------------------------------------------
# Singleton backend instance
# ---------------------------------------------------------------------------

_backend: _RedisRateLimiter | _InMemoryRateLimiter | None = None


def _get_backend():
    global _backend
    if _backend is not None:
        return _backend
    redis = _get_redis()
    _backend = _RedisRateLimiter(redis) if redis is not None else _InMemoryRateLimiter()
    return _backend


# ---------------------------------------------------------------------------
# Public API — drop-in replacement for old RateLimiter class
# ---------------------------------------------------------------------------

_tier_counter = itertools.count(1)


def _default_tier() -> str:
    """Namespace for a limiter created without an explicit tier.

    Previously every limiter shared one bucket per IP (the tier was stored
    but never used), so browsing /listings consumed the login budget and vice
    versa. The default namespace is the defining module + a per-process
    sequence number, which is stable for a given deploy.
    """
    try:
        module = sys._getframe(2).f_globals.get("__name__", "anon")
    except Exception:  # pragma: no cover
        module = "anon"
    return f"{module.rsplit('.', 1)[-1]}#{next(_tier_counter)}"


class RateLimiter:
    """Sliding-window rate limiter with Redis or in-memory backend.

    Each limiter has its own bucket namespace (``tier``), and the default key
    is per signed-in account, falling back to per-IP (``user_or_ip_key``).

    Usage (unchanged from before — sync, used as FastAPI dependency):
        _limiter = RateLimiter(max_requests=60, window_seconds=60)
        router = APIRouter(dependencies=[Depends(_limiter)])

    When Redis is configured, state is shared across workers and survives
    restarts. Otherwise falls back to in-memory per-process tracking.
    """

    def __init__(
        self,
        *,
        max_requests: int,
        window_seconds: int,
        message: str = "Too many requests. Try again shortly.",
        key_func: Callable[[Request], str] | None = None,
        tier: str | None = None,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.message = message
        self._key_func = key_func or user_or_ip_key
        self._tier = tier or _default_tier()

    @property
    def tier(self) -> str:
        return self._tier

    def __call__(self, request: Request, *, now: float | None = None) -> None:
        backend = _get_backend()
        key = f"{self._tier}:{self._key_func(request)}"

        result = backend.check(
            key,
            limit=self.max_requests,
            window=self.window_seconds,
            now=now,
        )

        # Expose headers for downstream middleware (add_rate_limit_headers)
        if hasattr(request, "state"):
            request.state.rate_limit = result
            # Store metadata in request.state so the response middleware can forward headers.
            # Uses getattr-style access so test doubles without .state are handled gracefully.
            state = getattr(request, "state", None)
            if state is not None:
                state.ratelimit_headers = {
                    "RateLimit-Limit": str(result["limit"]),
                    "RateLimit-Remaining": str(result["remaining"]),
                    "RateLimit-Reset": str(result["reset"]),
                }

        if not result["allowed"]:
            raise HTTPException(
                status_code=429,
                detail=self.message,
                headers={
                    "Retry-After": str(result["retry_after"]),
                    "RateLimit-Limit": str(result["limit"]),
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(result["reset"]),
                },
            )

    def reset(self) -> None:
        """Clear all rate-limit state (for test teardown only)."""
        backend = _get_backend()
        if isinstance(backend, _InMemoryRateLimiter):
            backend._buckets.clear()


# ---------------------------------------------------------------------------
# Login brute-force throttle (checked BEFORE password verification)
# ---------------------------------------------------------------------------


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return max(1, int(raw)) if raw else default
    except ValueError:
        return default


class LoginThrottle:
    """Failed-login tracking per account and per IP, with exponential backoff.

    * ``check(ip, email)`` runs before any bcrypt work; while an account or IP
      is locked it raises 429 - even for the correct password, otherwise the
      lockout would still be a password oracle.
    * Per account: after ``LOGIN_ACCOUNT_MAX_FAILURES`` (default 5) failures in
      ``LOGIN_FAILURE_WINDOW_SECONDS`` (default 900) the account is locked for
      30 s, doubling per further failure, capped at ``LOGIN_MAX_LOCKOUT_SECONDS``
      (default 900).
    * Per IP: ``LOGIN_IP_MAX_FAILURES`` (default 30) failures in the window
      locks that IP until the oldest failure ages out. Deliberately generous
      because carrier NAT / office Wi-Fi share addresses.
    * A successful login clears the account's failures (not the IP's).

    State is per process (HF runs one uvicorn worker). Emails are stored only
    as SHA-256 prefixes.
    """

    def __init__(self, message: str = "Too many sign-in attempts. Try again shortly.") -> None:
        self.message = message
        self._lock = threading.Lock()
        self._fails: dict[str, list[float]] = {}

    # -- config ----------------------------------------------------------
    @staticmethod
    def window() -> int:
        return _env_int("LOGIN_FAILURE_WINDOW_SECONDS", 900)

    @staticmethod
    def account_max() -> int:
        return _env_int("LOGIN_ACCOUNT_MAX_FAILURES", 5)

    @staticmethod
    def ip_max() -> int:
        return _env_int("LOGIN_IP_MAX_FAILURES", 30)

    @staticmethod
    def max_lockout() -> int:
        return _env_int("LOGIN_MAX_LOCKOUT_SECONDS", 900)

    # -- keys --------------------------------------------------------------
    @staticmethod
    def _acct_key(email: str) -> str:
        return "a:" + hashlib.sha256(email.strip().lower().encode()).hexdigest()[:32]

    @staticmethod
    def _ip_key(ip: str) -> str:
        return "i:" + (ip or "unknown")

    def _recent(self, key: str, now: float) -> list[float]:
        cutoff = now - self.window()
        hits = [t for t in self._fails.get(key, []) if t >= cutoff]
        if hits:
            self._fails[key] = hits
        else:
            self._fails.pop(key, None)
        return hits

    def retry_after(self, ip: str, email: str, *, now: float | None = None) -> int:
        """Seconds until a login attempt is allowed (0 = allowed now)."""
        now = time.time() if now is None else now
        with self._lock:
            wait = 0.0
            acct = self._recent(self._acct_key(email), now)
            over = len(acct) - self.account_max()
            if over >= 0 and acct:
                lock = min(self.max_lockout(), 30 * (2 ** over))
                wait = max(wait, acct[-1] + lock - now)
            ips = self._recent(self._ip_key(ip), now)
            if len(ips) >= self.ip_max():
                # Locked until enough failures age out of the window.
                idx = len(ips) - self.ip_max()
                wait = max(wait, ips[idx] + self.window() - now)
            return max(0, int(wait + 0.999))

    def check(self, ip: str, email: str, *, now: float | None = None) -> None:
        wait = self.retry_after(ip, email, now=now)
        if wait > 0:
            raise HTTPException(
                status_code=429,
                detail=self.message,
                headers={"Retry-After": str(wait)},
            )

    def record_failure(self, ip: str, email: str, *, now: float | None = None) -> None:
        now = time.time() if now is None else now
        with self._lock:
            for key in (self._acct_key(email), self._ip_key(ip)):
                self._recent(key, now)
                self._fails.setdefault(key, []).append(now)
            if len(self._fails) > 5000:
                cutoff = now - self.window()
                for k in [k for k, v in self._fails.items() if not v or v[-1] < cutoff][:2000]:
                    self._fails.pop(k, None)

    def record_success(self, email: str) -> None:
        with self._lock:
            self._fails.pop(self._acct_key(email), None)

    def reset(self) -> None:
        with self._lock:
            self._fails.clear()
