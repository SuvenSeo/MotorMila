"""Billing: signed plan-change webhook, manual pay (bank / KOKO) and checkout intent.

Stripe is not available to Sri Lankan businesses, so it is not a provider
here. Card / wallet payments go through PayHere (``app/routers/payhere.py``),
which verifies PayHere's md5sig itself. ``/billing/webhook`` stays for ops
tooling: an HMAC-signed body (BILLING_WEBHOOK_SECRET) that sets a plan, e.g.
after a bank-transfer receipt is checked.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import (
    ALLOWED_PLANS,
    ALLOWED_SUBSCRIPTION_STATUSES,
    default_subscription_for_plan,
)
from db.models import PlatformUser
from db.session import SessionLocal

router = APIRouter()


class BillingPlanEvent(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    plan: str = Field(..., min_length=3, max_length=20)
    subscription_status: Optional[str] = Field(default=None, max_length=20)
    event_id: Optional[str] = Field(default=None, max_length=120)


def _webhook_secret() -> str:
    return os.getenv("BILLING_WEBHOOK_SECRET", "").strip()


def _verify_signature(raw_body: bytes, signature: Optional[str]) -> None:
    secret = _webhook_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Billing webhook is not configured.")
    provided = (signature or "").strip()
    if provided.lower().startswith("sha256="):
        provided = provided.split("=", 1)[1].strip()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid billing webhook signature.")


@router.post("/webhook")
async def billing_webhook(
    request: Request,
    x_motormila_signature: Optional[str] = Header(default=None, alias="X-Motormila-Signature"),
):
    """Apply a plan change from a signed webhook body.

    Body JSON: ``{ "email", "plan", "subscription_status?", "event_id?" }``
    Signature: HMAC-SHA256 hex of the raw body in ``X-Motormila-Signature``
    (``sha256=<hex>`` also accepted).
    """
    raw = await request.body()
    _verify_signature(raw, x_motormila_signature)

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

    db: Session = SessionLocal()
    try:
        user = db.query(PlatformUser).filter(PlatformUser.email == email).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found.")
        user.plan = plan
        user.subscription_status = status
        user.token_version = int(getattr(user, "token_version", 0) or 0) + 1
        db.commit()
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
