"""Tests for app.utils.listing_lifecycle (dead-listing soft delete)."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.listing_lifecycle import mark_inactive_listings
from app.utils.listing_upsert import upsert_listing
from db.models import Base, CarListing, ScrapeRun


_NOW = datetime(2026, 7, 16, 10, 0)  # naive UTC, matches utc_now() convention


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _listing(source: str, source_id: str, *, last_seen_days_ago: float) -> CarListing:
    seen = _NOW - timedelta(days=last_seen_days_ago)
    return CarListing(
        source=source,
        source_id=source_id,
        scraped_at=seen,
        first_seen_at=seen - timedelta(days=3),
        last_seen_at=seen,
        make="Toyota",
        model="Prius",
        year=2020,
        price_lkr=10_000_000,
        title="Toyota Prius 2020",
        url=f"https://example.com/{source}/{source_id}",
        is_active=True,
    )


def _seed_fresh(db, source: str, count: int, prefix: str = "fresh"):
    for i in range(count):
        db.add(_listing(source, f"{prefix}{i}", last_seen_days_ago=1))


def test_stale_listings_deactivated_fresh_kept():
    db = _session()
    _seed_fresh(db, "ikman", 9)
    db.add(_listing("ikman", "stale", last_seen_days_ago=10))
    db.commit()

    result = mark_inactive_listings(db, stale_days=7, now=_NOW)

    assert result["deactivated_total"] == 1
    stale = db.query(CarListing).filter_by(source_id="stale").one()
    assert stale.is_active is False
    assert db.query(CarListing).filter(CarListing.is_active == True).count() == 9  # noqa: E712


def test_aware_now_is_normalised():
    """Postgres returns tz-aware datetimes; the pass must not raise on them."""
    db = _session()
    _seed_fresh(db, "ikman", 9)
    db.add(_listing("ikman", "stale", last_seen_days_ago=10))
    db.commit()

    aware_now = _NOW.replace(tzinfo=timezone.utc)
    result = mark_inactive_listings(db, stale_days=7, now=aware_now)

    assert result["deactivated_total"] == 1


def _run(db, source: str, status: str, days_ago: float = 0.5):
    db.add(
        ScrapeRun(
            source=source,
            started_at=_NOW - timedelta(days=days_ago),
            finished_at=_NOW - timedelta(days=days_ago),
            status=status,
        )
    )


def test_failed_latest_scrape_protects_recently_stale_rows():
    """A source whose latest scrape FAILED keeps rows between stale_days and the hard ceiling."""
    db = _session()
    _run(db, "riyasewana", "SUCCESS", days_ago=3)
    _run(db, "riyasewana", "FAILED", days_ago=1)
    db.add(_listing("riyasewana", "a", last_seen_days_ago=10))
    db.add(_listing("riyasewana", "ancient", last_seen_days_ago=20))
    db.commit()

    result = mark_inactive_listings(db, stale_days=7, hard_max_days=14, now=_NOW)

    assert "riyasewana" in result["skipped_stale_sources"]
    assert result["deactivated_total"] == 1
    assert db.query(CarListing).filter_by(source_id="a").one().is_active is True
    assert db.query(CarListing).filter_by(source_id="ancient").one().is_active is False


def test_successful_latest_scrape_sweeps_normally():
    db = _session()
    _run(db, "riyasewana", "FAILED", days_ago=3)
    _run(db, "riyasewana", "SUCCESS", days_ago=1)
    db.add(_listing("riyasewana", "a", last_seen_days_ago=10))
    db.commit()

    result = mark_inactive_listings(db, stale_days=7, now=_NOW)

    assert result["deactivated_total"] == 1


def test_no_fraction_cap_for_deep_sources():
    """Most of a source being stale no longer blocks the sweep (ghost-listing bug)."""
    db = _session()
    _seed_fresh(db, "ikman", 2)
    for i in range(8):
        db.add(_listing("ikman", f"deep{i}", last_seen_days_ago=40))
    db.commit()

    result = mark_inactive_listings(db, stale_days=30, now=_NOW)

    assert result["deactivated_total"] == 8
    assert result["fraction_guarded_sources"] == []
    assert db.query(CarListing).filter(CarListing.is_active == True).count() == 2  # noqa: E712


def test_source_with_no_runs_and_all_stale_is_expired():
    """A source that never re-sights anything (e.g. patpat) must not stay live forever."""
    db = _session()
    for i in range(5):
        db.add(_listing("patpat", f"p{i}", last_seen_days_ago=45))
    db.commit()

    result = mark_inactive_listings(db, stale_days=30, now=_NOW)

    assert result["deactivated_by_source"] == {"patpat": 5}


def test_first_party_listings_are_never_swept():
    db = _session()
    db.add(_listing("motormila_user", "mine", last_seen_days_ago=90))
    db.commit()

    result = mark_inactive_listings(db, stale_days=30, now=_NOW)

    assert result["deactivated_total"] == 0
    assert db.query(CarListing).filter_by(source_id="mine").one().is_active is True


def test_default_stale_days_is_30():
    from app.utils import listing_lifecycle

    assert listing_lifecycle.DEFAULT_STALE_DAYS == 30


def test_resight_reactivates_listing():
    db = _session()
    _seed_fresh(db, "ikman", 9)
    db.add(_listing("ikman", "comeback", last_seen_days_ago=10))
    db.commit()

    mark_inactive_listings(db, stale_days=7, now=_NOW)
    db.expire_all()
    assert db.query(CarListing).filter_by(source_id="comeback").one().is_active is False

    upsert_listing(
        db,
        "ikman",
        {
            "source": "ikman",
            "source_id": "comeback",
            "scraped_at": _NOW,
            "make": "Toyota",
            "model": "Prius",
            "year": 2020,
            "price_lkr": 10_000_000,
            "title": "Toyota Prius 2020",
            "url": "https://example.com/ikman/comeback",
        },
    )
    db.commit()

    assert db.query(CarListing).filter_by(source_id="comeback").one().is_active is True


def test_pass_is_idempotent():
    db = _session()
    _seed_fresh(db, "ikman", 9)
    db.add(_listing("ikman", "stale", last_seen_days_ago=10))
    db.commit()

    first = mark_inactive_listings(db, stale_days=7, now=_NOW)
    second = mark_inactive_listings(db, stale_days=7, now=_NOW)

    assert first["deactivated_total"] == 1
    assert second["deactivated_total"] == 0
