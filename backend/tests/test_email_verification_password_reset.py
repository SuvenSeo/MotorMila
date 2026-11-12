"""Email verification (self-signup) and password reset flows."""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import auth
from app.main import app
from app.services import invite_email
from db.models import Base, PlatformUser, UserInvite
from db.session import get_db

_BCRYPT_HASH = auth._hash_password("correct-horse")
PASSWORD = "a-long-password-1"


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret-verify")
    monkeypatch.setenv("SELF_SIGNUP", "true")
    monkeypatch.setattr("app.main.SKIP_DB_INIT", True)
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "boot@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Boot",
                    "plan": "enterprise",
                    "subscription_status": "active",
                    "role": "admin",
                }
            ]
        ),
    )

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    sent: dict[str, list[dict]] = {"verify": [], "reset": []}

    def fake_verify(*, to_email, token, name=None):
        sent["verify"].append({"to": to_email, "token": token})
        return True

    def fake_reset(*, to_email, token):
        sent["reset"].append({"to": to_email, "token": token})
        return True

    monkeypatch.setattr(invite_email, "try_send_verification_email", fake_verify)
    monkeypatch.setattr(invite_email, "try_send_password_reset_email", fake_reset)

    app.dependency_overrides[get_db] = override_get_db
    auth._login_rate_limiter.reset()
    auth._signup_rate_limiter.reset()  # shared in-memory backend: clears all buckets

    with TestClient(app) as client:
        yield client, SessionLocal, sent

    app.dependency_overrides.clear()
    auth._signup_rate_limiter.reset()
    auth._login_rate_limiter.reset()


def _row(SessionLocal, email):
    db = SessionLocal()
    try:
        return db.query(PlatformUser).filter(PlatformUser.email == email).first()
    finally:
        db.close()


def _login(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _self_signup(client, email="trial@example.com"):
    return client.post(
        "/api/v1/auth/self-signup", json={"email": email, "name": "Trial", "password": PASSWORD}
    )


# --- email verification -----------------------------------------------------


def test_self_signup_creates_unverified_account_without_session(env):
    client, SessionLocal, sent = env
    resp = _self_signup(client)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"ok": True, "verificationRequired": True, "email": "trial@example.com"}
    assert "token" not in body
    assert auth.SESSION_COOKIE_NAME not in resp.headers.get("set-cookie", "")

    row = _row(SessionLocal, "trial@example.com")
    assert row.email_verified is False
    assert len(sent["verify"]) == 1
    token = sent["verify"][0]["token"]
    # Only the SHA-256 digest is stored.
    assert row.email_verification_token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in json.dumps({c.name: str(getattr(row, c.name)) for c in row.__table__.columns})


def test_unverified_login_blocked_with_code(env):
    client, _SessionLocal, _sent = env
    _self_signup(client)
    resp = _login(client, "trial@example.com")
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "email_unverified"
    # Wrong password still answers a plain 401 (no verification-state oracle).
    bad = _login(client, "trial@example.com", "wrong-password-x")
    assert bad.status_code == 401


def test_verify_email_then_login_and_single_use(env):
    client, SessionLocal, sent = env
    _self_signup(client)
    token = sent["verify"][0]["token"]

    ok = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert ok.status_code == 200, ok.text
    assert ok.json()["email"] == "trial@example.com"
    row = _row(SessionLocal, "trial@example.com")
    assert row.email_verified is True
    assert row.email_verification_token_hash is None
    assert row.trial_ends_at is not None

    login = _login(client, "trial@example.com")
    assert login.status_code == 200, login.text
    assert login.json()["user"]["subscriptionStatus"] == "trialing"

    again = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert again.status_code == 400
    assert again.json()["detail"]["code"] == "invalid_token"


def test_verify_email_wrong_and_expired_token(env):
    client, SessionLocal, sent = env
    _self_signup(client)
    wrong = client.post("/api/v1/auth/verify-email", json={"token": "x" * 43})
    assert wrong.status_code == 400
    assert wrong.json()["detail"]["code"] == "invalid_token"

    db = SessionLocal()
    row = db.query(PlatformUser).filter(PlatformUser.email == "trial@example.com").first()
    row.email_verification_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    db.close()

    expired = client.post("/api/v1/auth/verify-email", json={"token": sent["verify"][0]["token"]})
    assert expired.status_code == 400
    assert expired.json()["detail"]["code"] == "token_expired"
    assert _row(SessionLocal, "trial@example.com").email_verified is False


def test_resend_verification_rotates_token_and_does_not_enumerate(env):
    client, _SessionLocal, sent = env
    _self_signup(client)
    first = sent["verify"][0]["token"]

    resp_known = client.post("/api/v1/auth/resend-verification", json={"email": "Trial@Example.com"})
    resp_unknown = client.post("/api/v1/auth/resend-verification", json={"email": "nobody@example.com"})
    resp_verified = client.post("/api/v1/auth/resend-verification", json={"email": "boot@example.com"})
    assert resp_known.status_code == resp_unknown.status_code == resp_verified.status_code == 200
    assert resp_known.json() == resp_unknown.json() == resp_verified.json()
    assert len(sent["verify"]) == 2
    second = sent["verify"][1]["token"]
    assert second != first

    # The superseded link no longer works; the new one does.
    assert client.post("/api/v1/auth/verify-email", json={"token": first}).status_code == 400
    assert client.post("/api/v1/auth/verify-email", json={"token": second}).status_code == 200


def test_resend_verification_per_address_quota_is_silent(env):
    client, _SessionLocal, sent = env
    _self_signup(client)
    for _ in range(5):
        resp = client.post("/api/v1/auth/resend-verification", json={"email": "trial@example.com"})
        assert resp.status_code == 200
    # 1 from signup + 3 allowed resends.
    assert len(sent["verify"]) == 4


def test_invited_and_bootstrap_and_existing_users_are_verified(env):
    client, SessionLocal, _sent = env
    # AUTH_USERS bootstrap admin logs in and its synced row is verified.
    boot = _login(client, "boot@example.com", "correct-horse")
    assert boot.status_code == 200, boot.text
    assert _row(SessionLocal, "boot@example.com").email_verified is True

    # Invite signup.
    db = SessionLocal()
    db.add(
        UserInvite(
            email="invited@example.com",
            plan="free",
            role="user",
            token="invite-token-0123456789abcdef",
            status="pending",
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
    )
    # Pre-existing row inserted without specifying email_verified (legacy row).
    db.execute(
        text(
            "INSERT INTO platform_users (email, password_hash, name, plan, subscription_status, role, "
            "is_active, token_version) VALUES ('legacy@example.com', :h, 'Legacy', 'free', 'none', 'user', 1, 0)"
        ),
        {"h": auth._hash_password(PASSWORD)},
    )
    db.commit()
    db.close()

    signup = client.post(
        "/api/v1/auth/signup",
        json={"token": "invite-token-0123456789abcdef", "name": "Invited", "password": PASSWORD},
    )
    assert signup.status_code == 200, signup.text
    assert _row(SessionLocal, "invited@example.com").email_verified is True
    assert _login(client, "invited@example.com").status_code == 200
    assert _login(client, "legacy@example.com").status_code == 200


def test_schema_patch_defaults_existing_rows_to_verified(tmp_path):
    from db.schema_patches import heal_platform_users_schema

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE platform_users (id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, "
                "password_hash VARCHAR(255) NOT NULL, name VARCHAR(120) NOT NULL, plan VARCHAR(20))"
            )
        )
        conn.execute(text("INSERT INTO platform_users (email, password_hash, name, plan) VALUES ('old@x.com', 'h', 'Old', 'free')"))
    db = sessionmaker(bind=engine)()
    try:
        applied = heal_platform_users_schema(db)
        assert "email_verified" in applied
        assert "password_reset_token_hash" in applied
        value = db.execute(text("SELECT email_verified FROM platform_users WHERE email='old@x.com'")).scalar()
        assert bool(value) is True
    finally:
        db.close()


# --- password reset ---------------------------------------------------------


def _verified_user(SessionLocal, email="user@example.com"):
    db = SessionLocal()
    db.add(
        PlatformUser(
            email=email,
            password_hash=auth._hash_password(PASSWORD),
            name="User",
            plan="pro",
            subscription_status="active",
            role="user",
            is_active=True,
        )
    )
    db.commit()
    db.close()


def test_forgot_password_does_not_enumerate(env):
    client, SessionLocal, sent = env
    _verified_user(SessionLocal)
    known = client.post("/api/v1/auth/forgot-password", json={"email": "user@example.com"})
    unknown = client.post("/api/v1/auth/forgot-password", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert [m["to"] for m in sent["reset"]] == ["user@example.com"]
    row = _row(SessionLocal, "user@example.com")
    assert row.password_reset_token_hash == hashlib.sha256(sent["reset"][0]["token"].encode()).hexdigest()


def test_reset_password_revokes_sessions_and_is_single_use(env):
    client, SessionLocal, sent = env
    _verified_user(SessionLocal)
    login = _login(client, "user@example.com")
    assert login.status_code == 200
    old_token = login.json()["token"]
    client.cookies.clear()
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 200

    client.post("/api/v1/auth/forgot-password", json={"email": "user@example.com"})
    token = sent["reset"][0]["token"]
    resp = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "brand-new-pass-9"})
    assert resp.status_code == 200, resp.text

    # Old session revoked, old password rejected, new password works.
    client.cookies.clear()
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    assert _login(client, "user@example.com").status_code == 401
    assert _login(client, "user@example.com", "brand-new-pass-9").status_code == 200

    reuse = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "another-pass-77"})
    assert reuse.status_code == 400
    assert reuse.json()["detail"]["code"] == "invalid_token"


def test_reset_password_expired_and_wrong_token(env):
    client, SessionLocal, sent = env
    _verified_user(SessionLocal)
    client.post("/api/v1/auth/forgot-password", json={"email": "user@example.com"})

    wrong = client.post("/api/v1/auth/reset-password", json={"token": "y" * 43, "password": "brand-new-pass-9"})
    assert wrong.status_code == 400
    assert wrong.json()["detail"]["code"] == "invalid_token"

    db = SessionLocal()
    row = db.query(PlatformUser).filter(PlatformUser.email == "user@example.com").first()
    row.password_reset_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    db.close()
    expired = client.post(
        "/api/v1/auth/reset-password", json={"token": sent["reset"][0]["token"], "password": "brand-new-pass-9"}
    )
    assert expired.status_code == 400
    assert expired.json()["detail"]["code"] == "token_expired"
    assert _login(client, "user@example.com").status_code == 200


def test_reset_password_rejects_short_password(env):
    client, SessionLocal, sent = env
    _verified_user(SessionLocal)
    client.post("/api/v1/auth/forgot-password", json={"email": "user@example.com"})
    resp = client.post("/api/v1/auth/reset-password", json={"token": sent["reset"][0]["token"], "password": "short"})
    assert resp.status_code == 422


def test_reset_password_verifies_unverified_mailbox(env):
    client, SessionLocal, sent = env
    _self_signup(client, "squat@example.com")
    client.post("/api/v1/auth/forgot-password", json={"email": "squat@example.com"})
    token = sent["reset"][0]["token"]
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "password": "mine-now-123"}).status_code == 200
    assert _row(SessionLocal, "squat@example.com").email_verified is True
    assert _login(client, "squat@example.com", "mine-now-123").status_code == 200


def test_forgot_password_per_address_quota_is_silent(env):
    client, SessionLocal, sent = env
    _verified_user(SessionLocal)
    for _ in range(5):
        assert client.post("/api/v1/auth/forgot-password", json={"email": "user@example.com"}).status_code == 200
    assert len(sent["reset"]) == 3


def test_forgot_password_ip_limit_returns_429(env):
    client, _SessionLocal, _sent = env
    statuses = [
        client.post("/api/v1/auth/forgot-password", json={"email": f"n{i}@example.com"}).status_code
        for i in range(12)
    ]
    assert statuses[:10] == [200] * 10
    assert statuses[-1] == 429


def test_auth_emails_skip_without_provider(monkeypatch):
    for var in ("RESEND_API_KEY", "SMTP_HOST", "AUTH_EMAIL_DEV_LOG_LINKS"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("PUBLIC_APP_ORIGIN", "https://app.example.com/")
    mail = invite_email
    assert mail.verify_email_url("abc") == "https://app.example.com/verify-email?token=abc"
    assert mail.reset_password_url("abc") == "https://app.example.com/reset-password?token=abc"
    assert mail.try_send_verification_email(to_email="a@example.com", token="abc") is False
    assert mail.try_send_password_reset_email(to_email="a@example.com", token="abc") is False
