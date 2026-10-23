"""Fail the live API over to the public merged SQLite dump when Neon is down.

Neon Free blocks every connection once the monthly transfer quota is exhausted.
Public browsing is supposed to use Vercel snapshots, but a Git deploy omits
the gitignored listing catalog, so the SPA falls through to `/listings` and
renders a hard error. This module downloads the public merged SQLite dump
(the same file manus-to-live publishes) and rebinds SQLAlchemy onto it so the
Hugging Face API can keep serving until Neon resets.

Self-healing monitor (Sep 2026): the original implementation ran exactly once
at startup, so a Space that was already running when the quota tripped stayed
down until a manual restart — and when Neon recovered on the 1st, the Space
kept serving the stale dump until another restart. The background thread now
re-checks every ``SQLITE_FAILOVER_CHECK_SECONDS`` (default 120s):

  * Neon down, not failed over -> download the dump and rebind. A failed
    download no longer kills the only attempt; the next tick retries.
  * Neon back, failed over     -> rebind to the saved primary DSN
    automatically (no manual Space restart needed at month reset).

Download sources are tried in order: ``SQLITE_FAILOVER_SLIM_URL`` (a slimmer
live-rows-only dump, when published), ``MERGED_SQLITE_URLS`` (comma-separated),
then ``MERGED_SQLITE_URL``, then the built-in defaults on public R2.

Oct 2026 outage fixes (overhaul/backend-sec):

  * ROOT CAUSE of "failover:false" while Neon was down: the R2 public bucket
    (``*.r2.dev``, Cloudflare) answers **403 Forbidden** to urllib's default
    ``Python-urllib/3.x`` User-Agent while curl gets 200. Every download
    attempt failed instantly. All requests now send an explicit UA
    (``SQLITE_FAILOVER_USER_AGENT``).
  * The download timeout is configurable: ``SQLITE_FAILOVER_SOCKET_TIMEOUT``
    (per-read, default 120 s) and ``SQLITE_FAILOVER_DOWNLOAD_DEADLINE``
    (whole download, default 1800 s) - the dump is ~108 MB gz / ~455 MB raw
    and cpu-basic gunzip is slow.
  * The default path prefers ``/data`` (HF persistent storage, when mounted
    and writable) over ``/tmp``; leftover ``.partial`` / ``.refresh`` files
    from a previous process are removed before a download, and a refresh is
    skipped (not attempted) when the disk cannot hold a second copy.
  * The last error / attempt count / source are exposed via
    :func:`failover_status` and reported by ``/health``.
"""

from __future__ import annotations

import gzip
import os
import shutil
import threading
import time
import urllib.request
from pathlib import Path
from typing import Optional

import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from db import session as db_session

logger = structlog.get_logger()

# Public R2 copies published next to the snapshot JSON by the live-publish
# pipeline (manus-to-live.yml). Moved off Vercel 2026-10-16: the gz crossed
# Vercel's 100MB per-file deploy limit. New canonical name first; the legacy
# name stays as a fallback until the old asset is retired. These URLs must
# stay reachable WITHOUT credentials: the failover download is anonymous
# and the old release-asset mirror went away when the source repository was
# made private.
FAILOVER_DB_URLS = (
    "https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/snapshots/latest/merged-motormila.db.gz",
    "https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/snapshots/latest/merged-autolens.db.gz",
)
# Backwards-compatible alias: the canonical (first) URL.
VERCEL_MERGED_DB_URL = FAILOVER_DB_URLS[0]
FAILOVER_DB_URL = FAILOVER_DB_URLS[0]
DEFAULT_FAILOVER_PATH = "/tmp/motormila-failover.db"
PERSISTENT_FAILOVER_PATH = "/data/motormila-failover.db"
# Slim dump name the export pipeline may publish next to the full one. A 404
# here just falls through to the full dump, so it is safe to try first.
SLIM_FAILOVER_DB_URL = (
    "https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/snapshots/latest/merged-motormila-slim.db.gz"
)
DEFAULT_USER_AGENT = "MotorMila-Failover/1.1 (+https://motormila.vercel.app)"
# Raw-to-gz size ratio observed on the merged dump (108 MB -> 455 MB). Used to
# estimate whether a second copy fits on disk before a refresh.
_EXPANSION_RATIO_ESTIMATE = 5

_status_lock = threading.Lock()
_status: dict = {
    "attempts": 0,
    "last_error": None,
    "last_attempt_at": None,
    "last_success_at": None,
    "source": None,
    "path": None,
    "bytes": None,
    # Last observation of the primary (Neon) database, credential-free:
    # "ok" | "quota_exceeded" | "unreachable" | "auth_failed" | "error".
    "primary_status": None,
    "primary_checked_at": None,
}


def classify_primary_error(exc: BaseException | str | None) -> str:
    """Map a Neon connect failure to a short, secret-free reason code.

    Neon Free answers "Your account or project has exceeded the quota" (or
    "...data transfer quota") once the monthly transfer allowance is used up;
    that needs a plan decision or the monthly reset, not a code fix, so
    /health reports it distinctly from a plain network failure.
    """
    if exc is None:
        return "ok"
    message = str(exc).lower()
    if "quota" in message or "exceeded" in message or "endpoint is disabled" in message:
        return "quota_exceeded"
    if "password authentication failed" in message or "authentication failed" in message:
        return "auth_failed"
    if any(
        marker in message
        for marker in (
            "could not connect",
            "timeout",
            "timed out",
            "could not translate host",
            "connection refused",
            "network is unreachable",
            "name or service not known",
            "server closed the connection",
        )
    ):
        return "unreachable"
    return "error"


def _record_primary(exc: BaseException | None) -> None:
    _record_status(primary_status=classify_primary_error(exc), primary_checked_at=time.time())


def _record_status(**fields) -> None:
    with _status_lock:
        _status.update(fields)


def failover_status() -> dict:
    """Snapshot of failover diagnostics for /health (no secrets)."""
    with _status_lock:
        snap = dict(_status)
    snap["active"] = _activated
    snap["enabled"] = failover_enabled()
    return snap


def _user_agent() -> str:
    return os.getenv("SQLITE_FAILOVER_USER_AGENT", "").strip() or DEFAULT_USER_AGENT


def _env_seconds(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    try:
        return max(5.0, float(raw)) if raw else default
    except ValueError:
        return default


def _socket_timeout() -> float:
    return _env_seconds("SQLITE_FAILOVER_SOCKET_TIMEOUT", 120.0)


def _download_deadline() -> float:
    return _env_seconds("SQLITE_FAILOVER_DOWNLOAD_DEADLINE", 1800.0)


def _failover_path() -> Path:
    """Where the failover DB lives.

    Explicit ``SQLITE_FAILOVER_PATH`` wins. Otherwise use HF persistent
    storage (``/data``) when it is mounted and writable - it is larger than the
    container's /tmp and survives restarts - and fall back to /tmp.
    """
    explicit = os.getenv("SQLITE_FAILOVER_PATH", "").strip()
    if explicit:
        return Path(explicit)
    data_dir = Path("/data")
    try:
        if data_dir.is_dir() and os.access(data_dir, os.W_OK):
            return Path(PERSISTENT_FAILOVER_PATH)
    except OSError:
        pass
    return Path(DEFAULT_FAILOVER_PATH)


def _cleanup_stale_partials(dest: Path) -> None:
    """Remove half-written files from a previous (killed) process."""
    for suffix in (".partial", ".refresh", ".refresh.partial"):
        try:
            dest.with_name(dest.name + suffix).unlink(missing_ok=True)
        except OSError:
            pass


def _free_bytes(path: Path) -> Optional[int]:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        return shutil.disk_usage(path.parent).free
    except OSError:
        return None

_lock = threading.Lock()
_activated = False
_primary_url: str | None = None
_consecutive_failures = 0
_active_source_url: str | None = None
_active_source_version: tuple[str | None, int | None] | None = None

# Refresh throttle. Vercel's edge serves identical bytes with a flapping
# Last-Modified on consecutive HEADs, which used to make every monitor tick
# see a "new version" and re-download the dump in a loop. The version is now
# (etag, content_length) only; on top of that a successful refresh is never
# repeated within the hour, and a failed one backs off for 30 minutes.
_REFRESH_MIN_INTERVAL_SECONDS = 3600
_REFRESH_BACKOFF_SECONDS = 1800
_next_refresh_allowed_at: float = 0.0


def failover_enabled() -> bool:
    raw = os.getenv("SQLITE_FAILOVER", "true").strip().lower()
    if raw in {"0", "false", "no", "off"}:
        return False
    # Unit tests already run on SQLite; never hit the network unless forced.
    if os.getenv("PYTEST_CURRENT_TEST") and os.getenv("SQLITE_FAILOVER_FORCE", "").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return False
    return True


def failover_active() -> bool:
    """True while the API is serving from the downloaded SQLite dump."""
    return _activated


def _check_interval_seconds() -> int:
    raw = os.getenv("SQLITE_FAILOVER_CHECK_SECONDS", "120").strip()
    try:
        return max(15, int(raw))
    except ValueError:
        return 120


def _current_url() -> str:
    return str(getattr(db_session, "HOT_URL", "") or "")


def neon_reachable(timeout_seconds: float = 3.0) -> bool:
    url = _current_url()
    if url.startswith("sqlite"):
        return True
    from app.core.db_guard import bypass_breaker

    try:
        # Bypass the circuit breaker: this probe must observe the real DB.
        with bypass_breaker(), db_session.hot_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        _record_primary(None)
        return True
    except Exception as exc:  # noqa: BLE001 — any connect failure means fail over
        _record_primary(exc)
        logger.warning("neon_probe_failed", error=str(exc), timeout_seconds=timeout_seconds)
        return False


def _probe_url(url: str, timeout_seconds: float = 3.0) -> bool:
    """Probe a raw DSN with a throwaway engine.

    Needed while failed over: ``db_session.hot_engine`` has been rebound to
    SQLite by then, so probing it would test the failover file, not Neon.
    """
    engine = create_engine(
        url,
        poolclass=NullPool,
        connect_args={"connect_timeout": max(1, int(timeout_seconds))},
    )
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        _record_primary(None)
        return True
    except Exception as exc:  # noqa: BLE001 — any connect failure means still down
        _record_primary(exc)
        logger.warning("neon_reprobe_failed", error=str(exc))
        return False
    finally:
        engine.dispose()


def _is_sqlite_file(path: Path) -> bool:
    """True when *path* starts with the SQLite 3 magic header.

    A size-only check lets a >1KB HTML error page (Vercel 404/500) pass and
    poison the failover DB until the next source-version change.
    """
    try:
        with path.open("rb") as fh:
            header = fh.read(16)
        return header.startswith(b"SQLite format 3\x00")
    except OSError:
        return False


def _open_source(source_url: str, *, method: str = "GET", timeout: Optional[float] = None):
    """urlopen with an explicit User-Agent (r2.dev 403s urllib's default UA)."""
    request = urllib.request.Request(
        source_url,
        method=method,
        headers={
            "User-Agent": _user_agent(),
            "Accept": "*/*",
            "Cache-Control": "no-cache",
        },
    )
    return urllib.request.urlopen(request, timeout=timeout or _socket_timeout())


def download_merged_sqlite(dest: Path, source_url: str) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_db = dest.with_name(dest.name + ".partial")
    tmp_db.unlink(missing_ok=True)
    deadline = time.monotonic() + _download_deadline()
    logger.info("sqlite_failover_download_start", url=source_url, dest=str(dest))
    try:
        with _open_source(source_url) as resp:
            # Disk pre-check: refuse early instead of filling the disk and
            # failing after minutes of download.
            raw_length = (resp.headers.get("Content-Length") or "").strip()
            free = _free_bytes(tmp_db)
            if raw_length.isdigit() and free is not None:
                needed = int(raw_length) * _EXPANSION_RATIO_ESTIMATE
                if free < needed:
                    raise RuntimeError(
                        f"not enough disk for failover DB at {tmp_db.parent}: "
                        f"free={free} needed~={needed}"
                    )
            # Stream straight through gunzip (no staged .gz copy on disk), so
            # only the decompressed file is written.
            with gzip.open(resp, "rb") as src, tmp_db.open("wb") as out:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    if time.monotonic() > deadline:
                        raise TimeoutError(
                            f"failover download exceeded {int(_download_deadline())}s deadline"
                        )
        if tmp_db.stat().st_size < 1_000:
            raise RuntimeError(f"Merged SQLite download was empty: {tmp_db}")
        if not _is_sqlite_file(tmp_db):
            raise RuntimeError(
                f"Merged SQLite download is not a SQLite database (HTML error page?): {source_url}"
            )
        tmp_db.replace(dest)
    finally:
        tmp_db.unlink(missing_ok=True)
    logger.info("sqlite_failover_download_done", bytes=dest.stat().st_size, dest=str(dest))
    return dest


def _drop_wal_sidecars(dest: Path) -> None:
    """Remove SQLite sidecar files for *dest* before a fresh file takes over.

    The refresh swaps the database file atomically, which leaves the previous
    generation's -wal/-shm behind. New connections then read stale WAL frames
    (silently wrong data) or fail outright ("database disk image is
    malformed"), so the sidecars must go before the new file owns the path.
    Only call this when the file at *dest* was just replaced.
    """
    for ext in ("-wal", "-shm", "-journal"):
        try:
            dest.with_name(dest.name + ext).unlink(missing_ok=True)
        except OSError as exc:  # noqa: BLE001 - best effort
            logger.warning(
                "sqlite_failover_sidecar_cleanup_failed",
                path=str(dest),
                ext=ext,
                error=str(exc),
            )


def activate_sqlite_file(db_path: Path) -> None:
    db_session.reattach_engines(f"sqlite:///{db_path.resolve()}")
    global _activated
    _activated = True
    logger.info("sqlite_failover_activated", path=str(db_path.resolve()))


def _candidate_sources() -> list[str]:
    """Ordered download mirrors for the merged dump, de-duplicated."""
    urls: list[str] = []
    # Slim dump first when configured: SQLITE_FAILOVER_SLIM_URL=<url>, or
    # SQLITE_FAILOVER_SLIM_URL=default for the conventional R2 name.
    slim = os.getenv("SQLITE_FAILOVER_SLIM_URL", "").strip()
    if slim.lower() == "default":
        slim = SLIM_FAILOVER_DB_URL
    if slim.startswith(("http://", "https://", "file:")):
        urls.append(slim)
    for raw in os.getenv("MERGED_SQLITE_URLS", "").split(","):
        url = raw.strip()
        if url and url not in urls:
            urls.append(url)
    single = os.getenv("MERGED_SQLITE_URL", "").strip()
    if single and single not in urls:
        urls.append(single)
    for url in FAILOVER_DB_URLS:
        if url not in urls:
            urls.append(url)
    return urls


def _source_version(url: str) -> tuple[str | None, int | None] | None:
    """Read cheap deployment metadata for a public merged-DB source."""
    if not url or url.startswith("file:"):
        return None
    try:
        with _open_source(url, method="HEAD", timeout=20) as response:
            return _version_from_headers(response.headers)
    except Exception as exc:  # noqa: BLE001 - refresh is best effort
        logger.warning("sqlite_failover_source_probe_failed", url=url, error=str(exc))
    return None


def _version_from_headers(headers) -> tuple[str | None, int | None] | None:
    # Last-Modified is deliberately NOT part of the version: Vercel's edge
    # serves identical bytes with a different Last-Modified on consecutive
    # HEAD requests, which made every monitor tick re-download the dump.
    etag = (headers.get("ETag") or headers.get("Etag") or "").strip() or None
    raw_length = (headers.get("Content-Length") or "").strip()
    try:
        content_length = int(raw_length) if raw_length else None
    except ValueError:
        content_length = None
    if etag is None and content_length is None:
        return None
    return etag, content_length


def _download_with_fallback(dest: Path) -> Path:
    """Try each mirror in order; only give up when every source fails."""
    global _active_source_url
    last_error: Exception | None = None
    _cleanup_stale_partials(dest)
    for url in _candidate_sources():
        _record_status(
            attempts=int(_status.get("attempts") or 0) + 1,
            last_attempt_at=time.time(),
        )
        try:
            result = download_merged_sqlite(dest, url)
            _active_source_url = url
            _record_status(
                last_error=None,
                last_success_at=time.time(),
                source=url,
                path=str(dest),
                bytes=dest.stat().st_size,
            )
            return result
        except Exception as exc:  # noqa: BLE001 — try the next mirror
            last_error = exc
            _record_status(last_error=f"{url.rsplit('/', 1)[-1]}: {str(exc)[:240]}")
            logger.warning("sqlite_failover_source_failed", url=url, error=str(exc))
    raise RuntimeError(f"all failover DB sources failed; last error: {last_error}")


def _ensure_failover_schema() -> None:
    """Best-effort create_all on the failover file.

    Older merged dumps predate the auth/alert tables; without them every
    gated request 500s during the outage even though AUTH_USERS env auth
    could still work. create_all is a checkfirst no-op when they exist.
    """
    try:
        db_session.init_db()
    except Exception as exc:  # noqa: BLE001 — schema gaps must not undo the failover
        logger.error("sqlite_failover_init_db_failed", error=str(exc))


def _remember_primary_locked() -> None:
    """Capture the Postgres DSN to fail back to once Neon recovers."""
    global _primary_url
    url = _current_url()
    if url and not url.startswith("sqlite"):
        _primary_url = url


def _activate_locked() -> bool:
    """Download (if needed) and rebind onto the merged dump. Caller holds _lock."""
    global _active_source_url, _active_source_version
    dest = _failover_path()
    # A fresh process must refresh once even when the container reused an old
    # /tmp file from a previous Space process.
    if not _active_source_url or not dest.is_file() or dest.stat().st_size < 1_000:
        _download_with_fallback(dest)
        # The download just replaced the file: drop the previous generation's
        # WAL sidecars before any connection opens the new file.
        _drop_wal_sidecars(dest)
    activate_sqlite_file(dest)
    _ensure_failover_schema()
    if not _active_source_url:
        sources = _candidate_sources()
        _active_source_url = sources[0] if sources else None
    _active_source_version = (
        _source_version(_active_source_url) if _active_source_url else None
    )
    return True


def _refresh_active_failover_locked() -> bool:
    """Refresh an active failover DB when the public source changes."""
    global _active_source_url, _active_source_version, _next_refresh_allowed_at
    dest = _failover_path()
    if not _activated or not dest.is_file():
        return False
    if time.time() < _next_refresh_allowed_at:
        return False

    for url in _candidate_sources():
        version = _source_version(url)
        if version is None:
            continue
        if url == _active_source_url and version == _active_source_version:
            return False

        # The source really changed. Throttle so one bad mirror cannot keep
        # the Space in a permanent download loop.
        _next_refresh_allowed_at = time.time() + _REFRESH_MIN_INTERVAL_SECONDS
        next_dest = dest.with_name(f"{dest.name}.refresh")
        # A refresh needs live + new copy on disk at once. If that cannot fit,
        # keep serving the current (stale but valid) file instead of failing
        # half-way and risking ENOSPC for the live database's WAL.
        free = _free_bytes(next_dest)
        gz_len = version[1] if isinstance(version, tuple) else None
        if free is not None and gz_len and free < gz_len * _EXPANSION_RATIO_ESTIMATE:
            logger.warning(
                "sqlite_failover_refresh_skipped_low_disk",
                free=free,
                needed=gz_len * _EXPANSION_RATIO_ESTIMATE,
            )
            return False
        try:
            download_merged_sqlite(next_dest, url)
            # Close idle pooled connections and drop the previous generation's
            # WAL sidecars BEFORE the new file takes over the path; otherwise
            # new connections read stale frames (or fail) from the old -wal.
            try:
                db_session.hot_engine.dispose()
            except Exception:  # noqa: BLE001 - best effort
                pass
            _drop_wal_sidecars(dest)
            next_dest.replace(dest)
            activate_sqlite_file(dest)
            _ensure_failover_schema()
            _active_source_url = url
            _active_source_version = version
            logger.info("sqlite_failover_refreshed", url=url, bytes=dest.stat().st_size)
            return True
        except Exception as exc:  # noqa: BLE001 - try the next mirror
            _next_refresh_allowed_at = time.time() + _REFRESH_BACKOFF_SECONDS
            logger.warning("sqlite_failover_refresh_failed", url=url, error=str(exc))
    return False


def maybe_activate_sqlite_failover() -> bool:
    """Download the merged dump and rebind engines when Neon cannot be probed.

    Returns True when the API is (now) on SQLite. Safe to call repeatedly.
    """
    if not failover_enabled():
        return False
    if _current_url().startswith("sqlite"):
        return True

    with _lock:
        if _activated:
            return True
        _remember_primary_locked()
        if neon_reachable():
            return False
        _activate_locked()
        return True


def _tick_once() -> None:
    """One monitor pass: fail over when Neon is down, fail back when it recovers."""
    global _activated
    if not failover_enabled():
        return
    if _current_url().startswith("sqlite") and not _activated:
        return  # local dev / tests on SQLite — nothing to fail over from

    with _lock:
        if _activated:
            primary = _primary_url
            if primary and _probe_url(primary):
                db_session.reattach_engines(primary)
                _activated = False
                try:
                    from app.core.db_guard import breaker

                    breaker.reset()
                except Exception:  # noqa: BLE001
                    pass
                global _active_source_url, _active_source_version
                _active_source_url = None
                _active_source_version = None
                # Never log credentials — host part only.
                logger.info("sqlite_failover_deactivated", primary_host=primary.split("@")[-1])
            else:
                _refresh_active_failover_locked()
            return
        _remember_primary_locked()
        if neon_reachable():
            return
        _activate_locked()


def _monitor_loop() -> None:
    global _consecutive_failures
    interval = _check_interval_seconds()
    while True:
        try:
            _tick_once()
            _consecutive_failures = 0
        except Exception as exc:  # noqa: BLE001 — never kill the monitor thread
            _consecutive_failures += 1
            _record_status(last_error=str(exc)[:300])
            logger.error(
                "sqlite_failover_tick_failed",
                error=str(exc),
                failures=_consecutive_failures,
            )
        time.sleep(interval)


def start_sqlite_failover_background() -> None:
    if not failover_enabled():
        return
    if _current_url().startswith("sqlite"):
        return
    thread = threading.Thread(
        target=_monitor_loop,
        name="sqlite-failover-monitor",
        daemon=True,
    )
    thread.start()
