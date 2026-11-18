"""Backfill missing/unknown fuel_type values on CarListing records.

Uses high-precision deterministic rules (BEV models, dedicated hybrids,
motorbikes, petrol three-wheelers, commercial diesel trucks/buses/tractors)
to dramatically reduce 'other' in /api/v1/stats/fuel-mix without guessing on
dual-fuel passenger cars.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.utils.fuel_inference import infer_deterministic_fuel_type  # noqa: E402

_MISSING_FUEL_SQL = (
    "fuel_type IS NULL "
    "OR trim(fuel_type) = '' "
    "OR lower(trim(fuel_type)) IN "
    "('unknown', 'other', 'n/a', 'na', 'none', 'null', '-', '--', 'nil', 'not available')"
)


def backfill_sqlite(
    db_path: Path | str,
    *,
    dry_run: bool = False,
    batch_size: int = 5000,
) -> dict[str, int]:
    """Backfill unknown/NULL fuel_type entries in the given SQLite database."""
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()

    cols = {row[1] for row in c.execute("PRAGMA table_info(car_listings)").fetchall()}
    has_category = "vehicle_category" in cols
    select_cols = "id, title, make, model, vehicle_category" if has_category else "id, title, make, model, NULL"
    c.execute(f"SELECT {select_cols} FROM car_listings WHERE {_MISSING_FUEL_SQL}")
    rows = c.fetchall()
    total = len(rows)
    print(f"Found {total} listings with missing/unknown fuel_type in {db_path}")

    counts: dict[str, int] = {}
    updates: list[tuple[str, int]] = []
    skipped = 0

    for row_id, title, make, model, vehicle_category in rows:
        inferred = infer_deterministic_fuel_type(make, model, title, vehicle_category)
        if inferred:
            counts[inferred] = counts.get(inferred, 0) + 1
            updates.append((inferred, row_id))
        else:
            skipped += 1

    print(f"Inferred {len(updates)}/{total} fuel_type values (left {skipped} unchanged):")
    for fuel, count in sorted(counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {fuel}: {count}")

    if dry_run or not updates:
        if dry_run:
            print("Dry run mode: changes NOT saved.")
        conn.close()
        return {**counts, "_matched": len(updates), "_skipped": skipped, "_scanned": total}

    print(f"Applying updates in batches of {batch_size}...")
    for i in range(0, len(updates), batch_size):
        chunk = updates[i : i + batch_size]
        c.executemany("UPDATE car_listings SET fuel_type = ? WHERE id = ?", chunk)
        conn.commit()
        print(f"  Updated {min(i + batch_size, len(updates))}/{len(updates)}")

    conn.close()
    print("Fuel type backfill complete and committed.")
    return {**counts, "_matched": len(updates), "_skipped": skipped, "_scanned": total}


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill unknown fuel_type on car_listings")
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Path to SQLite database file",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate classification without updating the database",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5000,
        help="Batch size for database updates",
    )
    args = parser.parse_args()

    if args.db_path:
        db_path = args.db_path
    else:
        candidates = [
            Path("backend/motormila.db"),
            Path("backend/autolens.db"),
            Path("motormila.db"),
            Path("autolens.db"),
        ]
        db_path = next((p for p in candidates if p.is_file()), None)
        if not db_path:
            raise SystemExit("No SQLite database found. Specify --db-path.")

    backfill_sqlite(db_path, dry_run=args.dry_run, batch_size=args.batch_size)


if __name__ == "__main__":
    main()
