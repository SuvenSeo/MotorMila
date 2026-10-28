"""Billing webhook — upgrade/downgrade Motormila plans from Stripe (or compatible) events.

Requires BILLING_WEBHOOK_SECRET. Without it the endpoint returns 503.
This does not create Stripe Checkout sessions; wire your Stripe dashboard /
PayHere success hook to POST here after payment succeeds.

Signing scheme (v2, replay-protected):
    X-Motormila-Timestamp: <unix seconds>
    X-Motormila-Signature: sha256=<hex HMAC-SHA256(secret, f"{timestamp}." + raw_body)>
    body must include a unique "event_id".
Requests older/newer than BILLING_WEBHOOK_TOLERANCE_SECONDS (default 300)
are rejected, and each event_id is applied at most once (stored in
billing_webhook_events; an in-process cache covers a missing table).
The legacy body-only signature (no timestamp) is refused unless
BILLING_WEBHOOK_ALLOW_LEGACY=true.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
import time
from collections import OrderedDict
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import (
    ALLOWED_PLANS,
    ALLOWED_SUBSCRIPTION_STATUSES,
    default_subscription_for_plan,
)
from db.models import BillingWebhookEvent, PlatformUser
from db.session import SessionLocal

router = APIRouter()


class BillingPlanEvent(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    plan: str = Field(..., min_length=3, max_length=20)
    subscription_status: Optional[str] = Field(default=None, max_length=20)
    event_id: Optional[str] = Field(default=None, min_length=1, max_length=120)


def _webhook_secret() -> str:
    return os.getenv("BILLING_WEBHOOK_SECRET", "").strip()


def _tolerance_seconds() -> int:
    raw = os.getenv("BILLING_WEBHOOK_TOLERANCE_SECONDS", "").strip()
    try:
        return max(30, int(raw)) if raw else 300
    except ValueError:
        return 300


def _legacy_allowed() -> bool:
    return os.getenv("BILLING_WEBHOOK_ALLOW_LEGACY", "false").strip().lower() in {"1", "true", "yes", "on"}


def _sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _verify_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str] = None,
    *,
    now: Optional[float] = None,
) -> None:
    secret = _webhook_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Billing webhook is not configured.")
    provided = (signature or "").strip()
    if provided.lower().startswith("sha256="):
        provided = provided.split("=", 1)[1].strip()
    provided = provided.lower()
    if not provided:
        raise HTTPException(status_code=401, detail="Invalid billing webhook signature.")

    ts_raw = (timestamp or "").strip()
    if ts_raw:
        try:
            ts = int(ts_raw)
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid billing webhook timestamp.") from exc
        current = time.time() if now is None else now
        if abs(current - ts) > _tolerance_seconds():
            raise HTTPException(status_code=401, detail="Billing webhook timestamp outside tolerance.")
        expected = _sign(secret, f"{ts}.".encode("utf-8") + raw_body)
    elif _legacy_allowed():
        expected = _sign(secret, raw_body)
    else:
        raise HTTPException(status_code=401, detail="Missing X-Motormila-Timestamp header.")
    # Constant-time comparison on equal-type (ASCII hex) strings.
    if not hmac.compare_digest(provided.encode("ascii", "ignore"), expected.encode("ascii")):
        raise HTTPException(status_code=401, detail="Invalid billing webhook signature.")


# In-process replay cache (bounded). The DB table is the durable store; this
# covers deployments where the table has not been created yet and races
# between concurrent deliveries in one process.
_SEEN_LOCK = threading.Lock()
_SEEN_EVENTS: "OrderedDict[str, float]" = OrderedDict()
_SEEN_MAX = 10_000


def _seen_in_memory(event_id: str) -> bool:
    with _SEEN_LOCK:
        if event_id in _SEEN_EVENTS:
            return True
        _SEEN_EVENTS[event_id] = time.time()
        while len(_SEEN_EVENTS) > _SEEN_MAX:
            _SEEN_EVENTS.popitem(last=False)
        return False


def _forget_in_memory(event_id: str) -> None:
    with _SEEN_LOCK:
        _SEEN_EVENTS.pop(event_id, None)


async def _raw_body(request: Request) -> bytes:
    """Read the request body on the event loop so the route itself can be sync."""
    return await request.body()


@router.post("/webhook")
def billing_webhook(
    raw: bytes = Depends(_raw_body),
    x_motormila_signature: Optional[str] = Header(default=None, alias="X-Motormila-Signature"),
    x_motormila_timestamp: Optional[str] = Header(default=None, alias="X-Motormila-Timestamp"),
    stripe_signature: Optional[str] = Header(default=None, alias="Stripe-Signature"),
):
    """Apply a plan change from a signed webhook body.

    Body JSON: ``{ "email", "plan", "subscription_status?", "event_id?" }``
    Signature: HMAC-SHA256 hex of the raw body in ``X-Motormila-Signature``
    (``sha256=<hex>`` also accepted). Stripe-Signature is ignored unless you
    terminate Stripe → Motormila in your own adapter; keep using our header.
    """
    # Plain ``def`` (body read by the async dependency): the DB work below is
    # sync SQLAlchemy and must run in the threadpool, not on the event loop.
    del stripe_signature  # reserved for a future native Stripe verifier
    _verify_signature(raw, x_motormila_signature, x_motormila_timestamp)

    try:
        parsed = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body.") from exc

    event = BillingPlanEvent.model_validate(parsed)
    email = event.email.strip().lower()
    plan = event.plan.strip().lower()
    if plan not in ALLOWED_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan.")
    status = (event.subscription_status or default_subscription_for_plan(plan)).strip().lower()
    if status not in ALLOWED_SUBSCRIPTION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid subscription_status.")
    event_id = (event.event_id or "").strip()
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required.")

    if _seen_in_memory(event_id):
        return {"ok": True, "duplicate": True, "eventId": event_id}

    db: Session = SessionLocal()
    try:
        durable = True
        try:
            if db.get(BillingWebhookEvent, event_id) is not None:
                return {"ok": True, "duplicate": True, "eventId": event_id}
        except Exception:
            # Table missing (schema not migrated yet): fall back to the
            # in-memory cache plus the timestamp tolerance window.
            db.rollback()
            durable = False

        user = db.query(PlatformUser).filter(PlatformUser.email == email).first()
        if user is None:
            _forget_in_memory(event_id)
            raise HTTPException(status_code=404, detail="User not found.")
        user.plan = plan
        user.subscription_status = status
        user.token_version = int(getattr(user, "token_version", 0) or 0) + 1
        if durable:
            db.add(BillingWebhookEvent(event_id=event_id, email=email))
        try:
            db.commit()
        except Exception:
            db.rollback()
            _forget_in_memory(event_id)
            # Unique-key race: another delivery of the same event won.
            try:
                if durable and db.get(BillingWebhookEvent, event_id) is not None:
                    return {"ok": True, "duplicate": True, "eventId": event_id}
            except Exception:
                pass
            raise
        return {
            "ok": True,
            "email": email,
            "plan": plan,
            "subscriptionStatus": status,
            "eventId": event.event_id,
            "tokenVersion": int(user.token_version or 0),
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Checkout intent — surface a checkout URL or contact-sales fallback
# ---------------------------------------------------------------------------

_CONTACT_EMAIL_FALLBACK = "suvenseoras@gmail.com"
_CONTACT_PHONE_FALLBACK = "0758504424"


def _checkout_url() -> Optional[str]:
    """Return a hosted PayHere link (PayHere "Links" product) if configured, or None.

    STRIPE_CHECKOUT_URL is deliberately ignored: Stripe can't pay out to a
    Sri Lankan business.
    """
    for env_var in ("PAYHERE_CHECKOUT_URL", "BILLING_CHECKOUT_URL"):
        url = os.getenv(env_var, "").strip()
        if url:
            return url
    return None


def _contact_email() -> str:
    return os.getenv("BILLING_CONTACT_EMAIL", _CONTACT_EMAIL_FALLBACK).strip()


# ---------------------------------------------------------------------------
# Manual-pay instructions (TRACK E, additive): bank / KOKO / WhatsApp 2hr flow
# ---------------------------------------------------------------------------

_MANUAL_PAY_ACTIVATION_DEFAULT = "2 hours"


def _manual_pay_activation_window() -> str:
    return os.getenv("BILLING_ACTIVATION_WINDOW", _MANUAL_PAY_ACTIVATION_DEFAULT).strip() or _MANUAL_PAY_ACTIVATION_DEFAULT


def _manual_pay_whatsapp() -> str:
    return os.getenv("BILLING_WHATSAPP", os.getenv("BILLING_WHATSAPP_NUMBER", _CONTACT_PHONE_FALLBACK)).strip()


def _manual_pay_bank_details() -> str:
    return os.getenv(
        "BILLING_BANK_DETAILS",
        "Bank transfer — account details are shared on request. Message us and we will reply with the Pro/Dealer account number and reference format.",
    ).strip()


def _manual_pay_koko_note() -> str:
    return os.getenv(
        "BILLING_KOKO_NOTE",
        "KOKO / instalments available on request — mention KOKO in your WhatsApp message and we will send a payment link.",
    ).strip()


def manual_pay_instructions(plan: str = "pro") -> dict:
    """Structured manual-pay steps so the frontend never shows a bare mailto."""
    contact = _contact_email()
    whatsapp = _manual_pay_whatsapp()
    activation = _manual_pay_activation_window()
    normalized = (plan or "pro").strip().lower()
    label = normalized if normalized in ("pro", "dealer", "dealer_starter", "dealer_pro", "dealer_yard") else "pro"
    steps = [
        f"1. Message us on WhatsApp{f' ({whatsapp})' if whatsapp else ''} or email {contact} with your Motormila account email + '{label}' plan.",
        f"2. Pay by bank transfer ({_manual_pay_bank_details()}) or KOKO — {_manual_pay_koko_note()}",
        f"3. Send the payment receipt screenshot. We activate your seat within {activation}.",
    ]
    return {
        "plan": label,
        "methods": ["bank_transfer", "koko", "whatsapp"],
        "bankDetails": _manual_pay_bank_details(),
        "kokoNote": _manual_pay_koko_note(),
        "whatsappNumber": whatsapp or None,
        "contactEmail": contact,
        "activationWindow": activation,
        "steps": steps,
    }


class CheckoutIntentRequest(BaseModel):
    plan: str = Field(..., min_length=1, max_length=30, description="Requested plan: 'pro' or 'dealer'")


class CheckoutIntentResponse(BaseModel):
    provider: Literal["manual", "payhere"]
    checkout_url: Optional[str] = None
    # When PayHere's Checkout API is configured the client POSTs here to get
    # signed form fields (see app/routers/payhere.py).
    payhere_checkout_endpoint: Optional[str] = None
    message: str
    manual_pay: Optional[dict] = Field(default=None, description="Manual-pay steps (always offered as a fallback)")


@router.get("/manual-pay", response_model=dict)
def manual_pay(plan: str = "pro") -> dict:
    """Public manual-pay instructions: bank / KOKO / WhatsApp with activation window."""
    return manual_pay_instructions(plan)


@router.post("/checkout-intent", response_model=CheckoutIntentResponse)
def checkout_intent(body: CheckoutIntentRequest) -> CheckoutIntentResponse:
    """Tell the pricing page how this plan can be paid for.

    1. PayHere Checkout API configured -> ``provider=payhere`` with
       ``payhere_checkout_endpoint`` (client fetches signed form fields).
    2. A hosted PayHere link in PAYHERE_CHECKOUT_URL / BILLING_CHECKOUT_URL ->
       ``provider=payhere`` with ``checkout_url``.
    3. Otherwise ``provider=manual`` (bank transfer / KOKO + WhatsApp).

    Manual-pay steps are always included so the user has a no-card option.
    """
    from app.routers.payhere import payhere_enabled, pro_checkout_enabled

    plan = (body.plan or "").strip().lower()
    instructions = manual_pay_instructions(plan)
    is_pro = plan == "pro"

    if payhere_enabled() and (not is_pro or pro_checkout_enabled()):
        return CheckoutIntentResponse(
            provider="payhere",
            payhere_checkout_endpoint="/api/v1/payhere/checkout",
            message=f"Pay for the {plan} plan by card, Genie, FriMi or eZcash via PayHere, or by bank transfer / KOKO.",
            manual_pay=instructions,
        )

    url = _checkout_url()
    if url and not is_pro:
        return CheckoutIntentResponse(
            provider="payhere",
            checkout_url=url,
            message=f"Redirecting to PayHere checkout for the {plan} plan.",
            manual_pay=instructions,
        )

    whatsapp = instructions.get("whatsappNumber")
    activation = instructions.get("activationWindow")
    contact = instructions.get("contactEmail")
    hint = f" WhatsApp {whatsapp} for fastest activation." if whatsapp else ""
    return CheckoutIntentResponse(
        provider="manual",
        checkout_url=None,
        message=(
            f"Pay by bank transfer or KOKO for the {plan} plan, then WhatsApp us for activation within {activation}.{hint} "
            f"Or email {contact} with your account email."
        ),
        manual_pay=instructions,
    )
