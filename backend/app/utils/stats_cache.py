"""Materialized cache for heavy aggregate stats endpoints.

``refresh_stats_cache(db)`` precomputes ``summary``, ``district_prices``,
``district_velocity``, ``trends`` (default params), ``insights``, and
``price_index`` payloads and stores them in ``market_stats_cache``.

Stale-while-revalidate policy: each key has its own TTL (see
``CACHE_TTLS``). The read helpers default to ``allow_stale=True`` so callers
(snapshot/export jobs, degraded API fallbacks) get the newest payload even
when it is expired. Pass ``allow_stale=False`` for a fresh-only read that
returns ``None`` on miss/staleness and signals the caller to recompute live.

``get_cache_meta`` exposes ``stale_age_seconds`` for payloads/headers, and
``with_degraded_flag`` marks a served-stale dict payload so downstream
exporters stay decoupled from analysis success (a failed analysis section
yields ``degraded=True`` data, never a hard failure).

``store_*_cache`` helpers let endpoints persist a result they just computed
so the next caller gets a cache hit.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import structlog
from sqlalchemy import case, func, and_, desc
from sqlalchemy.orm import Session

from app.models.schemas import DistrictVelocityPoint, DistrictVelocityResponse, StatsSummary
from app.utils.districts import (
    SL_DISTRICT_COORDS,
    count_canonical_districts,
    find_district_from_url,
    normalize_district_name,
)
from app.utils.pricing import build_district_median_map, median_from_values
from app.utils.time import utc_now
from db.models import CarListing, MarketStatsCache, PriceAggregate, live_listing_filter

log = structlog.get_logger()


def invalidate_stats_cache(db: Session, *, key: Optional[str] = None) -> int:
    """Drop cached market stats so the next read recomputes.

    Call after mutations that change the numbers users see (deal-score
    refresh, outlier pass, dedup, listing lifecycle). Without this the
    15min–24h TTLs keep serving stale summaries for hours.
    """
    query = db.query(MarketStatsCache)
    if key:
        query = query.filter(MarketStatsCache.cache_key == key)
    deleted = query.delete(synchronize_session=False)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    if deleted:
        log.info("stats_cache_invalidated", deleted=deleted, key=key)
    return int(deleted)


CACHE_TTL_SECONDS = 3600  # legacy default; kept for unknown keys
SUMMARY_TTL_SECONDS = 900  # 15 min — counts move with every sync
DISTRICT_PRICES_TTL_SECONDS = 3600  # 1 h
VELOCITY_TTL_SECONDS = 3600  # 1 h
INSIGHTS_TTL_SECONDS = 3600  # 1 h
TRENDS_TTL_SECONDS = 6 * 3600  # 6 h — monthly aggregates move slowly
PRICE_INDEX_TTL_SECONDS = 24 * 3600  # 24 h — mix-adjusted monthly index
_MIN_PRICE_LKR = 100_000
_TRENDS_CACHE_PREFIX = "trends:"
_INSIGHTS_CACHE_KEY = "insights"
_PRICE_INDEX_CACHE_KEY = "price_index"

CACHE_TTLS: dict[str, int] = {
    "summary": SUMMARY_TTL_SECONDS,
    "district_prices": DISTRICT_PRICES_TTL_SECONDS,
    "district_velocity": VELOCITY_TTL_SECONDS,
    "insights": INSIGHTS_TTL_SECONDS,
    "price_index": PRICE_INDEX_TTL_SECONDS,
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def ttl_for_key(key: str) -> int:
    """Return the TTL seconds for *key* (trends keys share one TTL)."""
    if key.startswith(_TRENDS_CACHE_PREFIX):
        return TRENDS_TTL_SECONDS
    return CACHE_TTLS.get(key, CACHE_TTL_SECONDS)


def get_cache_anchor(db: Session, key: str) -> Optional[str]:
    """Return an identity string for the current ``market_stats_cache`` entry.

    Format: ``"<key>:<refreshed_at iso8601>"`` or ``None`` when no entry
    exists. Callers use it to key process-local memory entries (see
    ``app.utils.memory_cache``) so any DB-side invalidation — TTL expiry,
    row deletion, exporter refresh — changes the anchor and the stale
    memory payload is bypassed automatically. The DB stays the single
    freshness authority; memory only avoids re-transferring and re-parsing
    a payload it already built from this exact entry.

    Cost: one scalar SELECT (``refreshed_at`` only — the payload column is
    NOT loaded), so the per-request overhead is ~tens of bytes.
    """
    refreshed = (
        db.query(MarketStatsCache.refreshed_at)
        .filter(MarketStatsCache.cache_key == key)
        .first()
    )
    if refreshed is None or refreshed[0] is None:
        return None
    value = refreshed[0]
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return f"{key}:{value.isoformat()}"


def _entry_age_seconds(entry: MarketStatsCache) -> Optional[float]:
    refreshed = entry.refreshed_at
    if refreshed is None:
        return None
    if refreshed.tzinfo is None:
        refreshed = refreshed.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - refreshed).total_seconds())


def _is_fresh(entry: MarketStatsCache, ttl_seconds: Optional[int] = None) -> bool:
    """Return True when *entry* was refreshed within its TTL window."""
    age = _entry_age_seconds(entry)
    if age is None:
        return False
    ttl = ttl_seconds if ttl_seconds is not None else ttl_for_key(entry.cache_key)
    return age < ttl


def _get_entry(db: Session, key: str) -> Optional[MarketStatsCache]:
    return db.query(MarketStatsCache).filter(MarketStatsCache.cache_key == key).first()


def _upsert(db: Session, key: str, payload: dict) -> None:
    now = datetime.now(timezone.utc)
    entry = _get_entry(db, key)
    if entry is None:
        db.add(MarketStatsCache(cache_key=key, payload=payload, refreshed_at=now))
    else:
        entry.payload = payload
        entry.refreshed_at = now
    db.commit()


def _stable_hash(payload: dict) -> str:
    serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]


def build_trends_cache_key(
    *,
    make: Optional[str],
    model: Optional[str],
    condition: Optional[str],
    district: Optional[str],
    months: int,
) -> str:
    normalized_payload = {
        "make": (make or "").strip().lower() or None,
        "model": (model or "").strip().lower() or None,
        "condition": (condition or "").strip().lower() or None,
        "district": (district or "").strip().lower() or None,
        "months": int(months),
    }
    return f"{_TRENDS_CACHE_PREFIX}{_stable_hash(normalized_payload)}"


# ---------------------------------------------------------------------------
# Public read helpers
# ---------------------------------------------------------------------------


def get_cached_summary(
    db: Session,
    *,
    allow_stale: bool = True,
) -> Optional[StatsSummary]:
    """Return cached ``StatsSummary`` or ``None`` on miss/staleness."""
    entry = _get_entry(db, "summary")
    if entry is None:
        return None
    if not allow_stale and not _is_fresh(entry):
        return None
    try:
        return StatsSummary.model_validate(entry.payload)
    except Exception as exc:
        log.warning("stats_cache_summary_parse_error", error=str(exc))
        return None


def get_cached_district_prices(
    db: Session,
    *,
    allow_stale: bool = True,
) -> Optional[dict]:
    """Return cached district-prices payload or ``None`` on miss/staleness."""
    entry = _get_entry(db, "district_prices")
    if entry is None:
        return None
    if not allow_stale and not _is_fresh(entry):
        return None
    payload = entry.payload
    if not isinstance(payload, dict):
        return None
    return payload


def get_cached_district_velocity(
    db: Session,
    *,
    allow_stale: bool = True,
) -> Optional[DistrictVelocityResponse]:
    """Return cached district-velocity payload or ``None`` on miss/staleness."""
    entry = _get_entry(db, "district_velocity")
    if entry is None:
        return None
    if not allow_stale and not _is_fresh(entry):
        return None
    try:
        return DistrictVelocityResponse.model_validate(entry.payload)
    except Exception as exc:
        log.warning("stats_cache_district_velocity_parse_error", error=str(exc))
        return None


def get_cached_trends(
    db: Session,
    cache_key: str,
    *,
    allow_stale: bool = True,
) -> Optional[dict]:
    entry = _get_entry(db, cache_key)
    if entry is None:
        return None
    if not allow_stale and not _is_fresh(entry):
        return None
    payload = entry.payload
    if not isinstance(payload, dict):
        return None
    return payload


def get_cached_insights(
    db: Session,
    *,
    allow_stale: bool = True,
) -> Optional[dict]:
    entry = _get_entry(db, _INSIGHTS_CACHE_KEY)
    if entry is None:
        return None
    if not allow_stale and not _is_fresh(entry):
        return None
    payload = entry.payload
    if not isinstance(payload, dict):
        return None
    return payload


def get_cached_price_index(
    db: Session,
    *,
    allow_stale: bool = True,
) -> Optional[dict]:
    entry = _get_entry(db, _PRICE_INDEX_CACHE_KEY)
    if entry is None:
        return None
    if not allow_stale and not _is_fresh(entry):
        return None
    payload = entry.payload
    if not isinstance(payload, dict):
        return None
    return payload


# ---------------------------------------------------------------------------
# Staleness metadata + degraded envelopes (SWR / export decoupling)
# ---------------------------------------------------------------------------


def get_cache_age_seconds(db: Session, key: str) -> Optional[float]:
    """Return seconds since *key* was refreshed, or ``None`` when absent."""
    entry = _get_entry(db, key)
    if entry is None:
        return None
    return _entry_age_seconds(entry)


def get_cache_meta(db: Session, key: str) -> dict:
    """Return freshness metadata for *key* (never raises).

    Shape: ``{cache_key, present, refreshed_at, age_seconds, ttl_seconds,
    is_stale}``. Snapshot/export jobs and API stale fallbacks use
    ``stale_age_seconds`` for payloads/headers.
    """
    entry = _get_entry(db, key)
    ttl = ttl_for_key(key)
    if entry is None:
        return {
            "cache_key": key,
            "present": False,
            "refreshed_at": None,
            "stale_age_seconds": None,
            "ttl_seconds": ttl,
            "is_stale": True,
        }
    age = _entry_age_seconds(entry)
    refreshed = entry.refreshed_at
    if refreshed is not None and refreshed.tzinfo is None:
        refreshed = refreshed.replace(tzinfo=timezone.utc)
    return {
        "cache_key": key,
        "present": True,
        "refreshed_at": refreshed.isoformat() if refreshed else None,
        "stale_age_seconds": round(age, 1) if age is not None else None,
        "ttl_seconds": ttl,
        "is_stale": (age is None) or (age >= ttl),
    }


def with_degraded_flag(
    payload: dict,
    *,
    stale_age_seconds: Optional[float],
    reason: str = "stale_cache",
) -> dict:
    """Return *payload* marked as served-stale (degraded, never failing).

    Lets exporters stay decoupled from analysis success: a failed analysis
    section still yields ``degraded=True`` data with ``stale_age_seconds``
    instead of raising.
    """
    if not isinstance(payload, dict):
        return payload
    if payload.get("degraded") is True:
        return payload
    return {
        **payload,
        "degraded": True,
        "degraded_reason": reason,
        "stale_age_seconds": round(stale_age_seconds, 1)
        if stale_age_seconds is not None
        else None,
    }


def read_export_section(
    db: Session,
    key: str,
    *,
    miss_factory: Optional[Callable[[], object]] = None,
) -> dict:
    """Best-effort read for snapshot/export jobs; never raises.

    Fresh payload → as-is. Stale payload → ``degraded=True`` envelope with
    ``stale_age_seconds``. Miss → ``miss_factory()`` (or empty degraded
    envelope) so one failed analysis section never fails the whole export.
    """
    try:
        meta = get_cache_meta(db, key)
        entry = _get_entry(db, key)
        if entry is not None and isinstance(entry.payload, dict):
            if meta["is_stale"]:
                return with_degraded_flag(
                    entry.payload,
                    stale_age_seconds=meta["stale_age_seconds"],
                )
            return entry.payload
        if miss_factory is not None:
            try:
                fallback = miss_factory()
                if isinstance(fallback, dict):
                    return fallback
            except Exception as exc:
                log.warning("stats_cache_export_section_miss_failed", key=key, error=str(exc))
    except Exception as exc:
        log.warning("stats_cache_export_section_error", key=key, error=str(exc))
    return {
        "degraded": True,
        "degraded_reason": "cache_miss",
        "stale_age_seconds": None,
    }


# ---------------------------------------------------------------------------
# Public write helpers (used by endpoints after inline computation)
# ---------------------------------------------------------------------------


def store_summary_cache(db: Session, result: StatsSummary) -> None:
    """Persist *result* to the cache; swallows all errors (non-fatal)."""
    try:
        _upsert(db, "summary", result.model_dump(mode="json"))
    except Exception as exc:
        log.warning("stats_cache_store_summary_error", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


def store_district_prices_cache(db: Session, result: dict) -> None:
    """Persist district-prices *result* to the cache; swallows all errors."""
    try:
        _upsert(db, "district_prices", result)
    except Exception as exc:
        log.warning("stats_cache_store_district_prices_error", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


def store_district_velocity_cache(db: Session, result: DistrictVelocityResponse) -> None:
    """Persist district-velocity *result* to the cache; swallows all errors."""
    try:
        _upsert(db, "district_velocity", result.model_dump(mode="json"))
    except Exception as exc:
        log.warning("stats_cache_store_district_velocity_error", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


def store_trends_cache(db: Session, cache_key: str, result: dict) -> None:
    try:
        _upsert(db, cache_key, result)
    except Exception as exc:
        log.warning("stats_cache_store_trends_error", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


def store_insights_cache(db: Session, result: dict) -> None:
    try:
        _upsert(db, _INSIGHTS_CACHE_KEY, result)
    except Exception as exc:
        log.warning("stats_cache_store_insights_error", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


def store_price_index_cache(db: Session, result: dict) -> None:
    try:
        _upsert(db, _PRICE_INDEX_CACHE_KEY, result)
    except Exception as exc:
        log.warning("stats_cache_store_price_index_error", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Standalone refresh (called from run_sync.py)
# ---------------------------------------------------------------------------


def _compute_summary(db: Session) -> dict:
    """Replicate the summary computation and return a JSON-safe dict."""
    seven_days_ago = utc_now() - timedelta(days=7)

    total = (
        db.query(func.count(CarListing.id))
        .filter(live_listing_filter())
        .scalar()
        or 0
    )
    avg_price = (
        db.query(func.avg(CarListing.price_lkr))
        .filter(live_listing_filter(), CarListing.price_lkr.isnot(None))
        .scalar()
    )
    good_deals = (
        db.query(func.count(CarListing.id))
        .filter(CarListing.deal_score >= 20, live_listing_filter())
        .scalar()
        or 0
    )
    this_week = (
        db.query(func.count(CarListing.id))
        .filter(CarListing.first_seen_at >= seven_days_ago)
        .scalar()
        or 0
    )
    districts = count_canonical_districts(
        db.query(CarListing).filter(
            CarListing.district.isnot(None),
            live_listing_filter(),
        )
    )
    source_count = (
        db.query(func.count(func.distinct(CarListing.source)))
        .filter(live_listing_filter(), CarListing.source.isnot(None))
        .scalar()
        or 0
    )
    last_updated = (
        db.query(
            func.max(
                func.coalesce(
                    CarListing.scraped_at,
                    CarListing.last_seen_at,
                    CarListing.first_seen_at,
                )
            )
        )
        .filter(live_listing_filter())
        .scalar()
    )

    price_change_mom = None
    now = utc_now()
    cur_y, cur_m = now.year, now.month
    prev_m, prev_y = (cur_m - 1, cur_y) if cur_m > 1 else (12, cur_y - 1)
    cur_avg = (
        db.query(func.avg(PriceAggregate.avg_price_lkr))
        .filter(
            PriceAggregate.period_year == cur_y,
            PriceAggregate.period_month == cur_m,
        )
        .scalar()
    )
    prev_avg = (
        db.query(func.avg(PriceAggregate.avg_price_lkr))
        .filter(
            PriceAggregate.period_year == prev_y,
            PriceAggregate.period_month == prev_m,
        )
        .scalar()
    )
    if cur_avg and prev_avg and float(prev_avg) > 0:
        price_change_mom = round(
            ((float(cur_avg) - float(prev_avg)) / float(prev_avg)) * 100, 1
        )

    summary = StatsSummary(
        total_listings=total,
        avg_price_lkr=float(avg_price) if avg_price else None,
        price_change_mom=price_change_mom,
        good_deals_count=good_deals,
        listings_this_week=this_week,
        districts_covered=districts,
        district_count=int(districts),
        source_count=int(source_count),
        last_updated=last_updated,
    )
    return summary.model_dump(mode="json")


def _compute_district_prices(db: Session) -> dict:
    """Replicate the district-prices computation and return the response dict."""
    median_by_district = build_district_median_map(db)
    results = (
        db.query(
            CarListing.district,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(
            CarListing.district.isnot(None),
            CarListing.price_lkr.isnot(None),
            live_listing_filter(),
        )
        .group_by(CarListing.district)
        .order_by(desc("count"))
        .all()
    )

    points: list[dict] = []
    inferred_mode = (
        len(results) <= 1
        and len(results) > 0
        and str(results[0][0] or "").strip().lower() == "sri lanka"
    )

    if inferred_mode:
        rows = (
            db.query(
                CarListing.district,
                CarListing.url,
                CarListing.price_lkr,
                CarListing.make,
                CarListing.model,
            )
            .filter(CarListing.price_lkr.isnot(None), live_listing_filter())
            .all()
        )

        agg: dict[str, dict] = {}
        for district, url, price, make, model in rows:
            normalized = normalize_district_name(district)
            if normalized == "Sri Lanka" or normalized is None:
                normalized = find_district_from_url(url)
            if not normalized:
                continue
            item = agg.setdefault(
                normalized, {"count": 0, "total": 0.0, "model_counts": {}, "prices": []}
            )
            item["count"] += 1
            item["total"] += float(price)
            item["prices"].append(float(price))
            make_model = f"{str(make or '').strip()} {str(model or '').strip()}".strip()
            if make_model:
                item["model_counts"][make_model] = item["model_counts"].get(make_model, 0) + 1

        for district, values in agg.items():
            coords = SL_DISTRICT_COORDS.get(district)
            if not coords or values["count"] <= 0:
                continue
            avg_price = values["total"] / values["count"]
            district_median = median_from_values(values["prices"]) or avg_price
            top_model_name = None
            top_model_count = None
            if values["model_counts"]:
                top_model_name, top_model_count = sorted(
                    values["model_counts"].items(),
                    key=lambda kv: kv[1],
                    reverse=True,
                )[0]
            top_make = None
            top_model_label = None
            if top_model_name:
                parts = top_model_name.split(" ", 1)
                top_make = parts[0] if parts else None
                top_model_label = parts[1] if len(parts) > 1 else None

            points.append(
                {
                    "district": district,
                    "lat": coords[0],
                    "lng": coords[1],
                    "count": values["count"],
                    "avg_price_lkr": round(float(avg_price), 2),
                    "median_price_lkr": round(float(district_median), 2),
                    "top_make": top_make,
                    "top_model": top_model_label,
                    "top_model_count": int(top_model_count) if top_model_count else None,
                }
            )
        points.sort(key=lambda p: p["count"], reverse=True)
        return {"points": points}

    model_results = (
        db.query(
            CarListing.district,
            CarListing.make,
            CarListing.model,
            func.count(CarListing.id).label("model_count"),
        )
        .filter(
            CarListing.district.isnot(None),
            CarListing.make.isnot(None),
            CarListing.model.isnot(None),
            live_listing_filter(),
        )
        .group_by(CarListing.district, CarListing.make, CarListing.model)
        .all()
    )

    top_model_by_district: dict[str, dict] = {}
    for district, make, model, model_count in model_results:
        normalized = normalize_district_name(district)
        if not normalized:
            continue
        current = top_model_by_district.get(normalized)
        count_int = int(model_count or 0)
        if current is None or count_int > current["count"]:
            top_model_by_district[normalized] = {
                "make": str(make),
                "model": str(model),
                "count": count_int,
            }

    for district, count, avg_price in results:
        normalized = normalize_district_name(district)
        if not normalized:
            continue
        coords = SL_DISTRICT_COORDS.get(normalized)
        if coords and avg_price:
            top = top_model_by_district.get(normalized)
            district_median = median_by_district.get(normalized, float(avg_price))
            points.append(
                {
                    "district": normalized,
                    "lat": coords[0],
                    "lng": coords[1],
                    "count": count,
                    "avg_price_lkr": round(float(avg_price), 2),
                    "median_price_lkr": round(float(district_median), 2),
                    "top_make": top["make"] if top else None,
                    "top_model": top["model"] if top else None,
                    "top_model_count": top["count"] if top else None,
                }
            )

    return {"points": points}


def compute_district_velocity(db: Session) -> DistrictVelocityResponse:
    """Compute district demand velocity in a single grouped query."""
    now = utc_now()
    seven_days_ago = now - timedelta(days=7)
    first_seen_ts = func.coalesce(CarListing.first_seen_at, CarListing.scraped_at)

    rows = (
        db.query(
            CarListing.district,
            func.count(CarListing.id).label("listing_count"),
            func.sum(case((first_seen_ts >= seven_days_ago, 1), else_=0)).label("new_7d_count"),
        )
        .filter(
            CarListing.district.isnot(None),
            live_listing_filter(),
        )
        .group_by(CarListing.district)
        .all()
    )

    agg: dict[str, dict] = {}
    for row in rows:
        normalized = normalize_district_name(str(row.district))
        if not normalized or normalized == "Sri Lanka":
            continue
        coords = SL_DISTRICT_COORDS.get(normalized)
        if not coords:
            continue
        total = int(row.listing_count or 0)
        new_7d = int(row.new_7d_count or 0)
        velocity = round(new_7d / total, 4) if total > 0 else 0.0

        entry = agg.get(normalized)
        if entry is None:
            agg[normalized] = {
                "district": normalized,
                "lat": coords[0],
                "lng": coords[1],
                "listing_count": total,
                "new_7d_count": new_7d,
                "velocity_score": velocity,
            }
        else:
            combined_total = entry["listing_count"] + total
            combined_new = entry["new_7d_count"] + new_7d
            agg[normalized] = {
                **entry,
                "listing_count": combined_total,
                "new_7d_count": combined_new,
                "velocity_score": (
                    round(combined_new / combined_total, 4) if combined_total > 0 else 0.0
                ),
            }

    points = sorted(agg.values(), key=lambda p: p["listing_count"], reverse=True)
    return DistrictVelocityResponse(
        points=[DistrictVelocityPoint.model_validate(p) for p in points],
        generated_at=now,
    )


def refresh_stats_cache(db: Session) -> None:
    """Precompute and persist default heavy-stat payloads.

    Designed to be called from the post-scrape pipeline (``run_sync.py``) so
    that the first API hit after a sync finds warm cache instead of running
    expensive aggregates on demand.
    """
    from app.api.v1.endpoints import stats as stats_module

    log.info("stats_cache_refresh_started")
    try:
        summary_payload = _compute_summary(db)
        _upsert(db, "summary", summary_payload)
        log.info("stats_cache_summary_stored")
    except Exception as exc:
        log.error("stats_cache_summary_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass

    try:
        district_payload = _compute_district_prices(db)
        _upsert(db, "district_prices", district_payload)
        log.info("stats_cache_district_prices_stored")
    except Exception as exc:
        log.error("stats_cache_district_prices_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass

    try:
        velocity = compute_district_velocity(db)
        _upsert(db, "district_velocity", velocity.model_dump(mode="json"))
        log.info("stats_cache_district_velocity_stored")
    except Exception as exc:
        log.error("stats_cache_district_velocity_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass

    try:
        trends_payload = stats_module._compute_price_trends_payload(
            make=None,
            model=None,
            condition=None,
            district=None,
            months=12,
            db=db,
        )
        trends_key = build_trends_cache_key(
            make=None,
            model=None,
            condition=None,
            district=None,
            months=12,
        )
        _upsert(db, trends_key, trends_payload)
        log.info("stats_cache_trends_default_stored")
    except Exception as exc:
        log.error("stats_cache_trends_default_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass

    try:
        insights_payload = stats_module._compute_dashboard_insights_payload(db)
        _upsert(db, _INSIGHTS_CACHE_KEY, insights_payload)
        log.info("stats_cache_insights_stored")
    except Exception as exc:
        log.error("stats_cache_insights_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass

    try:
        price_index_payload = stats_module._compute_price_index_payload(db)
        _upsert(db, _PRICE_INDEX_CACHE_KEY, price_index_payload)
        log.info("stats_cache_price_index_stored")
    except Exception as exc:
        log.error("stats_cache_price_index_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass

    log.info("stats_cache_refresh_completed")
