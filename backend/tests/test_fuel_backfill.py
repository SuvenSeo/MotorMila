"""Tests for SQLite fuel_type deterministic backfill."""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db.models import Base
from scripts.ops.backfill_fuel_types import backfill_sqlite


def test_backfill_sqlite_fills_unambiguous_rows_and_preserves_ambiguous_ones(tmp_path: Path):
    db_path = tmp_path / "sample.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    engine.dispose()

    now = datetime(2026, 10, 1, tzinfo=timezone.utc).isoformat()
    con = sqlite3.connect(db_path)
    rows = [
        ("ikman", "1", "BYD", "Atto 3", 2024, "BYD Atto 3 2024", "suvs", None, "https://x.test/1"),
        ("ikman", "2", "Toyota", "Aqua", 2017, "Toyota Aqua 2017", "cars", "other", "https://x.test/2"),
        ("riyahub", "3", "Honda", "Dio", 2019, "Honda Dio 2019", "motorbikes", "", "https://x.test/3"),
        ("riyahub", "4", "Bajaj", "RE", 2018, "Bajaj RE 205 Three Wheel", "three-wheelers", "N/A", "https://x.test/4"),
        ("ikman", "5", "Mitsubishi", "Canter", 2016, "Mitsubishi Canter Lorry", "lorries", None, "https://x.test/5"),
        ("ikman", "6", "Toyota", "Vitz", 2018, "Toyota Vitz 2018", "cars", None, "https://x.test/6"),
        ("ikman", "7", "Toyota", "Prius", 2016, "Toyota Prius 2016", "cars", "petrol", "https://x.test/7"),
    ]
    for source, sid, make, model, year, title, cat, fuel, url in rows:
        con.execute(
            """
            INSERT INTO car_listings (
                source, source_id, scraped_at, first_seen_at, last_seen_at,
                make, model, year, title, vehicle_category, fuel_type, url,
                is_active, is_outlier, is_duplicate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0)
            """,
            (source, sid, now, now, now, make, model, year, title, cat, fuel, url),
        )
    con.commit()
    con.close()

    # Dry run leaves DB unchanged
    dry_summary = backfill_sqlite(db_path, dry_run=True)
    assert dry_summary["_matched"] == 5
    assert dry_summary["_skipped"] == 1

    con = sqlite3.connect(db_path)
    assert con.execute("SELECT fuel_type FROM car_listings WHERE source_id = '1'").fetchone()[0] is None
    con.close()

    # Apply backfill
    summary = backfill_sqlite(db_path, dry_run=False, batch_size=2)
    assert summary["electric"] == 1
    assert summary["hybrid"] == 1
    assert summary["petrol"] == 2
    assert summary["diesel"] == 1

    con = sqlite3.connect(db_path)
    result_map = {
        sid: fuel
        for sid, fuel in con.execute("SELECT source_id, fuel_type FROM car_listings").fetchall()
    }
    con.close()

    assert result_map["1"] == "electric"
    assert result_map["2"] == "hybrid"
    assert result_map["3"] == "petrol"
    assert result_map["4"] == "petrol"
    assert result_map["5"] == "diesel"
    assert result_map["6"] is None  # dual-fuel Vitz preserved as NULL
    assert result_map["7"] == "petrol"  # existing structured value untouched
