"""Seed ~50 diverse demo listings into the local SQLite ``car_listings`` table.

How to run (from repo root)::

    python scripts/seed-demo.py --demo
    python scripts/seed-demo.py --demo --db backend/motormila.db
    python scripts/seed-demo.py --demo --count 50 --clear-cache

Notes
-----
* Idempotent: rows use ``source='demo'`` + ``source_id='demo-001'`` … and are
  upserted via ``ON CONFLICT(source, source_id) DO UPDATE`` — re-running is safe.
* Only touches rows where ``source='demo'``; real scraper rows are never modified.
* ``market_stats_cache`` warming concept: aggregate endpoints cache for 1h, so
  after changing listing data the old payload is served until TTL expiry. This
  script deletes ``market_stats_cache`` rows by default (``--clear-cache``,
  opt-out with ``--no-clear-cache``) so the next ``/stats/*`` hit recomputes
  from the seeded rows — that delete + lazy recompute IS the warming step.
* ``--demo`` is required so the script never runs by accident against prod data.
* Creates minimal ``car_listings`` / ``market_stats_cache`` tables when missing
  (fresh SQLite file); when the backend already created them, only the columns
  that exist are written (PRAGMA intersection).
"""

from __future__ import annotations

import argparse
import datetime as dt
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / "backend" / "motormila.db"

MAKES: list[tuple[str, str, int, int]] = [
    # (make, model, base_price_lkr, base_deal_score)
    ("Toyota", "Corolla", 8_700_000, 14),
    ("Toyota", "Aqua", 6_200_000, 18),
    ("Toyota", "Prius", 9_800_000, 12),
    ("Toyota", "Hilux", 16_500_000, 11),
    ("Honda", "Fit", 6_000_000, 16),
    ("Honda", "Vezel", 11_200_000, 13),
    ("Honda", "Civic", 12_800_000, 10),
    ("Suzuki", "Wagon R", 4_500_000, 20),
    ("Suzuki", "Swift", 5_800_000, 17),
    ("Suzuki", "Alto", 3_400_000, 22),
    ("Nissan", "Note", 5_200_000, 15),
    ("Nissan", "Leaf", 7_400_000, 12),
    ("Mitsubishi", "Mirage", 4_900_000, 16),
    ("Hyundai", "i10", 4_200_000, 14),
    ("Kia", "Picanto", 4_600_000, 13),
    ("Mazda", "Demio", 5_600_000, 11),
    ("BMW", "X5", 18_000_000, 15),
    ("Mercedes-Benz", "C200", 19_500_000, 9),
    ("Audi", "A4", 17_200_000, 10),
    ("Toyota", "Land Cruiser", 32_000_000, 8),
]

DISTRICTS = ["Colombo", "Gampaha", "Kandy", "Galle", "Kurunegala", "Jaffna", "Matara", "Anuradhapura"]
FUELS = ["petrol", "hybrid", "diesel", "electric"]
TRANSMISSIONS = ["automatic", "manual", "cvt"]
BODY_TYPES = ["sedan", "hatchback", "suv", "crossover", "pickup"]
CONDITIONS = ["used", "reconditioned", "used", "used"]


def build_rows(count: int, now: dt.datetime) -> list[dict]:
    rows: list[dict] = []
    ts = now.strftime("%Y-%m-%d %H:%M:%S+00:00")
    for i in range(count):
        make, model, base_price, base_score = MAKES[i % len(MAKES)]
        variant = i // len(MAKES)  # 0, 1, 2… spreads duplicates across years/prices
        year = 2014 + ((i * 3 + variant * 2) % 10)  # 2014–2023
        price = int(base_price * (1 + variant * 0.06) + ((i * 137_000) % 900_000) - 450_000)
        price = max(price, 1_200_000)
        deal_score = round(min(25.0, max(8.0, base_score + ((i * 7) % 9) - 4 + variant)), 1)
        district = DISTRICTS[i % len(DISTRICTS)]
        fuel = FUELS[i % len(FUELS)]
        transmission = TRANSMISSIONS[i % len(TRANSMISSIONS)]
        body = BODY_TYPES[i % len(BODY_TYPES)]
        condition = CONDITIONS[i % len(CONDITIONS)]
        mileage = 15_000 + ((i * 17_321) % 120_000)
        title = f"{make} {model} {year} — demo listing {i + 1:02d}"
        rows.append(
            {
                "source": "demo",
                "source_id": f"demo-{i + 1:03d}",
                "scraped_at": ts,
                "first_seen_at": ts,
                "last_seen_at": ts,
                "content_updated_at": ts,
                "title": title,
                "url": f"https://example.com/demo/demo-{i + 1:03d}",
                "make": make,
                "model": model,
                "year": year,
                "price_lkr": float(price),
                "mileage": mileage,
                "fuel_type": "plugin_hybrid" if (fuel == "hybrid" and i % 3 == 0) else fuel,
                "transmission": transmission,
                "engine_capacity": 1000 + ((i * 137) % 2000),
                "condition": condition,
                "body_type": body,
                "vehicle_category": "cars",
                "district": district,
                "city": district,
                "raw_location": district,
                "thumbnail_url": None,
                "deal_score": deal_score,
                "market_median_lkr": float(int(price * 1.08)),
                "is_outlier": 0,
                "is_duplicate": 0,
                "is_active": 1,
            }
        )
    return rows


CAR_LISTINGS_DDL = """
CREATE TABLE IF NOT EXISTS car_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source VARCHAR(20) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    scraped_at TIMESTAMP NOT NULL,
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    content_updated_at TIMESTAMP,
    title TEXT, url TEXT,
    make VARCHAR(50) NOT NULL, model VARCHAR(100) NOT NULL, year INTEGER,
    price_lkr NUMERIC(15, 2), mileage INTEGER,
    fuel_type VARCHAR(20), transmission VARCHAR(20), engine_capacity INTEGER,
    condition VARCHAR(20), body_type VARCHAR(30), vehicle_category VARCHAR(40),
    raw_location TEXT, district VARCHAR(50), city VARCHAR(100),
    thumbnail_url TEXT, deal_score NUMERIC(5, 1), market_median_lkr NUMERIC(15, 2),
    is_outlier BOOLEAN DEFAULT 0, is_duplicate BOOLEAN DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    UNIQUE (source, source_id)
)
"""

CACHE_DDL = """
CREATE TABLE IF NOT EXISTS market_stats_cache (
    cache_key VARCHAR(80) PRIMARY KEY,
    payload JSON NOT NULL,
    refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def existing_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed demo car_listings (requires --demo).")
    parser.add_argument("--demo", action="store_true", help="Required safety flag.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite file (default: backend/motormila.db).")
    parser.add_argument("--count", type=int, default=50, help="Demo rows to upsert (default: 50).")
    parser.add_argument("--clear-cache", dest="clear_cache", action="store_true", default=True)
    parser.add_argument("--no-clear-cache", dest="clear_cache", action="store_false")
    args = parser.parse_args(argv)

    if not args.demo:
        parser.print_usage(sys.stderr)
        print("error: refusing to run without --demo (safety flag).", file=sys.stderr)
        return 2
    if args.count < 1 or args.count > 500:
        print("error: --count must be 1..500.", file=sys.stderr)
        return 2

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc)
    rows = build_rows(args.count, now)

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(CAR_LISTINGS_DDL)
        conn.execute(CACHE_DDL)
        cols = existing_columns(conn, "car_listings")
        writable = [c for c in rows[0].keys() if c in cols]
        placeholders = ", ".join(f":{c}" for c in writable)
        col_list = ", ".join(writable)
        updates = ", ".join(f"{c}=excluded.{c}" for c in writable if c not in ("source", "source_id"))
        sql = (
            f"INSERT INTO car_listings ({col_list}) VALUES ({placeholders}) "
            f"ON CONFLICT(source, source_id) DO UPDATE SET {updates}"
        )
        with conn:
            conn.executemany(sql, [{c: r[c] for c in writable} for r in rows])
            demo_total = conn.execute(
                "SELECT COUNT(*) FROM car_listings WHERE source='demo'"
            ).fetchone()[0]
            cache_cleared = 0
            if args.clear_cache:
                cache_cleared = conn.execute("DELETE FROM market_stats_cache").rowcount or 0
    finally:
        conn.close()

    print(f"seeded {len(rows)} demo listings into {db_path} (demo rows total: {demo_total}).")
    if args.clear_cache:
        print(
            f"cleared {cache_cleared} market_stats_cache row(s) — next /stats/* hit "
            "recomputes (1h TTL restarts)."
        )
    else:
        print("market_stats_cache left intact — delete its rows to force a stats recompute.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
