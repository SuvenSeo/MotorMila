"""Tests for multi-feature FMV predictor."""

import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.fmv import predict_listing_fmv
from db.models import Base, CarListing


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _listing(**kwargs) -> CarListing:
    now = datetime(2026, 7, 21, tzinfo=timezone.utc)
    defaults = dict(
        source="ikman",
        source_id="x",
        scraped_at=now,
        first_seen_at=now,
        last_seen_at=now,
        make="Toyota",
        model="Aqua",
        year=2018,
        mileage=60_000,
        district="Colombo",
        condition="used",
        price_lkr=5_500_000,
        is_outlier=False,
        is_active=True,
    )
    defaults.update(kwargs)
    return CarListing(**defaults)


def test_fmv_falls_back_to_stored_median_without_comps():
    db = _session()
    subject = _listing(source_id="subject", market_median_lkr=5_200_000, price_lkr=4_800_000)
    db.add(subject)
    db.commit()
    db.refresh(subject)

    result = predict_listing_fmv(db, subject)
    assert result["method"] == "cohort_median"
    assert result["fmv_lkr"] == 5_200_000
    # Thin cohorts (here: 0 comps) must not emit a verdict band.
    assert result["band"] is None
    assert result["label"] is None
    assert result["confidence"] == "low"
    assert result["sample_size"] == 0
    assert result["comps_median_lkr"] is None
    assert result["updated_at"] is not None


def test_fmv_uses_ols_when_enough_comps():
    db = _session()
    subject = _listing(source_id="subject", year=2018, mileage=55_000, price_lkr=5_400_000)
    db.add(subject)
    for i in range(12):
        db.add(
            _listing(
                source_id=f"c{i}",
                year=2017 + (i % 3),
                mileage=40_000 + i * 3_000,
                price_lkr=5_000_000 + i * 80_000,
                district="Colombo" if i % 2 == 0 else "Gampaha",
            )
        )
    db.commit()
    db.refresh(subject)

    result = predict_listing_fmv(db, subject)
    assert result["method"] == "ols_comps"
    assert result["sample_count"] >= 8
    assert result["sample_size"] == result["sample_count"]
    assert result["fmv_lkr"] is not None
    assert result["fmv_lkr"] > 1_000_000
    assert result["confidence"] in {"medium", "high"}
    assert result["comps_median_lkr"] is not None
    assert result["comps_median_lkr"] > 0
    assert result["updated_at"] is not None


def test_fmv_confidence_high_with_large_sample():
    db = _session()
    subject = _listing(source_id="subject", year=2018, mileage=55_000, price_lkr=5_400_000)
    db.add(subject)
    for i in range(20):
        db.add(
            _listing(
                source_id=f"d{i}",
                year=2017 + (i % 3),
                mileage=40_000 + i * 2_000,
                price_lkr=5_000_000 + i * 50_000,
            )
        )
    db.commit()
    db.refresh(subject)

    result = predict_listing_fmv(db, subject)
    assert result["confidence"] == "high"
    assert result["sample_size"] >= 15


def test_fmv_insufficient_data_confidence_none():
    db = _session()
    subject = _listing(source_id="subject", price_lkr=5_000_000, market_median_lkr=None)
    db.add(subject)
    db.commit()
    db.refresh(subject)

    result = predict_listing_fmv(db, subject)
    assert result["method"] == "insufficient_data"
    assert result["confidence"] == "none"
    assert result["fmv_lkr"] is None
