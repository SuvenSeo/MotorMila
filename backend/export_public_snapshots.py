"""Build public Motormila snapshot JSON files from the configured database.

This is intentionally read-only. It lets the public site read Cloudflare R2
JSON snapshots instead of hitting Postgres for every visitor.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import and_, desc, func  # noqa: E402
from sqlalchemy.orm import load_only  # noqa: E402

from app.api.v1.endpoints import listings as listings_endpoint  # noqa: E402
from app.api.v1.endpoints import pipeline as pipeline_endpoint  # noqa: E402
from app.api.v1.endpoints import stats as stats_endpoint  # noqa: E402
from app.utils.districts import count_canonical_districts  # noqa: E402
from app.utils.make_canonical import canonicalize_make, canonicalize_model  # noqa: E402
from app.utils.listing_snapshot import (  # noqa: E402
    LISTING_SNAPSHOT_LOAD_ONLY,
    listing_to_dict,
)
from db.models import CarListing, live_listing_filter  # noqa: E402
from db.session import SessionLocal  # noqa: E402

logger = logging.getLogger(__name__)

MIN_REASONABLE_PRICE_LKR = 100_000
DEFAULT_OUTPUT_DIR = BASE_DIR / "snapshots" / "latest"

# Vercel caps a single deployed file at 100 MB; keep each catalog part around
# 20 MB (Cloudflare Pages 25 MiB per-file limit) and reliable client-side chunk streaming.
CATALOG_PART_TARGET_BYTES = 20 * 1024 * 1024


def jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "model_dump"):
        return jsonable(value.model_dump())
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(jsonable(payload), handle, separators=(",", ":"), sort_keys=True)
        handle.write("\n")


def to_utc_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def number_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isfinite(number):
        return number
    return None


def build_stats_summary(db) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    priced_clause = and_(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )

    total = db.query(func.count(CarListing.id)).filter(live_listing_filter()).scalar() or 0
    avg_price = db.query(func.avg(CarListing.price_lkr)).filter(priced_clause).scalar()
    good_deals = (
        db.query(func.count(CarListing.id))
        .filter(CarListing.deal_score >= 20, live_listing_filter())
        .scalar()
        or 0
    )
    this_week = (
        db.query(func.count(CarListing.id))
        .filter(CarListing.first_seen_at >= seven_days_ago, live_listing_filter())
        .scalar()
        or 0
    )
    districts = count_canonical_districts(
        db.query(CarListing).filter(CarListing.district.isnot(None), live_listing_filter())
    )
    source_count = (
        db.query(func.count(func.distinct(CarListing.source)))
        .filter(CarListing.source.isnot(None), live_listing_filter())
        .scalar()
        or 0
    )
    last_updated = (
        db.query(func.max(func.coalesce(CarListing.scraped_at, CarListing.last_seen_at, CarListing.first_seen_at)))
        .filter(live_listing_filter())
        .scalar()
    )

    top_makes = (
        db.query(CarListing.make, func.count(CarListing.id).label("count"))
        .filter(CarListing.make.isnot(None), live_listing_filter())
        .group_by(CarListing.make)
        .order_by(desc("count"))
        .limit(8)
        .all()
    )

    return {
        "total_listings": int(total),
        "avg_price_lkr": round(float(avg_price), 2) if avg_price is not None else None,
        "price_change_mom": None,
        "good_deals_count": int(good_deals),
        "listings_this_week": int(this_week),
        "districts_covered": int(districts),
        "district_count": int(districts),
        "source_count": int(source_count),
        "last_updated": to_utc_iso(last_updated),
        "top_makes": [{"make": str(row.make), "count": int(row.count or 0)} for row in top_makes],
    }


def build_pipeline_status(db) -> dict[str, Any]:
    """Public snapshot payload — same logic as GET /pipeline/status (anonymous)."""
    try:
        return pipeline_endpoint.pipeline_status(db=db, is_admin=False)
    except Exception:
        logger.exception("Failed to build pipeline-status snapshot; using degraded fallback")
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            # Deliberately NOT "ok": an empty job list derives "delayed" from
            # pipeline._derive_overall_status, and consumers treat only
            # "ok"/"running" as healthy. Publishing "ok" here would ship a
            # green pipeline-status.json to the UI exactly when the export
            # failed, hiding the breakage.
            "overall_status": "delayed",
            "jobs": [],
        }


def build_listing_catalog(db, limit: int | None = None) -> list[dict[str, Any]]:
    query = (
        db.query(CarListing)
        .options(load_only(*LISTING_SNAPSHOT_LOAD_ONLY))
        .filter(live_listing_filter())
        .order_by(
            desc(CarListing.first_seen_at),
            desc(CarListing.id),
        )
    )
    if limit is not None and limit > 0:
        query = query.limit(limit)
    return [listing_to_dict(row) for row in query.yield_per(1000)]


def build_models_by_make(catalog: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    from app.utils.make_canonical import compact_key, model_contains_foreign_make

    by_make: dict[str, dict[str, dict[str, Any]]] = {}
    for item in catalog:
        make = canonicalize_make(item.get("make"))
        model = canonicalize_model(item.get("model"))
        if not make or not model:
            continue
        # "Toyota Aqua" under Land Rover is a misattributed feed row, not a
        # Land Rover model.
        if model_contains_foreign_make(item.get("model"), make):
            continue
        bucket = by_make.setdefault(make, {})
        # Merge case/spelling variants ("Wira"/"wira", "CHR"/"C-HR") under one
        # canonical key so a model is one filter row with one count.
        key = compact_key(model)
        entry = bucket.get(key)
        if entry is None:
            bucket[key] = {"model": model, "count": 1}
        else:
            entry["count"] += 1
    return {
        make: [
            {"model": entry["model"], "count": entry["count"]}
            for entry in sorted(models.values(), key=lambda row: row["count"], reverse=True)
        ]
        for make, models in sorted(by_make.items())
    }


def build_make_insights(catalog: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Per-make hub payloads (same shape as GET /stats/make-insight).

    Written as make-insights.json so the snapshot-only frontend can render
    MakeHub stats, popular models and the all-models browser without calling
    the live backend.
    """
    from app.utils.make_canonical import (
        compact_key,
        model_contains_foreign_make,
    )
    from app.utils.pricing import median_from_values

    per_make: dict[str, dict[str, Any]] = {}
    for item in catalog:
        make = canonicalize_make(item.get("make"))
        if not make:
            continue
        model = canonicalize_model(item.get("model"))
        if model and model_contains_foreign_make(item.get("model"), make):
            model = ""
        price = item.get("price_lkr")
        priced = isinstance(price, (int, float)) and float(price) >= MIN_REASONABLE_PRICE_LKR
        bucket = per_make.setdefault(
            make, {"total": 0, "prices": [], "models": {}, "districts": {}}
        )
        bucket["total"] += 1
        if priced:
            bucket["prices"].append(float(price))
        if model:
            key = compact_key(model)
            entry = bucket["models"].get(key)
            if entry is None:
                bucket["models"][key] = {
                    "model": model,
                    "count": 1,
                    "price_total": float(price) if priced else 0.0,
                    "priced_count": 1 if priced else 0,
                }
            else:
                # First-seen display form wins for the merged model row.
                entry["count"] += 1
                if priced:
                    entry["price_total"] += float(price)
                    entry["priced_count"] += 1
        district = str(item.get("district") or "").strip()
        if district and compact_key(district) != "srilanka":
            dentry = bucket["districts"].get(district)
            if dentry is None:
                bucket["districts"][district] = {
                    "district": district,
                    "count": 1,
                    "price_total": float(price) if priced else 0.0,
                    "priced_count": 1 if priced else 0,
                }
            else:
                dentry["count"] += 1
                if priced:
                    dentry["price_total"] += float(price)
                    dentry["priced_count"] += 1

    result: dict[str, dict[str, Any]] = {}
    for make, bucket in sorted(per_make.items()):
        models = sorted(bucket["models"].values(), key=lambda m: m["count"], reverse=True)
        all_models = [
            {
                "model": m["model"],
                "count": m["count"],
                "avg_price_lkr": round(m["price_total"] / m["priced_count"], 2)
                if m["priced_count"]
                else None,
            }
            for m in models
        ]
        districts = sorted(
            bucket["districts"].values(), key=lambda d: d["count"], reverse=True
        )[:6]
        prices: list[float] = bucket["prices"]
        result[make] = {
            "make": make,
            "total": bucket["total"],
            "avg_price_lkr": round(sum(prices) / len(prices), 2) if prices else None,
            "median_price_lkr": round(median_from_values(prices), 2) if prices else None,
            "top_models": all_models[:12],
            "all_models": all_models,
            "top_districts": [
                {
                    "district": d["district"],
                    "count": d["count"],
                    "avg_price_lkr": round(d["price_total"] / d["priced_count"], 2)
                    if d["priced_count"]
                    else None,
                }
                for d in districts
            ],
        }
    return result


def write_catalog_parts(output_dir: Path, catalog: list[dict[str, Any]], generated_at: datetime) -> None:
    """Write the listing catalog as a small manifest + paginated part files.

    Vercel rejects a single deployed file over 100 MB, and the full catalog
    routinely exceeds that, so items are split into listing-catalog-part-NNN.json
    files (each wrapped as {"items": [...]}) with a manifest pointing at them —
    the multi-part shape the frontend already consumes.
    """
    part_names: list[str] = []
    current: list[dict[str, Any]] = []
    current_bytes = 0
    for item in catalog:
        current.append(item)
        current_bytes += len(
            json.dumps(jsonable(item), separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        if current_bytes >= CATALOG_PART_TARGET_BYTES:
            part_names.append(f"listing-catalog-part-{len(part_names):03d}.json")
            write_json(output_dir / part_names[-1], {"items": current})
            current = []
            current_bytes = 0
    if current:
        part_names.append(f"listing-catalog-part-{len(part_names):03d}.json")
        write_json(output_dir / part_names[-1], {"items": current})

    # Drop stale parts from an earlier export that had more parts.
    for stale in output_dir.glob("listing-catalog-part-*.json"):
        if stale.name not in part_names:
            stale.unlink(missing_ok=True)

    write_json(
        output_dir / "listing-catalog.json",
        {
            "generated_at": generated_at.isoformat(),
            "listing_count": len(catalog),
            "paginated": True,
            "parts": part_names,
        },
    )


def build_price_drops(db, days: int = 7, limit: int = 20) -> dict[str, Any]:
    """Biggest recorded cuts in the window — same LAG logic as the endpoint.

    Export runs anonymous (no plan gating); mirrors the free-browse limit.
    """
    from db.models import VehiclePriceHistory

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    prev_price = (
        func.lag(VehiclePriceHistory.price_lkr)
        .over(
            partition_by=VehiclePriceHistory.vehicle_id,
            order_by=(VehiclePriceHistory.scraped_at, VehiclePriceHistory.id),
        )
        .label("prev_price")
    )
    ordered = (
        db.query(
            VehiclePriceHistory.vehicle_id.label("vehicle_id"),
            VehiclePriceHistory.price_lkr.label("new_price"),
            VehiclePriceHistory.scraped_at.label("dropped_at"),
            prev_price,
        )
    ).subquery("ordered_history")
    drops = (
        db.query(
            ordered.c.vehicle_id,
            ordered.c.new_price,
            ordered.c.prev_price,
            ordered.c.dropped_at,
        )
        .filter(
            ordered.c.prev_price.isnot(None),
            ordered.c.new_price < ordered.c.prev_price,
            ordered.c.dropped_at >= cutoff,
        )
        .subquery("drops")
    )
    rows = (
        db.query(
            CarListing,
            drops.c.new_price,
            drops.c.prev_price,
            drops.c.dropped_at,
        )
        .join(drops, drops.c.vehicle_id == CarListing.id)
        .filter(live_listing_filter(), CarListing.is_duplicate.is_(False))
        .order_by(desc((drops.c.prev_price - drops.c.new_price) / drops.c.prev_price))
        .limit(limit)
        .all()
    )
    items = []
    seen: set[int] = set()
    for listing, new_price, prev, dropped_at in rows:
        if listing.id in seen:
            continue
        seen.add(int(listing.id))
        prev_f = float(prev)
        new_f = float(new_price)
        items.append(
            {
                "listing": listing_to_dict(listing),
                "previous_price_lkr": prev_f,
                "new_price_lkr": new_f,
                "drop_pct": round((prev_f - new_f) / prev_f * 100, 1) if prev_f > 0 else 0.0,
                "dropped_at": to_utc_iso(dropped_at),
            }
        )
    return {"items": items, "window_days": days, "generated_at": now.isoformat()}


def build_price_sparklines(db, max_listings: int = 100000, per_listing: int = 8) -> dict[str, Any]:
    """Compact per-listing price trajectories for the offline price chart.

    Only listings with at least two distinct observed prices are included
    (single-point histories add nothing over the catalog row). Each entry is
    the last ``per_listing`` [price_lkr, scraped_at] pairs, oldest first.
    Fully defensive: a missing/shapeless history table just yields {}.
    """
    now = datetime.now(timezone.utc).isoformat()
    try:
        from db.models import VehiclePriceHistory

        changed_ids = [
            row.vehicle_id
            for row in (
                db.query(
                    VehiclePriceHistory.vehicle_id,
                    func.max(VehiclePriceHistory.scraped_at).label("last_seen"),
                )
                .group_by(VehiclePriceHistory.vehicle_id)
                .having(func.count(func.distinct(VehiclePriceHistory.price_lkr)) > 1)
                .order_by(desc("last_seen"))
                .limit(max_listings)
                .all()
            )
        ]
        sparklines: dict[str, list] = {}
        batch_size = 5000
        for start in range(0, len(changed_ids), batch_size):
            batch = changed_ids[start : start + batch_size]
            rows = (
                db.query(
                    VehiclePriceHistory.vehicle_id,
                    VehiclePriceHistory.price_lkr,
                    VehiclePriceHistory.scraped_at,
                )
                .filter(VehiclePriceHistory.vehicle_id.in_(batch))
                .order_by(VehiclePriceHistory.vehicle_id, VehiclePriceHistory.scraped_at.desc())
                .all()
            )
            per_id: dict[int, list] = {}
            for vehicle_id, price, scraped_at in rows:
                bucket = per_id.setdefault(int(vehicle_id), [])
                if len(bucket) < per_listing:
                    bucket.append([float(price), to_utc_iso(scraped_at)])
            for vehicle_id, points in per_id.items():
                sparklines[str(vehicle_id)] = points[::-1]
        return {"sparklines": sparklines, "generated_at": now}
    except Exception as exc:
        logger.warning("price sparklines skipped: %s", exc)
        return {"sparklines": {}, "generated_at": now, "unavailable": True}


def build_permits_snapshot(db) -> dict[str, Any]:
    """Export the admin-seeded permit table; merged SQLite may not have it."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        from db.models import VehiclePermit

        rows = db.query(VehiclePermit).order_by(VehiclePermit.market_price_lkr.desc()).all()
        return {
            "items": [
                {
                    "id": row.id,
                    "permit_name": row.permit_name,
                    "permit_type": row.permit_type,
                    "market_price_lkr": number_or_none(row.market_price_lkr),
                }
                for row in rows
            ],
            "generated_at": now,
        }
    except Exception as exc:
        logger.warning("permits snapshot skipped: %s", exc)
        return {"items": [], "generated_at": now, "unavailable": True}


def build_small_snapshots(db) -> dict[str, Any]:
    """Cheap aggregate files so the SPA survives a Neon outage.

    Each builder is isolated: one failure logs and skips that file instead of
    breaking the whole export (the previous file stays deployed).
    """
    builders: dict[str, Any] = {
        # Reader exists but the file was never regenerated — fixes stale velocity.
        "district-velocity.json": lambda: stats_endpoint.compute_district_velocity(db),
        "price-index.json": lambda: stats_endpoint._compute_price_index_payload(db),
        "fuel-mix.json": lambda: stats_endpoint.get_fuel_mix(db=db),
        "hybrid-bands.json": lambda: stats_endpoint.get_hybrid_bands(db=db),
        "import-era-split.json": lambda: stats_endpoint.get_import_era_split(db),
        "permits.json": lambda: build_permits_snapshot(db),
    }
    # Aggregate trends use the same compute path as the live endpoint (free-tier
    # depth: national overall, 12 months).
    builders["price-trends.json"] = lambda: stats_endpoint._compute_price_trends_payload(db=db)
    builders["price-sparklines.json"] = lambda: build_price_sparklines(db)
    builders["price-drops.json"] = lambda: build_price_drops(db)
    out: dict[str, Any] = {}
    for filename, build in builders.items():
        try:
            out[filename] = build()
        except Exception as exc:
            logger.warning("snapshot %s skipped: %s", filename, exc)
    return out


def build_snapshot(output_dir: Path, catalog_limit: int | None = None, *, skip_catalog: bool = False) -> dict[str, Any]:
    db = SessionLocal()
    generated_at = datetime.now(timezone.utc)
    try:
        # Full-catalog reads transfer the whole car_listings table (egress).
        # Daily/stats-only runs pass skip_catalog=True so only the small JSON
        # files are rebuilt; listing-catalog.json keeps its last full export
        # (weekly or manual), which the frontend still reads from R2/CDN.
        if skip_catalog:
            catalog = []
            priced_count = 0
        else:
            catalog = build_listing_catalog(db, limit=catalog_limit)
            priced_count = sum(
                1
                for item in catalog
                if item.get("price_lkr") is not None and float(item.get("price_lkr") or 0) >= MIN_REASONABLE_PRICE_LKR
            )

        # listing-models.json is derived from the full catalog, so it must be
        # skipped together with the catalog — writing an empty {} would clobber
        # the last good file on R2 and break make→model drilldowns.
        skip_derived = skip_catalog

        files = {
            "manifest.json": {
                "generated_at": generated_at.isoformat(),
                "schema_version": 1,
                "listing_count": len(catalog),
                "priced_listing_count": priced_count,
                "files": [
                    "stats-summary.json",
                    "live-market.json",
                    "pipeline-status.json",
                    "district-prices.json",
                    "district-velocity.json",
                    "price-trends.json",
                    "price-index.json",
                    "fuel-mix.json",
                    "hybrid-bands.json",
                    "import-era-split.json",
                    "permits.json",
                    "price-sparklines.json",
                    "price-drops.json",
                    "dashboard-insights.json",
                    "listing-sources.json",
                    "listing-makes.json",
                ]
                + ([] if skip_derived else ["listing-models.json", "listing-catalog.json", "make-insights.json"]),
            },
            "stats-summary.json": build_stats_summary(db),
            "live-market.json": stats_endpoint.build_live_market_snapshot(db),
            "pipeline-status.json": build_pipeline_status(db),
            "district-prices.json": stats_endpoint.get_district_prices(db=db),
            "dashboard-insights.json": stats_endpoint.get_dashboard_insights(db=db),
            "listing-sources.json": listings_endpoint.get_sources(db=db),
            "listing-makes.json": listings_endpoint.get_makes(db=db),
            "listing-models.json": build_models_by_make(catalog),
            "make-insights.json": build_make_insights(catalog),
        }
        files.update(build_small_snapshots(db))

        if skip_derived:
            files.pop("listing-models.json")
            files.pop("make-insights.json")
        else:
            # Full catalog is paginated into <100 MB parts behind a small
            # manifest — the shape the frontend already reads.
            write_catalog_parts(output_dir, catalog, generated_at)

        for filename, payload in files.items():
            write_json(output_dir / filename, payload)
        return files["manifest.json"]
    finally:
        db.close()


def build_entity_indexes(output_dir: Path) -> None:
    """Emit per-listing shards + make/model/district indexes (idx/).

    The browser must never download the whole catalogue, so the frontend reads
    idx/listings/<bucket>.json, idx/models/<make>/<model>.json etc. The layout
    is produced by scripts/build-snapshot-indexes.mjs (shared with the Vercel
    build so keys always match the SPA's canonicalizers). Best effort: a missing
    Node runtime only means the frontend keeps using its legacy fallback.
    """
    import shutil
    import subprocess

    script = BASE_DIR.parent / "scripts" / "build-snapshot-indexes.mjs"
    node = shutil.which("node")
    if not node or not script.exists():
        logger.warning("entity index build skipped (node=%s, script=%s)", node, script.exists())
        return
    cmd = [node]
    try:
        major = int(
            subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10)
            .stdout.strip()
            .lstrip("v")
            .split(".")[0]
        )
        if 22 <= major:
            cmd.append("--experimental-strip-types")
    except Exception:  # noqa: BLE001
        pass
    cmd += [str(script), str(output_dir), "--no-sitemaps"]
    try:
        subprocess.run(cmd, check=False, timeout=900)
    except Exception as exc:  # noqa: BLE001
        logger.warning("entity index build failed: %s", exc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export public JSON snapshots for Motormila.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory to write snapshot files into. Defaults to backend/snapshots/latest.",
    )
    parser.add_argument(
        "--catalog-limit",
        type=int,
        default=0,
        help="Optional max listings for listing-catalog.json. 0 means export all listings.",
    )
    parser.add_argument(
        "--skip-catalog",
        action="store_true",
        help="Stats-only export: skip the full listing-catalog read (saves Neon egress). "
        "live-market.json still includes latest_listings (newest ads by first_seen_at) "
        "so the homepage can update between weekly catalog refreshes. "
        "Use for daily refreshes; run a full export weekly or manually.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    limit = args.catalog_limit if args.catalog_limit and args.catalog_limit > 0 else None
    manifest = build_snapshot(args.output, catalog_limit=limit, skip_catalog=args.skip_catalog)
    if not args.skip_catalog:
        build_entity_indexes(args.output)
    print(
        "Snapshot ready:",
        args.output,
        f"listings={manifest['listing_count']}",
        f"priced={manifest['priced_listing_count']}",
        "catalog=skipped" if args.skip_catalog else "catalog=full",
    )


if __name__ == "__main__":
    main()
