"""Persistent account store (db/account_store.py).

Covers enablement rules (private R2 only — never the public snapshot bucket),
the P0 regression (self-signup must work WHILE the catalog is failed over to
the public SQLite dump, because accounts live in the dedicated store), the
R2 download/upload lifecycle, and bind survival across catalog reattach.

The real get_db / HotSessionLocal are pointed at a temp catalog SQLite via
db.session.reattach_engines + init_db (NOT dependency_overrides): the auth
table binds installed by configure_auth_store must be inherited by the
sessionmaker the API actually uses.
"""

from __future__ import annotations

import gzip
import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import auth
from app.main import app
from app.services import invite_email
from db import account_store
from db import session as db_session
from db import sqlite_failover
from db.models import Base, PlatformUser, UserInvite

PASSWORD = "a-long-password-1"
EMAIL = "trial@example.com"

# Everything that could enable/authenticate the store or the signup flow.
_STORE_ENV_VARS = (
    "AUTH_DATABASE_URL",
    "ACCOUNT_STORE_PATH",
    "R2_ACCOUNT_STORE",
    "R2_ACCOUNTS_BUCKET",
    "R2_UPLOADS_BUCKET",
    "R2_BUCKET",
    "R2_ACCOUNT_ID",
    "CLOUDFLARE_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_UPLOADS_ACCESS_KEY_ID",
    "R2_UPLOADS_SECRET_ACCESS_KEY",
    "CLOUDFLARE_API_TOKEN",
    "SELF_SIGNUP",
    "ALLOW_SELF_SIGNUP",
    "RESEND_API_KEY",
    "SMTP_HOST",
    "AUTH_USERS",
    "AUTH_TOKEN_SECRET",
)


def _set_r2_s3_env(monkeypatch, bucket: str = "private-accounts") -> None:
    monkeypatch.setenv("R2_ACCOUNTS_BUCKET", bucket)
    monkeypatch.setenv("R2_ACCOUNT_ID", "acc123")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")


def _r2_mocks(monkeypatch, *, download=None, download_result: str = "missing"):
    """Replace the R2 transport. Returns (downloads, uploads) capture lists."""
    downloads: list = []
    uploads: list[bytes] = []

    def fake_download(cfg, dest):
        downloads.append((dict(cfg), Path(dest)))
        if download is not None:
            return download(cfg, Path(dest))
        return download_result

    def fake_upload(cfg, payload):
        uploads.append(bytes(payload))

    monkeypatch.setattr(account_store, "_r2_download", fake_download)
    monkeypatch.setattr(account_store, "_r2_upload", fake_upload)
    return downloads, uploads


def _api_env(monkeypatch) -> list[dict]:
    """Env + email mock needed for self-signup/login through the real app."""
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret-account-store")
    monkeypatch.setenv("SELF_SIGNUP", "true")
    monkeypatch.setenv("RESEND_API_KEY", "test-resend-key")
    monkeypatch.setattr("app.main.SKIP_DB_INIT", True)
    sent: list[dict] = []

    def fake_verify(*, to_email, token, name=None):
        sent.append({"to": to_email, "token": token})
        return True

    monkeypatch.setattr(invite_email, "try_send_verification_email", fake_verify)
    return sent


def _self_signup(client, email: str = EMAIL):
    return client.post(
        "/api/v1/auth/self-signup",
        json={"email": email, "name": "Trial", "password": PASSWORD},
    )


def _login(client, email: str, password: str = PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


@pytest.fixture(autouse=True)
def _isolate_account_store(monkeypatch, tmp_path):
    for var in _STORE_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    account_store.reset_account_store_for_tests()
    sqlite_failover._activated = False
    auth._signup_rate_limiter.reset()
    auth._login_rate_limiter.reset()
    auth._login_volume_limiter.reset()
    auth._token_redeem_limiter.reset()
    restore_url = db_session.HOT_URL
    # Deterministic non-persistent scratch path: never depend on whether the
    # host happens to have a writable /data (HF persistent storage).
    monkeypatch.setattr(account_store, "_accounts_path", lambda: tmp_path / "accounts.db")
    yield
    account_store.reset_account_store_for_tests()
    sqlite_failover._activated = False
    auth._signup_rate_limiter.reset()
    auth._login_rate_limiter.reset()
    auth._login_volume_limiter.reset()
    auth._token_redeem_limiter.reset()
    db_session.reattach_engines(restore_url)


@pytest.fixture()
def catalog(tmp_path):
    """Point the REAL get_db/HotSessionLocal at a temp catalog SQLite."""
    url = f"sqlite:///{tmp_path / 'catalog.db'}"
    db_session.reattach_engines(url)
    db_session.init_db()
    return url


# --- enablement rules --------------------------------------------------------


def test_skips_without_persistent_data_or_private_r2():
    # (a) No /data (path patched to a non-persistent tmp file), no R2 config.
    assert account_store.maybe_configure_account_store() is False
    assert db_session.has_dedicated_auth_store() is False
    status = account_store.account_store_status()
    assert status["enabled"] is False
    assert status["active"] is False


def test_public_r2_bucket_is_never_used(monkeypatch):
    # (b) R2_BUCKET is the PUBLIC snapshot bucket: even with full S3 creds it
    # must not become the account store (bcrypt hashes would be world-readable).
    monkeypatch.setenv("R2_BUCKET", "pub-snapshots")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acc123")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr(
        account_store, "_r2_download",
        lambda *a, **k: pytest.fail("must not download via the public bucket"),
    )
    assert account_store.maybe_configure_account_store() is False
    assert db_session.has_dedicated_auth_store() is False


def test_explicit_auth_database_url_wins(monkeypatch):
    # (c) An explicit AUTH_DATABASE_URL always beats the managed store.
    _set_r2_s3_env(monkeypatch)
    monkeypatch.setattr(db_session, "AUTH_URL", "postgresql://u:***@auth.example.com/db")
    monkeypatch.setattr(
        account_store, "_r2_download",
        lambda *a, **k: pytest.fail("must not touch R2 when AUTH_DATABASE_URL is set"),
    )
    assert account_store.maybe_configure_account_store() is False
    assert db_session.auth_engine is None  # left untouched, not rebound
    assert account_store.account_store_status()["enabled"] is False


def test_r2_account_store_false_disables(monkeypatch):
    # (i) Opt-out switch.
    _set_r2_s3_env(monkeypatch)
    monkeypatch.setenv("R2_ACCOUNT_STORE", "false")
    monkeypatch.setattr(
        account_store, "_r2_download",
        lambda *a, **k: pytest.fail("store is disabled"),
    )
    assert account_store.maybe_configure_account_store() is False
    assert db_session.has_dedicated_auth_store() is False


def test_persistent_data_mode_without_r2(monkeypatch, tmp_path):
    # /data branch: local file survives restarts, no R2 involved at all.
    path = tmp_path / "data" / "motormila-accounts.db"
    monkeypatch.setattr(account_store, "_accounts_path", lambda: path)
    monkeypatch.setattr(account_store, "_is_persistent", lambda p: True)
    assert account_store.maybe_configure_account_store() is True
    assert db_session.has_dedicated_auth_store() is True
    status = account_store.account_store_status()
    assert status["mode"] == "persistent"
    assert status["enabled"] is True
    assert path.is_file()
    # Nothing to upload in persistent mode; flush is a clean no-op.
    assert account_store.flush_account_store() is True


# --- the P0 regression: signup during catalog failover -----------------------


def test_self_signup_works_during_failover_with_r2_store(monkeypatch, catalog):
    # (d) Core P0: failover active + dedicated store => signup 200, and the
    # row lands in the auth engine, NOT the throwaway failover catalog.
    _set_r2_s3_env(monkeypatch)
    downloads, uploads = _r2_mocks(monkeypatch)
    sent = _api_env(monkeypatch)
    monkeypatch.setattr(sqlite_failover, "_activated", True)

    # TestClient runs the real lifespan, which calls maybe_configure_account_store.
    with TestClient(app) as client:
        assert db_session.has_dedicated_auth_store() is True
        assert account_store.account_store_status()["mode"] == "r2"
        assert sqlite_failover.failover_active() is True
        assert auth._accounts_store_degraded() is False
        assert len(downloads) == 1
        assert downloads[0][0]["bucket"] == "private-accounts"

        # Idempotent: a second configure must not re-download.
        assert account_store.maybe_configure_account_store() is True
        assert len(downloads) == 1

        resp = _self_signup(client)
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"ok": True, "verificationRequired": True, "email": EMAIL}
        assert "token" not in resp.json()
        assert len(sent) == 1 and sent[0]["to"] == EMAIL

        # Queryable through the auth engine directly...
        with db_session.auth_engine.connect() as conn:
            row = conn.execute(
                text("SELECT email, email_verified FROM platform_users WHERE email = :e"),
                {"e": EMAIL},
            ).mappings().first()
        assert row is not None
        assert row["email"] == EMAIL
        assert bool(row["email_verified"]) is False

        # ...and through the real sessionmaker (binds route PlatformUser).
        with db_session.HotSessionLocal() as db:
            user = db.query(PlatformUser).filter(PlatformUser.email == EMAIL).first()
            assert user is not None
            assert user.email_verified is False

        # The failover catalog must NOT carry the account.
        with db_session.hot_engine.connect() as conn:
            assert conn.execute(text("SELECT COUNT(*) FROM platform_users")).scalar() == 0

        # /health surfaces the store (app/main.py wiring).
        health = client.get("/health")
        assert health.status_code == 200, health.text
        body = health.json()
        assert body["failover"] is True
        assert body["account_store"]["enabled"] is True
        assert body["account_store"]["mode"] == "r2"


def test_self_signup_refused_during_failover_without_store(monkeypatch, catalog):
    # Control for (d): WITHOUT the store, failover must still refuse account
    # writes (the dump carries no accounts and loses writes on refresh).
    _api_env(monkeypatch)
    monkeypatch.setattr(sqlite_failover, "_activated", True)

    with TestClient(app) as client:
        assert db_session.has_dedicated_auth_store() is False
        assert auth._accounts_store_degraded() is True
        resp = _self_signup(client)
        assert resp.status_code == 503, resp.text
        assert resp.json()["code"] == "db_unavailable"
        with db_session.hot_engine.connect() as conn:
            assert conn.execute(text("SELECT COUNT(*) FROM platform_users")).scalar() == 0


# --- R2 sync lifecycle --------------------------------------------------------


def test_flush_uploads_gzip_sqlite_containing_new_user(monkeypatch, tmp_path, catalog):
    # (e) The uploaded payload is gzip of a real SQLite file with the new row.
    _set_r2_s3_env(monkeypatch)
    _downloads, uploads = _r2_mocks(monkeypatch)
    _api_env(monkeypatch)
    monkeypatch.setattr(sqlite_failover, "_activated", True)

    with TestClient(app) as client:
        assert _self_signup(client).status_code == 200
        uploads.clear()
        assert account_store.flush_account_store() is True
        assert uploads, "flush must upload the pending account file"
        raw = gzip.decompress(uploads[-1])
        assert raw.startswith(b"SQLite format 3\x00")
        flushed = tmp_path / "flushed.db"
        flushed.write_bytes(raw)
        conn = sqlite3.connect(str(flushed))
        try:
            emails = [r[0] for r in conn.execute("SELECT email FROM platform_users")]
            verified = conn.execute(
                "SELECT email_verified FROM platform_users WHERE email = ?", (EMAIL,)
            ).fetchone()
        finally:
            conn.close()
        assert EMAIL in emails
        assert verified is not None and bool(verified[0]) is False
        status = account_store.account_store_status()
        assert status["syncs"] >= 1
        assert status["last_error"] is None


def test_download_transport_error_fails_closed(monkeypatch):
    # (f) No persistent local copy + download failure => NO store (a stale
    # /tmp file must not silently become the account truth).
    _set_r2_s3_env(monkeypatch)

    def boom(cfg, dest):
        raise RuntimeError("connection reset by peer")

    monkeypatch.setattr(account_store, "_r2_download", boom)
    monkeypatch.setattr(
        account_store, "_r2_upload",
        lambda *a, **k: pytest.fail("must not upload when configure failed"),
    )
    assert account_store.maybe_configure_account_store() is False
    assert db_session.has_dedicated_auth_store() is False
    assert account_store.account_store_status()["active"] is False


def test_flush_failure_is_reported_not_raised(monkeypatch):
    # Shutdown/flush must never raise; the error surfaces in /health status.
    _set_r2_s3_env(monkeypatch)
    _r2_mocks(monkeypatch)
    assert account_store.maybe_configure_account_store() is True

    def boom(cfg, payload):
        raise RuntimeError("r2 unreachable")

    monkeypatch.setattr(account_store, "_r2_upload", boom)
    assert account_store.flush_account_store() is False
    assert "r2 unreachable" in (account_store.account_store_status()["last_error"] or "")


def test_preexisting_accounts_object_is_honored(monkeypatch, tmp_path, catalog):
    # (g) A real accounts object in R2 is downloaded and used as-is: its user
    # can log in, and no fresh-store seeding/initial upload happens.
    pre = tmp_path / "preexisting.db"
    engine = create_engine(f"sqlite:///{pre}")
    Base.metadata.create_all(
        bind=engine, tables=[PlatformUser.__table__, UserInvite.__table__]
    )
    with engine.begin() as conn:
        conn.execute(
            PlatformUser.__table__.insert().values(
                email="existing@example.com",
                password_hash=auth._hash_password(PASSWORD),
                name="Existing",
                plan="pro",
                subscription_status="active",
                role="user",
                is_active=True,
                email_verified=True,
                token_version=0,
            )
        )
    engine.dispose()
    blob = pre.read_bytes()

    def fake_download(cfg, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(blob)
        return "ok"

    _set_r2_s3_env(monkeypatch)
    downloads, uploads = _r2_mocks(monkeypatch, download=fake_download)
    _api_env(monkeypatch)

    with TestClient(app) as client:
        assert db_session.has_dedicated_auth_store() is True
        assert len(downloads) == 1
        assert uploads == []  # not fresh => no initial publish

        # The pre-existing row is visible through the real sessionmaker.
        with db_session.HotSessionLocal() as db:
            user = db.query(PlatformUser).filter(
                PlatformUser.email == "existing@example.com"
            ).first()
            assert user is not None
            assert user.email_verified is True

        login = _login(client, "existing@example.com")
        assert login.status_code == 200, login.text
        assert login.json()["user"]["email"] == "existing@example.com"
        assert login.json()["token"]


# --- bind survival across catalog reattach ------------------------------------


def test_auth_binds_survive_catalog_reattach(monkeypatch, tmp_path, catalog):
    # (h) Failover refresh / failback rebinds the catalog sessionmakers; the
    # account binds must survive so outage-created accounts keep working.
    _set_r2_s3_env(monkeypatch)
    _r2_mocks(monkeypatch)
    sent = _api_env(monkeypatch)

    with TestClient(app) as client:
        assert _self_signup(client).status_code == 200

        # Simulate the failover monitor rebinding onto a fresh dump file.
        db_session.reattach_engines(f"sqlite:///{tmp_path / 'catalog2.db'}")
        db_session.init_db()

        assert db_session.has_dedicated_auth_store() is True
        with db_session.HotSessionLocal() as db:
            user = db.query(PlatformUser).filter(PlatformUser.email == EMAIL).first()
            assert user is not None
            assert user.email_verified is False
        # Catalog reads really hit the new file (no account rows there).
        with db_session.hot_engine.connect() as conn:
            assert conn.execute(text("SELECT COUNT(*) FROM platform_users")).scalar() == 0

        # Full account flow still works after the rebind: verify + login.
        token = sent[0]["token"]
        verify = client.post("/api/v1/auth/verify-email", json={"token": token})
        assert verify.status_code == 200, verify.text
        login = _login(client, EMAIL)
        assert login.status_code == 200, login.text
        assert login.json()["user"]["email"] == EMAIL
