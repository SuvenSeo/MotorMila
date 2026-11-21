"""Tests for run_alert_match_pass() in app/utils/alert_matcher.py.

All tests use an in-memory SQLite database; no external services required.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.alert_matcher import _count_matching, _resolve_channels, run_alert_match_pass
from db.models import Base, CarListing, MarketAlert, MarketAlertMatch, PlatformUser


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _make_alert(db, *, make=None, model=None, max_price=None, district=None, active=True):
    alert = MarketAlert(
        user_token="test-token",
        make=make,
        model=model,
        max_price=max_price,
        district=district,
        active=active,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def _make_listing(db, *, make="Toyota", model="Axio", price_lkr=3_000_000, district="Colombo", is_outlier=False):
    listing = CarListing(
        source="ikman",
        source_id=f"test-{make}-{model}-{price_lkr}-{district}",
        scraped_at=datetime.now(timezone.utc),
        make=make,
        model=model,
        price_lkr=price_lkr,
        district=district,
        is_outlier=is_outlier,
        is_duplicate=False,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


# ---------------------------------------------------------------------------
# _count_matching unit tests
# ---------------------------------------------------------------------------


def test_count_matching_no_filters_excludes_outliers():
    db = _session()
    _make_listing(db, make="Toyota", is_outlier=False)
    _make_listing(db, make="Honda", is_outlier=False)
    _make_listing(db, make="Bugatti", is_outlier=True)

    alert = _make_alert(db)
    assert _count_matching(db, alert) == 2


def test_count_matching_make_filter():
    db = _session()
    _make_listing(db, make="Toyota", model="Axio")
    _make_listing(db, make="Toyota", model="Prius")
    _make_listing(db, make="Honda", model="Fit")

    alert = _make_alert(db, make="Toyota")
    assert _count_matching(db, alert) == 2


def test_count_matching_make_and_model_filter():
    db = _session()
    _make_listing(db, make="Toyota", model="Axio", price_lkr=3_000_000)
    _make_listing(db, make="Toyota", model="Prius", price_lkr=4_000_000)
    _make_listing(db, make="Honda", model="Fit", price_lkr=2_000_000)

    alert = _make_alert(db, make="Toyota", model="Axio")
    assert _count_matching(db, alert) == 1


def test_count_matching_max_price_filter():
    db = _session()
    _make_listing(db, make="Toyota", price_lkr=3_000_000)
    _make_listing(db, make="Toyota", price_lkr=5_000_000)
    _make_listing(db, make="Toyota", price_lkr=6_000_000)

    alert = _make_alert(db, make="Toyota", max_price=5_000_000)
    assert _count_matching(db, alert) == 2


def test_count_matching_district_filter():
    db = _session()
    _make_listing(db, make="Suzuki", district="Colombo")
    _make_listing(db, make="Suzuki", district="Kandy")
    _make_listing(db, make="Suzuki", district="Galle")

    alert = _make_alert(db, make="Suzuki", district="Colombo")
    assert _count_matching(db, alert) == 1


def test_count_matching_combined_filters():
    db = _session()
    _make_listing(db, make="Toyota", model="Axio", price_lkr=3_000_000, district="Colombo")
    _make_listing(db, make="Toyota", model="Axio", price_lkr=6_000_000, district="Colombo")
    _make_listing(db, make="Toyota", model="Axio", price_lkr=3_000_000, district="Kandy")

    alert = _make_alert(db, make="Toyota", model="Axio", max_price=4_000_000, district="Colombo")
    assert _count_matching(db, alert) == 1


def test_count_matching_returns_zero_when_no_match():
    db = _session()
    _make_listing(db, make="Honda", model="Fit", price_lkr=2_000_000)

    alert = _make_alert(db, make="Toyota")
    assert _count_matching(db, alert) == 0


# ---------------------------------------------------------------------------
# run_alert_match_pass integration tests
# ---------------------------------------------------------------------------


def test_run_alert_match_pass_returns_summary():
    db = _session()
    _make_listing(db, make="Toyota", model="Axio", price_lkr=3_000_000)
    _make_alert(db, make="Toyota", model="Axio")
    _make_alert(db, make="Honda")

    result = run_alert_match_pass(db)

    assert result["alerts_checked"] == 2
    assert isinstance(result["total_matches"], int)
    assert result["total_matches"] >= 1
    assert "elapsed_seconds" in result
    assert result["errors"] == 0
    assert "email_sent" in result
    assert "telegram_sent" in result


def test_run_alert_match_pass_creates_match_rows():
    db = _session()
    _make_listing(db, make="Toyota", model="Axio", price_lkr=3_000_000)
    alert1 = _make_alert(db, make="Toyota")
    alert2 = _make_alert(db, make="Honda")

    run_alert_match_pass(db)

    rows = db.query(MarketAlertMatch).all()
    assert len(rows) == 2
    alert_ids = {r.alert_id for r in rows}
    assert alert_ids == {alert1.id, alert2.id}


def test_run_alert_match_pass_stores_correct_counts():
    db = _session()
    _make_listing(db, make="Toyota", price_lkr=3_000_000)
    _make_listing(db, make="Toyota", price_lkr=4_000_000)
    _make_listing(db, make="Honda", price_lkr=2_500_000)
    alert = _make_alert(db, make="Toyota")

    run_alert_match_pass(db)

    match = db.query(MarketAlertMatch).filter(MarketAlertMatch.alert_id == alert.id).one()
    assert match.match_count == 2


def test_run_alert_match_pass_updates_existing_row():
    db = _session()
    alert = _make_alert(db, make="Toyota")
    _make_listing(db, make="Toyota", price_lkr=3_000_000)

    run_alert_match_pass(db)
    first_match = db.query(MarketAlertMatch).filter(MarketAlertMatch.alert_id == alert.id).one()
    first_count = first_match.match_count
    first_ts = first_match.last_matched_at

    # Add a second listing and re-run — match_count should increase, no new row created.
    _make_listing(db, make="Toyota", model="Prius", price_lkr=5_000_000)
    run_alert_match_pass(db)

    rows = db.query(MarketAlertMatch).filter(MarketAlertMatch.alert_id == alert.id).all()
    assert len(rows) == 1, "should not create a duplicate row on second pass"
    assert rows[0].match_count > first_count
    assert rows[0].last_matched_at >= first_ts


def test_run_alert_match_pass_skips_inactive_alerts():
    db = _session()
    _make_listing(db, make="Toyota")
    _make_alert(db, make="Toyota", active=False)
    active_alert = _make_alert(db, make="Honda", active=True)

    result = run_alert_match_pass(db)

    assert result["alerts_checked"] == 1
    rows = db.query(MarketAlertMatch).all()
    assert len(rows) == 1
    assert rows[0].alert_id == active_alert.id


def test_run_alert_match_pass_zero_alerts():
    db = _session()
    result = run_alert_match_pass(db)

    assert result["alerts_checked"] == 0
    assert result["total_matches"] == 0
    assert result["errors"] == 0


def test_run_alert_match_pass_last_matched_at_is_set():
    db = _session()
    alert = _make_alert(db, make="Toyota")
    _make_listing(db, make="Toyota")

    before = datetime.now(timezone.utc)
    run_alert_match_pass(db)
    after = datetime.now(timezone.utc)

    match = db.query(MarketAlertMatch).filter(MarketAlertMatch.alert_id == alert.id).one()
    # SQLite stores without tz; compare naively.
    ts = match.last_matched_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    assert before <= ts <= after


def test_run_alert_match_pass_total_matches_sums_all_alerts():
    db = _session()
    _make_listing(db, make="Toyota", price_lkr=3_000_000)
    _make_listing(db, make="Toyota", price_lkr=4_000_000)
    _make_listing(db, make="Honda", price_lkr=2_000_000)

    _make_alert(db, make="Toyota")
    _make_alert(db, make="Honda")

    result = run_alert_match_pass(db)

    # Toyota alert matches 2, Honda alert matches 1 → total 3
    assert result["total_matches"] == 3


# ---------------------------------------------------------------------------
# _resolve_channels unit tests
# ---------------------------------------------------------------------------


def test_resolve_channels_explicit_notify_channels():
    alert = MarketAlert(
        user_token="tok",
        notify_channels="whatsapp,email",
        notify_phone="0771234567",
        notify_email="user@example.com",
        notify_telegram_chat_id=None,
    )
    channels = _resolve_channels(alert)
    assert channels == {"whatsapp", "email"}


def test_resolve_channels_infers_from_fields_when_channels_null():
    alert = MarketAlert(
        user_token="tok",
        notify_channels=None,
        notify_phone="0771234567",
        notify_email="user@example.com",
        notify_telegram_chat_id="123456",
    )
    channels = _resolve_channels(alert)
    assert channels == {"whatsapp", "email", "telegram"}


def test_resolve_channels_empty_when_no_destinations():
    alert = MarketAlert(
        user_token="tok",
        notify_channels=None,
        notify_phone=None,
        notify_email=None,
        notify_telegram_chat_id=None,
    )
    assert _resolve_channels(alert) == set()


# ---------------------------------------------------------------------------
# Multi-channel dispatch integration tests
# ---------------------------------------------------------------------------


def _make_alert_with_channels(db, **kwargs):
    # These are positive provider tests: anonymous rules cannot authorize these routes.
    db.add(PlatformUser(email="user@example.com", name="Fixture", password_hash="unused",
                        plan="pro", subscription_status="active", email_verified=True))
    alert = MarketAlert(user_token="mm:user@example.com", active=True, **kwargs)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def test_matcher_dispatches_telegram_when_count_increases(monkeypatch):
    db = _session()
    _make_listing(db, make="Toyota")
    _make_alert_with_channels(
        db,
        make="Toyota",
        notify_telegram_chat_id="123456",
        notify_channels="telegram",
    )

    with patch("app.utils.alert_matcher.telegram_notify_configured", return_value=True), \
         patch("app.utils.alert_matcher.send_telegram_alert", return_value=True) as mock_tg, \
         patch("app.utils.alert_matcher.whatsapp_notify_configured", return_value=False), \
         patch("app.utils.alert_matcher.email_notify_configured", return_value=False):
        result = run_alert_match_pass(db)

    assert result["telegram_sent"] == 1
    assert result["whatsapp_sent"] == 0
    assert result["email_sent"] == 0
    mock_tg.assert_called_once()


def test_matcher_dispatches_email_when_count_increases(monkeypatch):
    db = _session()
    _make_listing(db, make="Honda")
    _make_alert_with_channels(
        db,
        make="Honda",
        notify_email="user@example.com",
        notify_channels="email",
    )

    with patch("app.utils.alert_matcher.email_notify_configured", return_value=True), \
         patch("app.utils.alert_matcher.send_alert_email", return_value=True) as mock_em, \
         patch("app.utils.alert_matcher.whatsapp_notify_configured", return_value=False), \
         patch("app.utils.alert_matcher.telegram_notify_configured", return_value=False):
        result = run_alert_match_pass(db)

    assert result["email_sent"] == 1
    assert result["whatsapp_sent"] == 0
    assert result["telegram_sent"] == 0
    mock_em.assert_called_once()


def test_matcher_dispatches_multiple_channels(monkeypatch):
    db = _session()
    _make_listing(db, make="Suzuki")
    _make_alert_with_channels(
        db,
        make="Suzuki",
        notify_phone="0771234567",
        notify_email="user@example.com",
        notify_telegram_chat_id="123456",
        notify_channels="whatsapp,email,telegram",
    )

    with patch("app.utils.alert_matcher.whatsapp_notify_configured", return_value=True), \
         patch("app.utils.alert_matcher.send_whatsapp_alert", return_value=True) as mock_wa, \
         patch("app.utils.alert_matcher.email_notify_configured", return_value=True), \
         patch("app.utils.alert_matcher.send_alert_email", return_value=True) as mock_em, \
         patch("app.utils.alert_matcher.telegram_notify_configured", return_value=True), \
         patch("app.utils.alert_matcher.send_telegram_alert", return_value=True) as mock_tg:
        result = run_alert_match_pass(db)

    assert result["whatsapp_sent"] == 1
    assert result["email_sent"] == 1
    assert result["telegram_sent"] == 1
    mock_wa.assert_called_once()
    mock_em.assert_called_once()
    mock_tg.assert_called_once()


def test_matcher_does_not_notify_when_count_unchanged():
    db = _session()
    _make_listing(db, make="Toyota")
    _make_alert_with_channels(
        db,
        make="Toyota",
        notify_email="user@example.com",
        notify_channels="email",
    )

    with patch("app.utils.alert_matcher.email_notify_configured", return_value=True), \
         patch("app.utils.alert_matcher.send_alert_email", return_value=True) as mock_em:
        run_alert_match_pass(db)  # first pass — count increases from 0 → 1
        mock_em.reset_mock()
        result = run_alert_match_pass(db)  # second pass — count stays at 1

    assert result["email_sent"] == 0
    mock_em.assert_not_called()

