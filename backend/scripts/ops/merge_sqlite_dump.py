#!/usr/bin/env python3
"""Merge a Manus-scraped SQLite dump into the local outage pipeline DB.

Manus runs scripts/ops/manus_scrape_dump.sh on its cloud computer and uploads
the compressed SQLite DB as a GitHub Release asset. This script pulls those
rows into a target DB (local SQLite by default, or a Postgres/Neon DSN via
`--target postgresql://…`).

Rows are upserted by (source, source_id) through the app's upsert_listing, so
nothing is duplicated and vehicle_price_history rows are recorded correctly.

Usage:
  python scripts/ops/merge_sqlite_dump.py path/to/motormila.db[.gz]
  python scripts/ops/merge_sqlite_dump.py path/to/motormila.db.gz --target C:/motormila/motormila.db --dry-run
"""
from __future__ import annotations

import argparse
import gzip
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Allow running as `python scripts/ops/...` from anywhere: make `backend/`
# importable (parents: [0]=ops, [1]=scripts, [2]=backend).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from db.models import CarListing, ScrapeRun  # noqa: E402
from app.services.source_aliases import canonical_source_key  # noqa: E402
from app.utils.listing_upsert import upsert_listing  # noqa: E402

# Derived/flags columns that the local analysis recomputes — never copy these
# from the dump. Timestamps upsert_listing manages are excluded too.
EXCLUDE_COLS = {
    "id",
    "is_duplicate",
    "duplicate_of",
    "is_outlier",
    "deal_score",
    "thumbnail_url_cached",
    "image_phash",
    "content_updated_at",
    "last_seen_at",
    # Dump first_seen_at is usually the scrape clock. upsert_listing also
    # refuses to overwrite it; keep it out of the payload so inserts use the
    # DB default and existing rows keep their original discovery time.
    "first_seen_at",
    # Lifecycle flag is owned by listing_lifecycle, not by dump merges —
    # merging an old dump must not resurrect deactivated listings.
    "is_active",
}

CONTENT_COLS = [
    c.name for c in CarListing.__table__.columns if c.name not in EXCLUDE_COLS
]

# SQLite may hand these back as ISO strings; the ORM DateTime columns require
# datetime objects.
DATETIME_COLS = {"scraped_at", "first_seen_at", "last_seen_at", "content_updated_at"}


def norm_ts(value) -> str:
    """Normalise a datetime-ish value to the string form sqlite3 stores.

    sqlite3's default datetime adapter writes naive "YYYY-MM-DD HH:MM:SS.ffffff"
    (tz dropped), so comparing raw text reads against each other works; this
    also handles aware datetimes and ISO strings with a Z suffix.
    """
    from datetime import datetime

    if isinstance(value, datetime):
        value = value.replace(tzinfo=None) if value.tzinfo else value
        return str(value).replace(".000000", "")
    return str(value).replace("Z", "").replace("+00:00", "").replace(".000000", "")


def coerce_datetimes(row: dict) -> dict:
    from datetime import datetime

    out = dict(row)
    for key in DATETIME_COLS:
        val = out.get(key)
        if isinstance(val, str):
            try:
                out[key] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError:
                pass
    return out


def ensure_merge_schema(engine) -> None:
    """ADD any model columns missing from an older dump/merged DB file.

    The durable merged DB and older dump DBs were created before newer
    columns existed (e.g. ``car_listings.owner_user_id`` from the
    sell-your-car feature). SQLite has no migrations, so without this the
    ORM upserts (``upsert_listing``) and the ``CONTENT_COLS`` SELECT above
    fail with ``no such column`` and the whole merge aborts — leaving the
    live snapshots stale. ``ALTER TABLE ... ADD COLUMN`` heals the file in
    place; rows written by older code simply read back NULL.

    Only nullable (or defaulted) columns are added — SQLite refuses a
    NOT NULL column without a default on a non-empty table.
    """
    from sqlalchemy import inspect as sa_inspect

    for model in (CarListing, ScrapeRun):
        table = model.__table__
        try:
            existing = {c["name"] for c in sa_inspect(engine).get_columns(table.name)}
        except Exception:
            # Table absent entirely (e.g. scrape_runs in old dumps) —
            # the merge steps that need it already cope with that.
            continue
        missing = [c for c in table.columns if c.name not in existing]
        if not missing:
            continue
        with engine.begin() as conn:
            for col in missing:
                if not col.nullable and col.server_default is None:
                    print(
                        f"WARNING: cannot ADD COLUMN {table.name}.{col.name} "
                        f"(NOT NULL without default) — skipping"
                    )
                    continue
                ddl_type = col.type.compile(dialect=engine.dialect)
                conn.execute(
                    text(
                        f'ALTER TABLE "{table.name}" '
                        f'ADD COLUMN "{col.name}" {ddl_type}'
                    )
                )
                print(f"schema heal: added {table.name}.{col.name} ({ddl_type})")


def engine_url_for_target(target: str) -> str:
    """Build a SQLAlchemy URL for a dump merge target.

    SQLite paths (the outage merged-db) stay sqlite:///… . Postgres DSNs
    (Neon restore) must be passed through — wrapping them as sqlite:///DSN
    silently wrote a garbage file instead of importing into Neon.
    """
    value = (target or "").strip()
    if value.startswith("postgres://"):
        return "postgresql://" + value[len("postgres://") :]
    if value.startswith(("postgresql://", "postgresql+psycopg2://", "sqlite:")):
        return value
    return f"sqlite:///{value}"


def load_dump_path(path: str) -> Path:
    """Return a usable .db path, decompressing .gz dumps into a temp file."""
    p = Path(path)
    if p.suffix == ".gz":
        tmp = Path(tempfile.gettempdir()) / f"manus-dump-{os.getpid()}.db"
        with gzip.open(p, "rb") as fin, open(tmp, "wb") as fout:
            shutil.copyfileobj(fin, fout)
        return tmp
    return p


def _parse_dump_datetime(value):
    """Parse SQLite datetime values and normalize them to naive UTC."""
    from datetime import datetime, timezone

    if isinstance(value, datetime):
        parsed = value
    else:
        text_value = str(value or "").strip()
        if not text_value:
            return None
        parsed = None
        for candidate in (text_value, text_value.replace("Z", "+00:00")):
            try:
                parsed = datetime.fromisoformat(candidate)
                break
            except ValueError:
                continue
        if parsed is None:
            return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _latest_dump_scrape_runs(dump_engine) -> list[dict]:
    """Return the newest scrape run for each canonical source in a dump."""
    with dump_engine.connect() as conn:
        has_table = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master "
                "WHERE type='table' AND name='scrape_runs'"
            )
        ).first()
        if not has_table:
            return []

        columns = {
            str(row[1])
            for row in conn.execute(text("PRAGMA table_info('scrape_runs')"))
        }
        if not {"source", "started_at"}.issubset(columns):
            return []

        rows = conn.execute(
            text(
                "SELECT source, started_at, finished_at, status, "
                "listings_found, listings_new, error_message "
                "FROM scrape_runs "
                "WHERE started_at IS NOT NULL "
                "ORDER BY started_at ASC, id ASC"
            )
        ).mappings().all()

    latest: dict[str, dict] = {}
    for index, row in enumerate(rows):
        source = canonical_source_key(row.get("source"))
        started_at = _parse_dump_datetime(row.get("started_at"))
        if not source or started_at is None:
            continue
        candidate = dict(row)
        candidate["_source"] = source
        candidate["_started_at"] = started_at
        candidate["_order"] = index
        previous = latest.get(source)
        if previous is None or (
            candidate["_started_at"], candidate["_order"]
        ) >= (
            previous["_started_at"], previous["_order"]
        ):
            latest[source] = candidate
    return list(latest.values())


def import_scrape_runs(dump_engine, target_engine, TargetSession) -> int:
    """Merge operational scrape telemetry without duplicating runs.

    The outage merge path historically copied only listings and price history.
    That left a fresh failover catalog with an empty ``scrape_runs`` table,
    making the public pipeline monitor report every source as delayed. Keep
    the newest run per source and never replace a newer target run.
    """
    rows = _latest_dump_scrape_runs(dump_engine)
    if not rows:
        return 0

    imported = 0
    db = TargetSession()
    try:
        for row in rows:
            source = str(row["_source"])
            started_at = row["_started_at"]
            existing = (
                db.query(ScrapeRun)
                .filter(ScrapeRun.source == source)
                .order_by(ScrapeRun.started_at.desc(), ScrapeRun.id.desc())
                .first()
            )
            if existing is not None:
                existing_started = _parse_dump_datetime(existing.started_at)
                if existing_started is not None and existing_started >= started_at:
                    continue
                target = existing
            else:
                target = ScrapeRun(source=source)
                db.add(target)

            status = str(row.get("status") or "SUCCESS").upper()[:10]
            finished_at = _parse_dump_datetime(row.get("finished_at"))
            if finished_at is None and status != "RUNNING":
                finished_at = started_at
            target.started_at = started_at
            target.finished_at = finished_at
            target.status = status
            target.listings_found = max(0, int(row.get("listings_found") or 0))
            target.listings_new = max(0, int(row.get("listings_new") or 0))
            target.error_message = (
                str(row.get("error_message") or "").strip()[:2000] or None
            )
            imported += 1
        db.commit()
        return imported
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("dump", help="path to a Manus .db or .db.gz dump")
    ap.add_argument(
        "--target",
        default=os.environ.get(
            "MOTORMILA_LOCAL_DB", "C:/motormila/motormila.db"
        ),
        help="local outage DB to merge into (default: C:/motormila/motormila.db)",
    )
    ap.add_argument("--dry-run", action="store_true", help="count only, no writes")
    args = ap.parse_args()

    dump_path = load_dump_path(args.dump)
    target_url = engine_url_for_target(args.target)

    dump_engine = create_engine(f"sqlite:///{dump_path}")
    target_engine = create_engine(target_url)
    TargetSession = sessionmaker(bind=target_engine)

    # Schema drift heal: the durable merged DB and older dumps may predate
    # newer model columns (e.g. owner_user_id). Heal both files before any
    # ORM or raw SELECT touches them, or the merge aborts on "no such column".
    ensure_merge_schema(dump_engine)
    ensure_merge_schema(target_engine)

    sel = f"SELECT {', '.join(CONTENT_COLS)} FROM car_listings"
    with dump_engine.connect() as dconn:
        rows = dconn.execute(text(sel)).mappings().all()

    print(f"dump rows: {len(rows)}")

    inserted = 0
    updated = 0
    per_source: dict[str, list[int]] = {}

    if args.dry_run:
        with target_engine.connect() as tconn:
            existing = set(
                tconn.execute(
                    text("SELECT source || '|' || source_id FROM car_listings")
                ).fetchall()
            )
        existing = {r[0] for r in existing}
        for row in rows:
            key = f"{row['source']}|{row['source_id']}"
            per_source.setdefault(row["source"], [0, 0])
            if key in existing:
                per_source[row["source"]][0] += 1
            else:
                per_source[row["source"]][1] += 1
    else:
        db = TargetSession()
        try:
            for i, row in enumerate(rows, 1):
                payload = coerce_datetimes({k: row[k] for k in CONTENT_COLS})
                created = upsert_listing(
                    db, payload["source"], payload, preserve_lifecycle=True
                )
                if created:
                    inserted += 1
                else:
                    updated += 1
                per_source.setdefault(payload["source"], [0, 0])
                per_source[payload["source"]][1 if created else 0] += 1
                if i % 2000 == 0:
                    db.commit()
                    print(f"  ... {i}/{len(rows)} (new={inserted})")
            db.commit()
        finally:
            db.close()

    print("\nper-source (updated, inserted):")
    for src, (up, ins) in sorted(per_source.items()):
        print(f"  {src:14s} updated={up:6d} inserted={ins:6d}")
    if not args.dry_run:
        print(f"\nTOTAL updated={updated} inserted={inserted}")
    else:
        total_new = sum(v[1] for v in per_source.values())
        print(f"\nDRY-RUN: would insert {total_new} new rows, update the rest.")
        return 0

    try:
        runs_imported = import_scrape_runs(dump_engine, target_engine, TargetSession)
        if runs_imported:
            print(f"scrape runs imported={runs_imported}")
    except Exception as exc:
        # Telemetry is useful but must never invalidate a catalog merge.
        print(f"WARNING: scrape-run import failed ({exc}) - continuing without it")

    # Neon exports carry a vehicle_price_history_src table keyed by
    # (source, source_id); re-attach those price points to the just-upserted
    # listings so pre-outage price history survives. Plain manus dumps do not
    # have this table, so this is a no-op for them.
    try:
        hist = import_price_history(dump_engine, target_engine, TargetSession)
        if hist:
            print(f"price history imported={hist} (non-fatal)")
    except Exception as exc:
        print(f"WARNING: price-history import failed ({exc}) — continuing without it")
    return 0


def import_price_history(dump_engine, target_engine, TargetSession) -> int:
    """Copy vehicle_price_history_src rows (neon-export dumps) into the target.

    Returns the number of rows inserted; 0 when the dump has no history table.
    Skipped rows are those whose listing is missing in the target or whose
    (vehicle_id, scraped_at) point already exists.
    """
    from datetime import datetime

    with dump_engine.connect() as conn:
        has = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master "
                "WHERE type='table' AND name='vehicle_price_history_src'"
            )
        ).first()
        if not has:
            return 0
        rows = conn.execute(
            text(
                "SELECT source, source_id, price_lkr, scraped_at "
                "FROM vehicle_price_history_src"
            )
        ).mappings().all()
    print(f"price-history rows in dump: {len(rows)}")

    with target_engine.connect() as tconn:
        id_by_key = {
            f"{r[0]}|{r[1]}": r[2]
            for r in tconn.execute(
                text("SELECT source, source_id, id FROM car_listings")
            )
        }
        existing = {
            (r[0], norm_ts(r[1]))
            for r in tconn.execute(
                text("SELECT vehicle_id, scraped_at FROM vehicle_price_history")
            )
        }

    inserted = 0
    skipped = 0
    pend: list[dict] = []
    db = TargetSession()
    try:
        for row in rows:
            lid = id_by_key.get(f"{row['source']}|{row['source_id']}")
            if lid is None:
                skipped += 1
                continue
            ts = row["scraped_at"]
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    pass
            if (lid, norm_ts(ts)) in existing:
                skipped += 1
                continue
            pend.append({"vehicle_id": lid, "price_lkr": row["price_lkr"], "scraped_at": ts})
            if len(pend) >= 2000:
                db.execute(
                    text(
                        "INSERT INTO vehicle_price_history "
                        "(vehicle_id, price_lkr, scraped_at) "
                        "VALUES (:vehicle_id, :price_lkr, :scraped_at)"
                    ),
                    pend,
                )
                db.commit()
                inserted += len(pend)
                pend = []
        if pend:
            db.execute(
                text(
                    "INSERT INTO vehicle_price_history "
                    "(vehicle_id, price_lkr, scraped_at) "
                    "VALUES (:vehicle_id, :price_lkr, :scraped_at)"
                ),
                pend,
            )
            db.commit()
            inserted += len(pend)
    finally:
        db.close()
    print(f"price history: imported={inserted} skipped={skipped}")
    return inserted


if __name__ == "__main__":
    raise SystemExit(main())
