"""Persistent account store for snapshot-only / failover operation.

The public SQLite failover dump deliberately carries NO accounts, and any
account written into it disappears on the next snapshot refresh or Space
restart — so ``auth._ensure_account_writes_allowed()`` refuses account writes
while the catalog is failed over. That blocks self-serve signup (and invites)
for the whole Neon outage.

This module provides a small, dedicated SQLite account database that survives
without touching the catalog or its quota:

  * HF persistent storage (``/data``) when mounted and writable — the file
    simply survives restarts; no external service involved.
  * Otherwise a PRIVATE Cloudflare R2 object: downloaded at startup, uploaded
    after every commit (debounced). The object key is
    ``motormila-accounts/accounts.sqlite.gz``.

SECURITY: the file contains bcrypt password hashes and email tokens. It must
NEVER live in the public snapshot bucket. Only ``R2_ACCOUNTS_BUCKET`` (or the
private uploads bucket ``R2_UPLOADS_BUCKET``) is accepted — never ``R2_BUCKET``
(the public ``pub-*.r2.dev`` snapshot bucket). Create the bucket with public
access disabled.

Once configured, the store is bound through ``db.session.configure_auth_store``
and STAYS the account source of truth across catalog failover AND failback, so
accounts created during an outage do not vanish when Neon recovers. An explicit
``AUTH_DATABASE_URL`` always wins over this module.

Enablement (all must hold):
  * ``AUTH_DATABASE_URL`` unset,
  * ``R2_ACCOUNT_STORE`` not "false",
  * ``/data`` writable OR a private bucket + credentials configured:
      R2_ACCOUNTS_BUCKET (preferred) or R2_UPLOADS_BUCKET
      R2_ACCOUNT_ID + R2_UPLOADS_ACCESS_KEY_ID / R2_UPLOADS_SECRET_ACCESS_KEY
        (base R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY accepted as fallback)
        — S3 API via boto3,
      or CLOUDFLARE_API_TOKEN — R2 HTTP object API.

When the store is created fresh and the primary Postgres is reachable, existing
``platform_users`` / ``user_invites`` rows are seeded into it so invited accounts
are not lost by the switch.
"""

from __future__ import annotations

import atexit
import gzip
import os
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import structlog
from sqlalchemy import event
from sqlalchemy.orm import Session

from db import session as db_session

logger = structlog.get_logger()

OBJECT_KEY = "motormila-accounts/accounts.sqlite.gz"
DEFAULT_ACCOUNTS_PATH = "/tmp/motormila-accounts.db"
PERSISTENT_ACCOUNTS_PATH = "/data/motormila-accounts.db"
_SYNC_DEBOUNCE_SECONDS = 1.0
_SYNC_RETRY_SECONDS = 60.0
_HTTP_TIMEOUT_SECONDS = 60

_truthy = {"1", "true", "yes", "on"}
_falsy = {"0", "false", "no", "off"}

_active = False
_listener_registered = False
_atexit_registered = False
_path: Optional[Path] = None
_r2: Optional[dict] = None
_dirty = False
_sync_lock = threading.Lock()
_wake = threading.Event()
_worker: Optional[threading.Thread] = None
_status: dict = {
    "enabled": False,
    "mode": None,          # "persistent" | "r2"
    "path": None,
    "last_sync_at": None,
    "last_error": None,
    "syncs": 0,
}


def account_store_status() -> dict:
    """Diagnostics for /health and ops (no secrets)."""
    with _sync_lock:
        snap = dict(_status)
    snap["active"] = _active
    snap["dirty"] = _dirty
    return snap


def _env(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _accounts_path() -> Path:
    explicit = _env("ACCOUNT_STORE_PATH")
    if explicit:
        return Path(explicit)
    data_dir = Path("/data")
    try:
        if data_dir.is_dir() and os.access(data_dir, os.W_OK):
            return Path(PERSISTENT_ACCOUNTS_PATH)
    except OSError:
        pass
    return Path(DEFAULT_ACCOUNTS_PATH)


def _is_persistent(path: Path) -> bool:
    try:
        return path.resolve().is_relative_to(Path("/data"))
    except (OSError, ValueError):
        return False


def _r2_config() -> Optional[dict]:
    """Private-bucket R2 config, or None. Never falls back to R2_BUCKET."""
    bucket = _env("R2_ACCOUNTS_BUCKET", "R2_UPLOADS_BUCKET")
    if not bucket:
        return None
    account_id = _env("R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
    access_key = _env("R2_UPLOADS_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID")
    secret_key = _env("R2_UPLOADS_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY")
    api_token = _env("CLOUDFLARE_API_TOKEN")
    if account_id and access_key and secret_key:
        return {"mode": "s3", "bucket": bucket, "account_id": account_id,
                "access_key": access_key, "secret_key": secret_key}
    if account_id and api_token:
        return {"mode": "cf", "bucket": bucket, "account_id": account_id,
                "api_token": api_token}
    return None


def _s3_client(cfg: dict):
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=f"https://{cfg['account_id']}.r2.cloudflarestorage.com",
        aws_access_key_id=cfg["access_key"],
        aws_secret_access_key=cfg["secret_key"],
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def _cf_url(cfg: dict) -> str:
    return (
        f"https://api.cloudflare.com/client/v4/accounts/{cfg['account_id']}"
        f"/r2/buckets/{cfg['bucket']}/objects/{quote(OBJECT_KEY, safe='')}"
    )


def _r2_download(cfg: dict, dest: Path) -> str:
    """Fetch the accounts object. Returns 'ok' | 'missing'; raises otherwise."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".partial")
    try:
        if cfg["mode"] == "s3":
            import botocore.exceptions

            try:
                resp = _s3_client(cfg).get_object(Bucket=cfg["bucket"], Key=OBJECT_KEY)
                data = resp["Body"].read()
            except botocore.exceptions.ClientError as exc:
                code = str(exc.response.get("Error", {}).get("Code", ""))
                if code in {"404", "NoSuchKey", "NotFound"}:
                    return "missing"
                raise
        else:
            req = urllib.request.Request(
                _cf_url(cfg), method="GET",
                headers={"Authorization": f"Bearer {cfg['api_token']}"},
            )
            try:
                with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT_SECONDS) as resp:
                    data = resp.read()
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    return "missing"
                raise
        raw = gzip.decompress(data)
        if not raw.startswith(b"SQLite format 3\x00"):
            raise RuntimeError("accounts object is not a SQLite database")
        tmp.write_bytes(raw)
        tmp.replace(dest)
        return "ok"
    finally:
        tmp.unlink(missing_ok=True)


def _r2_upload(cfg: dict, payload: bytes) -> None:
    if cfg["mode"] == "s3":
        _s3_client(cfg).put_object(
            Bucket=cfg["bucket"], Key=OBJECT_KEY,
            Body=payload, ContentType="application/gzip",
        )
    else:
        req = urllib.request.Request(
            _cf_url(cfg), data=payload, method="PUT",
            headers={
                "Authorization": f"Bearer {cfg['api_token']}",
                "Content-Type": "application/gzip",
            },
        )
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT_SECONDS) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f"accounts upload HTTP {resp.status}")


def _snapshot_bytes(path: Path) -> bytes:
    """Consistent copy of the live SQLite file (backup API), gzipped."""
    with tempfile.TemporaryDirectory(prefix="mm-accounts-") as tmpdir:
        copy = Path(tmpdir) / "accounts-copy.db"
        src = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            dst = sqlite3.connect(str(copy))
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
        return gzip.compress(copy.read_bytes())


def _sync_once() -> None:
    """Upload the current account file. Caller holds _sync_lock."""
    global _dirty
    if not (_active and _path is not None):
        return
    if _r2 is None:
        _dirty = False  # persistent /data file — nothing to upload
        return
    payload = _snapshot_bytes(_path)
    _r2_upload(_r2, payload)
    _dirty = False
    _status["last_sync_at"] = time.time()
    _status["last_error"] = None
    _status["syncs"] = int(_status.get("syncs") or 0) + 1
    logger.info("account_store_synced", bytes=len(payload))


def flush_account_store() -> bool:
    """Synchronous sync (shutdown / tests). True when nothing is pending."""
    with _sync_lock:
        try:
            _sync_once()
            return True
        except Exception as exc:  # noqa: BLE001 — never break shutdown
            _status["last_error"] = str(exc)[:300]
            logger.error("account_store_flush_failed", error=str(exc))
            return False


def _worker_loop() -> None:
    global _dirty
    while True:
        _wake.wait(timeout=_SYNC_RETRY_SECONDS)
        _wake.clear()
        if not _active:
            return
        time.sleep(_SYNC_DEBOUNCE_SECONDS)
        with _sync_lock:
            if not _dirty:
                continue
            try:
                _sync_once()
            except Exception as exc:  # noqa: BLE001 — retry on next commit/tick
                _status["last_error"] = str(exc)[:300]
                logger.warning("account_store_sync_failed", error=str(exc))


def _schedule_sync() -> None:
    global _dirty
    if not _active:
        return
    _dirty = True
    _wake.set()


def _on_any_commit(session: Session) -> None:
    # The API is read-heavy; commits are rare (auth writes, alerts, admin).
    # A tiny debounced upload after any commit keeps the R2 copy current
    # without threading write-hooks through every endpoint.
    _schedule_sync()


def _create_tables() -> None:
    from db.models import Base, PlatformUser, UserInvite

    assert db_session.auth_engine is not None
    Base.metadata.create_all(
        bind=db_session.auth_engine,
        tables=[PlatformUser.__table__, UserInvite.__table__],
    )


def _seed_from_primary() -> None:
    """Best-effort copy of existing accounts when the store is brand new.

    Only runs while the primary Postgres is still the catalog bind (i.e. at
    startup before any failover rebind) and reachable. Failure is fine: during
    a quota outage those rows are unreachable anyway, and AUTH_USERS bootstrap
    admins re-sync on login.
    """
    url = str(getattr(db_session, "HOT_URL", "") or "")
    if not url.startswith("postgresql"):
        return
    try:
        from db.models import PlatformUser, UserInvite

        assert db_session.auth_engine is not None
        with db_session.hot_engine.connect() as src_conn:
            for model in (PlatformUser, UserInvite):
                table = model.__table__
                rows = src_conn.execute(table.select()).mappings().all()
                if not rows:
                    continue
                with db_session.auth_engine.begin() as dst_conn:
                    dst_conn.execute(table.insert(), [dict(r) for r in rows])
                logger.info("account_store_seeded", table=table.name, rows=len(rows))
    except Exception as exc:  # noqa: BLE001 — seeding must never block startup
        logger.warning("account_store_seed_skipped", error=str(exc))


def maybe_configure_account_store() -> bool:
    """Bind the persistent account store when configured. Idempotent.

    Returns True when a dedicated account store is active after the call.
    Never raises: a misconfigured store must not take the API down.
    """
    global _active, _path, _r2, _listener_registered, _atexit_registered, _worker
    try:
        if _active:
            return True
        if db_session.AUTH_URL:
            return False  # explicit AUTH_DATABASE_URL wins
        if _env("R2_ACCOUNT_STORE").lower() in _falsy:
            return False

        path = _accounts_path()
        persistent = _is_persistent(path)
        r2 = _r2_config()
        if not persistent and r2 is None:
            logger.info(
                "account_store_skipped",
                reason="no persistent /data and no private R2 bucket configured",
            )
            return False

        fresh = True
        if r2 is not None:
            try:
                result = _r2_download(r2, path)
                fresh = result == "missing"
            except Exception as exc:  # noqa: BLE001
                # Fail closed on transport errors unless a persistent local
                # copy already exists — a stale /tmp file must not silently
                # become the account truth.
                if persistent and path.is_file():
                    logger.warning("account_store_download_failed_using_local", error=str(exc))
                    fresh = False
                else:
                    logger.error("account_store_download_failed", error=str(exc))
                    return False
        elif not path.is_file():
            fresh = True
        else:
            fresh = False

        path.parent.mkdir(parents=True, exist_ok=True)
        db_session.configure_auth_store(f"sqlite:///{path.resolve()}")
        _create_tables()
        if fresh:
            _seed_from_primary()

        _path = path
        _r2 = r2
        _active = True
        _status.update({
            "enabled": True,
            "mode": "persistent" if r2 is None else "r2",
            "path": str(path),
            "last_error": None,
        })
        if not _listener_registered:
            event.listen(Session, "after_commit", _on_any_commit)
            _listener_registered = True
        if r2 is not None:
            if fresh:
                # Publish the initial (possibly seeded) file right away.
                with _sync_lock:
                    try:
                        _dirty = True
                        _sync_once()
                    except Exception as exc:  # noqa: BLE001
                        _status["last_error"] = str(exc)[:300]
                        logger.warning("account_store_initial_sync_failed", error=str(exc))
            if _worker is None or not _worker.is_alive():
                _worker = threading.Thread(target=_worker_loop, name="account-store-sync", daemon=True)
                _worker.start()
            if not _atexit_registered:
                atexit.register(flush_account_store)
                _atexit_registered = True
        logger.info("account_store_active", mode=_status["mode"], path=str(path), fresh=fresh)
        return True
    except Exception as exc:  # noqa: BLE001 — startup must survive misconfig
        logger.error("account_store_configure_failed", error=str(exc))
        return False


def reset_account_store_for_tests() -> None:
    """Tear down module state (tests only)."""
    global _active, _path, _r2, _dirty, _worker
    with _sync_lock:
        _active = False
        _path = None
        _r2 = None
        _dirty = False
        _status.update({"enabled": False, "mode": None, "path": None,
                        "last_sync_at": None, "last_error": None, "syncs": 0})
    db_session.configure_auth_store("")