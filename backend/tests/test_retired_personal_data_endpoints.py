"""seller-profile and thumbnail-proxy are retired (410) for PDPA / copyright reasons."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import listings
from db.models import Base, CarListing


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_seller_profile_returns_410_pointing_to_source():
    db = _session()
    now = datetime(2026, 10, 1, tzinfo=timezone.utc)
    row = CarListing(
        source="ikman", source_id="x1", scraped_at=now, first_seen_at=now, last_seen_at=now,
        make="Toyota", model="Vitz", year=2018, price_lkr=5_000_000, district="Colombo",
        title="Toyota Vitz 2018", url="https://ikman.lk/en/ad/x1",
    )
    db.add(row)
    db.commit()
    resp = listings.get_seller_profile(row.id, db=db)
    assert resp.status_code == 410
    body = json.loads(resp.body)
    assert body["detail"] == "Contact the seller on Ikman"
    assert body["source_url"] == "https://ikman.lk/en/ad/x1"
    assert "phone_numbers" not in body


def test_seller_profile_unknown_listing_still_410():
    resp = listings.get_seller_profile(999, db=_session())
    assert resp.status_code == 410


def test_thumbnail_proxy_returns_410():
    resp = listings.get_listing_thumbnail_proxy(1)
    assert resp.status_code == 410


def test_no_seller_scraping_helpers_left():
    assert not hasattr(listings, "_extract_seller_profile_from_html")
    assert not hasattr(listings, "_download_image_bytes")
