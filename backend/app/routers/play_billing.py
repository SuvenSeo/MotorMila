"""Google Play Billing: server-side purchase verification for the Android app.

Routes (mounted at /api/v1/billing/play in app/main.py):

* ``POST /verify``  (signed-in, Bearer) — the app sends a Play purchase token.
  The server asks the Google Play Developer API (purchases.subscriptionsv2)
  whether it is a real, active MotorMila subscription bought by THIS account,
  grants the plan in ``platform_users`` (idempotent: re-sending the same token
  is a no-op) and acknowledges the purchase so Google does not auto-refund it.
  PENDING purchases are never granted or acknowledged.
* ``POST /rtdn?secret=...`` — Real-time developer notifications (Pub/Sub push).
  The message is only a hint: the token is re-verified with Google and the
  account is downgraded when the subscription expired / was revoked.

Configuration (env):

* ``PLAY_SERVICE_ACCOUNT_JSON`` — service-account key JSON (raw or base64) with
  "View financial data" + "Manage orders and subscriptions" on the Play app.
  Missing => both routes answer 503 (feature off).
* ``PLAY_PACKAGE_NAME`` (default ``lk.motormila.app``)
* ``PLAY_PRODUCT_PLANS`` (default ``motormila_pro_monthly:pro``) comma list of
  ``productId:plan``.
* ``PLAY_RTDN_SECRET`` — shared secret appended to the Pub/Sub push URL.

Account binding: the app sets ``obfuscatedAccountId = sha256(lower(email))``
on the billing flow; the server requires it to match the signed-in account, so
one purchase token cannot unlock several MotorMila accounts.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import ALLOWED_PLANS, get_current_auth_payload
from db.models import PlatformUser
from db.session import get_db

log = structlog.get_logger()

router = APIRouter()

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
_API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"

_GRANT_STATES = {"SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"}
_PENDING_STATES = {"SUBSCRIPTION_STATE_PENDING"}
# Still entitled until expiry when merely cancelled (auto-renew off).
_CANCELED_STATE = "SUBSCRIPTION_STATE_CANCELED"
_REVOKE_STATES = {
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
}

_access_token_cache: dict[str, Any] = {"token": None, "exp": 0.0}


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _package_name() -> str:
    return os.getenv("PLAY_PACKAGE_NAME", "lk.motormila.app").strip() or "lk.motormila.app"


def _product_plans() -> dict[str, str]:
    raw = os.getenv("PLAY_PRODUCT_PLANS", "motormila_pro_monthly:pro")
    plans: dict[str, str] = {}
    for item in raw.split(","):
        if ":" not in item:
            continue
        product, plan = (part.strip() for part in item.split(":", 1))
        if product and plan.lower() in ALLOWED_PLANS:
            plans[product] = plan.lower()
    return plans


def _service_account() -> Optional[dict]:
    raw = os.getenv("PLAY_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        return None
    if not raw.startswith("{"):
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except Exception:  # pragma: no cover - misconfiguration
            return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not data.get("client_email") or not data.get("private_key"):
        return None
    return data


def account_hash(email: str) -> str:
    """Must match the Android client's obfuscatedAccountId."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Google API access (service-account JWT bearer flow, RS256 via cryptography)
# ---------------------------------------------------------------------------


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _signed_assertion(sa: dict, now: float) -> str:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": sa["client_email"],
        "scope": _SCOPE,
        "aud": _TOKEN_URL,
        "iat": int(now),
        "exp": int(now) + 3600,
    }
    signing_input = f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(claims).encode())}"
    key = serialization.load_pem_private_key(sa["private_key"].encode("utf-8"), password=None)
    signature = key.sign(signing_input.encode("ascii"), padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input}.{_b64url(signature)}"


def _access_token() -> str:
    now = time.time()
    if _access_token_cache["token"] and _access_token_cache["exp"] - 60 > now:
        return _access_token_cache["token"]
    sa = _service_account()
    if sa is None:
        raise HTTPException(status_code=503, detail="Play billing verification is not configured.")
    resp = httpx.post(
        _TOKEN_URL,
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": _signed_assertion(sa, now),
        },
        timeout=10.0,
    )
    if resp.status_code != 200:
        log.warning("play_token_exchange_failed", status=resp.status_code)
        raise HTTPException(status_code=502, detail="Could not reach Google Play.")
    body = resp.json()
    _access_token_cache["token"] = body["access_token"]
    _access_token_cache["exp"] = now + float(body.get("expires_in", 3600))
    return body["access_token"]


def fetch_subscription(package_name: str, purchase_token: str) -> dict:
    """purchases.subscriptionsv2.get — the source of truth for a token."""
    resp = httpx.get(
        f"{_API}/{package_name}/purchases/subscriptionsv2/tokens/{purchase_token}",
        headers={"Authorization": f"Bearer {_access_token()}"},
        timeout=10.0,
    )
    if resp.status_code in (400, 404, 410):
        raise HTTPException(status_code=400, detail="Unknown or invalid purchase token.")
    if resp.status_code != 200:
        log.warning("play_subscription_lookup_failed", status=resp.status_code)
        raise HTTPException(status_code=502, detail="Could not verify with Google Play.")
    return resp.json()


def acknowledge_subscription(package_name: str, product_id: str, purchase_token: str) -> bool:
    resp = httpx.post(
        f"{_API}/{package_name}/purchases/subscriptions/{product_id}/tokens/{purchase_token}:acknowledge",
        headers={"Authorization": f"Bearer {_access_token()}"},
        json={},
        timeout=10.0,
    )
    if resp.status_code not in (200, 204):
        log.warning("play_acknowledge_failed", status=resp.status_code)
        return False
    return True


# ---------------------------------------------------------------------------
# Pure decision helpers (unit-tested)
# ---------------------------------------------------------------------------


def _line_item(sub: dict, product_id: str) -> Optional[dict]:
    for item in sub.get("lineItems") or []:
        if item.get("productId") == product_id:
            return item
    return None


def _expiry_ms(item: Optional[dict]) -> Optional[int]:
    if not item or not item.get("expiryTime"):
        return None
    from datetime import datetime

    try:
        value = str(item["expiryTime"]).replace("Z", "+00:00")
        return int(datetime.fromisoformat(value).timestamp() * 1000)
    except ValueError:
        return None


def entitlement(sub: dict, product_id: str, now_ms: Optional[int] = None) -> str:
    """'grant' | 'pending' | 'revoke' for a subscriptionsv2 resource."""
    state = sub.get("subscriptionState", "")
    if state in _PENDING_STATES:
        return "pending"
    item = _line_item(sub, product_id)
    if item is None:
        return "revoke"
    if state in _GRANT_STATES:
        return "grant"
    if state == _CANCELED_STATE:
        expiry = _expiry_ms(item)
        now = int(time.time() * 1000) if now_ms is None else now_ms
        return "grant" if expiry is not None and expiry > now else "revoke"
    return "revoke"


def _apply_plan(db: Session, email: str, plan: str, status: str) -> PlatformUser:
    user = db.query(PlatformUser).filter(PlatformUser.email == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    if user.plan != plan or user.subscription_status != status:
        # Live sessions re-read plan from the DB (resolve_live_session), so the
        # token_version is NOT bumped: the app stays signed in.
        user.plan = plan
        user.subscription_status = status
        db.commit()
    return user


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


class PlayVerifyRequest(BaseModel):
    purchase_token: str = Field(..., min_length=10, max_length=4096)
    product_id: str = Field(..., min_length=1, max_length=200)
    package_name: Optional[str] = Field(default=None, max_length=200)


@router.post("/verify")
def verify_play_purchase(
    body: PlayVerifyRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    live = get_current_auth_payload(request, authorization, db)
    email = str(live["email"]).strip().lower()

    if _service_account() is None:
        raise HTTPException(status_code=503, detail="Play billing verification is not configured.")
    package_name = _package_name()
    if body.package_name and body.package_name != package_name:
        raise HTTPException(status_code=400, detail="Unknown package.")
    plan = _product_plans().get(body.product_id)
    if plan is None:
        raise HTTPException(status_code=400, detail="Unknown product.")

    sub = fetch_subscription(package_name, body.purchase_token)

    owner = ((sub.get("externalAccountIdentifiers") or {}).get("obfuscatedExternalAccountId") or "").strip()
    if not owner or not hmac.compare_digest(owner, account_hash(email)):
        raise HTTPException(status_code=403, detail="This purchase belongs to another account.")

    decision = entitlement(sub, body.product_id)
    if decision == "pending":
        return {"ok": False, "status": "pending", "plan": live.get("plan"), "acknowledged": False}
    if decision != "grant":
        return {"ok": False, "status": "inactive", "plan": live.get("plan"), "acknowledged": False}

    _apply_plan(db, email, plan, "active")

    acknowledged = sub.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
    if not acknowledged:
        acknowledged = acknowledge_subscription(package_name, body.product_id, body.purchase_token)

    expiry = _expiry_ms(_line_item(sub, body.product_id))
    log.info("play_purchase_verified", plan=plan, acknowledged=acknowledged)
    return {
        "ok": True,
        "status": "active",
        "plan": plan,
        "expires_at": (
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expiry / 1000)) if expiry else None
        ),
        "acknowledged": acknowledged,
    }


async def _raw_body(request: Request) -> bytes:
    """Read the request body on the event loop so the route itself can be sync."""
    return await request.body()


@router.post("/rtdn")
def play_rtdn(
    secret: str = Query(default=""),
    raw_body: bytes = Depends(_raw_body),
    db: Session = Depends(get_db),
) -> dict:
    # Plain ``def``: fetch_subscription does blocking httpx calls and the DB
    # work is sync SQLAlchemy, so FastAPI must run this in the threadpool.
    expected = os.getenv("PLAY_RTDN_SECRET", "").strip()
    if not expected or not hmac.compare_digest(secret, expected):
        raise HTTPException(status_code=403, detail="Forbidden.")
    if _service_account() is None:
        raise HTTPException(status_code=503, detail="Play billing verification is not configured.")
    try:
        envelope = json.loads(raw_body)
        data = json.loads(base64.b64decode(envelope["message"]["data"]).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Pub/Sub message.") from exc

    note = data.get("subscriptionNotification") or {}
    token = note.get("purchaseToken")
    product_id = note.get("subscriptionId")
    if not token or not product_id:
        # Test notifications / one-time products: acknowledge receipt.
        return {"ok": True, "ignored": True}
    plan = _product_plans().get(product_id)
    if plan is None:
        return {"ok": True, "ignored": True}

    sub = fetch_subscription(_package_name(), token)
    owner = ((sub.get("externalAccountIdentifiers") or {}).get("obfuscatedExternalAccountId") or "").strip()
    if not owner:
        return {"ok": True, "ignored": True}
    # Small user base: match the account hash against users on this plan.
    users = db.query(PlatformUser).filter(PlatformUser.plan == plan).all()
    match = next((u for u in users if hmac.compare_digest(account_hash(u.email), owner)), None)
    decision = entitlement(sub, product_id)
    if match is not None and decision == "revoke":
        _apply_plan(db, match.email.lower(), "free", "canceled")
        log.info("play_subscription_revoked")
    return {"ok": True, "decision": decision}
