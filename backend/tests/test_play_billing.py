"""Server-side Google Play purchase verification (app/routers/play_billing.py).

Google APIs are monkeypatched: these tests pin the grant / pending / revoke
policy, account binding, idempotency and acknowledgement behaviour.
"""

from __future__ import annotations

import base64
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
from app.routers import play_billing
from db.models import Base, PlatformUser
from db.session import get_db

EMAIL = "buyer@example.com"
TOKEN = "purchase-token-123456"
PRODUCT = "motormila_pro_monthly"


def _sub(state="SUBSCRIPTION_STATE_ACTIVE", owner=None, ack="ACKNOWLEDGEMENT_STATE_PENDING", expiry="2099-01-01T00:00:00Z"):
    return {
        "subscriptionState": state,
        "acknowledgementState": ack,
        "externalAccountIdentifiers": {
            "obfuscatedExternalAccountId": owner if owner is not None else play_billing.account_hash(EMAIL)
        },
        "lineItems": [{"productId": PRODUCT, "expiryTime": expiry}],
    }


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret-play")
    monkeypatch.setattr("app.main.SKIP_DB_INIT", True)
    monkeypatch.setenv("AUTH_USERS", "[]")
    monkeypatch.setenv(
        "PLAY_SERVICE_ACCOUNT_JSON",
        json.dumps({"client_email": "svc@example.iam.gserviceaccount.com", "private_key": "unused-in-tests"}),
    )
    monkeypatch.setenv("PLAY_RTDN_SECRET", "rtdn-secret")

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    db.add(
        PlatformUser(
            email=EMAIL, password_hash="x", name="Buyer", plan="free",
            subscription_status="none", role="user", is_active=True, token_version=0,
        )
    )
    db.commit()
    db.close()

    def override_get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    state = {"sub": _sub(), "acks": 0}
    monkeypatch.setattr(play_billing, "fetch_subscription", lambda pkg, tok: state["sub"])

    def fake_ack(pkg, product, tok):
        state["acks"] += 1
        return True

    monkeypatch.setattr(play_billing, "acknowledge_subscription", fake_ack)
    token, _ = auth.issue_token(EMAIL, "free", "none", token_version=0)
    with TestClient(app) as client:
        yield client, {"Authorization": f"Bearer {token}"}, state, Session
    app.dependency_overrides.clear()


def _plan(Session):
    s = Session()
    try:
        return s.query(PlatformUser).filter(PlatformUser.email == EMAIL).one().plan
    finally:
        s.close()


def _verify(client, headers):
    return client.post(
        "/api/v1/billing/play/verify",
        json={"purchase_token": TOKEN, "product_id": PRODUCT, "package_name": "lk.motormila.app"},
        headers=headers,
    )


def test_requires_auth(env):
    client, _, _, _ = env
    assert _verify(client, {}).status_code == 401


def test_active_purchase_grants_plan_and_acknowledges_once(env):
    client, headers, state, Session = env
    res = _verify(client, headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is True and body["plan"] == "pro" and body["acknowledged"] is True
    assert _plan(Session) == "pro"
    assert state["acks"] == 1
    # Idempotent: Google now reports it acknowledged; replay grants nothing new.
    state["sub"] = _sub(ack="ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
    again = _verify(client, headers)
    assert again.status_code == 200 and again.json()["ok"] is True
    assert state["acks"] == 1
    # The session survives (token_version is not bumped).
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200


def test_pending_purchase_is_not_granted_or_acknowledged(env):
    client, headers, state, Session = env
    state["sub"] = _sub(state="SUBSCRIPTION_STATE_PENDING")
    body = _verify(client, headers).json()
    assert body["ok"] is False and body["status"] == "pending"
    assert _plan(Session) == "free"
    assert state["acks"] == 0


def test_purchase_from_another_account_is_rejected(env):
    client, headers, state, Session = env
    state["sub"] = _sub(owner=play_billing.account_hash("someone-else@example.com"))
    assert _verify(client, headers).status_code == 403
    state["sub"] = _sub(owner="")
    assert _verify(client, headers).status_code == 403
    assert _plan(Session) == "free"


def test_unknown_product_rejected(env):
    client, headers, _, _ = env
    res = client.post(
        "/api/v1/billing/play/verify",
        json={"purchase_token": TOKEN, "product_id": "something_else"},
        headers=headers,
    )
    assert res.status_code == 400


def test_not_configured_returns_503(env, monkeypatch):
    client, headers, _, _ = env
    monkeypatch.delenv("PLAY_SERVICE_ACCOUNT_JSON")
    assert _verify(client, headers).status_code == 503


def test_entitlement_policy():
    now = 1_700_000_000_000
    assert play_billing.entitlement(_sub(), PRODUCT, now) == "grant"
    assert play_billing.entitlement(_sub(state="SUBSCRIPTION_STATE_IN_GRACE_PERIOD"), PRODUCT, now) == "grant"
    assert play_billing.entitlement(_sub(state="SUBSCRIPTION_STATE_PENDING"), PRODUCT, now) == "pending"
    assert play_billing.entitlement(_sub(state="SUBSCRIPTION_STATE_EXPIRED"), PRODUCT, now) == "revoke"
    assert play_billing.entitlement(_sub(state="SUBSCRIPTION_STATE_CANCELED"), PRODUCT, now) == "grant"
    assert (
        play_billing.entitlement(
            _sub(state="SUBSCRIPTION_STATE_CANCELED", expiry="2001-01-01T00:00:00Z"), PRODUCT, now
        )
        == "revoke"
    )
    assert play_billing.entitlement(_sub(), "other_product", now) == "revoke"


def test_rtdn_downgrades_expired_subscription(env):
    client, headers, state, Session = env
    assert _verify(client, headers).json()["plan"] == "pro"
    state["sub"] = _sub(state="SUBSCRIPTION_STATE_EXPIRED")
    message = {
        "message": {
            "data": base64.b64encode(
                json.dumps(
                    {"subscriptionNotification": {"purchaseToken": TOKEN, "subscriptionId": PRODUCT}}
                ).encode()
            ).decode()
        }
    }
    assert client.post("/api/v1/billing/play/rtdn?secret=wrong", json=message).status_code == 403
    res = client.post("/api/v1/billing/play/rtdn?secret=rtdn-secret", json=message)
    assert res.status_code == 200 and res.json()["decision"] == "revoke"
    assert _plan(Session) == "free"


def test_service_account_assertion_is_valid_rs256():
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    jwt = play_billing._signed_assertion({"client_email": "svc@x.iam", "private_key": pem}, 1_700_000_000)
    header_b64, claims_b64, sig_b64 = jwt.split(".")
    pad = lambda s: s + "=" * (-len(s) % 4)  # noqa: E731
    claims = json.loads(base64.urlsafe_b64decode(pad(claims_b64)))
    assert claims["iss"] == "svc@x.iam" and claims["scope"].endswith("androidpublisher")
    key.public_key().verify(
        base64.urlsafe_b64decode(pad(sig_b64)),
        f"{header_b64}.{claims_b64}".encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
