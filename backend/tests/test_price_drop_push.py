"""Native price-drop push pipeline: device registration, detection, dedupe,
daily cap, FCM HTTP v1 sender (mocked transport) and unconfigured no-op."""

import base64
import json
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import notifications as notif_module  # noqa: E402
from app.utils import notify_fcm  # noqa: E402
from app.utils import price_drop_push as pdp  # noqa: E402
from db.models import (  # noqa: E402
    Base,
    CarListing,
    DevicePushToken,
    MarketAlert,
    NotificationDeliveryLog,
    VehiclePriceHistory,
)


class _DummyRequest:
    method = "POST"
    headers = {"user-agent": "pytest"}
    client = type("Client", (), {"host": "127.0.0.1"})()
    cookies: dict = {}


def _session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in (
        "FCM_SERVICE_ACCOUNT_JSON",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "FCM_PROJECT_ID",
        "PRICE_DROP_PUSH_DAILY_CAP",
        "PRICE_DROP_PUSH_ENABLED",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("PRICE_DROP_PUSH_QUIET_HOURS", "false")
    notify_fcm._reset_cache_for_tests()
    yield
    notify_fcm._reset_cache_for_tests()


def _signed_in_as(monkeypatch, email):
    monkeypatch.setattr(notif_module, "verify_token", lambda token: {"email": email} if token else None)
    monkeypatch.setattr(notif_module, "resolve_live_session", lambda payload, db: {"email": payload["email"]})


# --------------------------------------------------------------------------
# Device registration
# --------------------------------------------------------------------------

def test_register_device_requires_signed_in_session():
    db = _session()
    with pytest.raises(HTTPException) as exc:
        notif_module.register_device(
            payload=notif_module.DeviceRegisterIn(token="fcm-abc"),
            request=_DummyRequest(),
            db=db,
            authorization=None,
        )
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException) as exc:
        notif_module.unregister_device(
            payload=notif_module.DeviceUnregisterIn(token="fcm-abc"),
            request=_DummyRequest(),
            db=db,
            authorization=None,
        )
    assert exc.value.status_code == 401


def test_register_device_upserts_and_rebinds(monkeypatch):
    db = _session()
    _signed_in_as(monkeypatch, "A@Example.com")
    res = notif_module.register_device(
        payload=notif_module.DeviceRegisterIn(token="fcm-abc", watched_listing_ids=[3, 1, 3, -2]),
        request=_DummyRequest(),
        db=db,
        authorization="Bearer t",
    )
    assert res["registered"] is True and res["watched_count"] == 2
    assert res["push_configured"] is False
    # Re-register (token refresh round-trip): still one row, prefs updated,
    # watchlist untouched when omitted.
    notif_module.register_device(
        payload=notif_module.DeviceRegisterIn(token="fcm-abc", price_drops_enabled=False),
        request=_DummyRequest(),
        db=db,
        authorization="Bearer t",
    )
    rows = db.query(DevicePushToken).all()
    assert len(rows) == 1
    assert rows[0].user_token == "mm:a@example.com"
    assert rows[0].price_drops_enabled is False
    assert rows[0].watched_listing_ids == [1, 3]

    # Same device, another account: rebinds and drops the old watchlist.
    _signed_in_as(monkeypatch, "b@example.com")
    notif_module.register_device(
        payload=notif_module.DeviceRegisterIn(token="fcm-abc"),
        request=_DummyRequest(),
        db=db,
        authorization="Bearer t",
    )
    db.expire_all()
    row = db.query(DevicePushToken).one()
    assert row.user_token == "mm:b@example.com"
    assert not row.watched_listing_ids


def test_register_device_rejects_bad_token_and_platform(monkeypatch):
    db = _session()
    _signed_in_as(monkeypatch, "a@example.com")
    for payload in (
        notif_module.DeviceRegisterIn(token="   "),
        notif_module.DeviceRegisterIn(token="has space"),
        notif_module.DeviceRegisterIn(token="ok", platform="windows"),
    ):
        with pytest.raises(HTTPException) as exc:
            notif_module.register_device(payload=payload, request=_DummyRequest(), db=db, authorization="Bearer t")
        assert exc.value.status_code == 400


def test_unregister_only_deletes_own_token(monkeypatch):
    db = _session()
    db.add(DevicePushToken(user_token="mm:a@example.com", token="tok-a", platform="android"))
    db.commit()
    _signed_in_as(monkeypatch, "b@example.com")
    res = notif_module.unregister_device(
        payload=notif_module.DeviceUnregisterIn(token="tok-a"),
        request=_DummyRequest(),
        db=db,
        authorization="Bearer t",
    )
    assert res["deleted"] == 0
    _signed_in_as(monkeypatch, "a@example.com")
    res = notif_module.unregister_device(
        payload=notif_module.DeviceUnregisterIn(token="tok-a"),
        request=_DummyRequest(),
        db=db,
        authorization="Bearer t",
    )
    assert res["deleted"] == 1
    assert db.query(DevicePushToken).count() == 0


# --------------------------------------------------------------------------
# Detection + pass
# --------------------------------------------------------------------------

_NOW = datetime.now(timezone.utc)


def _listing(db, *, lid, make="Toyota", model="Aqua", year=2017, price=5_900_000, active=True, district="Colombo"):
    row = CarListing(
        id=lid,
        source="ikman",
        source_id=f"s{lid}",
        scraped_at=_NOW,
        make=make,
        model=model,
        year=year,
        price_lkr=Decimal(price),
        district=district,
        is_active=active,
        is_outlier=False,
        is_duplicate=False,
        user_listing_status="scraped",
    )
    db.add(row)
    db.flush()
    return row


def _history(db, lid, *prices, hours_ago_last=1):
    n = len(prices)
    for i, price in enumerate(prices):
        db.add(
            VehiclePriceHistory(
                vehicle_id=lid,
                price_lkr=Decimal(price),
                scraped_at=_NOW - timedelta(hours=hours_ago_last + (n - 1 - i) * 48),
            )
        )
    db.flush()


def _device(db, user="mm:a@example.com", token="tok-a", watched=None, enabled=True):
    db.add(
        DevicePushToken(
            user_token=user,
            token=token,
            platform="android",
            watched_listing_ids=watched,
            price_drops_enabled=enabled,
        )
    )
    db.commit()


class _Recorder:
    def __init__(self, result=notify_fcm.FCM_SENT, per_token=None):
        self.calls = []
        self.result = result
        self.per_token = per_token or {}

    def __call__(self, *, token, title, body, data):
        self.calls.append({"token": token, "title": title, "body": body, "data": data})
        return self.per_token.get(token, self.result)


def test_content_formatting():
    db = _session()
    listing = _listing(db, lid=7)
    title, body, data = pdp.build_price_drop_content(
        pdp.PriceDrop(listing=listing, old_price=Decimal(6_200_000), new_price=Decimal(5_900_000))
    )
    assert title == "Price drop: Toyota Aqua 2017"
    assert body == "Rs 6.2M → Rs 5.9M (−4.8%)"
    assert data == {
        "type": "price_drop",
        "listing_id": "7",
        "deep_link": "https://motormila.pages.dev/listing/7",
        "old_price_lkr": "6200000",
        "new_price_lkr": "5900000",
    }


def test_find_recent_price_drops_filters_raises_small_moves_and_inactive():
    db = _session()
    _listing(db, lid=1, price=5_900_000)
    _history(db, 1, 6_200_000, 5_900_000)  # real drop
    _listing(db, lid=2, price=6_500_000)
    _history(db, 2, 6_200_000, 6_500_000)  # raise
    _listing(db, lid=3, price=6_190_000)
    _history(db, 3, 6_200_000, 6_190_000)  # 0.16%: noise
    _listing(db, lid=4, price=5_000_000, active=False)
    _history(db, 4, 6_000_000, 5_000_000)  # sold/inactive
    _listing(db, lid=5, price=5_000_000)
    _history(db, 5, 6_000_000, 5_000_000, hours_ago_last=80)  # outside window
    _listing(db, lid=6, price=5_000_000)
    _history(db, 6, 5_000_000)  # first sighting only
    db.commit()
    drops = pdp.find_recent_price_drops(db, since=_NOW - timedelta(hours=26), min_pct=1.0)
    assert [d.listing_id for d in drops] == [1]
    assert drops[0].old_price == Decimal(6_200_000)


def test_pass_unconfigured_is_noop():
    db = _session()
    _listing(db, lid=1)
    _history(db, 1, 6_200_000, 5_900_000)
    _device(db, watched=[1])
    summary = pdp.run_price_drop_push_pass(db)
    assert summary["skipped"] == "fcm_not_configured"
    assert summary["sent"] == 0
    assert db.query(NotificationDeliveryLog).count() == 0


def test_pass_sends_watched_drop_once_then_dedupes():
    db = _session()
    _listing(db, lid=1)
    _history(db, 1, 6_200_000, 5_900_000)
    _device(db, watched=[1])
    sender = _Recorder()
    summary = pdp.run_price_drop_push_pass(db, sender=sender)
    assert summary["sent"] == 1
    assert sender.calls[0]["token"] == "tok-a"
    assert sender.calls[0]["data"]["listing_id"] == "1"
    log_row = db.query(NotificationDeliveryLog).one()
    assert log_row.status == "sent" and log_row.channel == "fcm" and log_row.listing_id == 1

    again = pdp.run_price_drop_push_pass(db, sender=sender)
    assert again["sent"] == 0 and again["duplicates"] == 1
    assert len(sender.calls) == 1


def test_pass_matches_alerts_and_respects_push_channel_and_prefs():
    db = _session()
    _listing(db, lid=1)  # Toyota Aqua 5.9M
    _history(db, 1, 6_200_000, 5_900_000)
    _listing(db, lid=2, make="Honda", model="Vezel", price=7_000_000)
    _history(db, 2, 7_500_000, 7_000_000)
    db.add(MarketAlert(user_token="mm:a@example.com", make="Toyota", model="Aqua", max_price=6_000_000, active=True))
    # Email-only alert: no native push for it.
    db.add(MarketAlert(user_token="mm:a@example.com", make="Honda", notify_channels="email", active=True))
    # User c matches but disabled price-drop pushes on the device.
    db.add(MarketAlert(user_token="mm:c@example.com", make="Toyota", active=True))
    db.commit()
    _device(db)
    _device(db, user="mm:c@example.com", token="tok-c", enabled=False)
    sender = _Recorder()
    summary = pdp.run_price_drop_push_pass(db, sender=sender)
    assert summary["sent"] == 1
    assert [c["data"]["listing_id"] for c in sender.calls] == ["1"]
    assert all(c["token"] == "tok-a" for c in sender.calls)


def test_pass_daily_cap(monkeypatch):
    monkeypatch.setenv("PRICE_DROP_PUSH_DAILY_CAP", "2")
    db = _session()
    for lid in (1, 2, 3):
        _listing(db, lid=lid)
        _history(db, lid, 6_200_000 + lid * 100_000, 5_900_000)
    _device(db, watched=[1, 2, 3])
    sender = _Recorder()
    summary = pdp.run_price_drop_push_pass(db, sender=sender)
    assert summary["sent"] == 2 and summary["capped"] == 1
    # Steepest cuts first: listing 3 (6.5M -> 5.9M) then 2.
    assert [c["data"]["listing_id"] for c in sender.calls] == ["3", "2"]
    # Still capped on the next pass (rolling 24 h).
    again = pdp.run_price_drop_push_pass(db, sender=sender)
    assert again["sent"] == 0 and again["capped"] == 1


def test_pass_prunes_invalid_tokens_and_retries_failures():
    db = _session()
    _listing(db, lid=1)
    _history(db, 1, 6_200_000, 5_900_000)
    _device(db, token="dead", watched=[1])
    _device(db, token="alive", watched=[1])
    sender = _Recorder(per_token={"dead": notify_fcm.FCM_INVALID_TOKEN})
    summary = pdp.run_price_drop_push_pass(db, sender=sender)
    assert summary["sent"] == 1 and summary["pruned_tokens"] == 1
    assert [d.token for d in db.query(DevicePushToken).all()] == ["alive"]

    # Transient failure: receipt released, so the next pass retries.
    db2 = _session()
    _listing(db2, lid=1)
    _history(db2, 1, 6_200_000, 5_900_000)
    _device(db2, watched=[1])
    failing = _Recorder(result=notify_fcm.FCM_FAILED)
    assert pdp.run_price_drop_push_pass(db2, sender=failing)["failed"] == 1
    assert db2.query(NotificationDeliveryLog).count() == 0
    assert pdp.run_price_drop_push_pass(db2, sender=_Recorder())["sent"] == 1


def test_pass_defers_during_quiet_hours(monkeypatch):
    monkeypatch.setenv("PRICE_DROP_PUSH_QUIET_HOURS", "true")
    db = _session()
    _listing(db, lid=1)
    _history(db, 1, 6_200_000, 5_900_000)
    _device(db, watched=[1])
    sender = _Recorder()
    # 23:00 Colombo = 17:30 UTC.
    late = datetime(2026, 10, 28, 17, 30, tzinfo=timezone.utc)
    summary = pdp.run_price_drop_push_pass(db, now=late, sender=sender)
    assert summary["skipped"] == "quiet_hours" and sender.calls == []
    assert db.query(NotificationDeliveryLog).count() == 0


# --------------------------------------------------------------------------
# FCM HTTP v1 sender
# --------------------------------------------------------------------------

def _service_account(monkeypatch, *, as_base64=False):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    raw = json.dumps(
        {
            "type": "service_account",
            "project_id": "motormila-test",
            "client_email": "push@motormila-test.iam.gserviceaccount.com",
            "private_key": pem,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    )
    monkeypatch.setenv("FCM_SERVICE_ACCOUNT_JSON", base64.b64encode(raw.encode()).decode() if as_base64 else raw)
    return key.public_key()


def _b64d(part):
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def test_fcm_send_not_configured():
    assert notify_fcm.fcm_configured() is False
    result = notify_fcm.send_fcm_message(token="t", title="x", body="y", data={})
    assert result == notify_fcm.FCM_NOT_CONFIGURED


def test_fcm_send_success_signs_assertion_and_posts_data_message(monkeypatch):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    public_key = _service_account(monkeypatch, as_base64=True)
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "ya29.test", "expires_in": 3600})
        return httpx.Response(200, json={"name": "projects/motormila-test/messages/1"})

    factory = lambda: httpx.Client(transport=httpx.MockTransport(handler))  # noqa: E731
    result = notify_fcm.send_fcm_message(
        token="device-1",
        title="Price drop: Toyota Aqua 2017",
        body="Rs 6.2M → Rs 5.9M (−4.8%)",
        data={"type": "price_drop", "listing_id": 7},
        client_factory=factory,
    )
    assert result == notify_fcm.FCM_SENT

    oauth, send = seen
    form = dict(x.split("=", 1) for x in oauth.content.decode().split("&"))
    assert form["grant_type"] == "urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer"
    header_b64, claims_b64, sig_b64 = form["assertion"].split(".")
    claims = json.loads(_b64d(claims_b64))
    assert claims["iss"] == "push@motormila-test.iam.gserviceaccount.com"
    assert claims["scope"] == notify_fcm.FCM_SCOPE
    assert claims["aud"] == "https://oauth2.googleapis.com/token"
    public_key.verify(
        _b64d(sig_b64), f"{header_b64}.{claims_b64}".encode(), padding.PKCS1v15(), hashes.SHA256()
    )

    assert str(send.url) == "https://fcm.googleapis.com/v1/projects/motormila-test/messages:send"
    assert send.headers["Authorization"] == "Bearer ya29.test"
    message = json.loads(send.content)["message"]
    assert message["token"] == "device-1"
    assert "notification" not in message  # data-only: the app renders + deep-links
    assert message["android"]["priority"] == "high"
    assert message["data"] == {
        "type": "price_drop",
        "listing_id": "7",
        "title": "Price drop: Toyota Aqua 2017",
        "body": "Rs 6.2M → Rs 5.9M (−4.8%)",
    }

    # Access token is cached: the second send skips the OAuth exchange.
    seen.clear()
    assert notify_fcm.send_fcm_message(token="d2", title="t", body="b", data={}, client_factory=factory) == notify_fcm.FCM_SENT
    assert [r.url.host for r in seen] == ["fcm.googleapis.com"]


@pytest.mark.parametrize(
    "status,body,expected",
    [
        (404, {"error": {"status": "NOT_FOUND", "details": [{"errorCode": "UNREGISTERED"}]}}, notify_fcm.FCM_INVALID_TOKEN),
        (
            400,
            {"error": {"status": "INVALID_ARGUMENT", "message": "The registration token is not a valid FCM registration token"}},
            notify_fcm.FCM_INVALID_TOKEN,
        ),
        (400, {"error": {"status": "INVALID_ARGUMENT", "message": "Invalid JSON payload"}}, notify_fcm.FCM_FAILED),
        (503, {"error": {"status": "UNAVAILABLE"}}, notify_fcm.FCM_FAILED),
    ],
)
def test_fcm_send_error_mapping(monkeypatch, status, body, expected):
    _service_account(monkeypatch)

    def handler(request: httpx.Request):
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "ya29.test", "expires_in": 3600})
        return httpx.Response(status, json=body)

    result = notify_fcm.send_fcm_message(
        token="device-1",
        title="t",
        body="b",
        data={},
        client_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler)),
    )
    assert result == expected


def test_fcm_oauth_failure_is_failed_not_crash(monkeypatch):
    _service_account(monkeypatch)
    handler = lambda request: httpx.Response(401, json={"error": "invalid_grant"})  # noqa: E731
    result = notify_fcm.send_fcm_message(
        token="device-1",
        title="t",
        body="b",
        data={},
        client_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler)),
    )
    assert result == notify_fcm.FCM_FAILED
