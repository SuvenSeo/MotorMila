from urllib.parse import urlencode

import pytest

from tests._money_app import make_client
from app.routers import payhere
from app.routers.money_models import PayhereNotification, PayherePayment
from db.models import PlatformUser

SECRET = "test-merchant-secret"
MERCHANT = "1211149"


@pytest.fixture(autouse=True)
def _payhere_env(monkeypatch):
    monkeypatch.setenv("PAYHERE_MERCHANT_ID", MERCHANT)
    monkeypatch.setenv("PAYHERE_MERCHANT_SECRET", SECRET)
    monkeypatch.setenv("PAYHERE_NOTIFY_URL", "https://api.example.com/api/v1/payhere/notify")
    monkeypatch.setenv("PAYHERE_SANDBOX", "true")
    monkeypatch.delenv("PAYHERE_PRO_CHECKOUT_ENABLED", raising=False)
    monkeypatch.delenv("PAYHERE_ENABLED", raising=False)


def _add_user(Session, email="buyer@example.com"):
    db = Session()
    db.add(PlatformUser(email=email, password_hash="x", name="Kasun", plan="free", subscription_status="none"))
    db.commit()
    db.close()


def _notify_body(order_id, amount, status_code="2", payment_id="320027150501", secret=SECRET, **extra):
    sig = payhere.notify_signature(MERCHANT, order_id, amount, "LKR", status_code, secret)
    form = {
        "merchant_id": MERCHANT,
        "order_id": order_id,
        "payment_id": payment_id,
        "payhere_amount": amount,
        "payhere_currency": "LKR",
        "status_code": status_code,
        "md5sig": sig,
        "method": "VISA",
        **extra,
    }
    return urlencode(form)


def _post_notify(client, body):
    return client.post(
        "/api/v1/payhere/notify", content=body, headers={"Content-Type": "application/x-www-form-urlencoded"}
    )


def test_hash_matches_payhere_reference_formula():
    import hashlib

    secret_md5 = hashlib.md5(SECRET.encode()).hexdigest().upper()
    expected = hashlib.md5(f"{MERCHANT}ORD11000.00LKR{secret_md5}".encode()).hexdigest().upper()
    assert payhere.checkout_hash(MERCHANT, "ORD1", "1000.00", "LKR", SECRET) == expected
    assert payhere.format_amount(2990) == "2990.00"
    assert payhere.format_amount("14990.5") == "14990.50"


def test_config_lists_new_prices_and_pro_free_during_beta():
    client, _ = make_client()
    data = client.get("/api/v1/payhere/config").json()
    plans = {p["code"]: p for p in data["plans"]}
    assert data["enabled"] is True and data["sandbox"] is True
    assert data["proFreeDuringBeta"] is True
    assert plans["pro"]["monthlyLkr"] == 999 and plans["pro"]["yearlyLkr"] == 9990
    assert plans["pro"]["checkoutOpen"] is False
    assert [plans[c]["monthlyLkr"] for c in ("dealer_starter", "dealer_pro", "dealer_yard")] == [2990, 6990, 14990]


def test_checkout_returns_signed_sandbox_form_without_secret():
    client, Session = make_client()
    res = client.post(
        "/api/v1/payhere/checkout",
        json={"plan_code": "dealer_pro", "period": "monthly", "phone": "0771234567", "recurring": True},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["action_url"] == payhere.SANDBOX_ACTION_URL
    fields = data["fields"]
    assert fields["amount"] == "6990.00" and fields["currency"] == "LKR"
    assert fields["recurrence"] == "1 Month" and fields["duration"] == "Forever"
    assert fields["hash"] == payhere.checkout_hash(MERCHANT, data["order_id"], "6990.00", "LKR", SECRET)
    assert SECRET not in str(data)
    db = Session()
    order = db.query(PayherePayment).one()
    assert order.granted_plan == "dealer" and order.status == "created"


def test_pro_checkout_blocked_during_beta():
    client, _ = make_client()
    res = client.post("/api/v1/payhere/checkout", json={"plan_code": "pro", "phone": "0771234567"})
    assert res.status_code == 409


def test_checkout_503_when_not_configured(monkeypatch):
    monkeypatch.delenv("PAYHERE_MERCHANT_SECRET")
    client, _ = make_client()
    res = client.post("/api/v1/payhere/checkout", json={"plan_code": "dealer_starter", "phone": "0771234567"})
    assert res.status_code == 503


def test_notify_grants_plan_once_and_is_idempotent():
    client, Session = make_client()
    _add_user(Session)
    order_id = client.post(
        "/api/v1/payhere/checkout", json={"plan_code": "dealer_starter", "period": "yearly", "phone": "0771234567"}
    ).json()["order_id"]

    body = _notify_body(order_id, "29900.00")
    first = _post_notify(client, body)
    assert first.status_code == 200 and first.json()["applied"] == "granted"
    second = _post_notify(client, body)
    assert second.json().get("duplicate") is True

    db = Session()
    user = db.query(PlatformUser).one()
    assert user.plan == "dealer" and user.subscription_status == "active"
    assert user.token_version == 1  # bumped exactly once
    assert db.query(PayhereNotification).count() == 1
    assert db.query(PayherePayment).one().status == "paid"


def test_notify_rejects_bad_signature():
    client, Session = make_client()
    _add_user(Session)
    order_id = client.post(
        "/api/v1/payhere/checkout", json={"plan_code": "dealer_starter", "phone": "0771234567"}
    ).json()["order_id"]
    res = _post_notify(client, _notify_body(order_id, "2990.00", secret="wrong-secret"))
    assert res.status_code == 401
    assert Session().query(PlatformUser).one().plan == "free"


def test_notify_amount_mismatch_does_not_grant():
    client, Session = make_client()
    _add_user(Session)
    order_id = client.post(
        "/api/v1/payhere/checkout", json={"plan_code": "dealer_yard", "phone": "0771234567"}
    ).json()["order_id"]
    res = _post_notify(client, _notify_body(order_id, "1.00"))
    assert res.json()["applied"] == "amount_mismatch"
    assert Session().query(PlatformUser).one().plan == "free"


def test_notify_failed_and_chargeback():
    client, Session = make_client()
    _add_user(Session)
    order_id = client.post(
        "/api/v1/payhere/checkout", json={"plan_code": "dealer_starter", "phone": "0771234567"}
    ).json()["order_id"]
    assert _post_notify(client, _notify_body(order_id, "2990.00", status_code="-2", payment_id="1")).status_code == 200
    assert Session().query(PlatformUser).one().plan == "free"
    _post_notify(client, _notify_body(order_id, "2990.00", payment_id="2"))
    assert Session().query(PlatformUser).one().plan == "dealer"
    _post_notify(client, _notify_body(order_id, "2990.00", status_code="-3", payment_id="3"))
    user = Session().query(PlatformUser).one()
    assert user.plan == "free" and user.subscription_status == "canceled"


def test_checkout_intent_has_no_stripe_and_offers_payhere(monkeypatch):
    monkeypatch.setenv("STRIPE_CHECKOUT_URL", "https://checkout.stripe.com/x")
    client, _ = make_client()
    dealer = client.post("/api/v1/billing/checkout-intent", json={"plan": "dealer_pro"}).json()
    assert dealer["provider"] == "payhere"
    assert dealer["payhere_checkout_endpoint"] == "/api/v1/payhere/checkout"
    assert "stripe" not in str(dealer).lower()
    assert dealer["manual_pay"]["methods"] == ["bank_transfer", "koko", "whatsapp"]
    pro = client.post("/api/v1/billing/checkout-intent", json={"plan": "pro"}).json()
    assert pro["provider"] == "manual"  # Pro is free during beta: no card checkout


def test_checkout_intent_manual_when_payhere_off(monkeypatch):
    monkeypatch.setenv("PAYHERE_ENABLED", "false")
    client, _ = make_client()
    data = client.post("/api/v1/billing/checkout-intent", json={"plan": "dealer_starter"}).json()
    assert data["provider"] == "manual" and data["checkout_url"] is None
