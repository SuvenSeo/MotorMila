"""Tests for app.utils.listing_upsert price-history recording and the
/listings/{id}/price-history endpoint."""

import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.listing_upsert import upsert_listing
from db.models import Base, CarListing, VehiclePriceHistory


_NOW = datetime(2026, 7, 16, 10, 0, tzinfo=timezone.utc)


def _session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _payload(source_id: str = "abc-1", price_lkr=10_000_000, source: str = "ikman"):
    # Mirrors cleaner.normalize_listing_payload output: source is always present.
    return {
        "source": source,
        "source_id": source_id,
        "scraped_at": _NOW,
        "make": "Toyota",
        "model": "Prius",
        "year": 2020,
        "price_lkr": price_lkr,
        "title": "Toyota Prius 2020",
        "url": f"https://example.com/{source}/{source_id}",
    }


def _history(db, listing_id):
    return (
        db.query(VehiclePriceHistory)
        .filter(VehiclePriceHistory.vehicle_id == listing_id)
        .order_by(VehiclePriceHistory.scraped_at.asc(), VehiclePriceHistory.id.asc())
        .all()
    )


def test_insert_records_initial_price_point():
    db = _session()
    created = upsert_listing(db, "ikman", _payload())
    db.commit()

    assert created is True
    listing = db.query(CarListing).one()
    rows = _history(db, listing.id)
    assert len(rows) == 1
    assert float(rows[0].price_lkr) == 10_000_000


def test_rescrape_same_price_adds_no_history_row():
    db = _session()
    upsert_listing(db, "ikman", _payload())
    db.commit()

    created = upsert_listing(db, "ikman", _payload())
    db.commit()

    assert created is False
    listing = db.query(CarListing).one()
    assert len(_history(db, listing.id)) == 1


def test_price_change_appends_history_row():
    db = _session()
    upsert_listing(db, "ikman", _payload(price_lkr=10_000_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(price_lkr=9_500_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(price_lkr=9_500_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(price_lkr=9_200_000))
    db.commit()

    listing = db.query(CarListing).one()
    rows = _history(db, listing.id)
    assert [float(r.price_lkr) for r in rows] == [10_000_000, 9_500_000, 9_200_000]
    assert float(listing.price_lkr) == 9_200_000


def test_content_updated_at_set_on_insert_and_price_change_only():
    db = _session()
    upsert_listing(db, "ikman", _payload(price_lkr=10_000_000))
    db.commit()
    listing = db.query(CarListing).one()
    assert listing.content_updated_at is not None
    first_stamp = listing.content_updated_at

    upsert_listing(db, "ikman", _payload(price_lkr=10_000_000))
    db.commit()
    db.refresh(listing)
    assert listing.content_updated_at == first_stamp

    upsert_listing(db, "ikman", _payload(price_lkr=9_000_000))
    db.commit()
    db.refresh(listing)
    assert listing.content_updated_at is not None
    assert listing.content_updated_at >= first_stamp


def test_insert_without_price_records_no_history():
    db = _session()
    upsert_listing(db, "ikman", _payload(price_lkr=None))
    db.commit()

    listing = db.query(CarListing).one()
    assert _history(db, listing.id) == []


def test_price_appearing_later_records_first_point():
    db = _session()
    upsert_listing(db, "ikman", _payload(price_lkr=None))
    db.commit()
    upsert_listing(db, "ikman", _payload(price_lkr=8_000_000))
    db.commit()

    listing = db.query(CarListing).one()
    rows = _history(db, listing.id)
    assert len(rows) == 1
    assert float(rows[0].price_lkr) == 8_000_000


def test_different_sources_do_not_collide():
    db = _session()
    upsert_listing(db, "ikman", _payload(source_id="x1"))
    upsert_listing(
        db,
        "riyasewana",
        _payload(source_id="x1", price_lkr=9_000_000, source="riyasewana"),
    )
    db.commit()

    assert db.query(CarListing).count() == 2
    assert db.query(VehiclePriceHistory).count() == 2


def test_price_drops_feed_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app
    from db.session import get_db

    db = _session()
    # Vehicle A: two cuts (12M -> 10.8M -> 9.6M); Vehicle B: a price RISE; C: no change.
    upsert_listing(db, "ikman", _payload(source_id="a", price_lkr=12_000_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(source_id="a", price_lkr=10_800_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(source_id="a", price_lkr=9_600_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(source_id="b", price_lkr=8_000_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(source_id="b", price_lkr=8_500_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(source_id="c", price_lkr=5_000_000))
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)
        resp = client.get("/api/v1/listings/price-drops?days=7&limit=10")
        assert resp.status_code == 200
        body = resp.json()
        assert body["window_days"] == 7
        # Only vehicle A dropped; one row per vehicle — its BIGGEST single cut
        # (10.8M -> 9.6M = 11.1%, larger than the 12M -> 10.8M = 10.0% cut).
        assert len(body["items"]) == 1
        item = body["items"][0]
        assert item["listing"]["source_id"] == "a"
        assert item["previous_price_lkr"] == 10_800_000
        assert item["new_price_lkr"] == 9_600_000
        assert item["drop_pct"] == 11.1
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_price_history_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app
    from db.session import get_db

    db = _session()
    upsert_listing(db, "ikman", _payload(price_lkr=10_000_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(price_lkr=9_000_000))
    db.commit()
    listing = db.query(CarListing).one()

    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)
        resp = client.get(f"/api/v1/listings/{listing.id}/price-history")
        assert resp.status_code == 200
        body = resp.json()
        assert body["listing_id"] == listing.id
        assert [p["price_lkr"] for p in body["points"]] == [10_000_000, 9_000_000]
        assert body["first_price_lkr"] == 10_000_000
        assert body["current_price_lkr"] == 9_000_000
        assert body["change_pct"] == -10.0
        assert body["cut_count"] == 1
        assert body["raise_count"] == 0
        assert body["tracked_points"] == 2

        missing = client.get("/api/v1/listings/999999/price-history")
        assert missing.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_price_drops_feed_vehicle_category_filter():
    """`vehicle_category=cars` keeps passenger cars and drops bikes (Android cars-first)."""
    from fastapi.testclient import TestClient
    from app.main import app
    from db.session import get_db

    db = _session()
    upsert_listing(db, "ikman", _payload(source_id="car", price_lkr=12_000_000))
    db.commit()
    upsert_listing(db, "ikman", _payload(source_id="car", price_lkr=10_000_000))
    db.commit()
    bike = {
        **_payload(source_id="bike", price_lkr=900_000),
        "make": "Honda",
        "model": "Dio",
        "title": "Honda Dio scooter 2019",
        "vehicle_category": "motorbikes",
    }
    upsert_listing(db, "ikman", bike)
    db.commit()
    upsert_listing(db, "ikman", {**bike, "price_lkr": 600_000})
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)
        all_body = client.get("/api/v1/listings/price-drops?days=7&limit=10").json()
        assert {i["listing"]["source_id"] for i in all_body["items"]} == {"car", "bike"}
        cars = client.get("/api/v1/listings/price-drops?days=7&limit=10&vehicle_category=cars")
        assert cars.status_code == 200
        assert [i["listing"]["source_id"] for i in cars.json()["items"]] == ["car"]
    finally:
        app.dependency_overrides.pop(get_db, None)
