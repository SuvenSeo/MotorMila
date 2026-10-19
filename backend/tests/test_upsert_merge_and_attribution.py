"""Upsert must not overwrite good data with nulls; sources expose last_checked_at."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import listings
from app.utils.listing_upsert import upsert_listing
from db.models import Base, CarListing, ScrapeRun

_NOW = datetime(2026, 10, 1, 10, 0)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _payload(**overrides):
    base = {
        "source": "ikman",
        "source_id": "ad-1",
        "scraped_at": _NOW,
        "make": "Nissan",
        "model": "X-Trail",
        "year": 2015,
        "price_lkr": 9_500_000,
        "mileage": 80_000,
        "district": "Colombo",
        "fuel_type": "petrol",
        "thumbnail_url": "https://i.ikman-st.com/x.jpg",
        "title": "Nissan X-Trail 2015",
        "url": "https://ikman.lk/en/ad/ad-1",
    }
    base.update(overrides)
    return base


def test_update_never_overwrites_known_values_with_nulls_or_placeholders():
    db = _session()
    upsert_listing(db, "ikman", _payload())
    db.commit()
    upsert_listing(
        db,
        "ikman",
        _payload(
            price_lkr=None,
            mileage=None,
            district="Sri Lanka",
            model="Other",
            fuel_type="",
            thumbnail_url="data:image/png;base64,AAAA",
            url="",
            scraped_at=_NOW + timedelta(days=1),
        ),
    )
    db.commit()
    row = db.query(CarListing).one()
    assert float(row.price_lkr) == 9_500_000
    assert row.mileage == 80_000
    assert row.district == "Colombo"
    assert row.model == "X-Trail"
    assert row.fuel_type == "petrol"
    assert row.thumbnail_url == "https://i.ikman-st.com/x.jpg"
    assert row.url == "https://ikman.lk/en/ad/ad-1"


def test_update_still_applies_real_changes():
    db = _session()
    upsert_listing(db, "ikman", _payload())
    db.commit()
    upsert_listing(db, "ikman", _payload(price_lkr=9_000_000, mileage=81_000))
    db.commit()
    row = db.query(CarListing).one()
    assert float(row.price_lkr) == 9_000_000
    assert row.mileage == 81_000


def test_merge_of_older_dump_does_not_overwrite_newer_row():
    db = _session()
    upsert_listing(db, "ikman", _payload(price_lkr=9_000_000, scraped_at=_NOW))
    db.commit()
    upsert_listing(
        db,
        "ikman",
        _payload(price_lkr=12_000_000, scraped_at=_NOW - timedelta(days=5)),
        preserve_lifecycle=True,
    )
    db.commit()
    assert float(db.query(CarListing).one().price_lkr) == 9_000_000


def test_sources_endpoint_exposes_last_checked_at():
    db = _session()
    now = datetime(2026, 10, 1, tzinfo=timezone.utc)
    db.add(
        CarListing(
            source="riyasewana", source_id="r1", scraped_at=now, first_seen_at=now, last_seen_at=now,
            make="Toyota", model="Vitz", year=2018, price_lkr=5_000_000, title="Toyota Vitz",
            url="https://riyasewana.com/buy/r1", is_active=True, is_duplicate=False, is_outlier=False,
        )
    )
    db.add(ScrapeRun(source="riyasewana", started_at=now, finished_at=now, status="SUCCESS"))
    db.add(ScrapeRun(source="riyasewana", started_at=now + timedelta(hours=5),
                     finished_at=now + timedelta(hours=5), status="FAILED"))
    db.commit()
    rows = listings.get_sources(db=db)
    row = next(r for r in rows if r["source"] == "riyasewana")
    assert row["count"] == 1
    assert row["last_checked_at"].startswith("2026-10-01T00:00")
