#!/usr/bin/env python3
"""Master Unblock & Merge Pipeline.

1. Streams all 194k+ listings + price history from Neon PostgreSQL into motormila.db.
2. Discovers and merges all newer Manus dumps (from Aug 12 through Sept 2, 2026).
3. Merges local C:/motormila/motormila.db if present.
4. Ensures all records are deduplicated and up-to-date.
"""
from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import sessionmaker

from db.models import Base, CarListing, VehiclePriceHistory
from app.utils.listing_upsert import upsert_listing

CHUNK = 5000

DATETIME_COLS = {"scraped_at", "first_seen_at", "last_seen_at", "content_updated_at"}
EXCLUDE_COLS = {
    "id",
    "is_duplicate",
    "duplicate_of",
    "is_outlier",
    "deal_score",
    "thumbnail_url_cached",
    "image_phash",
    "vehicle_category",
    "content_updated_at",
    "last_seen_at",
}
CONTENT_COLS = [c.name for c in CarListing.__table__.columns if c.name not in EXCLUDE_COLS]


def clean_row(row_map):
    d = dict(row_map)
    for k, v in d.items():
        if isinstance(v, Decimal):
            d[k] = float(v)
    return d


def coerce_datetimes(row: dict) -> dict:
    out = dict(row)
    for key in DATETIME_COLS:
        val = out.get(key)
        if isinstance(val, str):
            try:
                out[key] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError:
                pass
    return out


def step1_export_neon(dst_db_path: Path) -> int:
    dsn = os.getenv("DATABASE_URL") or os.getenv("HOT_DATABASE_URL") or ""
    if not dsn:
        raise ValueError("DATABASE_URL is not set!")

    print("\n" + "=" * 60)
    print("STEP 1: Exporting full catalog from Neon PostgreSQL")
    print("=" * 60)
    print("Source DSN:", dsn.split("@")[-1])
    print("Destination SQLite:", dst_db_path)

    pg = create_engine(dsn, poolclass=NullPool, pool_pre_ping=True, connect_args={"connect_timeout": 15})
    sq = create_engine(f"sqlite:///{dst_db_path}")

    # Initialize tables in sqlite
    Base.metadata.create_all(sq)

    cols = [c.name for c in CarListing.__table__.columns]
    col_list = ", ".join(cols)
    placeholders = ", ".join(f":{c}" for c in cols)

    listings_count = 0
    history_count = 0

    try:
        with pg.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM car_listings")).fetchone()[0]
            print(f"Neon car_listings total: {total}")

        # Stream car_listings
        with pg.connect().execution_options(stream_results=True) as conn:
            result = conn.execute(text(f"SELECT {col_list} FROM car_listings"))
            while True:
                chunk = result.fetchmany(CHUNK)
                if not chunk:
                    break
                with sq.begin() as dst:
                    dst.execute(
                        text(f"INSERT INTO car_listings ({col_list}) VALUES ({placeholders})"),
                        [clean_row(r._mapping) for r in chunk],
                    )
                listings_count += len(chunk)
                if listings_count % 25000 == 0 or listings_count == total:
                    print(f"  listings copied: {listings_count}/{total} ({(listings_count/total)*100:.1f}%)")

        # Stream price history
        hist_cols = [c.name for c in VehiclePriceHistory.__table__.columns]
        hist_col_list = ", ".join(hist_cols)
        hist_placeholders = ", ".join(f":{c}" for c in hist_cols)

        with pg.connect().execution_options(stream_results=True) as conn:
            result = conn.execute(text(f"SELECT {hist_col_list} FROM vehicle_price_history"))
            while True:
                chunk = result.fetchmany(CHUNK)
                if not chunk:
                    break
                with sq.begin() as dst:
                    dst.execute(
                        text(f"INSERT INTO vehicle_price_history ({hist_col_list}) VALUES ({hist_placeholders})"),
                        [clean_row(r._mapping) for r in chunk],
                    )
                history_count += len(chunk)
                if history_count % 10000 == 0:
                    print(f"  price history rows copied: {history_count}")

    finally:
        pg.dispose()
        sq.dispose()

    print(f"STEP 1 COMPLETE: {listings_count} listings, {history_count} price history rows exported.\n")
    return listings_count


def step2_merge_manus_dumps(dst_db_path: Path):
    print("\n" + "=" * 60)
    print("STEP 2: Merging all recent Manus scrape releases")
    print("=" * 60)

    target_engine = create_engine(f"sqlite:///{dst_db_path}")
    TargetSession = sessionmaker(bind=target_engine)

    token = os.environ.get("GH_TOKEN") or ""
    repo = "SuvenSeo/Vehicle-Platform"
    headers = {"User-Agent": "master-merge", "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/releases?per_page=100", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            releases = json.load(resp)
    except Exception as e:
        print(f"Warning: could not list releases from GitHub API: {e}")
        releases = []

    ts_re = re.compile(r"(\d{8}T\d+Z)")
    dump_releases = []
    for rel in releases:
        tag = rel.get("tag_name") or ""
        if not tag.startswith(("manus-scrape-", "laptop-db-")):
            continue
        assets = {a.get("name"): a for a in rel.get("assets", [])}
        asset = assets.get("motormila.db.gz") or assets.get("autolens.db.gz")  # legacy name
        if not asset:
            continue
        m = ts_re.search(tag)
        cand_ts = m.group(1) if m else tag
        dump_releases.append((cand_ts, tag, asset["browser_download_url"]))

    dump_releases.sort(key=lambda x: x[0])
    print(f"Found {len(dump_releases)} Manus dump releases to merge.")

    tmp_dir = Path(tempfile.mkdtemp(prefix="manus-dumps-"))
    total_new = 0
    total_updated = 0

    try:
        for cand_ts, tag, download_url in dump_releases:
            gz_path = tmp_dir / f"{tag}.db.gz"
            db_path = tmp_dir / f"{tag}.db"
            print(f"\nProcessing {tag} ({cand_ts})...")
            
            # Download
            req_dl = urllib.request.Request(download_url, headers={"User-Agent": "master-merge"})
            if token:
                req_dl.add_header("Authorization", f"Bearer {token}")
            with urllib.request.urlopen(req_dl, timeout=120) as resp, open(gz_path, "wb") as f:
                shutil.copyfileobj(resp, f)

            with gzip.open(gz_path, "rb") as fin, open(db_path, "wb") as fout:
                shutil.copyfileobj(fin, fout)

            # Read rows from dump
            dump_engine = create_engine(f"sqlite:///{db_path}")
            sel = f"SELECT {', '.join(CONTENT_COLS)} FROM car_listings"
            with dump_engine.connect() as dconn:
                rows = dconn.execute(text(sel)).mappings().all()

            print(f"  dump rows: {len(rows)}")
            inserted = 0
            updated = 0
            db = TargetSession()
            try:
                for i, row in enumerate(rows, 1):
                    payload = coerce_datetimes(clean_row(row))
                    created = upsert_listing(db, payload["source"], payload)
                    if created:
                        inserted += 1
                    else:
                        updated += 1
                    if i % 2000 == 0:
                        db.commit()
                db.commit()
            finally:
                db.close()
                dump_engine.dispose()

            print(f"  result: inserted={inserted} new, updated={updated}")
            total_new += inserted
            total_updated += updated

            # Clean up temp files
            if gz_path.exists():
                gz_path.unlink()
            if db_path.exists():
                db_path.unlink()

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print(f"\nSTEP 2 COMPLETE: total new listings={total_new}, total updated={total_updated}")


def step3_merge_local_outage_db(dst_db_path: Path):
    local_path = Path("C:/motormila/motormila.db")
    if not local_path.exists():
        print("No C:/motormila/motormila.db found; skipping local outage db merge.")
        return

    print("\n" + "=" * 60)
    print("STEP 3: Merging local C:/motormila/motormila.db")
    print("=" * 60)

    target_engine = create_engine(f"sqlite:///{dst_db_path}")
    TargetSession = sessionmaker(bind=target_engine)
    src_engine = create_engine(f"sqlite:///{local_path}")

    sel = f"SELECT {', '.join(CONTENT_COLS)} FROM car_listings"
    with src_engine.connect() as sconn:
        rows = sconn.execute(text(sel)).mappings().all()

    print(f"Local DB rows: {len(rows)}")
    inserted = 0
    updated = 0
    db = TargetSession()
    try:
        for i, row in enumerate(rows, 1):
            payload = coerce_datetimes(clean_row(row))
            created = upsert_listing(db, payload["source"], payload)
            if created:
                inserted += 1
            else:
                updated += 1
            if i % 2000 == 0:
                db.commit()
        db.commit()
    finally:
        db.close()
        src_engine.dispose()

    print(f"STEP 3 COMPLETE: inserted={inserted} new, updated={updated}")


def main():
    target_db = BACKEND_DIR / "motormila.db"
    if target_db.exists():
        backup_db = BACKEND_DIR / f"motormila_backup_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%MZ')}.db"
        print(f"Backing up existing {target_db} to {backup_db}")
        shutil.copy2(target_db, backup_db)
        target_db.unlink()

    step1_export_neon(target_db)
    step2_merge_manus_dumps(target_db)
    step3_merge_local_outage_db(target_db)

    # Print final summary
    engine = create_engine(f"sqlite:///{target_db}")
    with engine.connect() as conn:
        listings = conn.execute(text("SELECT COUNT(*) FROM car_listings")).scalar()
        active = conn.execute(text("SELECT COUNT(*) FROM car_listings WHERE is_active=1")).scalar()
        history = conn.execute(text("SELECT COUNT(*) FROM vehicle_price_history")).scalar()
        srcs = conn.execute(text("SELECT source, COUNT(*) FROM car_listings GROUP BY source")).fetchall()

    print("\n" + "=" * 60)
    print("MASTER MERGE SUMMARY")
    print("=" * 60)
    print(f"Total Listings: {listings}")
    print(f"Active Listings: {active}")
    print(f"Price History Rows: {history}")
    print("Source Breakdown:", dict(srcs))
    print("=" * 60)


if __name__ == "__main__":
    main()
