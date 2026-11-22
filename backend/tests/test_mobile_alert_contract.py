"""Mobile alerts over the real router/auth, isolated to in-memory SQLite."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import alerts, auth, notifications
from db.models import Base, PlatformUser
from db.session import get_db


FREE = "buyer@example.test"
OTHER = "other@example.test"
PRO = "dealer@example.test"
UNVERIFIED = "pending@example.test"


def headers(email=FREE):
    # The live DB record, not this signed token's plan, determines entitlements.
    token, _ = auth.issue_token(email, "pro")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def store(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "local-test-only")
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions.begin() as db:
        for email in (FREE, OTHER, PRO, UNVERIFIED):
            db.add(PlatformUser(email=email, name="Test", password_hash="unused",
                                plan="pro" if email == PRO else "free", email_verified=email != UNVERIFIED))

    yield sessions
    engine.dispose()


@pytest.fixture
def api(store):
    def test_db():
        with store() as db:
            yield db

    app = FastAPI()
    app.include_router(alerts.router, prefix="/alerts")
    app.include_router(notifications.router, prefix="/notifications")
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[alerts._alerts_rate_limiter] = lambda: None
    with TestClient(app) as client:
        yield client


def test_channel_preferences_advertise_persisted_explicit_optouts(api):
    response = api.get("/notifications/preferences", headers=headers())
    assert response.status_code == 200, response.text
    assert response.json().get("explicit_alert_channels") is True


def test_free_channels_use_verified_account_on_create_edit_and_channel_patch(api):
    response = api.post("/alerts", headers=headers(), json={"make": "Toyota", "notify_channels": "inapp,push"})
    assert response.status_code == 201, response.text
    alert = response.json()
    assert alert["notify_channels"] == "inapp,push" and alert["notify_email"] is None
    url = f"/alerts/{alert['id']}"
    edited = api.put(url, headers=headers(), json={"make": "Honda", "notify_channels": " Email ,email"})
    assert edited.status_code == 200 and edited.json()["notify_email"] == FREE
    assert edited.json()["notify_channels"] == "email"
    changed = api.patch(url + "/channels", headers=headers(), json={"channels": ["in-app", "webpush"]})
    assert changed.status_code == 200 and changed.json()["notify_channels"] == "inapp,push"
    assert api.patch(url + "/channels", headers=headers(), json={"channels": ["email"]}).json()["notify_email"] == FREE


def test_pause_refresh_match_resume_and_soft_delete_are_distinct(api):
    owner = headers()
    created = api.post("/alerts", headers=owner, json={"make": "Toyota"}).json()
    url = f"/alerts/{created['id']}"
    for path in (url, url + "/active"):
        paused = api.patch(path, headers=owner, json={"active": False})
        assert paused.status_code == 200, paused.text
        assert paused.json() == {**created, "active": False}
    assert api.get("/alerts", headers=owner).json() == []
    assert api.get("/alerts?include_paused=true", headers=owner).json() == [paused.json()]
    assert api.get("/alerts?include_paused=true", headers=headers(OTHER)).json() == []
    assert api.post("/alerts/match", headers=owner).json()["results"] == []
    assert api.patch(url, headers=headers(OTHER), json={"active": True}).status_code == 404
    assert api.patch(url, headers=owner, json={"active": True}).json() == created
    assert [m["alert_id"] for m in api.get("/alerts/match", headers=owner).json()["results"]] == [created["id"]]
    assert api.patch(url, headers=owner, json={"active": False}).status_code == 200
    assert api.delete(url, headers=owner).status_code == 204
    assert api.get("/alerts?include_paused=true", headers=owner).json() == []
    assert api.patch(url, headers=owner, json={"active": True}).status_code == 404


def test_resuming_must_fit_current_free_cap(api):
    owner = headers()
    first = api.post("/alerts", headers=owner, json={}).json()["id"]
    url = f"/alerts/{first}/active"
    assert api.patch(url, headers=owner, json={"active": False}).status_code == 200
    second = api.post("/alerts", headers=owner, json={}).json()["id"]
    assert api.patch(url, headers=owner, json={"active": True}).status_code == 429
    assert [a["id"] for a in api.get("/alerts", headers=owner).json()] == [second]
    assert api.patch(f"/alerts/{second}/active", headers=owner, json={"active": True}).status_code == 200


@pytest.mark.parametrize("payload", [{}, {"active": None}, {"active": "false"}, {"active": 1},
                                     {"active": True, "notify_email": OTHER}])
def test_active_patch_accepts_only_a_json_boolean(api, payload):
    owner = headers()
    rule = api.post("/alerts", headers=owner, json={}).json()
    assert api.patch(f"/alerts/{rule['id']}/active", headers=owner, json=payload).status_code == 422
    assert api.get("/alerts", headers=owner).json() == [rule]


@pytest.mark.parametrize(("setting", "status"), [
    ({"notify_channels": "inapp,WA"}, 403), ({"notify_channels": "tg"}, 403),
    ({"notify_phone": "+94771234567"}, 403), ({"notify_telegram_chat_id": "12345"}, 403),
    ({"notify_email": OTHER}, 403), ({"notify_channels": "push,other"}, 400),
    ({"notify_channels": ""}, 400), ({"notify_channels": "push,,email"}, 400),
])
def test_free_create_and_edit_reject_invalid_routing_without_changes(api, setting, status):
    owner = headers()
    assert api.post("/alerts", headers=owner, json=setting).status_code == status
    rule = api.post("/alerts", headers=owner, json={"make": "Kia"}).json()
    url = f"/alerts/{rule['id']}"
    assert api.put(url, headers=owner, json={"make": "Honda", **setting}).status_code == status
    if "notify_channels" in setting:
        values = setting["notify_channels"].split(",") if setting["notify_channels"] else []
        assert api.patch(url + "/channels", headers=owner, json={"channels": values}).status_code == status
    assert api.get("/alerts", headers=owner).json() == [rule]


def test_email_selection_requires_verified_session_and_only_owners_can_patch(api):
    for h in (headers(UNVERIFIED), {"X-Alert-Token": "legacy"}):
        assert api.post("/alerts", headers=h, json={"notify_channels": "email"}).status_code == 403
    rule = api.post("/alerts", headers=headers(), json={"notify_email": FREE.upper()}).json()
    assert rule["notify_email"] == FREE
    url = f"/alerts/{rule['id']}/channels"
    assert api.patch(url, headers=headers(OTHER), json={"channels": ["push"]}).status_code == 404
    assert api.patch(url, headers=headers(UNVERIFIED), json={"channels": ["email"]}).status_code == 403
    assert api.get("/alerts", headers=headers()).json() == [rule]


def test_paid_routes_still_work_but_cannot_be_resumed_after_downgrade(api, store):
    owner = headers(PRO)
    rule = api.post("/alerts", headers=owner, json={
        "notify_phone": "+94771234567", "notify_telegram_chat_id": "12345", "notify_email": OTHER,
        "notify_channels": "wa,tg,email",
    }).json()
    assert rule["notify_channels"] == "email,telegram,whatsapp" and rule["notify_email"] == OTHER
    url = f"/alerts/{rule['id']}"
    assert api.patch(url, headers=owner, json={"active": False}).status_code == 200
    with store.begin() as db:
        db.query(PlatformUser).filter_by(email=PRO).one().plan = "free"
    assert api.patch(url, headers=owner, json={"active": True}).status_code == 403
    assert api.patch(url + "/channels", headers=owner, json={"channels": ["email"]}).status_code == 403
    assert api.put(url, headers=owner, json={"notify_channels": "inapp"}).json()["active"] is False
    assert api.patch(url, headers=owner, json={"active": True}).status_code == 200


def test_match_delivery_obeys_explicit_selection_and_current_state(api, store, monkeypatch):
    from datetime import datetime, timezone
    from unittest.mock import Mock
    from app.utils import alert_matcher, digest_flush, notify_email
    from db.models import CarListing, NotificationDeliveryLog, UserNotification

    owner = headers()
    rule = api.post("/alerts", headers=owner, json={"notify_channels": "email", "delivery_mode": "digest"}).json()
    url = f"/alerts/{rule['id']}"
    sender = Mock(return_value=True)
    for mod in (alert_matcher, notify_email):
        monkeypatch.setattr(mod, "email_notify_configured", lambda: True)
        monkeypatch.setattr(mod, "send_alert_email", sender)
    with store.begin() as db:
        db.add(CarListing(source="test", source_id="fixture", make="Toyota", model="Aqua",
                          scraped_at=datetime.now(timezone.utc)))
    with store() as db:
        assert alert_matcher.run_alert_match_pass(db)["queued"] == 1
        assert db.query(UserNotification).count() == 0  # email only, not inbox
    assert api.patch(url + "/channels", headers=owner, json={"channels": ["inapp"]}).status_code == 200
    with store() as db:
        assert digest_flush.flush_queued_deliveries(db)["sent"] == 0
        assert db.query(NotificationDeliveryLog).one().status == "skipped"
    sender.assert_not_called()
    assert api.patch(url, headers=owner, json={"active": False}).status_code == 200
    with store() as db:
        assert alert_matcher.run_alert_match_pass(db)["alerts_checked"] == 0


def test_patch_on_legacy_db_does_not_revive_deleted_alerts(store, api):
    from db.schema_patches import apply_schema_patches

    owner = headers()
    created = api.post("/alerts", headers=owner, json={}).json()
    with store() as db:
        engine = db.get_bind()
    with engine.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE market_alerts DROP COLUMN paused_at")
        conn.exec_driver_sql("UPDATE market_alerts SET active = 0")  # pre-pause soft-delete
    apply_schema_patches(engine)
    assert api.get("/alerts?include_paused=true", headers=owner).json() == []
    assert api.patch(f"/alerts/{created['id']}/active", headers=owner, json={"active": True}).status_code == 404


def test_free_email_only_dispatches_to_verified_mailbox(api, store, monkeypatch):
    from datetime import datetime, timezone
    from unittest.mock import Mock
    from app.utils import alert_matcher
    from db.models import CarListing, UserNotification

    sender = Mock(return_value=True)
    monkeypatch.setattr(alert_matcher, "email_notify_configured", lambda: True)
    monkeypatch.setattr(alert_matcher, "send_alert_email", sender)
    assert api.post("/alerts", headers=headers(), json={"notify_channels": "email"}).status_code == 201
    # Omitted channels still yield a legacy inbox entry without enabling email.
    assert api.post("/alerts", headers=headers(OTHER), json={}).status_code == 201
    with store() as db:
        db.add(CarListing(source="fixture", source_id="1", make="Toyota", model="Aqua",
                          scraped_at=datetime.now(timezone.utc)))
        db.commit()
        assert alert_matcher.run_alert_match_pass(db)["email_sent"] == 1
        assert db.query(UserNotification).one().user_token == f"mm:{OTHER}"
    sender.assert_called_once()
    assert sender.call_args.kwargs["to_email"] == FREE
