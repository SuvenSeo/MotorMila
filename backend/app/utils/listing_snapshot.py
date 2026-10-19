"""Shared listing card payloads for public snapshots and live-market JSON.

Kept small (load_only) so daily/stats-only exports can attach the newest
discovered ads without reading the full catalog.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session, load_only

from app.utils.thumbnail_urls import parse_image_list, upgrade_thumbnail_url
from db.models import CarListing, live_listing_filter

LATEST_LISTINGS_LIMIT = 80

LISTING_SNAPSHOT_LOAD_ONLY = (
    CarListing.id,
    CarListing.source,
    CarListing.source_id,
    CarListing.url,
    CarListing.title,
    CarListing.make,
    CarListing.model,
    CarListing.year,
    CarListing.price_lkr,
    CarListing.mileage,
    CarListing.fuel_type,
    CarListing.transmission,
    CarListing.engine_capacity,
    CarListing.condition,
    CarListing.body_type,
    CarListing.vehicle_category,
    CarListing.district,
    CarListing.city,
    CarListing.thumbnail_url,
    CarListing.images,
    CarListing.scraped_at,
    CarListing.first_seen_at,
    CarListing.last_seen_at,
    CarListing.deal_score,
    CarListing.market_median_lkr,
    CarListing.is_outlier,
)


def to_utc_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def number_or_none(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        value = float(value)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isfinite(number):
        return number
    return None


def listing_to_dict(row: CarListing) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "source": row.source,
        "source_id": row.source_id,
        "url": row.url,
        "detail_url": row.url,
        "external_url": row.url,
        "title": row.title or "",
        "make": row.make or "",
        "model": row.model or "",
        "year": int(row.year) if row.year is not None else None,
        "price_lkr": number_or_none(row.price_lkr),
        "mileage": int(row.mileage) if row.mileage is not None else None,
        "mileage_km": int(row.mileage) if row.mileage is not None else None,
        "fuel_type": row.fuel_type,
        "transmission": row.transmission,
        "engine_capacity": int(row.engine_capacity) if row.engine_capacity is not None else None,
        "engine_cc": int(row.engine_capacity) if row.engine_capacity is not None else None,
        "condition": row.condition,
        "body_type": row.body_type,
        "vehicle_category": row.vehicle_category,
        "district": row.district,
        "city": row.city,
        # Stored rows can still hold a tiny source grid crop; cards render the
        # upgraded URL so old listings get sharp art without a re-scrape.
        "thumbnail_url": upgrade_thumbnail_url(row.thumbnail_url),
        # Full gallery as upgraded URLs (primary photo first); empty when the
        # scraper only knew the thumbnail — the frontend falls back to it.
        "images": [
            upgrade_thumbnail_url(url) or url for url in parse_image_list(row.images)
        ],
        "scraped_at": to_utc_iso(row.scraped_at),
        "first_seen_at": to_utc_iso(row.first_seen_at),
        "last_seen_at": to_utc_iso(row.last_seen_at),
        "deal_score": number_or_none(row.deal_score),
        "market_median_lkr": number_or_none(row.market_median_lkr),
        "is_outlier": bool(row.is_outlier),
    }


def query_latest_listings(
    db: Session,
    limit: int = LATEST_LISTINGS_LIMIT,
) -> list[dict[str, Any]]:
    """Newest live listings by discovery time (first_seen_at), matching GET /listings?sort=newest."""
    if limit <= 0:
        return []
    rows = (
        db.query(CarListing)
        .options(load_only(*LISTING_SNAPSHOT_LOAD_ONLY))
        .filter(live_listing_filter())
        .order_by(desc(CarListing.first_seen_at), desc(CarListing.id))
        .limit(limit)
        .all()
    )
    return [listing_to_dict(row) for row in rows]
