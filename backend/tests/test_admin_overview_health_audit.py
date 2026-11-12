"""Tests for the CeyFi-style admin additions: overview activity figures,
the admin health endpoint, and the admin audit log.

Mirrors the fixture in test_admin_invites.py (in-memory SQLite, an
AUTH_USERS admin, SKIP_DB_INIT) so the file runs standalone.
"""

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
from db.models import Base
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
    return {"Authorization": f"Bearer {token}"}


def test_overview_reports_activity_and_moderation_pending(client: TestClient):
    headers = _admin_headers(client)
    # Logging in heals the AUTH_USERS admin into platform_users with a
    # fresh last_login_at, so the "empty" DB still has exactly one
    # active user and one sign-up (today). Moderation and feedback,
    # which login does not touch, stay empty.
    response = client.get("/api/v1/admin/overview", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["users"]["active7"] == 1
    assert body["users"]["active30"] == 1
    assert sum(day["count"] for day in body["signupsDaily"]) >= 1
    assert body["recentUsers"], "the healed admin row should appear as a recent user"
    assert body["moderation"]["pending"] == 0
    assert body["recentFeedback"] == []


def test_health_reports_database_and_no_scrapes(client: TestClient):
    headers = _admin_headers(client)
    response = client.get("/api/v1/admin/health", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["databaseOk"] is True
    assert body["liveListings"] == 0
    assert body["lastScrape"] is None
    assert body["failedScrapes24h"] == 0
    assert body["recentErrors"] == []
    # The bundle carries no commit id: null, never an invented value.
    assert body["version"] is None
    assert body["commit"] is None


def test_invite_create_writes_audit_log(client: TestClient):
    headers = _admin_headers(client)
    created = client.post(
        "/api/v1/admin/invites",
        json={"email": "newperson@example.com", "plan": "free", "role": "user"},
        headers=headers,
    )
    assert created.status_code == 200, created.text

    log = client.get("/api/v1/admin/audit-log", headers=headers)
    assert log.status_code == 200, log.text
    items = log.json()["items"]
    assert items, "expected at least one audit row after creating an invite"
    assert items[0]["action"] == "invite_created"
    assert items[0]["actorEmail"] == "owner@example.com"
    assert items[0]["targetType"] == "invite"


def test_non_admin_cannot_read_audit_log(client: TestClient):
    response = client.get("/api/v1/admin/audit-log")
    assert response.status_code in {401, 403}
