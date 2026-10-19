"""Tests for the server-side market alerts CRUD endpoints and matcher."""
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import alerts as alerts_module
from app.models.schemas import MarketAlertCreate
from db.models import Base, CarListing, MarketAlert


class _DummyRequest:
    method = "GET"
    headers = {"user-agent": "pytest"}
    client = type("Client", (), {"host": "127.0.0.1"})()
    cookies: dict = {}



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _make_header(token: str):
    return token


def _seed_listing(db, *, make="Toyota", model="Axio", price_lkr=3_500_000, district="Colombo", deal_score=75.0):
    listing = CarListing(
        source="ikman",
        source_id=f"test-{make}-{model}-{price_lkr}",
        scraped_at=datetime.now(timezone.utc),
        make=make,
        model=model,
        price_lkr=price_lkr,
        district=district,
        deal_score=deal_score,
        is_outlier=False,
        is_duplicate=False,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


# ---------------------------------------------------------------------------
# create_alert
# ---------------------------------------------------------------------------

def test_create_alert_persists_to_db():
    db = _session()
    token = "test-token-uuid-001"

    result = alerts_module.create_alert(
        request=_DummyRequest(),
        payload=MarketAlertCreate(make="Toyota", model="Axio", max_price=5_000_000, district="Colombo"),
        x_alert_token=token,
        db=db,
    )

    stored = db.query(MarketAlert).one()
    assert result.id == stored.id
    assert stored.user_token == token
    assert stored.make == "Toyota"
    assert stored.model == "Axio"
    assert float(stored.max_price) == 5_000_000
    assert stored.district == "Colombo"
    assert stored.active is True


def test_create_alert_with_minimal_fields():
    db = _session()

    result = alerts_module.create_alert(
        request=_DummyRequest(),
        payload=MarketAlertCreate(make="Honda"),
        x_alert_token="tok-minimal",
        db=db,
    )

    assert result.make == "Honda"
    assert result.model is None
    assert result.district is None
    assert result.max_price is None


def test_create_alert_persists_email_and_telegram_fields():
    """External channels require a signed-in Pro plan — legacy tokens must not attach them."""
    db = _session()

    with pytest.raises(HTTPException) as exc_info:
        alerts_module.create_alert(
            request=_DummyRequest(),
            payload=MarketAlertCreate(
                make="Toyota",
                notify_email="user@example.com",
                notify_telegram_chat_id="123456",
                notify_channels="email,telegram",
            ),
            x_alert_token="tok-multi",
            db=db,
        )

    assert exc_info.value.status_code == 403
    assert "Pro plan" in str(exc_info.value.detail)


def test_create_alert_schema_validates_email_format():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        MarketAlertCreate(notify_email="not-an-email")


def test_create_alert_schema_validates_telegram_chat_id():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        MarketAlertCreate(notify_telegram_chat_id="bad chat id with spaces")


def test_create_alert_rejects_empty_token():
    db = _session()

    with pytest.raises(HTTPException) as exc_info:
        alerts_module.create_alert(
            request=_DummyRequest(),
            payload=MarketAlertCreate(make="Suzuki"),
            x_alert_token="",
            db=db,
        )

    assert exc_info.value.status_code == 400


def test_create_alert_rejects_account_token_impersonation():
    """Client-supplied `mm:{email}` tokens must never resolve to another account."""
    db = _session()

    with pytest.raises(HTTPException) as exc_info:
        alerts_module.create_alert(
            request=_DummyRequest(),
            payload=MarketAlertCreate(make="Toyota"),
            x_alert_token="mm:victim@example.com",
            db=db,
        )

    assert exc_info.value.status_code == 403
    assert "mm:" in str(exc_info.value.detail).lower() or "client" in str(exc_info.value.detail).lower()


def test_create_alert_rejects_token_exceeding_max_length():
    db = _session()

    with pytest.raises(HTTPException) as exc_info:
        alerts_module.create_alert(
            request=_DummyRequest(),
            payload=MarketAlertCreate(make="Suzuki"),
            x_alert_token="x" * 65,
            db=db,
        )

    assert exc_info.value.status_code == 400


def test_create_alert_enforces_per_token_limit():
    db = _session()
    token = "tok-limit-test"

    # Legacy / anonymous tokens get free-tier caps.
    for i in range(alerts_module.FREE_ALERTS_LIMIT):
        alerts_module.create_alert(
            request=_DummyRequest(),
            payload=MarketAlertCreate(make=f"Make{i}"),
            x_alert_token=token,
            db=db,
        )

    with pytest.raises(HTTPException) as exc_info:
        alerts_module.create_alert(
            request=_DummyRequest(),
            payload=MarketAlertCreate(make="OverLimit"),
            x_alert_token=token,
            db=db,
        )

    assert exc_info.value.status_code == 429


# ---------------------------------------------------------------------------
# list_alerts
# ---------------------------------------------------------------------------

def test_list_alerts_returns_only_active_for_token():
    db = _session()
    token = "tok-list-001"
    other_token = "tok-list-002"
    third_token = "tok-list-003"

    alerts_module.create_alert(request=_DummyRequest(), payload=MarketAlertCreate(make="Toyota"), x_alert_token=token, db=db)
    alerts_module.create_alert(request=_DummyRequest(), payload=MarketAlertCreate(make="Honda"), x_alert_token=other_token, db=db)
    alerts_module.create_alert(request=_DummyRequest(), payload=MarketAlertCreate(make="Nissan"), x_alert_token=third_token, db=db)

    result = alerts_module.list_alerts(request=_DummyRequest(), token=token, db=db)

    assert len(result) == 1
    makes = {a.make for a in result}
    assert makes == {"Toyota"}


def test_list_alerts_returns_empty_list_for_unknown_token():
    db = _session()

    result = alerts_module.list_alerts(request=_DummyRequest(), token="no-such-token", db=db)

    assert result == []


def test_list_alerts_excludes_deactivated_alerts():
    db = _session()
    token = "tok-inactive"

    created = alerts_module.create_alert(request=_DummyRequest(), payload=MarketAlertCreate(make="BMW"), x_alert_token=token, db=db)
    alerts_module.delete_alert(request=_DummyRequest(), alert_id=created.id, x_alert_token=token, db=db)

    result = alerts_module.list_alerts(request=_DummyRequest(), token=token, db=db)
    assert result == []


# ---------------------------------------------------------------------------
# delete_alert
# ---------------------------------------------------------------------------

def test_delete_alert_soft_deletes_record():
    db = _session()
    token = "tok-delete-001"

    created = alerts_module.create_alert(request=_DummyRequest(), payload=MarketAlertCreate(make="Mazda"), x_alert_token=token, db=db)
    alerts_module.delete_alert(request=_DummyRequest(), alert_id=created.id, x_alert_token=token, db=db)

    stored = db.query(MarketAlert).filter(MarketAlert.id == created.id).one()
    assert stored.active is False


def test_delete_alert_raises_404_for_wrong_token():
    db = _session()
    owner_token = "tok-owner"
    attacker_token = "tok-attacker"

    created = alerts_module.create_alert(request=_DummyRequest(), payload=MarketAlertCreate(make="Kia"), x_alert_token=owner_token, db=db)

    with pytest.raises(HTTPException) as exc_info:
        alerts_module.delete_alert(request=_DummyRequest(), alert_id=created.id, x_alert_token=attacker_token, db=db)

    assert exc_info.value.status_code == 404


def test_delete_alert_raises_404_for_nonexistent_id():
    db = _session()

    with pytest.raises(HTTPException) as exc_info:
        alerts_module.delete_alert(request=_DummyRequest(), alert_id=99999, x_alert_token="tok-any", db=db)

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# match_alerts
# ---------------------------------------------------------------------------

def test_match_alerts_returns_matching_listings():
    db = _session()
    token = "tok-match-001"

    _seed_listing(db, make="Toyota", model="Axio", price_lkr=3_000_000, district="Colombo")
    _seed_listing(db, make="Toyota", model="Axio", price_lkr=4_000_000, district="Kandy")
    _seed_listing(db, make="Honda", model="Fit", price_lkr=2_500_000, district="Colombo")

    alerts_module.create_alert(
        request=_DummyRequest(),
        payload=MarketAlertCreate(make="Toyota", model="Axio", max_price=3_500_000),
        x_alert_token=token,
        db=db,
    )

    response = alerts_module.match_alerts(request=_DummyRequest(), token=token, db=db)

    assert len(response.results) == 1
    result = response.results[0]
    assert result.matching_count == 1
    assert len(result.listings) == 1
    assert result.listings[0].make == "Toyota"
    assert result.listings[0].model == "Axio"
    assert result.listings[0].price_lkr == 3_000_000


def test_match_alerts_empty_when_no_listings_match():
    db = _session()
    token = "tok-match-002"

    _seed_listing(db, make="Toyota", model="Axio", price_lkr=8_000_000)

    alerts_module.create_alert(
        request=_DummyRequest(),
        payload=MarketAlertCreate(make="Toyota", model="Axio", max_price=5_000_000),
        x_alert_token=token,
        db=db,
    )

    response = alerts_module.match_alerts(request=_DummyRequest(), token=token, db=db)

    assert response.results[0].matching_count == 0
    assert response.results[0].listings == []


def test_match_alerts_no_filters_matches_all_non_outliers():
    db = _session()
    token = "tok-match-003"

    _seed_listing(db, make="Toyota", price_lkr=3_000_000)
    _seed_listing(db, make="Honda", price_lkr=2_500_000)

    outlier = CarListing(
        source="ikman",
        source_id="outlier-001",
        scraped_at=datetime.now(timezone.utc),
        make="Bugatti",
        model="Veyron",
        price_lkr=500_000_000,
        is_outlier=True,
        is_duplicate=False,
    )
    db.add(outlier)
    db.commit()

    alerts_module.create_alert(
        request=_DummyRequest(),
        payload=MarketAlertCreate(),
        x_alert_token=token,
        db=db,
    )

    response = alerts_module.match_alerts(request=_DummyRequest(), token=token, db=db)
    assert response.results[0].matching_count == 2


def test_match_alerts_returns_empty_results_for_unknown_token():
    db = _session()

    response = alerts_module.match_alerts(request=_DummyRequest(), token="tok-nobody", db=db)

    assert response.results == []


def test_match_alerts_district_filter_is_case_insensitive():
    db = _session()
    token = "tok-match-district"

    _seed_listing(db, make="Suzuki", model="Alto", district="Colombo", price_lkr=1_500_000)
    _seed_listing(db, make="Suzuki", model="Alto", district="Kandy", price_lkr=1_400_000)

    alerts_module.create_alert(
        request=_DummyRequest(),
        payload=MarketAlertCreate(make="Suzuki", district="colombo"),
        x_alert_token=token,
        db=db,
    )

    response = alerts_module.match_alerts(request=_DummyRequest(), token=token, db=db)
    assert response.results[0].matching_count == 1
    assert response.results[0].listings[0].district == "Colombo"


# ---------------------------------------------------------------------------
# Transport contract: /alerts/match must answer GET as well as POST.
# The web client issues a GET; serving POST only returned 405, which left the
# alerts page stuck on "Loading alerts" with 405/500 in the console.
# ---------------------------------------------------------------------------

def test_match_route_is_registered_for_both_get_and_post():
    paths = {
        (route.path, method)
        for route in alerts_module.router.routes
        for method in (getattr(route, "methods", None) or set())
    }
    assert ("/match", "GET") in paths
    assert ("/match", "POST") in paths


def test_match_alerts_get_delegates_to_the_post_handler():
    db = _session()
    token = "tok-get-alias"

    _seed_listing(db, make="Toyota", model="Axio", price_lkr=3_000_000)
    alerts_module.create_alert(
        request=_DummyRequest(),
        payload=MarketAlertCreate(make="Toyota"),
        x_alert_token=token,
        db=db,
    )

    response = alerts_module.match_alerts_get(
        request=_DummyRequest(),
        token=token,
        db=db,
    )

    assert len(response.results) == 1
    assert response.results[0].matching_count == 1
