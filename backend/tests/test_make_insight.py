"""Tests for /stats/make-insight programmatic SEO hub endpoint."""

import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import listings, stats
from db.models import Base, CarListing
from db.session import get_db

_NOW = datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)


def _session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_make_insight_aggregates_models_and_districts():
    db = _session()
    for make, model, district, price in (
        ("Toyota", "Aqua", "Colombo", 5_500_000),
        ("Toyota", "Aqua", "Gampaha", 5_200_000),
        ("Toyota", "Prius", "Colombo", 8_000_000),
        ("Toyota", "Vitz", "Kandy", 4_100_000),
        ("Toyota", "Land Cruiser", "Colombo", 42_000_000),
        ("Toyota", "Land Cruiser Prado", "Colombo", 28_000_000),
        ("Toyota", "C-HR", "Gampaha", 12_500_000),
        ("Honda", "CR-V", "Colombo", 16_000_000),
        ("Land Rover", "Defender", "Colombo", 55_000_000),
    ):
        db.add(
            CarListing(
                source="ikman",
                source_id=f"{make}-{model}-{district}-{price}",
                url=f"https://ikman.lk/en/ad/{make.lower()}-{model.lower()}-{price}",
                title=f"{make} {model} 2018",
                scraped_at=_NOW,
                first_seen_at=_NOW,
                last_seen_at=_NOW,
                make=make,
                model=model,
                year=2018,
                price_lkr=price,
                district=district,
                is_outlier=False,
                is_active=True,
                is_duplicate=False,
            )
        )
    db.commit()

    data = stats.get_make_insight(make="toyota", db=db)
    assert data["make"] == "Toyota"
    assert data["total"] == 7
    assert data["avg_price_lkr"] is not None
    assert data["top_models"][0]["model"] == "Aqua"
    assert data["top_models"][0]["count"] == 2
    assert any(d["district"] == "Colombo" for d in data["top_districts"])

    # Hyphenated make slug matches multi-word make.
    lr = stats.get_make_insight(make="land-rover", db=db)
    assert lr["make"] == "Land Rover"
    assert lr["total"] == 1
    assert lr["top_models"][0]["model"] == "Defender"

    # Hyphenated model slug matches space-separated model without matching Prado.
    lc = stats.get_make_model_insight(make="toyota", model="land-cruiser", db=db)
    assert lc["make"] == "Toyota"
    assert lc["model"] == "Land Cruiser"
    assert lc["total"] == 1

    # Compact and hyphenated slugs both resolve punctuated models like C-HR and CR-V.
    chr_data = stats.get_make_model_insight(make="toyota", model="c-hr", db=db)
    assert chr_data["model"] == "C-HR"
    assert chr_data["total"] == 1

    crv_data = stats.get_make_model_insight(make="honda", model="crv", db=db)
    assert crv_data["model"] == "CR-V"
    assert crv_data["total"] == 1

    # /listings HTTP route handles hyphenated slugs cleanly.
    test_app = FastAPI()
    test_app.include_router(listings.router, prefix="/listings")

    def _override_db():
        yield db

    test_app.dependency_overrides[get_db] = _override_db
    client = TestClient(test_app)

    res = client.get("/listings", params={"make": "land-rover", "model": "defender"})
    assert res.status_code == 200
    payload = res.json()
    assert payload["total"] == 1
    assert payload["items"][0]["make"] == "Land Rover"

    res_model = client.get("/listings", params={"make": "toyota", "model": "land-cruiser"})
    assert res_model.status_code == 200
    payload_model = res_model.json()
    assert payload_model["total"] == 2
    assert all("Land Cruiser" in row["model"] for row in payload_model["items"])

    res_chr = client.get("/listings", params={"make": "toyota", "model": "c-hr"})
    assert res_chr.status_code == 200
    assert res_chr.json()["total"] == 1

