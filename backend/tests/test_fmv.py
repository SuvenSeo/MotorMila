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
    # Uncorroborated stored median: kept for diagnostics, never shown as FMV.
    assert result["estimate_lkr"] == 5_200_000
    assert result["fmv_lkr"] is None
    assert result["verdict"]["status"] == "withheld"
    assert result["verdict"]["reason"] == "thin_comps"
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


# ── Price-consistency regressions (fix/price-consistency) ──────────────────


def test_fmv_comps_stay_in_vehicle_category():
    """Listing 680073: a Hero-Honda Hunk bike in the Honda "Other" bucket was
    valued off cars and cheap bikes ("Overpriced 498 %")."""
    db = _session()
    subject = _listing(source_id="hunk", make="Honda", model="Hunk", year=2018, price_lkr=735_000,
                       vehicle_category="motorbikes", title="Hero-Honda Hunk Motorbike")
    db.add(subject)
    for i in range(10):
        db.add(_listing(source_id=f"bike{i}", make="Honda", model="Hunk", year=2017 + i % 3,
                        price_lkr=700_000 + i * 10_000, vehicle_category="motorbikes"))
    for i in range(10):
        db.add(_listing(source_id=f"car{i}", make="Honda", model="Hunk", year=2018,
                        price_lkr=7_000_000 + i * 50_000, vehicle_category="cars"))
    db.commit()
    db.refresh(subject)
    result = predict_listing_fmv(db, subject)
    assert result["sample_size"] == 10
    assert 600_000 < result["estimate_lkr"] < 900_000
    assert result["verdict"]["status"] == "ok"
    assert abs(result["verdict"]["gap_pct"]) < 20


def test_generic_other_model_never_gets_a_verdict():
    db = _session()
    subject = _listing(source_id="o", make="Honda", model="Other", year=2026, price_lkr=735_000,
                       vehicle_category="motorbikes", market_median_lkr=7_201_142)
    db.add(subject)
    for i in range(12):
        db.add(_listing(source_id=f"o{i}", make="Honda", model="Other", year=2026,
                        price_lkr=150_000 + i * 50_000, vehicle_category="motorbikes"))
    db.commit()
    db.refresh(subject)
    result = predict_listing_fmv(db, subject)
    assert result["verdict"]["status"] == "withheld"
    assert result["band"] is None and result["label"] is None and result["delta_pct"] is None
    assert result["fmv_lkr"] is None
    assert result["deal_score"] is None


def test_fmv_uses_nearest_years_not_an_arbitrary_slice():
    """Toyota Axio 2024 was valued off 2005-2012 Axios ("Overpriced 72 %")."""
    db = _session()
    subject = _listing(source_id="axio", model="Axio", year=2024, price_lkr=14_900_000, mileage=10_000)
    db.add(subject)
    for i in range(200):  # lots of old, cheap rows inserted first (low ids)
        db.add(_listing(source_id=f"old{i}", model="Axio", year=2006 + i % 6, price_lkr=4_000_000 + i * 1_000))
    for i in range(12):
        db.add(_listing(source_id=f"new{i}", model="Axio", year=2023 + i % 3, price_lkr=14_500_000 + i * 50_000,
                        mileage=5_000 + i * 1_000))
    db.commit()
    db.refresh(subject)
    result = predict_listing_fmv(db, subject)
    assert result["estimate_lkr"] > 13_000_000
    assert result["verdict"]["status"] == "ok"
    assert result["verdict"]["band"] == "fair"


def test_outlier_comps_are_trimmed():
    db = _session()
    subject = _listing(source_id="s", year=2018, price_lkr=5_500_000)
    db.add(subject)
    for i in range(12):
        db.add(_listing(source_id=f"c{i}", year=2018, price_lkr=5_300_000 + i * 40_000))
    for p in (123_456, 250_000, 55_000_000):  # placeholder, deposit-like, typo
        db.add(_listing(source_id=f"x{p}", year=2018, price_lkr=p))
    db.commit()
    db.refresh(subject)
    result = predict_listing_fmv(db, subject)
    assert result["sample_size"] == 12
    assert 5_000_000 < result["comps_median_lkr"] < 6_000_000


def test_corroborated_stored_median_is_the_single_fmv():
    """Card (stored median) and detail (FMV) must compare against the same number."""
    db = _session()
    subject = _listing(source_id="s", year=2018, price_lkr=5_000_000, market_median_lkr=5_400_000)
    db.add(subject)
    for i in range(12):
        db.add(_listing(source_id=f"c{i}", year=2018, price_lkr=5_200_000 + i * 30_000))
    db.commit()
    db.refresh(subject)
    result = predict_listing_fmv(db, subject)
    assert result["method"] == "cohort_median"
    assert result["corroborated_by_comps"] is True
    assert result["fmv_lkr"] == 5_400_000
    assert result["verdict"]["band"] == "below"
    assert result["verdict"]["pct"] == 7
    assert result["deal_score"] == 7.4


def test_disagreeing_estimates_withhold_the_verdict():
    db = _session()
    subject = _listing(source_id="s", year=2018, price_lkr=5_000_000, market_median_lkr=8_000_000)
    db.add(subject)
    for i in range(12):
        db.add(_listing(source_id=f"c{i}", year=2018, price_lkr=5_100_000 + i * 20_000))
    db.commit()
    db.refresh(subject)
    result = predict_listing_fmv(db, subject)
    assert result["verdict"]["status"] == "withheld"
    assert result["verdict"]["reason"] == "estimates_disagree"
    assert result["fmv_lkr"] is None


def test_no_absurd_percentages_ever():
    db = _session()
    subject = _listing(source_id="s", year=2018, price_lkr=30_000_000)
    db.add(subject)
    for i in range(12):
        db.add(_listing(source_id=f"c{i}", year=2018, price_lkr=5_100_000 + i * 20_000))
    db.commit()
    db.refresh(subject)
    result = predict_listing_fmv(db, subject)
    assert result["verdict"]["status"] == "withheld"
    assert result["verdict"]["reason"] in {"implausible_gap", "unit_mismatch"}
    assert result["label"] is None
