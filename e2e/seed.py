"""Seed a dedicated SQLite database with realistic car_listings rows for E2E.

Usage (from the repo root):

    backend/.venv/bin/python e2e/seed.py [path/to/e2e.db]

The path defaults to $E2E_DB_PATH or e2e/.output/e2e.db. The file is deleted
and recreated on every run so tests always start from the same known state.
The backend is then started with DATABASE_URL=sqlite:///<that path> (see
playwright.config.ts), which backend/db/session.py uses for both the hot and
cold engines.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"

db_path = Path(
    sys.argv[1] if len(sys.argv) > 1 else os.getenv("E2E_DB_PATH", str(REPO_ROOT / "e2e" / ".output" / "e2e.db"))
).resolve()
db_path.parent.mkdir(parents=True, exist_ok=True)
for suffix in ("", "-wal", "-shm"):
    Path(f"{db_path}{suffix}").unlink(missing_ok=True)

# Must be set before backend/db/session.py is imported: it builds its engines
# at import time. Clear the Postgres URLs so a developer's shell env can never
# point the seed at a real database.
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
os.environ.pop("HOT_DATABASE_URL", None)
os.environ.pop("COLD_DATABASE_URL", None)
os.environ.pop("AUTH_DATABASE_URL", None)
os.environ["ALLOW_SQLITE_FALLBACK"] = "true"
os.environ["SQLITE_FAILOVER"] = "false"

sys.path.insert(0, str(BACKEND_DIR))

from db.models import CarListing  # noqa: E402
from db.session import ColdSessionLocal, init_db  # noqa: E402

NOW = datetime.now(timezone.utc).replace(microsecond=0)

# (make, model, year, price_lkr, mileage, fuel, transmission, cc, body, district, city)
VEHICLES = [
    ("Toyota", "Prius", 2017, 11_500_000, 68_000, "Hybrid", "Automatic", 1800, "Hatchback", "Colombo", "Nugegoda"),
    ("Toyota", "Prius", 2016, 10_750_000, 82_000, "Hybrid", "Automatic", 1800, "Hatchback", "Gampaha", "Negombo"),
    ("Toyota", "Prius", 2018, 12_900_000, 45_000, "Hybrid", "Automatic", 1800, "Hatchback", "Kandy", "Peradeniya"),
    ("Toyota", "Prius", 2015, 9_850_000, 101_000, "Hybrid", "Automatic", 1800, "Hatchback", "Colombo", "Dehiwala"),
    ("Toyota", "Prius", 2017, 11_200_000, 73_500, "Hybrid", "Automatic", 1800, "Hatchback", "Kurunegala", "Kurunegala"),
    # Extra Prius comparables: the fair-value model needs >= 8 comps in a
    # +/-2 year window before it reports a confident typical price.
    ("Toyota", "Prius", 2016, 10_900_000, 79_000, "Hybrid", "Automatic", 1800, "Hatchback", "Colombo", "Kotte"),
    ("Toyota", "Prius", 2017, 11_650_000, 64_000, "Hybrid", "Automatic", 1800, "Hatchback", "Gampaha", "Kelaniya"),
    ("Toyota", "Prius", 2018, 12_600_000, 51_000, "Hybrid", "Automatic", 1800, "Hatchback", "Colombo", "Moratuwa"),
    ("Toyota", "Prius", 2016, 10_500_000, 88_000, "Hybrid", "Automatic", 1800, "Hatchback", "Kalutara", "Horana"),
    ("Toyota", "Prius", 2017, 11_350_000, 70_000, "Hybrid", "Automatic", 1800, "Hatchback", "Kandy", "Katugastota"),
    ("Toyota", "Prius", 2015, 9_990_000, 97_000, "Hybrid", "Automatic", 1800, "Hatchback", "Galle", "Hikkaduwa"),
    ("Toyota", "Vitz", 2018, 7_450_000, 39_000, "Petrol", "Automatic", 1000, "Hatchback", "Colombo", "Maharagama"),
    ("Toyota", "Vitz", 2017, 6_950_000, 52_000, "Petrol", "Automatic", 1000, "Hatchback", "Gampaha", "Kadawatha"),
    ("Toyota", "Vitz", 2019, 7_990_000, 28_000, "Petrol", "Automatic", 1000, "Hatchback", "Kalutara", "Panadura"),
    ("Suzuki", "Wagon R", 2019, 5_600_000, 31_000, "Hybrid", "Automatic", 660, "Hatchback", "Colombo", "Kottawa"),
    ("Suzuki", "Wagon R", 2018, 5_250_000, 47_000, "Hybrid", "Automatic", 660, "Hatchback", "Galle", "Galle"),
    ("Suzuki", "Wagon R", 2017, 4_900_000, 63_000, "Hybrid", "Automatic", 660, "Hatchback", "Matara", "Matara"),
    ("Honda", "Vezel", 2016, 9_900_000, 76_000, "Hybrid", "Automatic", 1500, "SUV", "Colombo", "Battaramulla"),
    ("Honda", "Vezel", 2017, 10_600_000, 61_000, "Hybrid", "Automatic", 1500, "SUV", "Gampaha", "Ja-Ela"),
    ("Honda", "Vezel", 2015, 9_300_000, 94_000, "Hybrid", "Automatic", 1500, "SUV", "Kandy", "Kandy"),
    ("Nissan", "Leaf", 2018, 6_800_000, 54_000, "Electric", "Automatic", None, "Hatchback", "Colombo", "Rajagiriya"),
    ("Nissan", "Leaf", 2017, 6_200_000, 69_000, "Electric", "Automatic", None, "Hatchback", "Gampaha", "Wattala"),
]


def build_rows() -> list[CarListing]:
    rows: list[CarListing] = []
    medians: dict[tuple[str, str], Decimal] = {}
    by_model: dict[tuple[str, str], list[int]] = {}
    for v in VEHICLES:
        by_model.setdefault((v[0], v[1]), []).append(v[3])
    for key, prices in by_model.items():
        ordered = sorted(prices)
        medians[key] = Decimal(ordered[len(ordered) // 2])

    for i, (make, model, year, price, mileage, fuel, gear, cc, body, district, city) in enumerate(VEHICLES):
        median = medians[(make, model)]
        # Positive deal score = priced below the model median.
        deal = Decimal(round(float((median - price) / median * 100), 1))
        seen = NOW - timedelta(days=i + 1)
        source = "ikman" if i % 2 == 0 else "riyasewana"
        rows.append(
            CarListing(
                source=source,
                source_id=f"e2e-{i + 1:03d}",
                scraped_at=NOW - timedelta(hours=i),
                first_seen_at=seen,
                last_seen_at=NOW - timedelta(hours=i),
                content_updated_at=seen,
                title=f"{make} {model} {year}",
                url=f"https://example.com/{source}/e2e-{i + 1:03d}",
                make=make,
                model=model,
                year=year,
                price_lkr=Decimal(price),
                mileage=mileage,
                fuel_type=fuel,
                transmission=gear,
                engine_capacity=cc,
                condition="Used",
                body_type=body,
                vehicle_category="cars",
                raw_location=f"{city}, {district}",
                district=district,
                city=city,
                deal_score=deal,
                market_median_lkr=median,
                is_outlier=False,
                is_duplicate=False,
                is_active=True,
                user_listing_status="scraped",
                description=f"Well maintained {year} {make} {model}. Seeded for end-to-end tests.",
            )
        )
    return rows


def main() -> None:
    init_db()
    session = ColdSessionLocal()
    try:
        session.add_all(build_rows())
        session.commit()
        count = session.query(CarListing).count()
    finally:
        session.close()
    print(f"seeded {count} car_listings rows into {db_path}")


if __name__ == "__main__":
    main()
