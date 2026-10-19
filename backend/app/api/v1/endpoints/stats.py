import asyncio
import json
import os
import re

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import case, func, desc, and_, or_
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.utils.districts import (
    SL_DISTRICT_COORDS,
    count_canonical_districts,
    find_district_from_url,
    normalize_district_name,
)
from app.utils.import_era import classify_import_era, era_label, FREEZE_BOUNDARY_YEAR
from app.utils.pricing import build_district_median_map, median_from_values, median_price_for_listings
from app.utils.memory_cache import get_cached as _mem_get
from app.utils.memory_cache import set_cached as _mem_set
from app.utils.memory_cache import MISSING as _MEM_MISS
from app.utils.stats_cache import (
    get_cache_anchor,
)
from app.utils.stats_cache import (
    build_trends_cache_key,
    compute_district_velocity,
    get_cache_age_seconds,
    get_cached_district_prices,
    get_cached_district_velocity,
    get_cached_insights,
    get_cached_price_index,
    get_cached_summary,
    get_cached_trends,
    store_district_prices_cache,
    store_district_velocity_cache,
    store_insights_cache,
    store_price_index_cache,
    store_summary_cache,
    store_trends_cache,
    with_degraded_flag,
)
from app.utils.time import utc_now
from app.utils.plan_limits import (
    FREE_EV_MODELS_LIMIT,
    FREE_TRENDS_MONTHS,
    is_free_browse_plan,
    take_last_months,
)
from app.utils.request_access import resolve_request_access
from db.session import SessionLocal, get_db
from db.models import CarListing, PriceAggregate, ScrapeRun, live_listing_filter
from app.models.schemas import StatsSummary, DistrictPrice
from app.models.schemas import DashboardInsightsResponse, DistrictQuickInsightResponse
from app.models.schemas import DistrictVelocityResponse
from app.models.schemas import PriceIndexResponse
from app.utils.price_index import build_price_index
from app.services.rate_limit import RateLimiter
from app.services.model_price_history import build_model_price_history
from app.utils.listing_snapshot import query_latest_listings

_stats_rate_limiter = RateLimiter(max_requests=300, window_seconds=60)

router = APIRouter(dependencies=[Depends(_stats_rate_limiter)])
MIN_REASONABLE_PRICE_LKR = 100_000

# Process-local TTL cache in front of the materialized market_stats_cache.
# Repeat hits within the TTL cost ZERO database round-trips (Neon egress);
# after expiry the normal DB-side cache/fresh-recompute flow runs. Listings
# land 2-3x/day, so 5 minutes of payload staleness is well inside budget.
STATS_MEMORY_TTL_SECONDS = int(os.getenv("STATS_MEMORY_CACHE_TTL_SECONDS", "300"))

LIVE_STREAM_INTERVAL_SECONDS = int(os.getenv("LIVE_STREAM_INTERVAL_SECONDS", "120"))
RECENT_SUCCESS_HOURS = 24

MAX_SSE_CONNECTIONS: int = int(os.getenv("SSE_MAX_CONNECTIONS", "50"))
# Set DISABLE_LIVE_SSE=true during egress incidents so clients fall back to polling/snapshots.
DISABLE_LIVE_SSE = os.getenv("DISABLE_LIVE_SSE", "false").strip().lower() in {"1", "true", "yes"}
_sse_active_connections: int = 0

def _to_utc(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _is_running_scrape(run: ScrapeRun, now: datetime) -> bool:
    started_at = _to_utc(run.started_at)
    return (
        str(run.status or "").upper() == "RUNNING"
        and started_at is not None
        and run.finished_at is None
        and now - started_at <= timedelta(hours=6)
    )


def _is_recent_success(run: ScrapeRun, now: datetime) -> bool:
    finished_at = _to_utc(run.finished_at)
    return (
        str(run.status or "").upper() == "SUCCESS"
        and finished_at is not None
        and now - finished_at <= timedelta(hours=RECENT_SUCCESS_HOURS)
    )


def build_live_market_snapshot(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    priced_clause = and_(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )
    listing_metrics = db.query(
        func.max(func.coalesce(CarListing.scraped_at, CarListing.last_seen_at, CarListing.first_seen_at)).label("latest_listing_at"),
        func.count(CarListing.id).label("total_listings"),
        func.sum(case((priced_clause, 1), else_=0)).label("priced_listings"),
        func.sum(
            case(
                (
                    and_(
                        live_listing_filter(),
                        or_(CarListing.price_lkr.is_(None), CarListing.price_lkr < MIN_REASONABLE_PRICE_LKR),
                    ),
                    1,
                ),
                else_=0,
            )
        ).label("unavailable_listings"),
        func.avg(case((priced_clause, CarListing.price_lkr), else_=None)).label("avg_price"),
    ).filter(live_listing_filter()).one()

    latest_listing_at = listing_metrics.latest_listing_at
    total_listings = int(listing_metrics.total_listings or 0)
    priced_listings = int(listing_metrics.priced_listings or 0)
    unavailable_listings = int(listing_metrics.unavailable_listings or 0)
    avg_price = listing_metrics.avg_price

    recent_runs = (
        db.query(ScrapeRun)
        .order_by(desc(ScrapeRun.started_at))
        .limit(100)
        .all()
    )
    latest_by_source: dict[str, ScrapeRun] = {}
    active_sources: set[str] = set()
    for run in recent_runs:
        source = str(run.source or "unknown")
        if source not in latest_by_source:
            latest_by_source[source] = run
        if _is_running_scrape(run, now):
            active_sources.add(source)

    for source, run in latest_by_source.items():
        if _is_recent_success(run, now):
            active_sources.add(source)

    latest_run = recent_runs[0] if recent_runs else None
    return {
        "generated_at": now.isoformat(),
        "total_listings": int(total_listings),
        "priced_listings": int(priced_listings),
        "unavailable_price_listings": int(unavailable_listings),
        "avg_price_lkr": round(float(avg_price), 2) if avg_price is not None else None,
        "latest_listing_at": _to_utc(latest_listing_at).isoformat() if latest_listing_at else None,
        "active_scrape_sources": sorted(active_sources),
        "latest_run": {
            "source": str(latest_run.source or "unknown"),
            "status": str(latest_run.status or "UNKNOWN"),
            "started_at": _to_utc(latest_run.started_at).isoformat() if latest_run and latest_run.started_at else None,
            "finished_at": _to_utc(latest_run.finished_at).isoformat() if latest_run and latest_run.finished_at else None,
            "listings_found": int(latest_run.listings_found or 0) if latest_run else 0,
            "listings_new": int(latest_run.listings_new or 0) if latest_run else 0,
            "error_message": (str(latest_run.error_message or "").strip()[:220] or None) if latest_run else None,
        } if latest_run else None,
        "source_status": [
            {
                "source": source,
                "status": str(run.status or "UNKNOWN"),
                "started_at": _to_utc(run.started_at).isoformat() if run.started_at else None,
                "finished_at": _to_utc(run.finished_at).isoformat() if run.finished_at else None,
                "listings_found": int(run.listings_found or 0),
                "listings_new": int(run.listings_new or 0),
            }
            for source, run in sorted(latest_by_source.items())
        ],
        # Cheap homepage feed: rebuilt on every stats-only export so the
        # public grid can show newly discovered ads without a full catalog.
        "latest_listings": query_latest_listings(db),
    }

@router.get("/price-index", response_model=PriceIndexResponse)
def get_price_index(
    request: Request,
    response: Response = None,  # type: ignore[assignment]
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Mix-adjusted monthly used-vehicle price index (overall + top makes)."""
    pi_anchor = get_cache_anchor(db, "price_index")
    if pi_anchor is not None:
        memory_hit = _mem_get(pi_anchor, STATS_MEMORY_TTL_SECONDS)
        if memory_hit is not _MEM_MISS:
            result = memory_hit
        else:
            cached = get_cached_price_index(db, allow_stale=False)
            if cached is not None:
                result = cached
                _mem_set(pi_anchor, cached, STATS_MEMORY_TTL_SECONDS)
            else:
                result = None
    else:
        result = None

    if result is None:
        try:
            result = _compute_price_index_payload(db)
        except Exception:
            stale = get_cached_price_index(db, allow_stale=True)
            if stale is not None:
                age = get_cache_age_seconds(db, "price_index")
                _mark_stale_response(response, age)
                result = with_degraded_flag(stale, stale_age_seconds=age)
            else:
                raise
        else:
            store_price_index_cache(db, result)
            fresh_anchor = get_cache_anchor(db, "price_index")
            if fresh_anchor is not None:
                _mem_set(fresh_anchor, result, STATS_MEMORY_TTL_SECONDS)

    plan, role = resolve_request_access(request, authorization, db)
    if is_free_browse_plan(plan, role=role):
        # Soft-limit: newest N months overall only (no segment breakdown).
        points = take_last_months(list(result.get("points") or []), FREE_TRENDS_MONTHS)
        return {
            **result,
            "points": points,
            "segments": {},
        }
    return result


def _compute_price_index_payload(db: Session) -> dict:
    return build_price_index(db)


def _set_cache_control(response, value: str = "public, max-age=60") -> None:
    if response is not None:
        response.headers["Cache-Control"] = value


def _mark_stale_response(response, age_seconds) -> None:
    """Additive SWR markers for stale fallbacks.

    Typed payloads (StatsSummary / DistrictVelocityResponse) cannot carry
    extra fields through their response_model, so staleness travels via
    headers; dict payloads additionally get the ``degraded`` envelope.
    """
    if response is not None:
        response.headers["X-Cache-Status"] = "stale"
        if age_seconds is not None:
            response.headers["X-Cache-Age"] = str(int(age_seconds))


@router.get("/summary", response_model=StatsSummary)
def get_stats_summary(response: Response = None, db: Session = Depends(get_db)):  # type: ignore[assignment]
    # Memory hit (same materialized entry) → zero payload transfer. The
    # anchor changes whenever the DB-side entry is invalidated, so the
    # documented DELETE FROM market_stats_cache lever keeps working.
    summary_anchor = get_cache_anchor(db, "summary")
    if summary_anchor is not None:
        memory_hit = _mem_get(summary_anchor, STATS_MEMORY_TTL_SECONDS)
        if memory_hit is not _MEM_MISS:
            _set_cache_control(response)
            return memory_hit

    # Serve from materialized cache when fresh (summary TTL: 15 min).
    cached = get_cached_summary(db, allow_stale=False)
    if cached is not None:
        if summary_anchor is not None:
            _mem_set(summary_anchor, cached, STATS_MEMORY_TTL_SECONDS)
        _set_cache_control(response)
        return cached

    try:
        seven_days_ago = utc_now() - timedelta(days=7)

        total = db.query(func.count(CarListing.id)).filter(live_listing_filter()).scalar() or 0
        avg_price = db.query(func.avg(CarListing.price_lkr)).filter(
            live_listing_filter(), CarListing.price_lkr.isnot(None)
        ).scalar()
        good_deals = db.query(func.count(CarListing.id)).filter(
            CarListing.deal_score >= 20, live_listing_filter()
        ).scalar() or 0
        this_week = db.query(func.count(CarListing.id)).filter(
            CarListing.first_seen_at >= seven_days_ago
        ).scalar() or 0
        districts = count_canonical_districts(
            db.query(CarListing).filter(
                CarListing.district.isnot(None),
                live_listing_filter(),
            )
        )
        source_count = db.query(func.count(func.distinct(CarListing.source))).filter(
            live_listing_filter(),
            CarListing.source.isnot(None),
        ).scalar() or 0
        last_updated = db.query(
            func.max(func.coalesce(CarListing.scraped_at, CarListing.last_seen_at, CarListing.first_seen_at))
        ).filter(
            live_listing_filter()
        ).scalar()

        # MoM price change from aggregates
        price_change_mom = None
        now = utc_now()
        cur_y, cur_m = now.year, now.month
        prev_m, prev_y = (cur_m - 1, cur_y) if cur_m > 1 else (12, cur_y - 1)
        cur_avg = db.query(func.avg(PriceAggregate.avg_price_lkr)).filter(
            PriceAggregate.period_year == cur_y, PriceAggregate.period_month == cur_m
        ).scalar()
        prev_avg = db.query(func.avg(PriceAggregate.avg_price_lkr)).filter(
            PriceAggregate.period_year == prev_y, PriceAggregate.period_month == prev_m
        ).scalar()
        if cur_avg and prev_avg and float(prev_avg) > 0:
            price_change_mom = round(((float(cur_avg) - float(prev_avg)) / float(prev_avg)) * 100, 1)

        result = StatsSummary(
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
    except Exception:
        stale = get_cached_summary(db, allow_stale=True)
        if stale is not None:
            _set_cache_control(response)
            _mark_stale_response(response, get_cache_age_seconds(db, "summary"))
            return stale
        raise

    store_summary_cache(db, result)
    fresh_anchor = get_cache_anchor(db, "summary")
    if fresh_anchor is not None:
        _mem_set(fresh_anchor, result, STATS_MEMORY_TTL_SECONDS)
    _set_cache_control(response)
    return result


@router.get("/live", response_model=dict)
def get_live_market_snapshot(db: Session = Depends(get_db)):
    return build_live_market_snapshot(db)


@router.get("/live/stream")
async def stream_live_market_snapshot(request: Request):
    global _sse_active_connections

    if DISABLE_LIVE_SSE:
        return Response(
            status_code=503,
            content=json.dumps({
                "detail": "Live SSE disabled (DISABLE_LIVE_SSE). Use /stats/live polling or CDN snapshots.",
            }),
            media_type="application/json",
            headers={"Retry-After": "60"},
        )

    if _sse_active_connections >= MAX_SSE_CONNECTIONS:
        return Response(
            status_code=503,
            content=json.dumps({"detail": "SSE connection limit reached. Try again later."}),
            media_type="application/json",
            headers={"Retry-After": "30"},
        )

    _sse_active_connections += 1

    async def events():
        global _sse_active_connections

        def _fetch_snapshot() -> dict:
            db = SessionLocal()
            try:
                return build_live_market_snapshot(db)
            finally:
                db.close()

        try:
            while True:
                if await request.is_disconnected():
                    break

                snapshot = await asyncio.to_thread(_fetch_snapshot)

                yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"
                # Sleep in short slices and re-check the client between them,
                # so a disconnect releases the SSE slot within ~1s instead of
                # holding it for the whole interval.
                remaining = float(LIVE_STREAM_INTERVAL_SECONDS)
                disconnected = False
                while remaining > 0:
                    step = min(1.0, remaining)
                    await asyncio.sleep(step)
                    remaining -= step
                    if await request.is_disconnected():
                        disconnected = True
                        break
                if disconnected:
                    break
        finally:
            _sse_active_connections -= 1

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.get("/district-prices")
def get_district_prices(response: Response = None, db: Session = Depends(get_db)):  # type: ignore[assignment]
    # Memory hit (same materialized entry) → zero payload transfer.
    dp_anchor = get_cache_anchor(db, "district_prices")
    if dp_anchor is not None:
        memory_hit = _mem_get(dp_anchor, STATS_MEMORY_TTL_SECONDS)
        if memory_hit is not _MEM_MISS:
            _set_cache_control(response)
            return memory_hit

    # Serve from materialized cache when fresh (district-prices TTL: 1 hour).
    cached = get_cached_district_prices(db, allow_stale=False)
    if cached is not None:
        if dp_anchor is not None:
            _mem_set(dp_anchor, cached, STATS_MEMORY_TTL_SECONDS)
        _set_cache_control(response)
        return cached

    try:
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

        points = []
        inferred_mode = (
            len(results) <= 1
            and len(results) > 0
            and str(results[0][0] or "").strip().lower() == "sri lanka"
        )

        if inferred_mode:
            rows = (
                db.query(CarListing.district, CarListing.url, CarListing.price_lkr, CarListing.make, CarListing.model)
                .filter(
                    CarListing.price_lkr.isnot(None),
                    live_listing_filter(),
                )
                .all()
            )

            agg = {}
            for district, url, price, make, model in rows:
                normalized = normalize_district_name(district)
                if normalized == "Sri Lanka" or normalized is None:
                    normalized = find_district_from_url(url)
                if not normalized:
                    continue
                item = agg.setdefault(normalized, {"count": 0, "total": 0.0, "model_counts": {}, "prices": []})
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
                        key=lambda item: item[1],
                        reverse=True,
                    )[0]
                top_make = None
                top_model = None
                if top_model_name:
                    parts = top_model_name.split(" ", 1)
                    top_make = parts[0] if parts else None
                    top_model = parts[1] if len(parts) > 1 else None

                points.append(
                    {
                        "district": district,
                        "lat": coords[0],
                        "lng": coords[1],
                        "count": values["count"],
                        "avg_price_lkr": round(float(avg_price), 2),
                        "median_price_lkr": round(float(district_median), 2),
                        "top_make": top_make,
                        "top_model": top_model,
                        "top_model_count": int(top_model_count) if top_model_count else None,
                    }
                )
            points.sort(key=lambda p: p["count"], reverse=True)
            result = {"points": points}
            store_district_prices_cache(db, result)
            return result

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

        top_model_by_district = {}
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
                points.append({
                    "district": normalized,
                    "lat": coords[0],
                    "lng": coords[1],
                    "count": count,
                    "avg_price_lkr": round(float(avg_price), 2),
                    "median_price_lkr": round(float(district_median), 2),
                    "top_make": top["make"] if top else None,
                    "top_model": top["model"] if top else None,
                    "top_model_count": top["count"] if top else None,
                })
        result = {"points": points}
    except Exception:
        stale = get_cached_district_prices(db, allow_stale=True)
        if stale is not None:
            age = get_cache_age_seconds(db, "district_prices")
            _set_cache_control(response)
            _mark_stale_response(response, age)
            return with_degraded_flag(stale, stale_age_seconds=age)
        raise

    store_district_prices_cache(db, result)
    fresh_anchor = get_cache_anchor(db, "district_prices")
    if fresh_anchor is not None:
        _mem_set(fresh_anchor, result, STATS_MEMORY_TTL_SECONDS)
    _set_cache_control(response)
    return result

def _trend_response(points, scope: str, note: Optional[str] = None) -> dict:
    return {
        "points": points,
        "coverage_scope": scope,
        "coverage_note": note,
    }


def _aggregate_trend_points(
    db: Session,
    start_year: int,
    start_month: int,
    make_lower: Optional[str],
    model_lower: Optional[str],
    district_lower: Optional[str],
) -> list[dict]:
    q = db.query(
        PriceAggregate.period_year,
        PriceAggregate.period_month,
        func.avg(PriceAggregate.avg_price_lkr).label("avg"),
        func.avg(PriceAggregate.median_price_lkr).label("median"),
        func.sum(PriceAggregate.listing_count).label("count"),
    )
    if make_lower:
        q = q.filter(func.lower(PriceAggregate.make) == make_lower)
    if model_lower:
        q = q.filter(func.lower(PriceAggregate.model) == model_lower)
    if district_lower:
        q = q.filter(func.lower(PriceAggregate.district) == district_lower)
    q = q.filter(
        (PriceAggregate.period_year * 100 + PriceAggregate.period_month)
        >= (start_year * 100 + start_month)
    )

    rows = (
        q.group_by(PriceAggregate.period_year, PriceAggregate.period_month)
        .order_by(PriceAggregate.period_year, PriceAggregate.period_month)
        .all()
    )

    return [
        {
            "year": row.period_year,
            "month": row.period_month,
            "avg_price_lkr": round(float(row.avg), 2) if row.avg else None,
            "median_price_lkr": round(float(row.median), 2) if row.median else None,
            "listing_count": int(row.count or 0),
        }
        for row in rows
    ]


def _listing_trend_points(
    db: Session,
    start_date: Optional[datetime],
    start_year: int,
    start_month: int,
    make_lower: Optional[str],
    model_lower: Optional[str],
    condition_lower: Optional[str],
    district_lower: Optional[str],
) -> list[dict]:
    event_ts = func.coalesce(CarListing.first_seen_at, CarListing.scraped_at, CarListing.last_seen_at)
    period_expr = func.strftime("%Y-%m", event_ts)
    dialect = db.bind.dialect.name if db.bind and db.bind.dialect else ""
    if dialect != "sqlite":
        period_expr = func.to_char(event_ts, "YYYY-MM")

    listing_q = db.query(
        period_expr.label("period"),
        func.avg(CarListing.price_lkr).label("avg"),
        func.avg(CarListing.price_lkr).label("median"),
        func.count(CarListing.id).label("count"),
    ).filter(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
        event_ts.isnot(None),
    )
    if start_date is not None:
        listing_q = listing_q.filter(event_ts >= start_date)
    if make_lower:
        listing_q = listing_q.filter(func.lower(CarListing.make) == make_lower)
    if model_lower:
        listing_q = listing_q.filter(func.lower(CarListing.model) == model_lower)
    if condition_lower:
        listing_q = listing_q.filter(func.lower(CarListing.condition) == condition_lower)
    if district_lower:
        listing_q = listing_q.filter(func.lower(CarListing.district) == district_lower)

    rows = listing_q.group_by(period_expr).order_by(period_expr).all()
    points = []
    for row in rows:
        period = str(row.period or "")
        if not period or len(period) < 7:
            continue

        year = int(period[0:4])
        month = int(period[5:7])
        if start_date is not None and (year * 100 + month) < (start_year * 100 + start_month):
            continue

        points.append(
            {
                "year": year,
                "month": month,
                "avg_price_lkr": round(float(row.avg), 2) if row.avg else None,
                "median_price_lkr": round(float(row.median), 2) if row.median else None,
                "listing_count": int(row.count or 0),
            }
        )
    return points


def _current_snapshot_point(
    db: Session,
    now: datetime,
    make_lower: Optional[str],
    model_lower: Optional[str],
    condition_lower: Optional[str],
    district_lower: Optional[str],
) -> list[dict]:
    q = db.query(
        func.avg(CarListing.price_lkr).label("avg"),
        func.count(CarListing.id).label("count"),
    ).filter(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )
    if make_lower:
        q = q.filter(func.lower(CarListing.make) == make_lower)
    if model_lower:
        q = q.filter(func.lower(CarListing.model) == model_lower)
    if condition_lower:
        q = q.filter(func.lower(CarListing.condition) == condition_lower)
    if district_lower:
        q = q.filter(func.lower(CarListing.district) == district_lower)

    row = q.first()
    if not row or not row.count:
        return []

    avg = round(float(row.avg), 2) if row.avg else None
    return [
        {
            "year": now.year,
            "month": now.month,
            "avg_price_lkr": avg,
            "median_price_lkr": avg,
            "listing_count": int(row.count or 0),
        }
    ]


def _compute_price_trends_payload(
    make: Optional[str] = None,
    model: Optional[str] = None,
    condition: Optional[str] = None,
    district: Optional[str] = None,
    months: int = 12,
    db: Session | None = None,
):
    if db is None:
        raise ValueError("db session is required")
    try:
        months_value = int(months)
    except (TypeError, ValueError):
        months_value = 12

    now = utc_now()
    start_year = now.year
    start_month = now.month - months_value
    while start_month <= 0:
        start_month += 12
        start_year -= 1

    start_date = datetime(start_year, start_month, 1)
    make_lower = make.strip().lower() if make else None
    model_lower = model.strip().lower() if model else None
    condition_lower = condition.strip().lower() if condition else None
    district_lower = district.strip().lower() if district else None

    aggregate_points = []
    if condition_lower is None:
        aggregate_points = _aggregate_trend_points(db, start_year, start_month, make_lower, model_lower, district_lower)
        if len(aggregate_points) >= 2:
            return _trend_response(aggregate_points, "exact")

    exact_points = _listing_trend_points(
        db,
        start_date,
        start_year,
        start_month,
        make_lower,
        model_lower,
        condition_lower,
        district_lower,
    )
    if len(exact_points) >= 2:
        return _trend_response(exact_points, "exact")

    if condition_lower:
        condition_relaxed_aggregate = _aggregate_trend_points(
            db, start_year, start_month, make_lower, model_lower, district_lower
        )
        if len(condition_relaxed_aggregate) >= 2:
            return _trend_response(
                condition_relaxed_aggregate,
                "condition_fallback",
                "Condition-specific samples are thin, so this chart shows the same vehicle lane across all conditions.",
            )

        condition_relaxed_listing = _listing_trend_points(
            db, start_date, start_year, start_month, make_lower, model_lower, None, district_lower
        )
        if len(condition_relaxed_listing) >= 2:
            return _trend_response(
                condition_relaxed_listing,
                "condition_fallback",
                "Condition-specific samples are thin, so this chart shows the same vehicle lane across all conditions.",
            )

    if district_lower:
        district_relaxed_aggregate = []
        if condition_lower is None:
            district_relaxed_aggregate = _aggregate_trend_points(db, start_year, start_month, make_lower, model_lower, None)
            if len(district_relaxed_aggregate) >= 2:
                return _trend_response(
                    district_relaxed_aggregate,
                    "district_fallback",
                    "District samples are thin, so this chart shows the Sri Lanka-wide trend for this vehicle lane.",
                )

        district_relaxed_listing = _listing_trend_points(
            db, start_date, start_year, start_month, make_lower, model_lower, condition_lower, None
        )
        if len(district_relaxed_listing) >= 2:
            return _trend_response(
                district_relaxed_listing,
                "district_fallback",
                "District samples are thin, so this chart shows the Sri Lanka-wide trend for this vehicle lane.",
            )

    if district_lower and condition_lower:
        national_aggregate = _aggregate_trend_points(db, start_year, start_month, make_lower, model_lower, None)
        if len(national_aggregate) >= 2:
            return _trend_response(
                national_aggregate,
                "national_fallback",
                "Exact district and condition samples are thin, so this chart shows the broader national lane.",
            )

        national_listing = _listing_trend_points(
            db, start_date, start_year, start_month, make_lower, model_lower, None, None
        )
        if len(national_listing) >= 2:
            return _trend_response(
                national_listing,
                "national_fallback",
                "Exact district and condition samples are thin, so this chart shows the broader national lane.",
            )

    if exact_points:
        return _trend_response(
            exact_points,
            "partial",
            "Only one recent monthly point is available for this selection. Showing the partial signal while more samples accumulate.",
        )
    if aggregate_points:
        return _trend_response(
            aggregate_points,
            "partial",
            "Only one recent monthly point is available for this selection. Showing the partial signal while more samples accumulate.",
        )

    snapshot_points = _current_snapshot_point(db, now, make_lower, model_lower, condition_lower, district_lower)
    if snapshot_points:
        return _trend_response(
            snapshot_points,
            "current_snapshot",
            "Historical trend samples are still building, so this chart shows the current matching market snapshot.",
        )

    if district_lower or condition_lower:
        broader_snapshot = _current_snapshot_point(db, now, make_lower, model_lower, None, None)
        if broader_snapshot:
            return _trend_response(
                broader_snapshot,
                "current_snapshot_fallback",
                "Exact samples are still building, so this chart shows the current broader national market snapshot.",
            )

    return _trend_response([], "none", "Trend samples are still being collected for this vehicle lane.")


@router.get("/trends")
def get_price_trends(
    request: Request,
    make: Optional[str] = None,
    model: Optional[str] = None,
    condition: Optional[str] = None,
    district: Optional[str] = None,
    months: int = Query(12, ge=3, le=24),
    response: Response = None,  # type: ignore[assignment]
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    try:
        months_value = int(months)
    except (TypeError, ValueError):
        months_value = 12

    plan, role = resolve_request_access(request, authorization, db)
    free_browse = is_free_browse_plan(plan, role=role)
    if free_browse:
        months_value = min(months_value, FREE_TRENDS_MONTHS)
        # Free depth: national overall only (no district/condition filters).
        condition = None
        district = None

    cache_key = build_trends_cache_key(
        make=make,
        model=model,
        condition=condition,
        district=district,
        months=months_value,
    )
    cached = get_cached_trends(db, cache_key, allow_stale=False)
    if cached is not None:
        return cached

    try:
        result = _compute_price_trends_payload(
            make=make,
            model=model,
            condition=condition,
            district=district,
            months=months_value,
            db=db,
        )
    except Exception:
        stale = get_cached_trends(db, cache_key, allow_stale=True)
        if stale is not None:
            age = get_cache_age_seconds(db, cache_key)
            _mark_stale_response(response, age)
            return with_degraded_flag(stale, stale_age_seconds=age)
        raise

    store_trends_cache(db, cache_key, result)
    return result


def _compute_dashboard_insights_payload(db: Session) -> dict:
    now = utc_now()
    day_ago = now - timedelta(hours=24)
    current_30d = now - timedelta(days=30)
    previous_30d = now - timedelta(days=60)

    new_listings_24h = (
        db.query(func.count(CarListing.id))
        .filter(
            CarListing.first_seen_at >= day_ago,
            live_listing_filter(),
        )
        .scalar()
        or 0
    )

    current_segments = (
        db.query(
            CarListing.body_type,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(
            CarListing.body_type.isnot(None),
            CarListing.price_lkr.isnot(None),
            CarListing.scraped_at >= current_30d,
            live_listing_filter(),
        )
        .group_by(CarListing.body_type)
        .all()
    )

    previous_segments = (
        db.query(
            CarListing.body_type,
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(
            CarListing.body_type.isnot(None),
            CarListing.price_lkr.isnot(None),
            CarListing.scraped_at >= previous_30d,
            CarListing.scraped_at < current_30d,
            live_listing_filter(),
        )
        .group_by(CarListing.body_type)
        .all()
    )

    previous_segment_map = {
        str(row.body_type).lower(): float(row.avg_price)
        for row in previous_segments
        if row.body_type and row.avg_price
    }

    segment_performance = []
    for row in current_segments:
        if not row.body_type:
            continue

        current_avg = float(row.avg_price) if row.avg_price else 0.0
        previous_avg = previous_segment_map.get(str(row.body_type).lower())
        change_pct = None
        if previous_avg and previous_avg > 0:
            change_pct = round(((current_avg - previous_avg) / previous_avg) * 100, 1)

        segment_performance.append(
            {
                "segment": str(row.body_type).lower(),
                "listing_count": int(row.count or 0),
                "avg_price_lkr": round(current_avg, 2),
                "change_pct_30d": change_pct,
            }
        )

    segment_performance.sort(key=lambda item: item["listing_count"], reverse=True)
    segment_performance = segment_performance[:6]

    trending_models = (
        db.query(
            CarListing.make,
            CarListing.model,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
            func.max(CarListing.thumbnail_url).label("thumbnail_url"),
        )
        .filter(
            CarListing.make.isnot(None),
            CarListing.model.isnot(None),
            CarListing.price_lkr.isnot(None),
            CarListing.scraped_at >= current_30d,
            live_listing_filter(),
        )
        .group_by(CarListing.make, CarListing.model)
        .order_by(desc("count"))
        .limit(6)
        .all()
    )

    previous_trending_models = (
        db.query(
            CarListing.make,
            CarListing.model,
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(
            CarListing.make.isnot(None),
            CarListing.model.isnot(None),
            CarListing.price_lkr.isnot(None),
            CarListing.scraped_at >= previous_30d,
            CarListing.scraped_at < current_30d,
            live_listing_filter(),
        )
        .group_by(CarListing.make, CarListing.model)
        .all()
    )

    previous_trending_map = {
        (str(row.make).lower(), str(row.model).lower()): float(row.avg_price)
        for row in previous_trending_models
        if row.make and row.model and row.avg_price
    }

    trending_payload = []
    for row in trending_models:
        current_avg = float(row.avg_price) if row.avg_price else 0.0
        previous_avg = previous_trending_map.get(
            (str(row.make).lower(), str(row.model).lower())
        )
        movement_pct = None
        if previous_avg and previous_avg > 0:
            movement_pct = round(((current_avg - previous_avg) / previous_avg) * 100, 1)

        trending_payload.append(
            {
                "make": str(row.make),
                "model": str(row.model),
                "listing_count": int(row.count or 0),
                "avg_price_lkr": round(current_avg, 2),
                "movement_pct": movement_pct,
                "thumbnail_url": str(row.thumbnail_url) if row.thumbnail_url else None,
            }
        )

    hot_deals = (
        db.query(CarListing)
        .filter(
            CarListing.deal_score.isnot(None),
            CarListing.deal_score >= 8,
            CarListing.price_lkr.isnot(None),
            CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
            live_listing_filter(),
        )
        .order_by(desc(CarListing.deal_score), desc(CarListing.scraped_at))
        .limit(10)
        .all()
    )

    hot_deal_payload = [
        {
            "id": row.id,
            "make": row.make,
            "model": row.model,
            "year": row.year,
            "district": row.district,
            "source": row.source,
            "price_lkr": float(row.price_lkr),
            "deal_score": float(row.deal_score) if row.deal_score is not None else 0.0,
            "thumbnail_url": row.thumbnail_url,
        }
        for row in hot_deals
    ]

    return {
        "new_listings_24h": int(new_listings_24h),
        "segment_performance": segment_performance,
        "trending_models": trending_payload,
        "hot_deals": hot_deal_payload,
    }


@router.get("/insights", response_model=DashboardInsightsResponse)
def get_dashboard_insights(
    response: Response = None,  # type: ignore[assignment]
    db: Session = Depends(get_db),
):
    ins_anchor = get_cache_anchor(db, "insights")
    if ins_anchor is not None:
        memory_hit = _mem_get(ins_anchor, STATS_MEMORY_TTL_SECONDS)
        if memory_hit is not _MEM_MISS:
            return memory_hit

    cached = get_cached_insights(db, allow_stale=False)
    if cached is not None:
        _mem_set(ins_anchor, cached, STATS_MEMORY_TTL_SECONDS)
        return cached

    try:
        result = _compute_dashboard_insights_payload(db)
    except Exception:
        stale = get_cached_insights(db, allow_stale=True)
        if stale is not None:
            age = get_cache_age_seconds(db, "insights")
            _mark_stale_response(response, age)
            return with_degraded_flag(stale, stale_age_seconds=age)
        raise

    store_insights_cache(db, result)
    fresh_anchor = get_cache_anchor(db, "insights")
    if fresh_anchor is not None:
        _mem_set(fresh_anchor, result, STATS_MEMORY_TTL_SECONDS)
    return result


@router.get("/make-model-insight")
def get_make_model_insight(
    make: str = Query(..., min_length=1),
    model: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    make_lower = make.strip().lower()
    model_lower = model.strip().lower()

    base_clause = and_(
        live_listing_filter(),
        func.lower(CarListing.make) == make_lower,
        func.lower(CarListing.model) == model_lower,
    )
    priced_clause = and_(
        base_clause,
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )

    total = db.query(func.count(CarListing.id)).filter(base_clause).scalar() or 0
    avg_price = db.query(func.avg(CarListing.price_lkr)).filter(priced_clause).scalar()
    median_price = median_price_for_listings(db, priced_clause)

    top_districts_rows = (
        db.query(
            CarListing.district,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(base_clause, CarListing.district.isnot(None))
        .group_by(CarListing.district)
        .order_by(desc("count"))
        .limit(6)
        .all()
    )

    canonical = db.query(CarListing.make, CarListing.model).filter(base_clause).first()
    canonical_make = str(canonical.make) if canonical else make.strip().title()
    canonical_model = str(canonical.model) if canonical else model.strip().title()

    return {
        "make": canonical_make,
        "model": canonical_model,
        "total": int(total),
        "avg_price_lkr": round(float(avg_price), 2) if avg_price is not None else None,
        "median_price_lkr": round(float(median_price), 2) if median_price is not None else None,
        "top_districts": [
            {
                "district": str(row.district),
                "count": int(row.count),
                "avg_price_lkr": round(float(row.avg_price), 2) if row.avg_price is not None else None,
            }
            for row in top_districts_rows
            if row.district
        ],
    }


@router.get("/model-price-history")
def get_model_price_history(
    make: str = Query(..., min_length=1),
    model: str = Query(..., min_length=1),
    from_year: int = Query(2000, ge=1950, le=2100),
    to_year: int = Query(2026, ge=1950, le=2100),
    db: Session = Depends(get_db),
):
    """Calendar-time + YOM cross-section price history for a make/model.

    Combines Motormila ``price_aggregates``, Wayback/CSV
    ``historical_price_observations``, and today's live listings by
    manufacture year (explicitly labeled so YOM is not mistaken for history).
    """
    if to_year < from_year:
        from_year, to_year = to_year, from_year
    return build_model_price_history(
        db,
        make=make,
        model=model,
        from_year=from_year,
        to_year=to_year,
    )


@router.get("/make-insight")
def get_make_insight(
    make: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Programmatic SEO hub payload for /cars/:make (all models for a make).

    Model rows are canonicalized in Python (misspellings folded, phone
    numbers / trim-word leaks / cross-make values dropped, case variants
    merged) so the hub shows real models instead of scrape noise. Returns
    both ``top_models`` (top 12, for the hero grid) and ``all_models`` (the
    full cleaned list, for the "all models" browser).
    """
    from app.utils.make_canonical import (
        canonicalize_model,
        compact_key,
        model_contains_foreign_make,
    )

    # "land-rover" / "land_rover" -> "land rover": hub URLs use slugs, the DB
    # stores display names.
    make_normalized = re.sub(r"[-_]+", " ", make.strip()).strip()
    make_lower = make_normalized.lower()

    base_clause = and_(
        live_listing_filter(),
        func.lower(CarListing.make) == make_lower,
    )
    priced_clause = and_(
        base_clause,
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )

    total = db.query(func.count(CarListing.id)).filter(base_clause).scalar() or 0
    avg_price = db.query(func.avg(CarListing.price_lkr)).filter(priced_clause).scalar()
    median_price = median_price_for_listings(db, priced_clause)

    # Pull a wide net of raw model rows, then canonicalize + merge in Python:
    # junk rows ("Other Model", phone numbers, "Suv") are dropped and case
    # variants ("Wira"/"wira") merge instead of splitting the model.
    model_rows = (
        db.query(
            CarListing.model,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(base_clause, CarListing.model.isnot(None))
        .group_by(CarListing.model)
        .order_by(desc("count"))
        .all()
    )
    merged: dict[str, dict] = {}
    for row in model_rows:
        if not row.model:
            continue
        canonical = canonicalize_model(row.model)
        if not canonical:
            continue
        # Cross-feed misattribution ("Toyota Aqua" under Land Rover).
        if model_contains_foreign_make(row.model, make_normalized):
            continue
        key = compact_key(canonical)
        bucket = merged.get(key)
        if bucket is None:
            merged[key] = {
                "model": canonical,
                "count": int(row.count or 0),
                "price_total": float(row.avg_price or 0) * int(row.count or 0),
            }
        else:
            # Keep the most common raw variant's display form.
            if int(row.count or 0) > bucket["count"]:
                bucket["model"] = canonical
            bucket["count"] += int(row.count or 0)
            bucket["price_total"] += float(row.avg_price or 0) * int(row.count or 0)
    all_models = [
        {
            "model": bucket["model"],
            "count": bucket["count"],
            "avg_price_lkr": round(bucket["price_total"] / bucket["count"], 2) if bucket["count"] else None,
        }
        for bucket in sorted(merged.values(), key=lambda b: b["count"], reverse=True)
    ]

    top_districts_rows = (
        db.query(
            CarListing.district,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(base_clause, CarListing.district.isnot(None))
        .group_by(CarListing.district)
        .order_by(desc("count"))
        .limit(12)
        .all()
    )

    canonical = db.query(CarListing.make).filter(base_clause).first()
    canonical_make = str(canonical.make) if canonical else make_normalized.title()

    return {
        "make": canonical_make,
        "total": int(total),
        "avg_price_lkr": round(float(avg_price), 2) if avg_price is not None else None,
        "median_price_lkr": round(float(median_price), 2) if median_price is not None else None,
        "top_models": all_models[:12],
        "all_models": all_models,
        "top_districts": [
            {
                "district": str(row.district),
                "count": int(row.count),
                "avg_price_lkr": round(float(row.avg_price), 2) if row.avg_price is not None else None,
            }
            for row in top_districts_rows
            if row.district and compact_key(str(row.district)) != "srilanka"
        ][:6],
    }


_FUEL_CATEGORY_MAP: dict[str, str] = {
    "petrol": "petrol",
    "gasoline": "petrol",
    "diesel": "diesel",
    "hybrid": "hybrid",
    "plugin_hybrid": "hybrid",
    "phev": "hybrid",
    "electric": "electric",
    "ev": "electric",
}

_ORDERED_FUEL_CATEGORIES = ["petrol", "hybrid", "electric", "diesel", "other"]


@router.get("/fuel-mix")
def get_fuel_mix(db: Session = Depends(get_db)):
    rows = (
        db.query(
            CarListing.fuel_type,
            func.count(CarListing.id).label("count"),
        )
        .filter(live_listing_filter())
        .group_by(CarListing.fuel_type)
        .all()
    )

    totals: dict[str, int] = {cat: 0 for cat in _ORDERED_FUEL_CATEGORIES}

    for row in rows:
        raw = str(row.fuel_type or "").strip().lower().replace(" ", "_").replace("-", "_")
        category = _FUEL_CATEGORY_MAP.get(raw, "other")
        totals[category] += int(row.count or 0)

    total = sum(totals.values())

    buckets = [
        {
            "fuel_type": ft,
            "count": totals[ft],
            "pct": round(totals[ft] / total * 100, 1) if total > 0 else 0.0,
        }
        for ft in _ORDERED_FUEL_CATEGORIES
    ]

    return {
        "total": total,
        "buckets": buckets,
        "generated_at": utc_now().isoformat(),
    }


_HYBRID_FUEL_TYPES = {"hybrid", "plugin_hybrid", "phev"}

_HYBRID_BANDS: list[dict] = [
    {"key": "le1500", "label": "≤1500cc", "cc_max": 1500},
    {"key": "1501_2000", "label": "1501–2000cc", "cc_max": 2000},
    {"key": "gt2000", "label": ">2000cc", "cc_max": None},
]


def _classify_hybrid_band(cc: int) -> str:
    if cc <= 1500:
        return "le1500"
    if cc <= 2000:
        return "1501_2000"
    return "gt2000"


@router.get("/hybrid-bands")
def get_hybrid_bands(db: Session = Depends(get_db)):
    rows = (
        db.query(
            CarListing.engine_capacity,
            CarListing.price_lkr,
        )
        .filter(
            live_listing_filter(),
            func.lower(CarListing.fuel_type).in_(list(_HYBRID_FUEL_TYPES)),
            CarListing.engine_capacity.isnot(None),
        )
        .all()
    )

    band_counts: dict[str, int] = {b["key"]: 0 for b in _HYBRID_BANDS}
    band_prices: dict[str, list[float]] = {b["key"]: [] for b in _HYBRID_BANDS}

    for row in rows:
        cc = int(row.engine_capacity)
        key = _classify_hybrid_band(cc)
        band_counts[key] += 1
        if row.price_lkr and float(row.price_lkr) >= MIN_REASONABLE_PRICE_LKR:
            band_prices[key].append(float(row.price_lkr))

    result_bands = []
    for band in _HYBRID_BANDS:
        key = band["key"]
        prices = sorted(band_prices[key])
        n = len(prices)
        if n == 0:
            median_price = None
        elif n % 2 == 1:
            median_price = prices[n // 2]
        else:
            median_price = (prices[n // 2 - 1] + prices[n // 2]) / 2.0

        result_bands.append(
            {
                "label": band["label"],
                "cc_max": band["cc_max"],
                "count": band_counts[key],
                "median_price_lkr": round(median_price, 2) if median_price is not None else None,
            }
        )

    return {
        "total_hybrids": sum(band_counts.values()),
        "bands": result_bands,
        "generated_at": utc_now().isoformat(),
    }


@router.get("/source-quality")
def get_source_quality(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    fresh_ts = func.coalesce(
        CarListing.scraped_at, CarListing.last_seen_at, CarListing.first_seen_at
    )

    rows = (
        db.query(
            CarListing.source,
            func.count(CarListing.id).label("total"),
            func.sum(
                case(
                    (
                        and_(
                            CarListing.price_lkr.isnot(None),
                            CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("priced"),
            func.sum(
                case((fresh_ts >= cutoff_24h, 1), else_=0)
            ).label("fresh_24h"),
            func.sum(
                case((CarListing.is_outlier == True, 1), else_=0)
            ).label("outliers"),
            func.sum(
                case((CarListing.is_duplicate == True, 1), else_=0)
            ).label("duplicates"),
        )
        .filter(CarListing.source.isnot(None))
        .group_by(CarListing.source)
        .order_by(desc("total"))
        .all()
    )

    sources = []
    for row in rows:
        total = int(row.total or 0)
        if total == 0:
            continue
        priced = int(row.priced or 0)
        fresh = int(row.fresh_24h or 0)
        outliers = int(row.outliers or 0)
        duplicates = int(row.duplicates or 0)
        sources.append(
            {
                "source": str(row.source),
                "listing_count": total,
                "price_fill_rate": round(priced / total, 4),
                "fresh_24h_pct": round(fresh / total, 4),
                "outlier_rate": round(outliers / total, 4),
                "duplicate_rate": round(duplicates / total, 4),
            }
        )

    return {
        "generated_at": now.isoformat(),
        "sources": sources,
    }


@router.get("/district-insight", response_model=DistrictQuickInsightResponse)
def get_district_quick_insight(
    district: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
):
    normalized = normalize_district_name(district) or " ".join(district.strip().split()).title()
    district_slug = normalized.lower().replace(" ", "-")
    district_clause = and_(
        live_listing_filter(),
        or_(
            func.lower(CarListing.district) == normalized.lower(),
            func.lower(CarListing.url).ilike(f"%-for-sale-{district_slug}%"),
        ),
    )
    now = utc_now()
    current_30d = now - timedelta(days=30)
    previous_30d = now - timedelta(days=60)

    base = db.query(CarListing).filter(district_clause)

    listing_count = base.count()

    avg_price = (
        db.query(func.avg(CarListing.price_lkr))
        .filter(
            district_clause,
            CarListing.price_lkr.isnot(None),
        )
        .scalar()
    )

    current_avg = (
        db.query(func.avg(CarListing.price_lkr))
        .filter(
            district_clause,
            CarListing.price_lkr.isnot(None),
            CarListing.scraped_at >= current_30d,
        )
        .scalar()
    )

    previous_avg = (
        db.query(func.avg(CarListing.price_lkr))
        .filter(
            district_clause,
            CarListing.price_lkr.isnot(None),
            CarListing.scraped_at >= previous_30d,
            CarListing.scraped_at < current_30d,
        )
        .scalar()
    )

    change_pct_30d = None
    if current_avg and previous_avg and float(previous_avg) > 0:
        change_pct_30d = round(((float(current_avg) - float(previous_avg)) / float(previous_avg)) * 100, 1)

    top_models = (
        db.query(
            CarListing.make,
            CarListing.model,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(
            district_clause,
            CarListing.make.isnot(None),
            CarListing.model.isnot(None),
        )
        .group_by(CarListing.make, CarListing.model)
        .order_by(desc("count"))
        .limit(4)
        .all()
    )

    district_median = median_price_for_listings(db, district_clause)

    return {
        "district": normalized,
        "listing_count": int(listing_count),
        "avg_price_lkr": round(float(avg_price), 2) if avg_price else None,
        "median_price_lkr": round(float(district_median), 2) if district_median is not None else None,
        "change_pct_30d": change_pct_30d,
        "top_models": [
            {
                "make": str(row.make),
                "model": str(row.model),
                "listing_count": int(row.count or 0),
                "avg_price_lkr": round(float(row.avg_price), 2) if row.avg_price else 0.0,
            }
            for row in top_models
        ],
    }


_EV_FUEL_TYPES = {"electric", "ev"}


def _median_price(values: list[float]) -> Optional[float]:
    if not values:
        return None
    sorted_values = sorted(values)
    count = len(sorted_values)
    if count % 2 == 1:
        return round(sorted_values[count // 2], 2)
    return round((sorted_values[count // 2 - 1] + sorted_values[count // 2]) / 2.0, 2)


@router.get("/ev-insight")
def get_ev_insight(
    request: Request,
    top_n: int = Query(5, ge=1, le=20),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """EV market share, top models, median price, and Toyota Aqua hybrid benchmark."""
    plan, role = resolve_request_access(request, authorization, db)
    effective_top_n = top_n
    if is_free_browse_plan(plan, role=role):
        effective_top_n = min(top_n, FREE_EV_MODELS_LIMIT)
    now = utc_now()

    priced_clause = and_(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )

    ev_clause = and_(
        live_listing_filter(),
        func.lower(CarListing.fuel_type).in_(list(_EV_FUEL_TYPES)),
        # The EV hub tracks passenger vehicles — two-wheelers (e-bikes,
        # e-scooters) would otherwise drag the median price down.
        or_(
            CarListing.vehicle_category.is_(None),
            func.lower(CarListing.vehicle_category) != "motorbikes",
        ),
    )
    ev_priced_clause = and_(
        ev_clause,
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )

    total_count = db.query(func.count(CarListing.id)).filter(live_listing_filter()).scalar() or 0
    ev_count = db.query(func.count(CarListing.id)).filter(ev_clause).scalar() or 0
    ev_pct = round(ev_count / total_count * 100, 2) if total_count > 0 else 0.0

    ev_price_rows = (
        db.query(CarListing.price_lkr)
        .filter(ev_priced_clause)
        .all()
    )
    ev_prices = [float(row.price_lkr) for row in ev_price_rows]
    median_ev_price = _median_price(ev_prices)

    top_models_rows = (
        db.query(
            CarListing.make,
            CarListing.model,
            func.count(CarListing.id).label("listing_count"),
        )
        .filter(ev_clause, CarListing.make.isnot(None), CarListing.model.isnot(None))
        .group_by(CarListing.make, CarListing.model)
        .order_by(desc("listing_count"))
        .limit(effective_top_n)
        .all()
    )

    model_median_by_key: dict[tuple[str, str], Optional[float]] = {}
    model_keys = [
        (str(row.make).strip().lower(), str(row.model).strip().lower())
        for row in top_models_rows
    ]
    model_filters = [
        and_(
            func.lower(CarListing.make) == make_key,
            func.lower(CarListing.model) == model_key,
        )
        for make_key, model_key in model_keys
    ]
    if model_filters:
        dialect_name = db.bind.dialect.name if db.bind and db.bind.dialect else ""
        if dialect_name == "sqlite":
            grouped_price_rows = (
                db.query(
                    func.lower(CarListing.make).label("make_key"),
                    func.lower(CarListing.model).label("model_key"),
                    func.group_concat(CarListing.price_lkr, ",").label("prices_blob"),
                )
                .filter(ev_priced_clause, or_(*model_filters))
                .group_by(func.lower(CarListing.make), func.lower(CarListing.model))
                .all()
            )
            for grouped_row in grouped_price_rows:
                prices_blob = str(grouped_row.prices_blob or "")
                prices = [float(value) for value in prices_blob.split(",") if value]
                model_median_by_key[(str(grouped_row.make_key), str(grouped_row.model_key))] = _median_price(prices)
        else:
            grouped_price_rows = (
                db.query(
                    func.lower(CarListing.make).label("make_key"),
                    func.lower(CarListing.model).label("model_key"),
                    func.array_agg(CarListing.price_lkr).label("prices_array"),
                )
                .filter(ev_priced_clause, or_(*model_filters))
                .group_by(func.lower(CarListing.make), func.lower(CarListing.model))
                .all()
            )
            for grouped_row in grouped_price_rows:
                prices = [float(value) for value in (grouped_row.prices_array or []) if value is not None]
                model_median_by_key[(str(grouped_row.make_key), str(grouped_row.model_key))] = _median_price(prices)

    top_ev_models = []
    for row in top_models_rows:
        model_median = model_median_by_key.get(
            (str(row.make).strip().lower(), str(row.model).strip().lower())
        )
        top_ev_models.append(
            {
                "make": str(row.make),
                "model": str(row.model),
                "listing_count": int(row.listing_count or 0),
                "median_price_lkr": model_median,
            }
        )

    aqua_clause = and_(
        live_listing_filter(),
        func.lower(CarListing.make) == "toyota",
        func.lower(CarListing.model) == "aqua",
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )
    aqua_price_rows = db.query(CarListing.price_lkr).filter(aqua_clause).all()
    aqua_prices = [float(row.price_lkr) for row in aqua_price_rows]
    an = len(aqua_prices)
    aqua_median = _median_price(aqua_prices)

    return {
        "ev_count": int(ev_count),
        "ev_pct": ev_pct,
        "median_ev_price_lkr": median_ev_price,
        "top_ev_models": top_ev_models,
        "hybrid_benchmark": {
            "make": "Toyota",
            "model": "Aqua",
            "median_price_lkr": aqua_median,
            "listing_count": int(an),
        },
        "generated_at": now.isoformat(),
    }


@router.get("/district-velocity", response_model=DistrictVelocityResponse)
def get_district_velocity(response: Response = None, db: Session = Depends(get_db)):  # type: ignore[assignment]
    dv_anchor = get_cache_anchor(db, "district_velocity")
    if dv_anchor is not None:
        memory_hit = _mem_get(dv_anchor, STATS_MEMORY_TTL_SECONDS)
        if memory_hit is not _MEM_MISS:
            _set_cache_control(response)
            return memory_hit

    cached = get_cached_district_velocity(db, allow_stale=False)
    if cached is not None:
        _mem_set(dv_anchor, cached, STATS_MEMORY_TTL_SECONDS)
        _set_cache_control(response)
        return cached

    try:
        result = compute_district_velocity(db)
    except Exception:
        stale = get_cached_district_velocity(db, allow_stale=True)
        if stale is not None:
            _set_cache_control(response)
            _mark_stale_response(response, get_cache_age_seconds(db, "district_velocity"))
            return stale
        raise

    store_district_velocity_cache(db, result)
    fresh_anchor = get_cache_anchor(db, "district_velocity")
    if fresh_anchor is not None:
        _mem_set(fresh_anchor, result, STATS_MEMORY_TTL_SECONDS)
    _set_cache_control(response)
    return result


# ---------------------------------------------------------------------------
# Import-era split: pre-freeze (≤2024) vs post-freeze (≥2025)
# ---------------------------------------------------------------------------

_ERA_TOP_MAKES_LIMIT = 10


def get_import_era_split(db: Session, top_n: int = _ERA_TOP_MAKES_LIMIT) -> dict:
    """Return median prices and listing counts per import era for the top makes.

    Uses year as a proxy for import timing: vehicles manufactured up to and
    including 2024 are classified as pre-freeze stock; 2025 onwards are
    post-freeze.  Only non-outlier, priced listings with a known year are
    considered.

    ``top_n`` controls how many makes (by total listing count) are returned.
    """
    eligible = and_(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
        CarListing.year.isnot(None),
        CarListing.make.isnot(None),
    )

    # ── rank makes by total eligible listing volume ───────────────────────
    make_counts = (
        db.query(CarListing.make, func.count(CarListing.id).label("total"))
        .filter(eligible)
        .group_by(CarListing.make)
        .order_by(desc("total"))
        .limit(top_n)
        .all()
    )
    top_makes = [str(row.make) for row in make_counts]
    if not top_makes:
        return {"makes": [], "generated_at": utc_now().isoformat()}

    # ── fetch (make, year, price_lkr) for the top makes ───────────────────
    rows = (
        db.query(CarListing.make, CarListing.year, CarListing.price_lkr)
        .filter(eligible, CarListing.make.in_(top_makes))
        .all()
    )

    # ── bucket into {make -> {era -> [prices]}} ────────────────────────────
    buckets: dict[str, dict[str, list[float]]] = {
        make: {"pre_freeze": [], "post_freeze": []}
        for make in top_makes
    }
    for make, year, price_lkr in rows:
        era = classify_import_era(year)
        if era is None:
            continue
        key = str(make)
        if key not in buckets:
            continue
        buckets[key][era].append(float(price_lkr))

    # ── assemble response ──────────────────────────────────────────────────
    makes_out = []
    for make in top_makes:
        era_data: dict[str, dict] = {}
        for era_key in ("pre_freeze", "post_freeze"):
            prices = buckets[make][era_key]
            median_val = median_from_values(prices)
            era_data[era_key] = {
                "era": era_key,
                "label": era_label(era_key),  # type: ignore[arg-type]
                "count": len(prices),
                "median_price_lkr": round(median_val, 2) if median_val is not None else None,
            }
        makes_out.append({"make": make, **era_data})

    return {
        "makes": makes_out,
        "freeze_boundary_year": FREEZE_BOUNDARY_YEAR,
        "generated_at": utc_now().isoformat(),
    }


@router.get("/import-era-split")
def import_era_split_endpoint(
    top_n: int = Query(default=_ERA_TOP_MAKES_LIMIT, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """Pre-2025 vs post-2025 import-freeze cohort median prices per make."""
    return get_import_era_split(db=db, top_n=top_n)
