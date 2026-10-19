"""Moderation queue, account deletion (DELETE /auth/me), billing webhook replay protection."""

from __future__ import annotations

import hashlib
import hmac
import json
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import auth, billing  # noqa: E402
from app.main import app  # noqa: E402
from db.models import Base, BillingWebhookEvent, CarListing, MarketAlert, PlatformUser, live_listing_filter  # noqa: E402
from db.session import get_db  # noqa: E402

_HASH = auth._hash_password("correct-horse")
ORIGIN = {"Origin": "https://motormila.vercel.app"}


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret-mod")
    monkeypatch.setattr("app.main.SKIP_DB_INIT", True)
    monkeypatch.setenv("APP_ACCESS_ENFORCED", "true")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "owner@example.com",
                    "password_hash": _HASH,
                    "name": "Owner",
                    "plan": "enterprise",
                    "subscription_status": "active",
                    "role": "admin",
                }
            ]
        ),
    )
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(billing, "SessionLocal", Session)
    auth._login_rate_limiter.reset()
    auth._me_rate_limiter.reset()
    auth._delete_account_limiter.reset()
    with TestClient(app) as client:
        yield client, Session
    app.dependency_overrides.clear()


def _login(client, email, password="correct-horse") -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password}, headers=ORIGIN)
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _make_user(Session, email="seller@example.com"):
    db = Session()
    db.add(
        PlatformUser(
            email=email, password_hash=_HASH, name="Seller", plan="free",
            subscription_status="none", role="user", is_active=True,
        )
    )
    db.commit()
    db.close()


# ── moderation ──────────────────────────────────────────────────────────────

def test_user_listing_pending_until_admin_approves(env):
    client, Session = env
    _make_user(Session)
    seller = _login(client, "seller@example.com")
    admin = _login(client, "owner@example.com")

    created = client.post(
        "/api/v1/listings/mine",
        json={"make": "Toyota", "model": "Aqua", "year": 2015, "price_lkr": 6_000_000},
        headers={**seller, **ORIGIN},
    )
    assert created.status_code == 201, created.text
    listing_id = created.json()["id"]
    assert created.json()["status"] == "pending"

    db = Session()
    assert db.query(CarListing).filter(live_listing_filter()).count() == 0
    db.close()

    # Hidden from the public detail endpoint; visible to the owner.
    client.cookies.clear()
    assert client.get(f"/api/v1/listings/{listing_id}").status_code == 404
    assert client.get(f"/api/v1/listings/{listing_id}", headers=seller).status_code == 200

    queue = client.get("/api/v1/admin/listings/moderation", headers=admin)
    assert queue.status_code == 200
    assert [i["id"] for i in queue.json()["items"]] == [listing_id]

    # Non-admin cannot approve.
    assert client.post(f"/api/v1/admin/listings/{listing_id}/approve", headers=seller).status_code == 403

    approved = client.post(f"/api/v1/admin/listings/{listing_id}/approve", headers=admin)
    assert approved.status_code == 200
    assert approved.json()["status"] == "published"
    db = Session()
    assert db.query(CarListing).filter(live_listing_filter()).count() == 1
    db.close()
    assert client.get(f"/api/v1/listings/{listing_id}").status_code == 200

    # Editing content after approval sends it back to review.
    edited = client.patch(
        f"/api/v1/listings/mine/{listing_id}", json={"price_lkr": 5_000_000}, headers={**seller, **ORIGIN}
    )
    assert edited.status_code == 200
    assert edited.json()["status"] == "pending"
    db = Session()
    assert db.query(CarListing).filter(live_listing_filter()).count() == 0
    db.close()


def test_admin_cookie_write_from_foreign_origin_blocked(env):
    client, _ = env
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "correct-horse"},
        headers=ORIGIN,
    )
    assert r.status_code == 200
    # Cookie is now set on the client; a foreign-origin cookie-only POST is refused.
    resp = client.post(
        "/api/v1/admin/invites",
        json={"email": "x@example.com", "plan": "free"},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403


# ── account deletion ────────────────────────────────────────────────────────

def test_delete_my_account_removes_user_data_and_revokes_tokens(env):
    client, Session = env
    _make_user(Session)
    seller = _login(client, "seller@example.com")
    client.post(
        "/api/v1/listings/mine",
        json={"make": "Honda", "model": "Fit", "contact_phone": "0771234567"},
        headers={**seller, **ORIGIN},
    )
    db = Session()
    db.add(MarketAlert(user_token="mm:seller@example.com", make="Honda", active=True))
    db.commit()
    db.close()

    wrong = client.request("DELETE", "/api/v1/auth/me", json={"password": "nope"}, headers=seller)
    assert wrong.status_code == 403

    r = client.request("DELETE", "/api/v1/auth/me", headers=seller)
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] is True

    db = Session()
    assert db.query(PlatformUser).filter(PlatformUser.email == "seller@example.com").count() == 0
    assert db.query(CarListing).filter(CarListing.owner_user_id == "seller@example.com").count() == 0
    assert db.query(MarketAlert).filter(MarketAlert.user_token == "mm:seller@example.com").count() == 0
    db.close()

    # Outstanding token no longer works.
    assert client.get("/api/v1/auth/me", headers=seller).status_code == 401


def test_delete_requires_auth_and_protects_bootstrap_account(env):
    client, _ = env
    client.cookies.clear()
    assert client.request("DELETE", "/api/v1/auth/me").status_code == 401
    admin = _login(client, "owner@example.com")
    assert client.request("DELETE", "/api/v1/auth/me", headers=admin).status_code == 409


# ── billing webhook ─────────────────────────────────────────────────────────

def _signed(body: dict, secret="whsec", ts=None):
    raw = json.dumps(body).encode()
    ts = int(time.time()) if ts is None else ts
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    return raw, {
        "X-Motormila-Signature": f"sha256={sig}",
        "X-Motormila-Timestamp": str(ts),
        "Content-Type": "application/json",
    }


def test_billing_webhook_applies_once_and_rejects_replay(env, monkeypatch):
    client, Session = env
    monkeypatch.setenv("BILLING_WEBHOOK_SECRET", "whsec")
    billing._SEEN_EVENTS.clear()
    _make_user(Session, "payer@example.com")
    raw, headers = _signed({"email": "payer@example.com", "plan": "pro", "event_id": "evt_1"})

    first = client.post("/api/v1/billing/webhook", content=raw, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["plan"] == "pro"

    billing._SEEN_EVENTS.clear()  # prove the durable store dedupes too
    again = client.post("/api/v1/billing/webhook", content=raw, headers=headers)
    assert again.status_code == 200
    assert again.json()["duplicate"] is True
    db = Session()
    assert db.get(BillingWebhookEvent, "evt_1") is not None
    db.close()


def test_billing_webhook_rejects_stale_timestamp_bad_sig_and_missing_event(env, monkeypatch):
    client, Session = env
    monkeypatch.setenv("BILLING_WEBHOOK_SECRET", "whsec")
    billing._SEEN_EVENTS.clear()
    _make_user(Session, "payer2@example.com")

    raw, headers = _signed({"email": "payer2@example.com", "plan": "pro", "event_id": "e2"}, ts=int(time.time()) - 3600)
    assert client.post("/api/v1/billing/webhook", content=raw, headers=headers).status_code == 401

    raw, headers = _signed({"email": "payer2@example.com", "plan": "pro", "event_id": "e3"}, secret="wrong")
    assert client.post("/api/v1/billing/webhook", content=raw, headers=headers).status_code == 401

    raw, headers = _signed({"email": "payer2@example.com", "plan": "pro"})
    assert client.post("/api/v1/billing/webhook", content=raw, headers=headers).status_code == 400

    # Legacy body-only signature refused by default.
    raw = json.dumps({"email": "payer2@example.com", "plan": "pro", "event_id": "e4"}).encode()
    sig = hmac.new(b"whsec", raw, hashlib.sha256).hexdigest()
    legacy = client.post(
        "/api/v1/billing/webhook", content=raw,
        headers={"X-Motormila-Signature": sig, "Content-Type": "application/json"},
    )
    assert legacy.status_code == 401
