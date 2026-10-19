"""Tests for the user-submitted listings (sell-your-car) endpoints."""
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import my_listings
from app.api.v1.endpoints.my_listings import (
    MyListingCreate,
    MyListingRead,
    MyListingUpdate,
    STATUS_PENDING,
    STATUS_REMOVED,
    _serialize_images,
    _to_read,
)
from db.models import Base, CarListing

_NOW = datetime.now(timezone.utc)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


class _DummyRequest:
    method = "GET"
    headers = {"user-agent": "pytest"}
    client = type("Client", (), {"host": "127.0.0.1"})()


AUTH = {"email": "seller@example.com", "plan": "pro", "role": "user"}


def test_create_my_listing_sets_owner_and_pending_status():
    db = _session()
    result = my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio", year=2018, price_lkr=5_500_000),
        request=_DummyRequest(),
        db=db,
        auth=AUTH,
    )
    assert result.make == "Toyota"
    assert result.status == STATUS_PENDING

    stored = db.query(CarListing).one()
    assert stored.owner_user_id == "seller@example.com"
    assert stored.user_listing_status == STATUS_PENDING
    assert stored.source == "motormila_user"
    # Moderation queue: not live until an admin approves it.
    assert stored.is_active is False


def test_create_my_listing_generates_unique_source_ids():
    db = _session()
    my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio"),
        request=_DummyRequest(),
        db=db,
        auth=AUTH,
    )
    my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio"),
        request=_DummyRequest(),
        db=db,
        auth=AUTH,
    )
    rows = db.query(CarListing).all()
    assert len(rows) == 2
    assert rows[0].source_id != rows[1].source_id


def test_list_my_listings_is_scoped_to_owner():
    db = _session()
    mine = CarListing(
        source="motormila_user", source_id="user-a-1",
        scraped_at=_NOW, make="Toyota", model="Axio",
        owner_user_id="seller@example.com", user_listing_status="pending",
    )
    other = CarListing(
        source="motormila_user", source_id="user-b-1",
        scraped_at=_NOW, make="Honda", model="Fit",
        owner_user_id="other@example.com", user_listing_status="pending",
    )
    db.add_all([mine, other])
    db.commit()

    result = my_listings.list_my_listings(
        request=_DummyRequest(), db=db, auth=AUTH
    )
    assert len(result) == 1
    assert result[0].make == "Toyota"


def test_update_my_listing_rejects_invalid_status():
    db = _session()
    created = my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio"),
        request=_DummyRequest(), db=db, auth=AUTH,
    )
    with pytest.raises(HTTPException) as exc_info:
        my_listings.update_my_listing(
            created.id,
            MyListingUpdate(status="published"),
            request=_DummyRequest(), db=db, auth=AUTH,
        )
    assert exc_info.value.status_code == 400


def test_update_my_listing_cannot_touch_other_owners():
    db = _session()
    other = CarListing(
        source="motormila_user", source_id="user-b-2",
        scraped_at=_NOW, make="Honda", model="Fit",
        owner_user_id="other@example.com", user_listing_status="pending",
    )
    db.add(other)
    db.commit()
    db.refresh(other)

    with pytest.raises(HTTPException) as exc_info:
        my_listings.update_my_listing(
            other.id,
            MyListingUpdate(title="hijack"),
            request=_DummyRequest(), db=db, auth=AUTH,
        )
    assert exc_info.value.status_code == 404


def test_delete_my_listing_soft_deletes():
    db = _session()
    created = my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio"),
        request=_DummyRequest(), db=db, auth=AUTH,
    )
    result = my_listings.delete_my_listing(
        created.id, request=_DummyRequest(), db=db, auth=AUTH,
    )
    assert result["ok"] is True

    stored = db.query(CarListing).one()
    assert stored.user_listing_status == STATUS_REMOVED
    assert stored.is_active is False


def test_serialize_images_caps_and_parses_json():
    import json
    urls = [f"https://img/{i}.jpg" for i in range(20)]
    parsed = _serialize_images(json.dumps(urls))
    assert len(parsed) == 12
    assert _serialize_images(None) == []
    assert _serialize_images("not-json") == []


def test_scraper_rows_are_not_affected_by_user_endpoints():
    """Scraped listings (owner_user_id NULL) must never appear in /mine."""
    db = _session()
    scraped = CarListing(
        source="ikman", source_id="ik-1",
        scraped_at=_NOW, make="Toyota", model="Axio",
        owner_user_id=None, user_listing_status="scraped",
    )
    db.add(scraped)
    db.commit()

    result = my_listings.list_my_listings(
        request=_DummyRequest(), db=db, auth=AUTH,
    )
    assert result == []
