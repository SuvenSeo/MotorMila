"""Tests for admin invites, signup, and plan management."""

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
from app.main import app
from db.models import Base, PlatformUser
from db.session import get_db

_BCRYPT_HASH = auth._hash_password("correct-horse")


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret-admin")
    monkeypatch.setattr("app.main.SKIP_DB_INIT", True)
    monkeypatch.setenv("APP_ACCESS_ENFORCED", "true")
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "owner@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Owner Person",
                    "plan": "enterprise",
                    "subscription_status": "active",
                    "role": "admin",
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
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    auth._login_rate_limiter.reset()
    auth._me_rate_limiter.reset()
    auth._signup_rate_limiter.reset()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def _admin_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "correct-horse"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["token"]
    assert response.json()["user"]["role"] == "admin"
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_invite_and_user_can_signup(client: TestClient):
    headers = _admin_headers(client)

    invite = client.post(
        "/api/v1/admin/invites",
        headers=headers,
        json={"email": "buyer@example.com", "plan": "free", "role": "user"},
    )
    assert invite.status_code == 200, invite.text
    body = invite.json()
    assert body["email"] == "buyer@example.com"
    assert body["plan"] == "free"
    token = body["token"]

    preview = client.get(f"/api/v1/auth/invite/{token}")
    assert preview.status_code == 200
    assert preview.json()["email"] == "buyer@example.com"

    signup = client.post(
        "/api/v1/auth/signup",
        json={"token": token, "name": "Buyer One", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text
    user = signup.json()["user"]
    assert user["email"] == "buyer@example.com"
    assert user["plan"] == "free"
    assert user["role"] == "user"
    assert user["subscriptionStatus"] == "none"

    overview = client.get("/api/v1/admin/overview", headers=headers)
    assert overview.status_code == 200
    assert overview.json()["users"]["total"] >= 1
    assert overview.json()["users"]["free"] >= 1


def test_admin_can_upgrade_user_to_pro(client: TestClient):
    headers = _admin_headers(client)
    invite = client.post(
        "/api/v1/admin/invites",
        headers=headers,
        json={"email": "prouser@example.com", "plan": "free"},
    ).json()
    client.post(
        "/api/v1/auth/signup",
        json={"token": invite["token"], "name": "Pro Candidate", "password": "password123"},
    )

    users = client.get("/api/v1/admin/users", headers=headers).json()["users"]
    target = next(row for row in users if row["email"] == "prouser@example.com")

    updated = client.patch(
        f"/api/v1/admin/users/{target['id']}",
        headers=headers,
        json={"plan": "pro"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["plan"] == "pro"
    assert updated.json()["subscriptionStatus"] == "active"

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "prouser@example.com", "password": "password123"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["plan"] == "pro"


def test_non_admin_cannot_invite(client: TestClient):
    headers = _admin_headers(client)
    invite = client.post(
        "/api/v1/admin/invites",
        headers=headers,
        json={"email": "regular@example.com", "plan": "pro"},
    ).json()
    signup = client.post(
        "/api/v1/auth/signup",
        json={"token": invite["token"], "name": "Regular", "password": "password123"},
    )
    user_token = signup.json()["token"]

    denied = client.post(
        "/api/v1/admin/invites",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"email": "someone@example.com", "plan": "free"},
    )
    assert denied.status_code == 403


def test_app_access_gate_requires_auth(client: TestClient):
    # Public-browse allowlist stays open without a session even when enforced.
    # B2-A extends it to listing detail/sub-reads, stats trends, ev + market reads.
    for public_path in (
        "/api/v1/listings",
        "/api/v1/listings/price-drops",
        "/api/v1/stats/summary",
        "/api/v1/stats/district-prices",
        "/api/v1/stats/district-velocity",
        "/api/v1/stats/trends",
        "/api/v1/ev/charging-stations?lat=6.9&lng=79.86&radius_km=5",
        "/api/v1/market/summary",
    ):
        assert client.get(public_path).status_code != 401

    # Non-allowlisted product routes still require a session.
    assert client.get("/api/v1/vehicles/safety-research").status_code == 401
    # Writes and privileged surfaces stay gated (B2-A boundary).
    # Unsafe methods without a Bearer token are CSRF-blocked (403) before
    # the auth-session check ever runs (see require_authenticated).
    assert client.post("/api/v1/alerts", json={}).status_code in (401, 403)
    assert client.post("/api/v1/dealer/verify", json={}).status_code in (401, 403)
    assert client.get("/api/v1/pro/market-snapshot").status_code in (401, 403)

    headers = _admin_headers(client)
    allowed = client.get("/api/v1/stats/summary", headers=headers)
    # May be empty/zero but must not be auth-blocked.
    assert allowed.status_code != 401
