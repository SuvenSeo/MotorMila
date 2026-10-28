"""OWNER_EMAILS allowlist: owner accounts are always admin + enterprise + active."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import auth
from app.core.owners import is_owner_email, owner_emails
from app.main import app
from app.utils.plan_limits import is_free_browse_plan
from db.models import Base, PlatformUser
from db.session import get_db

_BCRYPT_HASH = auth._hash_password("correct-horse")
OWNER = "suvenseoras@gmail.com"


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret-owner")
    monkeypatch.setattr("app.main.SKIP_DB_INIT", True)
    monkeypatch.setenv("APP_ACCESS_ENFORCED", "true")
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")
    monkeypatch.delenv("OWNER_EMAILS", raising=False)
    # A non-owner bootstrap account so auth counts as configured.
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "bootstrap@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Bootstrap",
                    "plan": "free",
                    "subscription_status": "none",
                    "role": "user",
                }
            ]
        ),
    )

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    auth._login_rate_limiter.reset()
    auth._me_rate_limiter.reset()
    with TestClient(app) as client:
        yield client, SessionLocal
    app.dependency_overrides.clear()


def _add_user(SessionLocal, email, *, plan="free", status="none", role="user", active=True):
    db = SessionLocal()
    try:
        db.add(
            PlatformUser(
                email=email,
                password_hash=_BCRYPT_HASH,
                name="Some One",
                plan=plan,
                subscription_status=status,
                role=role,
                is_active=active,
            )
        )
        db.commit()
    finally:
        db.close()


def _row(SessionLocal, email):
    db = SessionLocal()
    try:
        return db.query(PlatformUser).filter(PlatformUser.email == email).first()
    finally:
        db.close()


def _login(client, email):
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": "correct-horse"})
    return resp


def test_owner_emails_default_and_override(monkeypatch):
    monkeypatch.delenv("OWNER_EMAILS", raising=False)
    assert owner_emails() == frozenset({OWNER})
    assert is_owner_email("  SuvenSeoras@Gmail.com ")
    assert not is_owner_email("someone@example.com")
    assert not is_owner_email(None)
    monkeypatch.setenv("OWNER_EMAILS", "a@x.com, B@y.com ,")
    assert owner_emails() == frozenset({"a@x.com", "b@y.com"})
    assert not is_owner_email(OWNER)
    monkeypatch.setenv("OWNER_EMAILS", "")
    assert owner_emails() == frozenset()


def test_owner_login_heals_free_row_to_admin_enterprise(env):
    client, SessionLocal = env
    _add_user(SessionLocal, OWNER, plan="free", status="none", role="user")

    resp = _login(client, OWNER.upper())
    assert resp.status_code == 200, resp.text
    user = resp.json()["user"]
    assert user["role"] == "admin"
    assert user["plan"] == "enterprise"
    assert user["subscriptionStatus"] == "active"

    payload = auth.verify_token(resp.json()["token"])
    assert payload["role"] == "admin"
    assert payload["plan"] == "enterprise"
    assert payload["subscription_status"] == "active"

    row = _row(SessionLocal, OWNER)
    assert (row.role, row.plan, row.subscription_status, row.is_active) == (
        "admin",
        "enterprise",
        "active",
        True,
    )


def test_owner_existing_session_gains_admin_and_pro(env):
    """A token issued while the owner was free/user unlocks admin + pro live."""
    client, SessionLocal = env
    _add_user(SessionLocal, OWNER, plan="free", status="none", role="user")
    token, _ = auth.issue_token(OWNER, "free", "none", role="user", token_version=0)
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    assert me.json()["role"] == "admin"
    assert me.json()["plan"] == "enterprise"

    overview = client.get("/api/v1/admin/overview", headers=headers)
    assert overview.status_code == 200, overview.text

    payload = auth.verify_token(token)
    live = auth.resolve_live_session(payload, SessionLocal())
    assert live["role"] == "admin" and live["plan"] == "enterprise"
    assert not is_free_browse_plan(live["plan"], role=live["role"])


def test_owner_demoted_by_admin_is_healed_on_next_request(env):
    client, SessionLocal = env
    _add_user(SessionLocal, OWNER, plan="enterprise", status="active", role="admin")
    db = SessionLocal()
    row = db.query(PlatformUser).filter(PlatformUser.email == OWNER).first()
    row.role = "user"
    row.plan = "free"
    row.subscription_status = "canceled"
    row.is_active = False
    db.commit()
    db.close()

    resp = _login(client, OWNER)
    assert resp.status_code == 200, resp.text
    headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    assert client.get("/api/v1/admin/users", headers=headers).status_code == 200
    row = _row(SessionLocal, OWNER)
    assert row.is_active is True and row.role == "admin" and row.plan == "enterprise"


def test_require_pro_access_passes_for_owner(env, monkeypatch):
    client, SessionLocal = env
    _add_user(SessionLocal, OWNER, plan="pro", status="trialing", role="user")
    token, _ = auth.issue_token(OWNER, "pro", "trialing", role="user")

    class Req:
        method = "GET"
        headers = {"user-agent": "pytest"}
        cookies: dict = {}

    db = SessionLocal()
    try:
        assert auth.require_pro_access(Req(), f"Bearer {token}", db) is None
    finally:
        db.close()


def test_non_owner_is_not_elevated(env):
    client, SessionLocal = env
    _add_user(SessionLocal, "buyer@example.com", plan="free", status="none", role="user")
    resp = _login(client, "buyer@example.com")
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["role"] == "user"
    assert resp.json()["user"]["plan"] == "free"
    headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    assert client.get("/api/v1/admin/overview", headers=headers).status_code == 403
    row = _row(SessionLocal, "buyer@example.com")
    assert row.role == "user" and row.plan == "free"


def test_owner_without_account_is_not_created(env):
    client, SessionLocal = env
    resp = _login(client, OWNER)
    assert resp.status_code == 401
    assert _row(SessionLocal, OWNER) is None


def test_owner_emails_can_be_disabled(env, monkeypatch):
    client, SessionLocal = env
    monkeypatch.setenv("OWNER_EMAILS", "")
    _add_user(SessionLocal, OWNER, plan="free", status="none", role="user")
    resp = _login(client, OWNER)
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "user"


def test_env_owner_record_is_elevated(env, monkeypatch):
    """An AUTH_USERS owner entry with a weaker plan still logs in as owner."""
    client, SessionLocal = env
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": OWNER,
                    "password_hash": _BCRYPT_HASH,
                    "name": "Suven",
                    "plan": "free",
                    "subscription_status": "none",
                    "role": "user",
                }
            ]
        ),
    )
    resp = _login(client, OWNER)
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["role"] == "admin"
    assert resp.json()["user"]["plan"] == "enterprise"
    row = _row(SessionLocal, OWNER)
    assert row is not None and row.role == "admin" and row.plan == "enterprise"


def test_owner_email_cannot_be_self_registered(env, monkeypatch):
    """Self-signup does not verify mailbox ownership; an unregistered owner
    address must not be claimable (it would be healed to enterprise admin)."""
    client, SessionLocal = env
    monkeypatch.setenv("SELF_SIGNUP", "true")

    resp = client.post(
        "/api/v1/auth/self-signup",
        json={"email": " SuvenSeoras@Gmail.com ", "name": "Mallory", "password": "a-long-password-1"},
    )
    assert resp.status_code == 403, resp.text
    assert "Owner email" in resp.json()["detail"]
    assert _row(SessionLocal, OWNER) is None

    # Non-owner addresses still self-register normally.
    ok = client.post(
        "/api/v1/auth/self-signup",
        json={"email": "trial@example.com", "name": "Trial", "password": "a-long-password-1"},
    )
    assert ok.status_code == 200, ok.text
    assert _row(SessionLocal, "trial@example.com") is not None
