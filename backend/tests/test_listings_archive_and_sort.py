"""Tests for oldest sort and include_archive filter on /listings."""

import os
os.environ["HOT_DATABASE_URL"] = ""
os.environ["COLD_DATABASE_URL"] = ""
os.environ["DATABASE_URL"] = ""
os.environ["ALLOW_SQLITE_FALLBACK"] = "true"
os.environ["PRO_ACCESS_ENFORCED"] = "false"
os.environ["APP_ACCESS_ENFORCED"] = "false"

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.main import app
from db.models import Base, CarListing
from db.session import SessionLocal, engine

client = TestClient(app)


def test_search_listings_supports_oldest_sort_and_archive():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    old_active = CarListing(
        source="ikman",
        source_id="test-old-unique-1",
        url="https://ikman.lk/ad/test-old-unique-1",
        title="TestArchiveMake TestArchiveModel 2010",
        make="TestArchiveMake",
        model="TestArchiveModel",
        year=2010,
        price_lkr=Decimal("4500000"),
        scraped_at=now - timedelta(days=20),
        first_seen_at=now - timedelta(days=20),
        last_seen_at=now - timedelta(days=2),
        is_active=True,
        is_duplicate=False,
        is_outlier=False,
        user_listing_status="scraped",
    )
    new_active = CarListing(
        source="ikman",
        source_id="test-new-unique-1",
        url="https://ikman.lk/ad/test-new-unique-1",
        title="TestArchiveMake TestArchiveModel 2018",
        make="TestArchiveMake",
        model="TestArchiveModel",
        year=2018,
        price_lkr=Decimal("7500000"),
        scraped_at=now - timedelta(days=1),
        first_seen_at=now - timedelta(days=1),
        last_seen_at=now,
        is_active=True,
        is_duplicate=False,
        is_outlier=False,
        user_listing_status="scraped",
    )
    archived_listing = CarListing(
        source="ikman",
        source_id="test-archived-unique-1",
        url="https://ikman.lk/ad/test-archived-unique-1",
        title="TestArchiveMake TestArchiveModel 2005",
        make="TestArchiveMake",
        model="TestArchiveModel",
        year=2005,
        price_lkr=Decimal("3000000"),
        scraped_at=now - timedelta(days=90),
        first_seen_at=now - timedelta(days=90),
        last_seen_at=now - timedelta(days=60),
        is_active=False,
        is_duplicate=False,
        is_outlier=False,
        user_listing_status="scraped",
    )
    try:
        db.add_all([old_active, new_active, archived_listing])
        db.commit()

        # 1. Default (archive excluded): should only return the 2 active listings
        res_default = client.get("/api/v1/listings?make=TestArchiveMake&model=TestArchiveModel")
        assert res_default.status_code == 200
        data_default = res_default.json()
        items_default = data_default.get("items", [])
        item_ids_default = [item["id"] for item in items_default]
        assert len(items_default) == 2
        assert old_active.id in item_ids_default
        assert new_active.id in item_ids_default
        assert archived_listing.id not in item_ids_default

        # 2. include_archive=true: should include the archived listing (3 total)
        res_archive = client.get("/api/v1/listings?make=TestArchiveMake&model=TestArchiveModel&include_archive=true")
        assert res_archive.status_code == 200
        data_archive = res_archive.json()
        item_ids_archive = [item["id"] for item in data_archive.get("items", [])]
        assert len(item_ids_archive) == 3
        assert archived_listing.id in item_ids_archive

        # 3. sort=oldest: first item should be the oldest listing
        res_oldest = client.get("/api/v1/listings?make=TestArchiveMake&model=TestArchiveModel&sort=oldest")
        assert res_oldest.status_code == 200
        items_oldest = res_oldest.json().get("items", [])
        assert len(items_oldest) == 2
        assert items_oldest[0]["id"] == old_active.id
    finally:
        db.delete(old_active)
        db.delete(new_active)
        db.delete(archived_listing)
        db.commit()
        db.close()
