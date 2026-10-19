import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import events as events_module
from app.models.schemas import AnalyticsEventCreate
from db.models import AnalyticsEvent, Base


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


class DummyRequest:
    headers = {"user-agent": "pytest"}
    client = type("Client", (), {"host": "127.0.0.1"})()


def setup_function():
    events_module._events_rate_limiter.reset()


def test_record_event_persists_row():
    db = _session()
    receipt = events_module.record_event(
        AnalyticsEventCreate(
            event="listing_viewed",
            properties={"listing_id": 42, "source": "ikman"},
            session_id="sess-abc",
        ),
        request=DummyRequest(),
        db=db,
    )
    stored = db.query(AnalyticsEvent).one()
    assert receipt.id == stored.id
    assert stored.event == "listing_viewed"
    assert stored.properties == {"listing_id": 42, "source": "ikman"}
    assert stored.session_id == "sess-abc"


def test_record_event_minimal_payload():
    db = _session()
    receipt = events_module.record_event(
        AnalyticsEventCreate(event="page_view"),
        request=DummyRequest(),
        db=db,
    )
    stored = db.query(AnalyticsEvent).one()
    assert receipt.id == stored.id
    assert stored.event == "page_view"
    assert stored.properties is None
    assert stored.session_id is None


def test_record_event_strips_event_name():
    db = _session()
    events_module.record_event(
        AnalyticsEventCreate(event="  search_submit  "),
        request=DummyRequest(),
        db=db,
    )
    assert db.query(AnalyticsEvent).one().event == "search_submit"


def test_record_event_strips_credential_properties():
    """Alert/session bearer tokens must never be persisted in analytics_events."""
    db = _session()
    events_module.record_event(
        AnalyticsEventCreate(
            event="alert_created",
            properties={
                "user_token": "mm:victim@example.com",
                "alert_token": "mm:victim@example.com",
                "token": "mm:victim@example.com",
                "api_key": "sk-secret",
                "make": "Toyota",
            },
        ),
        request=DummyRequest(),
        db=db,
    )
    stored = db.query(AnalyticsEvent).one()
    assert stored.properties == {"make": "Toyota"}


def test_anonymous_events_cannot_inject_notifications():
    """Unauthenticated /events must not write into any user's in-app feed."""
    from db.models import UserNotification

    db = _session()
    events_module.record_event(
        AnalyticsEventCreate(
            event="listing_view",
            properties={
                "user_token": "mm:victim@example.com",
                "listing_id": 1,
                "price_drop": 1,
                "nudge_body": "Click here to claim your prize",
            },
        ),
        request=DummyRequest(),
        db=db,
    )
    assert db.query(UserNotification).count() == 0


def test_sanitize_properties_rejects_nested_credential_keys():
    clean = events_module._sanitize_properties({
        "owner_token": "mm:x@y.z",
        "session_token": "abc",
        "listing_id": 9,
    })
    assert clean == {"listing_id": 9}


def test_record_event_rate_limit_rejects_excess():
    request = DummyRequest()
    db = _session()

    for i in range(events_module._events_rate_limiter.max_requests):
        events_module._events_rate_limiter(request, now=float(1000 + i))

    try:
        events_module._events_rate_limiter(request, now=1060.0)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 429
    else:
        raise AssertionError("analytics rate limiter should reject excess requests")


def test_record_event_allows_burst_then_recovers():
    request = DummyRequest()

    for i in range(events_module._events_rate_limiter.max_requests):
        events_module._events_rate_limiter(request, now=float(1000 + i))

    # After full window elapses, should accept again.
    recovered_ok = False
    try:
        events_module._events_rate_limiter(
            request,
            now=float(1000 + events_module._events_rate_limiter.window_seconds + 1),
        )
        recovered_ok = True
    except Exception:
        pass
    assert recovered_ok, "rate limiter should recover after window elapses"
