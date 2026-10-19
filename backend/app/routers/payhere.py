"""PayHere checkout + notify_url handler (Sri Lanka card / wallet rail).

Flow
----
1. Signed-in user calls ``POST /api/v1/payhere/checkout`` with a plan code.
   We create a ``payhere_payments`` row (our ``order_id``) and return the
   HTML-form fields, including the server-side ``hash``. The browser
   auto-submits them to PayHere's action URL. The merchant secret never
   leaves the server.
2. PayHere calls ``POST /api/v1/payhere/notify`` (form-encoded). We verify
   ``md5sig`` with the merchant secret, check merchant id, amount and
   currency against the stored order, then grant the plan exactly once per
   PayHere ``payment_id`` (idempotent: retries are no-ops).
3. The return page polls ``GET /api/v1/payhere/orders/{order_id}``.

Env
---
PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET (secret; never logged),
PAYHERE_NOTIFY_URL (public backend URL of /api/v1/payhere/notify),
PAYHERE_RETURN_URL, PAYHERE_CANCEL_URL, PAYHERE_SANDBOX (default true),
PAYHERE_ENABLED (default true when the three required vars are set),
PAYHERE_PRO_CHECKOUT_ENABLED (default false: Pro is free during beta),
PAYHERE_RECURRING_ENABLED (default false: needs a PayHere Plus/Premium account).

Docs: https://support.payhere.lk/api-&-mobile-sdk/checkout-api
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, Optional
from urllib.parse import parse_qs

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_auth_payload
from db.models import PlatformUser
from db.session import get_db

from ._common import normalise_phone, scoped_limiter
from .money_models import PayhereNotification, PayherePayment

logger = structlog.get_logger()
router = APIRouter()

LIVE_ACTION_URL = "https://www.payhere.lk/pay/checkout"
SANDBOX_ACTION_URL = "https://sandbox.payhere.lk/pay/checkout"

# Prices in LKR. Annual = 10x monthly (two months free). Keep in sync with
# src/lib/pricingContent.ts (PLAN_PRICES).
PLAN_CATALOG: dict[str, dict] = {
    "pro": {
        "label": "MotorMila Pro",
        "grants": "pro",
        "monthly": 999,
        "yearly": 9990,
        "stock_limit": None,
        "beta_free": True,
    },
    "dealer_starter": {
        "label": "MotorMila Dealer Starter (up to 20 cars)",
        "grants": "dealer",
        "monthly": 2990,
        "yearly": 29900,
        "stock_limit": 20,
        "beta_free": False,
    },
    "dealer_pro": {
        "label": "MotorMila Dealer Pro (up to 75 cars)",
        "grants": "dealer",
        "monthly": 6990,
        "yearly": 69900,
        "stock_limit": 75,
        "beta_free": False,
    },
    "dealer_yard": {
        "label": "MotorMila Dealer Yard (unlimited stock, team seats)",
        "grants": "dealer",
        "monthly": 14990,
        "yearly": 149900,
        "stock_limit": None,
        "beta_free": False,
    },
}

STATUS_BY_CODE = {"2": "paid", "0": "pending", "-1": "canceled", "-2": "failed", "-3": "chargedback"}
RECURRING_STOP_MESSAGES = {"RECURRING_STOPPED", "RECURRING_COMPLETE"}

_checkout_limiter = scoped_limiter(
    "payhere-checkout", max_requests=10, window_seconds=60, message="Too many checkout attempts. Try again shortly."
)


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _truthy(name: str, default: str) -> bool:
    return _env(name, default).lower() in {"1", "true", "yes", "on"}


def merchant_id() -> str:
    return _env("PAYHERE_MERCHANT_ID")


def _merchant_secret() -> str:
    return _env("PAYHERE_MERCHANT_SECRET")


def sandbox_mode() -> bool:
    return _truthy("PAYHERE_SANDBOX", "true")


def payhere_enabled() -> bool:
    if not _truthy("PAYHERE_ENABLED", "true"):
        return False
    return bool(merchant_id() and _merchant_secret() and _env("PAYHERE_NOTIFY_URL"))


def pro_checkout_enabled() -> bool:
    """Pro stays free during beta: no paywall over scraped data yet."""
    return _truthy("PAYHERE_PRO_CHECKOUT_ENABLED", "false")


def action_url() -> str:
    return SANDBOX_ACTION_URL if sandbox_mode() else LIVE_ACTION_URL


def format_amount(value: int | float | str | Decimal) -> str:
    """PayHere hashes the amount as ``number_format(amount, 2, '.', '')``."""
    return str(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _upper_md5(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest().upper()  # noqa: S324 - PayHere's protocol


def checkout_hash(merchant: str, order_id: str, amount: str, currency: str, secret: str) -> str:
    return _upper_md5(f"{merchant}{order_id}{amount}{currency}{_upper_md5(secret)}")


def notify_signature(merchant: str, order_id: str, amount: str, currency: str, status_code: str, secret: str) -> str:
    return _upper_md5(f"{merchant}{order_id}{amount}{currency}{status_code}{_upper_md5(secret)}")


def plan_price(plan_code: str, period: str) -> int:
    plan = PLAN_CATALOG[plan_code]
    return int(plan["yearly"] if period == "yearly" else plan["monthly"])


# ---------------------------------------------------------------------------
# Public config
# ---------------------------------------------------------------------------

@router.get("/config")
def payhere_config() -> dict:
    """What the pricing page needs: is PayHere on, sandbox or live, prices."""
    return {
        "enabled": payhere_enabled(),
        "sandbox": sandbox_mode(),
        "currency": "LKR",
        "proFreeDuringBeta": not pro_checkout_enabled(),
        # Recurring billing needs PayHere Plus/Premium; Lite is one-off only.
        "recurringAvailable": payhere_enabled() and _truthy("PAYHERE_RECURRING_ENABLED", "false"),
        "plans": [
            {
                "code": code,
                "label": plan["label"],
                "grants": plan["grants"],
                "monthlyLkr": plan["monthly"],
                "yearlyLkr": plan["yearly"],
                "stockLimit": plan["stock_limit"],
                "checkoutOpen": payhere_enabled() and (code != "pro" or pro_checkout_enabled()),
            }
            for code, plan in PLAN_CATALOG.items()
        ],
    }


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    plan_code: Literal["pro", "dealer_starter", "dealer_pro", "dealer_yard"]
    period: Literal["monthly", "yearly"] = "monthly"
    recurring: bool = Field(default=False, description="Recurring billing needs a PayHere Plus/Premium account.")
    phone: str = Field(..., min_length=9, max_length=20)
    first_name: Optional[str] = Field(default=None, max_length=60)
    last_name: Optional[str] = Field(default=None, max_length=60)
    address: Optional[str] = Field(default=None, max_length=200)
    city: Optional[str] = Field(default=None, max_length=60)


class CheckoutResponse(BaseModel):
    action_url: str
    method: Literal["POST"] = "POST"
    sandbox: bool
    order_id: str
    fields: dict[str, str]


def _clean(value: Optional[str], fallback: str) -> str:
    text = " ".join(str(value or "").replace("<", " ").replace(">", " ").split())
    return text[:200] or fallback


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout(
    body: CheckoutRequest,
    request: Request,
    auth: dict = Depends(get_current_auth_payload),
    db: Session = Depends(get_db),
) -> CheckoutResponse:
    _checkout_limiter(request)
    if not payhere_enabled():
        raise HTTPException(status_code=503, detail="Card payments are not switched on yet. Use bank transfer or KOKO.")
    if body.recurring and not _truthy("PAYHERE_RECURRING_ENABLED", "false"):
        raise HTTPException(status_code=409, detail="Recurring billing isn't switched on yet. Pay for a month or a year instead.")
    if body.plan_code == "pro" and not pro_checkout_enabled():
        raise HTTPException(status_code=409, detail="Pro is free during the beta, so there is nothing to pay.")
    phone = normalise_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=422, detail="Enter a valid Sri Lankan phone number.")

    email = str(auth.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Authentication required.")
    display = str(auth.get("name") or email.split("@")[0])
    first_guess, _, last_guess = display.partition(" ")

    plan = PLAN_CATALOG[body.plan_code]
    amount = format_amount(plan_price(body.plan_code, body.period))
    currency = "LKR"
    order_id = f"MM{secrets.token_hex(8).upper()}"
    merchant = merchant_id()

    db.add(
        PayherePayment(
            order_id=order_id,
            user_email=email,
            plan_code=body.plan_code,
            granted_plan=plan["grants"],
            period=body.period,
            recurring=1 if body.recurring else 0,
            amount=amount,
            currency=currency,
            status="created",
            sandbox=1 if sandbox_mode() else 0,
        )
    )
    db.commit()

    period_label = "1 year" if body.period == "yearly" else "1 month"
    fields: dict[str, str] = {
        "merchant_id": merchant,
        "return_url": _env("PAYHERE_RETURN_URL", "https://motormila.vercel.app/checkout/return") + f"?order_id={order_id}",
        "cancel_url": _env("PAYHERE_CANCEL_URL", "https://motormila.vercel.app/pricing?checkout=cancelled"),
        "notify_url": _env("PAYHERE_NOTIFY_URL"),
        "first_name": _clean(body.first_name, _clean(first_guess, "MotorMila")),
        "last_name": _clean(body.last_name, _clean(last_guess, "Customer")),
        "email": email,
        "phone": phone,
        "address": _clean(body.address, "Sri Lanka"),
        "city": _clean(body.city, "Colombo"),
        "country": "Sri Lanka",
        "order_id": order_id,
        "items": f"{plan['label']} - {period_label}",
        "currency": currency,
        "amount": amount,
        "custom_1": body.plan_code,
        "custom_2": body.period,
        "hash": checkout_hash(merchant, order_id, amount, currency, _merchant_secret()),
    }
    if body.recurring:
        fields["recurrence"] = "1 Year" if body.period == "yearly" else "1 Month"
        fields["duration"] = "Forever"

    logger.info("payhere_checkout_created", order_id=order_id, plan_code=body.plan_code, period=body.period)
    return CheckoutResponse(action_url=action_url(), sandbox=sandbox_mode(), order_id=order_id, fields=fields)


@router.get("/orders/{order_id}")
def order_status(
    order_id: str,
    auth: dict = Depends(get_current_auth_payload),
    db: Session = Depends(get_db),
) -> dict:
    order = db.query(PayherePayment).filter(PayherePayment.order_id == order_id).first()
    email = str(auth.get("email") or "").strip().lower()
    if order is None or order.user_email != email:
        raise HTTPException(status_code=404, detail="Order not found.")
    return {
        "orderId": order.order_id,
        "status": order.status,
        "planCode": order.plan_code,
        "period": order.period,
        "amount": order.amount,
        "currency": order.currency,
    }


# ---------------------------------------------------------------------------
# notify_url
# ---------------------------------------------------------------------------

def _grant(db: Session, order: PayherePayment) -> str:
    user = db.query(PlatformUser).filter(PlatformUser.email == order.user_email).first()
    if user is None:
        return "no_user"
    user.plan = order.granted_plan
    user.subscription_status = "active"
    user.token_version = int(getattr(user, "token_version", 0) or 0) + 1
    return "granted"


def _revoke(db: Session, order: PayherePayment, *, downgrade: bool) -> str:
    user = db.query(PlatformUser).filter(PlatformUser.email == order.user_email).first()
    if user is None:
        return "no_user"
    user.subscription_status = "canceled"
    if downgrade:
        user.plan = "free"
    user.token_version = int(getattr(user, "token_version", 0) or 0) + 1
    return "revoked" if downgrade else "canceled"


@router.post("/notify")
async def payhere_notify(request: Request, db: Session = Depends(get_db)) -> dict:
    secret = _merchant_secret()
    if not secret or not merchant_id():
        raise HTTPException(status_code=503, detail="PayHere is not configured.")

    raw = (await request.body()).decode("utf-8", errors="replace")
    form = {key: values[0] for key, values in parse_qs(raw, keep_blank_values=True).items()}

    merchant = form.get("merchant_id", "")
    order_id = form.get("order_id", "")
    payment_id = form.get("payment_id", "")
    amount = form.get("payhere_amount", "")
    currency = form.get("payhere_currency", "")
    status_code = form.get("status_code", "")
    provided = form.get("md5sig", "").strip().upper()

    expected = notify_signature(merchant, order_id, amount, currency, status_code, secret)
    if not provided or not hmac.compare_digest(provided, expected):
        logger.warning("payhere_notify_bad_signature", order_id=order_id[:64])
        raise HTTPException(status_code=401, detail="Invalid signature.")
    if not hmac.compare_digest(merchant, merchant_id()):
        raise HTTPException(status_code=400, detail="Unknown merchant.")
    if not payment_id or not order_id:
        raise HTTPException(status_code=400, detail="Missing payment_id or order_id.")

    order = db.query(PayherePayment).filter(PayherePayment.order_id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Unknown order.")

    message_type = form.get("message_type", "").strip().upper()
    idem_key = f"{payment_id}:{message_type}" if message_type else payment_id
    if db.query(PayhereNotification).filter(PayhereNotification.payment_id == idem_key[:64]).first():
        return {"ok": True, "duplicate": True, "orderId": order_id}

    try:
        amount_matches = format_amount(amount) == order.amount
    except Exception:  # malformed amount
        amount_matches = False
    currency_matches = currency == order.currency

    applied = "ignored"
    if message_type in RECURRING_STOP_MESSAGES:
        order.status = "canceled"
        applied = _revoke(db, order, downgrade=False)
    elif status_code == "2":
        if amount_matches and currency_matches:
            order.status = "paid"
            applied = _grant(db, order)
        else:
            order.status = "amount_mismatch"
            applied = "amount_mismatch"
            logger.warning("payhere_notify_amount_mismatch", order_id=order_id)
    elif status_code == "-3":
        order.status = "chargedback"
        applied = _revoke(db, order, downgrade=True)
    elif status_code in STATUS_BY_CODE:
        # pending / canceled / failed: record the state, never grant.
        if order.status != "paid":
            order.status = STATUS_BY_CODE[status_code]

    db.add(
        PayhereNotification(
            payment_id=idem_key[:64],
            order_id=order_id,
            subscription_id=(form.get("subscription_id") or None),
            status_code=status_code[:4],
            amount=amount[:20],
            currency=currency[:3],
            applied=applied,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # A concurrent retry of the same notification won the race.
        db.rollback()
        return {"ok": True, "duplicate": True, "orderId": order_id}

    logger.info("payhere_notify_applied", order_id=order_id, status_code=status_code, applied=applied)
    return {"ok": True, "orderId": order_id, "applied": applied}
