from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.services.historical_csv_import import rows_from_csv
from app.services.market_context_seed import (
    build_dmt_and_policy_signal_rows,
    upsert_market_context_signals,
)
from app.services.model_price_history import build_model_price_history
from app.services.nhtsa_specs import fetch_models_for_make
from db.models import (
    Base,
    CarListing,
    HistoricalPriceObservation,
    MarketSignal,
    PriceAggregate,
)

@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_dmt_seed_rows_cover_ban_years():
    rows = build_dmt_and_policy_signal_rows()
    regs = {
        (r["period_year"], int(r["value_numeric"]))
        for r in rows
        if r["metric"] == "motor_cars_new"
    }
    assert (2018, 80_776) in regs
    assert (2022, 1_489) in regs
    assert (2025, 68_047) in regs
    assert any(r["metric"] == "import_ban_lifted" for r in rows)


def test_upsert_market_context_signals_idempotent(db_session):
    first = upsert_market_context_signals(db_session)
    second = upsert_market_context_signals(db_session)
    assert first["inserted"] == len(build_dmt_and_policy_signal_rows())
    assert second["inserted"] == 0
    assert db_session.query(MarketSignal).count() == first["inserted"]


def test_model_price_history_separates_yom_and_calendar(db_session):
    db_session.add(
        CarListing(
            source="ikman",
            source_id="live-1",
            url="https://example.com/1",
            title="Toyota Aqua 2015",
            make="Toyota",
            model="Aqua",
            year=2015,
            price_lkr=7_500_000,
            district="Colombo",
            is_active=True,
            is_outlier=False,
            scraped_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            first_seen_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            last_seen_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
    )
    db_session.add(
        PriceAggregate(
            make="Toyota",
            model="Aqua",
            year=2015,
            district=None,
            period_year=2024,
            period_month=6,
            median_price_lkr=8_000_000,
            avg_price_lkr=8_100_000,
            listing_count=12,
        )
    )
    db_session.add(
        HistoricalPriceObservation(
            archive_source="wayback_ikman",
            source_id="arch-1",
            observed_at=datetime(2018, 3, 15, tzinfo=timezone.utc),
            url="https://ikman.lk/en/ad/aqua",
            title="Toyota Aqua 2015",
            make="Toyota",
            model="Aqua",
            year=2015,
            price_lkr=3_200_000,
            confidence="medium",
            raw_meta={},
        )
    )
    db_session.commit()

    payload = build_model_price_history(
        db_session, make="toyota", model="aqua", from_year=2015, to_year=2026
    )
    assert payload["counts"]["aggregate_points"] == 1
    assert payload["counts"]["archive_points"] == 1
    assert payload["counts"]["yom_buckets"] == 1
    assert payload["cross_section_by_yom"][0]["yom"] == 2015
    assert "not a substitute" in payload["interpretation"]["cross_section_by_yom"]


def test_csv_import_maps_brand_price_columns(tmp_path: Path):
    csv_path = tmp_path / "sample.csv"
    csv_path.write_text(
        "Brand,Model,YOM,Price,Mileage,Town,Date\n"
        "Toyota,Aqua,2015,\"Rs. 4,500,000\",80000,Colombo,2024-12-01\n"
        "Suzuki,Alto,2018,2500000,45000,Gampaha,2024-12-02\n",
        encoding="utf-8",
    )
    rows = rows_from_csv(
        csv_path,
        archive_source="kaggle_sl",
        observed_default=datetime(2025, 1, 15, tzinfo=timezone.utc),
    )
    assert len(rows) == 2
    assert rows[0]["make"] == "Toyota"
    assert rows[0]["price_lkr"] == 4_500_000
    assert rows[0]["year"] == 2015
    assert rows[0]["raw_meta"]["price_unit"] == "lkr"


def test_csv_import_prasad_nirmal_lakhs_and_millage(tmp_path: Path):
    """Real Kaggle SL car_price_dataset.csv uses Price in lakhs + Millage(KM)."""
    csv_path = tmp_path / "car_price_dataset.csv"
    csv_path.write_text(
        ",Brand,Model,YOM,Engine (cc),Gear,Fuel Type,Millage(KM),Town,Date,"
        "Leasing,Condition,AIR CONDITION,POWER STEERING,POWER MIRROR,POWER WINDOW,Price\n"
        "0,TOYOTA,AQUA,2015,1500.0,Automatic,Hybrid,85000.0,Colombo,2025-01-10,"
        "No Leasing,USED,Available,Available,Available,Available,43.0\n"
        "1,SUZUKI,ALTO,2018,800.0,Manual,Petrol,42000.0,Gampaha,2025-01-12,"
        "No Leasing,USED,Available,Available,Available,Available,28.5\n",
        encoding="utf-8",
    )
    rows = rows_from_csv(
        csv_path,
        archive_source="kaggle_sl",
        observed_default=datetime(2025, 1, 15, tzinfo=timezone.utc),
        price_unit="auto",
    )
    assert len(rows) == 2
    assert rows[0]["make"] == "Toyota"
    assert rows[0]["price_lkr"] == 4_300_000
    assert rows[0]["mileage"] == 85_000
    assert rows[0]["raw_meta"]["price_unit"] == "lakhs"
    assert rows[1]["price_lkr"] == 2_850_000


def test_csv_import_drops_date_like_and_overflow_mileage(tmp_path: Path):
    """Community CSV rows put YYYYMMDD / huge junk into mileage and crashed prod."""
    csv_path = tmp_path / "community.csv"
    csv_path.write_text(
        "Brand,Model,YOM,Price,Mileage,Town,Date,URL\n"
        "Toyota,Starlet,1985,1755000,20260217,Divulapitiya,2026-02-20,"
        "https://riyasewana.com/buy/toyota-starlet-sale-divulapitiya-11217755\n"
        "Nissan,Tiida,2008,5200000,9999999999,Embilipitiya,2026-02-20,"
        "https://riyasewana.com/buy/nissan-tiida-sale-embilipitiya-11217753\n"
        "Suzuki,Swift,2005,4390000,145000,Malabe,2026-02-14,"
        "https://riyasewana.com/buy/suzuki-swift-center-sale-malabe-11217749\n",
        encoding="utf-8",
    )
    rows = rows_from_csv(
        csv_path,
        archive_source="community_csv_riyasewana",
        observed_default=datetime(2026, 2, 20, tzinfo=timezone.utc),
        price_unit="lkr",
    )
    assert len(rows) == 3
    by_model = {r["model"]: r for r in rows}
    assert by_model["Starlet"]["mileage"] is None
    assert by_model["Tiida"]["mileage"] is None
    assert by_model["Swift"]["mileage"] == 145_000


def test_upsert_clamps_oversized_mileage(db_session):
    from app.services.historical_archive import upsert_historical_observations

    result = upsert_historical_observations(
        db_session,
        [
            {
                "archive_source": "community_csv_riyasewana",
                "source_id": "bad-mileage-1",
                "observed_at": datetime(2026, 2, 20, tzinfo=timezone.utc),
                "url": "https://example.com/1",
                "title": "Toyota Starlet 1985",
                "make": "Toyota",
                "model": "Starlet",
                "year": 1985,
                "price_lkr": 1_755_000,
                "mileage": 20_260_217,  # YYYYMMDD junk
                "confidence": "low",
                "raw_meta": {},
            }
        ],
    )
    assert result["inserted"] == 1
    row = db_session.query(HistoricalPriceObservation).one()
    assert row.mileage is None


@pytest.mark.live
@pytest.mark.skipif(
    os.getenv("RUN_LIVE_TESTS") != "1",
    reason="Live NHTSA test requires RUN_LIVE_TESTS=1",
)
def test_nhtsa_fetch_models_for_make_live():
    models = fetch_models_for_make("toyota")
    if not models:
        pytest.skip("NHTSA vPIC unavailable (timeout/5xx); mocked coverage is in test_nhtsa_endpoint.py")
    assert len(models) > 10
    names = {m["model"].lower() for m in models}
    assert "corolla" in names or "prius" in names
