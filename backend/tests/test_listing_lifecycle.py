"""Tests for app.utils.listing_lifecycle (dead-listing soft delete)."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.listing_lifecycle import mark_inactive_listings
from app.utils.listing_upsert import upsert_listing
from db.models import Base, CarListing


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


def test_broken_source_is_not_swept():
    """If a source has no fresh sightings at all, its scraper is likely broken
    — none of its listings should be deactivated."""
    db = _session()
    db.add(_listing("riyasewana", "a", last_seen_days_ago=10))
    db.add(_listing("riyasewana", "b", last_seen_days_ago=12))
    db.commit()

    result = mark_inactive_listings(db, stale_days=7, now=_NOW)

    assert result["deactivated_total"] == 0
    assert "riyasewana" in result["skipped_stale_sources"]
    assert all(l.is_active for l in db.query(CarListing).all())


def test_fraction_guard_blocks_mass_deactivation():
    """When most of a source's inventory looks stale (e.g. crawl horizon is
    shallower than the source), the sweep must be skipped, not executed."""
    db = _session()
    _seed_fresh(db, "ikman", 2)
    for i in range(8):
        db.add(_listing("ikman", f"deep{i}", last_seen_days_ago=10))
    db.commit()

    result = mark_inactive_listings(db, stale_days=7, now=_NOW)

    assert result["deactivated_total"] == 0
    assert "ikman" in result["fraction_guarded_sources"]
    assert db.query(CarListing).filter(CarListing.is_active == True).count() == 10  # noqa: E712


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
