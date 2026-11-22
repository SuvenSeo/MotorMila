from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from app.utils.price_verdict import plausible_deal_score, plausible_deal_score_sql
from app.utils.districts import count_canonical_districts
from app.utils.sql_median import median_price_expr, median_price_for_query, python_median
from app.utils.time import utc_now
from statistics import median
from typing import Annotated, Iterable, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.orm import Session

from app.models.schemas import (
    DistrictTopModel,
    LaneSparkPoint,
    MarketPulse,
    MarketPulseDailySupplyPoint,
    MarketPulseDaysToClear,
    MarketPulseDealScoreBand,
    MarketPulsePriceCutShare,
    MarketPulsePriceDecile,
    ProArbitrageGap,
    ProBreakdownPoint,
    ProDetailPayload,
    ProDistrictProfile,
    ProListingSample,
    ProMarketSnapshot,
    ProMetric,
    ProTrendPoint,
    ProVehicleLane,
)
from app.services.rate_limit import RateLimiter
from db.models import CarListing, PriceAggregate, VehiclePriceHistory, live_listing_filter
from db.session import get_db

_pro_rate_limiter = RateLimiter(max_requests=120, window_seconds=60)

router = APIRouter(dependencies=[Depends(_pro_rate_limiter)])

MIN_REASONABLE_PRICE_LKR = 100_000
SOURCE_LABELS = {
    "ikman": "Ikman",
    "riyasewana": "Riyasewana",
    "autolanka": "AutoLanka",
    "autodirect": "AutoDirect",
    "patpat": "Patpat",
    "autostream": "AutoStream",
    "carshop": "Carshop",
    "saleme": "SaleMe",
    "riyahub": "Riyahub",
    "dimo": "Cars at DIMO",
}


def _num(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _median(values: Iterable[object]) -> Optional[float]:
    numbers = [_num(value) for value in values]
    clean = [value for value in numbers if value is not None and value >= MIN_REASONABLE_PRICE_LKR]
    if not clean:
        return None
    return round(float(median(clean)), 2)


def _median_price_expr(db: Session):
    return median_price_expr(db, CarListing.price_lkr)


def _median_price_for_query(db: Session, query) -> Optional[float]:
    return median_price_for_query(db, query, CarListing.price_lkr, min_value=MIN_REASONABLE_PRICE_LKR)


def _scope_metrics(db: Session, query, *, include_deal_score: bool = False) -> dict[str, Optional[float] | int]:
    fields = [
        func.count(CarListing.id).label("count"),
        func.avg(CarListing.price_lkr).label("avg_price"),
        func.min(CarListing.price_lkr).label("min_price"),
        func.max(CarListing.price_lkr).label("max_price"),
    ]
    if include_deal_score:
        fields.append(func.avg(CarListing.deal_score).label("avg_deal_score"))
    median_expr = _median_price_expr(db)
    if median_expr is not None:
        fields.append(median_expr)

    row = query.with_entities(*fields).one()
    return {
        "count": int(row.count or 0),
        "avg_price_lkr": _num(row.avg_price),
        "median_price_lkr": _num(getattr(row, "median_price", None)) if median_expr is not None else _median_price_for_query(db, query),
        "min_price_lkr": _num(row.min_price),
        "max_price_lkr": _num(row.max_price),
        "avg_deal_score": _num(getattr(row, "avg_deal_score", None)) if include_deal_score else None,
    }


def _price_query(db: Session):
    return db.query(CarListing).filter(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
    )


def _apply_listing_scope(
    query,
    *,
    make: Optional[str] = None,
    model: Optional[str] = None,
    district: Optional[str] = None,
    condition: Optional[str] = None,
):
    if make:
        query = query.filter(CarListing.make.ilike(f"%{make.strip()}%"))
    if model:
        query = query.filter(CarListing.model.ilike(f"%{model.strip()}%"))
    if district:
        normalized = " ".join(district.strip().lower().replace("-", " ").split())
        district_slug = normalized.replace(" ", "-")
        district_expr = func.lower(func.replace(CarListing.district, "-", " "))
        raw_location_expr = func.lower(func.replace(CarListing.raw_location, "-", " "))
        query = query.filter(
            or_(
                district_expr.ilike(f"%{normalized}%"),
                raw_location_expr.ilike(f"%{normalized}%"),
                func.lower(CarListing.url).ilike(f"%-for-sale-{district_slug}%"),
            )
        )
    if condition:
        query = query.filter(func.lower(CarListing.condition) == condition.strip().lower())
    return query


def _listing_sample(row: CarListing) -> ProListingSample:
    return ProListingSample(
        id=int(row.id),
        title=str(row.title or f"{row.make} {row.model}").strip(),
        make=str(row.make or ""),
        model=str(row.model or ""),
        year=int(row.year) if row.year is not None else None,
        price_lkr=_num(row.price_lkr),
        district=str(row.district) if row.district else None,
        source=str(row.source or "unknown"),
        deal_score=plausible_deal_score(row),
        thumbnail_url=str(row.thumbnail_url) if row.thumbnail_url else None,
        detail_url=str(row.url) if row.url else None,
        external_url=str(row.url) if row.url else None,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
    )


def _share(count: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((count / total) * 100, 1)


def _source_label(value: str) -> str:
    key = str(value or "").strip().lower()
    return SOURCE_LABELS.get(key, key.replace("-", " ").title() or "Unknown")


def _breakdown(db: Session, field, *, total: int, limit: int = 8, **scope) -> list[ProBreakdownPoint]:
    rows = (
        _apply_listing_scope(_price_query(db), **scope)
        .with_entities(
            field.label("label"),
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
            func.max(func.coalesce(CarListing.last_seen_at, CarListing.scraped_at, CarListing.first_seen_at)).label("latest"),
        )
        .filter(field.isnot(None))
        .group_by(field)
        .order_by(desc("count"))
        .limit(limit)
        .all()
    )

    return [
        ProBreakdownPoint(
            label=_source_label(row.label) if field is CarListing.source else str(row.label),
            count=int(row.count or 0),
            share_pct=_share(int(row.count or 0), total),
            avg_price_lkr=_num(row.avg_price),
            latest_seen_at=row.latest,
        )
        for row in rows
        if row.label
    ]


def _trend_points(db: Session, *, make: Optional[str] = None, model: Optional[str] = None, district: Optional[str] = None) -> list[ProTrendPoint]:
    query = db.query(
        PriceAggregate.period_year,
        PriceAggregate.period_month,
        func.avg(PriceAggregate.avg_price_lkr).label("avg_price"),
        func.avg(PriceAggregate.median_price_lkr).label("median_price"),
        func.sum(PriceAggregate.listing_count).label("listing_count"),
    )
    if make:
        query = query.filter(func.lower(PriceAggregate.make) == make.strip().lower())
    if model:
        query = query.filter(func.lower(PriceAggregate.model) == model.strip().lower())
    if district:
        query = query.filter(func.lower(PriceAggregate.district) == district.strip().lower())

    rows = (
        query.group_by(PriceAggregate.period_year, PriceAggregate.period_month)
        .order_by(PriceAggregate.period_year, PriceAggregate.period_month)
        .limit(24)
        .all()
    )

    if rows:
        return [
            ProTrendPoint(
                month=f"{int(row.period_year):04d}-{int(row.period_month):02d}",
                avg_price_lkr=_num(row.avg_price),
                median_price_lkr=_num(row.median_price),
                listing_count=int(row.listing_count or 0),
            )
            for row in rows
        ]

    event_ts = func.coalesce(CarListing.first_seen_at, CarListing.scraped_at)
    period_expr = func.strftime("%Y-%m", event_ts)
    if db.bind and db.bind.dialect and db.bind.dialect.name != "sqlite":
        period_expr = func.to_char(event_ts, "YYYY-MM")

    fallback = _apply_listing_scope(_price_query(db), make=make, model=model, district=district)
    rows = (
        fallback.with_entities(
            period_expr.label("period"),
            func.avg(CarListing.price_lkr).label("avg_price"),
            func.count(CarListing.id).label("listing_count"),
        )
        .filter(event_ts.isnot(None))
        .group_by(period_expr)
        .order_by(period_expr)
        .limit(24)
        .all()
    )
    return [
        ProTrendPoint(
            month=str(row.period),
            avg_price_lkr=_num(row.avg_price),
            median_price_lkr=_num(row.avg_price),
            listing_count=int(row.listing_count or 0),
        )
        for row in rows
        if row.period
    ]


def _top_models(db: Session, *, district: Optional[str] = None, limit: int = 5) -> list[DistrictTopModel]:
    rows = (
        _apply_listing_scope(_price_query(db), district=district)
        .with_entities(
            CarListing.make,
            CarListing.model,
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .filter(CarListing.make.isnot(None), CarListing.model.isnot(None))
        .group_by(CarListing.make, CarListing.model)
        .order_by(desc("count"))
        .limit(limit)
        .all()
    )
    return [
        DistrictTopModel(
            make=str(row.make),
            model=str(row.model),
            listing_count=int(row.count or 0),
            avg_price_lkr=_num(row.avg_price) or 0.0,
        )
        for row in rows
    ]


def _samples(db: Session, *, limit: int = 8, **scope) -> list[ProListingSample]:
    rows = (
        _apply_listing_scope(_price_query(db), **scope)
        .order_by(desc(CarListing.deal_score), desc(CarListing.first_seen_at))
        .limit(limit)
        .all()
    )
    return [_listing_sample(row) for row in rows]


def _bulk_top_label_by_pair(db: Session, scoped_query, group_col) -> dict[tuple[str, str], str]:
    """One row_number() window query giving the top `group_col` value for every (make, model) pair
    present in `scoped_query`, instead of one query per pair."""
    grouped = (
        scoped_query.with_entities(
            CarListing.make.label("make"),
            CarListing.model.label("model"),
            group_col.label("label"),
            func.count(CarListing.id).label("count"),
        )
        .filter(group_col.isnot(None))
        .group_by(CarListing.make, CarListing.model, group_col)
        .subquery()
    )
    ranked = select(
        grouped.c.make,
        grouped.c.model,
        grouped.c.label,
        func.row_number()
        .over(partition_by=(grouped.c.make, grouped.c.model), order_by=desc(grouped.c.count))
        .label("rn"),
    ).subquery()

    rows = db.execute(select(ranked).where(ranked.c.rn == 1)).all()
    is_source = group_col is CarListing.source
    return {
        (str(row.make), str(row.model)): (_source_label(row.label) if is_source else str(row.label))
        for row in rows
    }


def _bulk_median_by_pair(db: Session, scoped_query) -> dict[tuple[str, str], Optional[float]]:
    """Python-side median per (make, model) pair from a single query, used as the SQLite fallback
    when the dialect has no percentile_cont()."""
    rows = scoped_query.with_entities(CarListing.make, CarListing.model, CarListing.price_lkr).all()
    buckets: dict[tuple[str, str], list[float]] = defaultdict(list)
    for make, model, price in rows:
        if price is not None:
            buckets[(str(make), str(model))].append(float(price))
    return {key: python_median(prices, min_value=MIN_REASONABLE_PRICE_LKR) for key, prices in buckets.items()}


def _bulk_district_top_models(db: Session, districts: list[str], *, limit: int = 5) -> dict[str, list[DistrictTopModel]]:
    if not districts:
        return {}
    grouped = (
        _price_query(db)
        .filter(CarListing.district.in_(districts), CarListing.make.isnot(None), CarListing.model.isnot(None))
        .with_entities(
            CarListing.district.label("district"),
            CarListing.make.label("make"),
            CarListing.model.label("model"),
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
        )
        .group_by(CarListing.district, CarListing.make, CarListing.model)
        .subquery()
    )
    ranked = select(
        grouped.c.district,
        grouped.c.make,
        grouped.c.model,
        grouped.c.count,
        grouped.c.avg_price,
        func.row_number().over(partition_by=grouped.c.district, order_by=desc(grouped.c.count)).label("rn"),
    ).subquery()

    rows = db.execute(select(ranked).where(ranked.c.rn <= limit).order_by(ranked.c.district, ranked.c.rn)).all()
    result: dict[str, list[DistrictTopModel]] = defaultdict(list)
    for row in rows:
        result[str(row.district)].append(
            DistrictTopModel(
                make=str(row.make),
                model=str(row.model),
                listing_count=int(row.count or 0),
                avg_price_lkr=_num(row.avg_price) or 0.0,
            )
        )
    return dict(result)


def _bulk_district_source_mix(
    db: Session, districts: list[str], district_totals: dict[str, int], *, limit: int = 8
) -> dict[str, list[ProBreakdownPoint]]:
    if not districts:
        return {}
    grouped = (
        _price_query(db)
        .filter(CarListing.district.in_(districts), CarListing.source.isnot(None))
        .with_entities(
            CarListing.district.label("district"),
            CarListing.source.label("source"),
            func.count(CarListing.id).label("count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
            func.max(func.coalesce(CarListing.last_seen_at, CarListing.scraped_at, CarListing.first_seen_at)).label("latest"),
        )
        .group_by(CarListing.district, CarListing.source)
        .subquery()
    )
    ranked = select(
        grouped.c.district,
        grouped.c.source,
        grouped.c.count,
        grouped.c.avg_price,
        grouped.c.latest,
        func.row_number().over(partition_by=grouped.c.district, order_by=desc(grouped.c.count)).label("rn"),
    ).subquery()

    rows = db.execute(select(ranked).where(ranked.c.rn <= limit).order_by(ranked.c.district, ranked.c.rn)).all()
    result: dict[str, list[ProBreakdownPoint]] = defaultdict(list)
    for row in rows:
        total = district_totals.get(str(row.district), 0)
        count = int(row.count or 0)
        result[str(row.district)].append(
            ProBreakdownPoint(
                label=_source_label(row.source),
                count=count,
                share_pct=_share(count, total),
                avg_price_lkr=_num(row.avg_price),
                latest_seen_at=row.latest,
            )
        )
    return dict(result)


def _bulk_district_samples(db: Session, districts: list[str], *, limit: int = 5) -> dict[str, list[ProListingSample]]:
    if not districts:
        return {}
    windowed = select(
        CarListing.id,
        CarListing.title,
        CarListing.make,
        CarListing.model,
        CarListing.year,
        CarListing.price_lkr,
        CarListing.district,
        CarListing.source,
        CarListing.deal_score,
        CarListing.thumbnail_url,
        CarListing.url,
        CarListing.first_seen_at,
        CarListing.last_seen_at,
        func.row_number()
        .over(
            partition_by=CarListing.district,
            order_by=(desc(CarListing.deal_score), desc(CarListing.first_seen_at)),
        )
        .label("rn"),
    ).where(
        live_listing_filter(),  # noqa: E712
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
        CarListing.district.in_(districts),
    )
    ranked = windowed.subquery()
    rows = db.execute(select(ranked).where(ranked.c.rn <= limit).order_by(ranked.c.district, ranked.c.rn)).all()

    result: dict[str, list[ProListingSample]] = defaultdict(list)
    for row in rows:
        result[str(row.district)].append(_listing_sample(row))
    return dict(result)


def _bulk_district_medians(db: Session, districts: list[str]) -> dict[str, Optional[float]]:
    if not districts:
        return {}
    rows = (
        _price_query(db)
        .filter(CarListing.district.in_(districts))
        .with_entities(CarListing.district, CarListing.price_lkr)
        .all()
    )
    buckets: dict[str, list[float]] = defaultdict(list)
    for district, price in rows:
        if price is not None:
            buckets[str(district)].append(float(price))
    return {district: python_median(prices, min_value=MIN_REASONABLE_PRICE_LKR) for district, prices in buckets.items()}


SPARK_MONTHS = 6
NEW_LISTING_WINDOW = timedelta(days=7)


def _naive_utc(value: datetime) -> datetime:
    """DB datetimes arrive naive on SQLite and tz-aware on Postgres; compare in UTC."""
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


def _month_start(value: datetime, months_back: int = 0) -> datetime:
    index = value.year * 12 + value.month - 1 - months_back
    return datetime(index // 12, index % 12 + 1, 1)


def _bulk_lane_sparks(scoped, pairs: list[tuple[str, str]], *, now: datetime) -> dict[tuple[str, str], tuple[list[LaneSparkPoint], int]]:
    """One read for every lane's monthly median series and 7-day intake.

    Month buckets are cut in Python rather than with strftime()/to_char() so the
    same query runs on SQLite and Postgres.
    """
    if not pairs:
        return {}
    pair_filter = or_(*(and_(CarListing.make == make, CarListing.model == model) for make, model in pairs))
    cutoff = _month_start(now, SPARK_MONTHS - 1)
    new_cutoff = _naive_utc(now - NEW_LISTING_WINDOW)
    rows = (
        scoped.with_entities(CarListing.make, CarListing.model, CarListing.first_seen_at, CarListing.price_lkr)
        .filter(pair_filter, CarListing.first_seen_at.isnot(None), CarListing.first_seen_at >= cutoff)
        .all()
    )

    prices_by_month: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    new_counts: Counter = Counter()
    for make, model, first_seen, price in rows:
        if price is None or first_seen is None:
            continue
        pair = (str(make), str(model))
        seen_at = _naive_utc(first_seen)
        prices_by_month[(pair[0], pair[1], seen_at.strftime("%Y-%m"))].append(float(price))
        if seen_at >= new_cutoff:
            new_counts[pair] += 1

    points_by_pair: dict[tuple[str, str], list[LaneSparkPoint]] = defaultdict(list)
    for (make, model, month), prices in prices_by_month.items():
        points_by_pair[(make, model)].append(
            LaneSparkPoint(
                month=month,
                median_price_lkr=python_median(prices, min_value=MIN_REASONABLE_PRICE_LKR),
                listing_count=len(prices),
            )
        )

    return {
        pair: (sorted(points, key=lambda point: point.month)[-SPARK_MONTHS:], int(new_counts.get(pair, 0)))
        for pair, points in points_by_pair.items()
    }


def _change_since_oldest(current: Optional[float], points: list[LaneSparkPoint]) -> Optional[float]:
    usable = [point.median_price_lkr for point in points if point.median_price_lkr]
    if current is None or len(usable) < 2 or not usable[0]:
        return None
    return round((current - usable[0]) / usable[0] * 100, 2)


def _percentile(values: list[float], pct: float) -> Optional[float]:
    """Linear-interpolated percentile, computed in Python so it is dialect-neutral."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)
    position = (len(ordered) - 1) * pct / 100
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower), 2)


def _price_deciles(prices: list[float]) -> list[MarketPulsePriceDecile]:
    """Ten rank-based price bands; every priced listing lands in exactly one."""
    values = sorted(prices)
    total = len(values)
    if not total:
        return []
    bands: list[MarketPulsePriceDecile] = []
    for index in range(10):
        start = -(-(index * total) // 10)  # ceil: rank boundaries without dropping rows
        end = -(-((index + 1) * total) // 10)
        if end > start:
            low, high = values[start], values[end - 1]
            count = end - start
        else:
            low = high = values[min(start, total - 1)]
            count = 0
        bands.append(
            MarketPulsePriceDecile(label=f"D{index + 1}", low_lkr=round(float(low), 2), high_lkr=round(float(high), 2), count=count)
        )
    return bands


def _days_to_clear(db: Session) -> MarketPulseDaysToClear:
    """Lifespan of listings that left the market, from a bounded sample of them."""
    rows = (
        db.query(CarListing.first_seen_at, CarListing.last_seen_at)
        .filter(CarListing.is_active == False, CarListing.is_duplicate == False)  # noqa: E712
        .limit(5_000)
        .all()
    )
    durations = [
        max((_naive_utc(last_seen) - _naive_utc(first_seen)).total_seconds() / 86_400, 0.0)
        for first_seen, last_seen in rows
        if first_seen is not None and last_seen is not None
    ]
    return MarketPulseDaysToClear(
        median_days=_percentile(durations, 50),
        p25_days=_percentile(durations, 25),
        p75_days=_percentile(durations, 75),
        sample_size=len(durations),
    )


def _price_cut_share(db: Session) -> MarketPulsePriceCutShare:
    """Share of tracked listings now asking less than the first price we recorded.

    Reads ``vehicle_price_history`` (written by every upsert that sees a price).
    A database with no history rows yields zeros rather than a fake share.
    """
    first_points = (
        select(
            VehiclePriceHistory.vehicle_id.label("vehicle_id"),
            VehiclePriceHistory.price_lkr.label("first_price"),
            func.row_number()
            .over(
                partition_by=VehiclePriceHistory.vehicle_id,
                order_by=(VehiclePriceHistory.scraped_at, VehiclePriceHistory.id),
            )
            .label("rn"),
        )
        .subquery()
    )
    rows = db.execute(
        select(first_points.c.first_price, CarListing.price_lkr)
        .join(CarListing, CarListing.id == first_points.c.vehicle_id)
        .where(
            first_points.c.rn == 1,
            live_listing_filter(),
            CarListing.price_lkr.isnot(None),
            CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
        )
    ).all()

    cut_count = sum(
        1
        for first_price, current_price in rows
        if first_price is not None
        and current_price is not None
        and Decimal(str(current_price)) < Decimal(str(first_price))
    )
    return MarketPulsePriceCutShare(
        cut_count=cut_count,
        tracked_count=len(rows),
        share_pct=_share(cut_count, len(rows)),
    )


@router.get("/market-snapshot", response_model=ProMarketSnapshot)
def get_pro_market_snapshot(db: Session = Depends(get_db)):
    now = utc_now()
    seven_days_ago = now - timedelta(days=7)
    priced = _price_query(db)
    metrics = _scope_metrics(db, priced)
    total = int(metrics["count"])
    source_count = (
        priced.with_entities(func.count(func.distinct(CarListing.source))).scalar()
        or 0
    )

    return ProMarketSnapshot(
        generated_at=now,
        total_listings=total,
        avg_price_lkr=metrics["avg_price_lkr"],
        median_price_lkr=metrics["median_price_lkr"],
        min_price_lkr=metrics["min_price_lkr"],
        max_price_lkr=metrics["max_price_lkr"],
        new_listings_7d=int(priced.filter(CarListing.first_seen_at >= seven_days_ago).count()),
        districts_covered=count_canonical_districts(priced),
        source_count=int(source_count),
        hot_deal_count=int(priced.filter(CarListing.deal_score >= 8, plausible_deal_score_sql(CarListing.deal_score)).count()),
        last_updated=priced.with_entities(func.max(func.coalesce(CarListing.last_seen_at, CarListing.scraped_at, CarListing.first_seen_at))).scalar(),
        source_coverage=_breakdown(db, CarListing.source, total=total),
        top_opportunities=_samples(db, limit=8),
    )


@router.get("/vehicle-lanes", response_model=list[ProVehicleLane])
def get_pro_vehicle_lanes(
    make: Optional[str] = None,
    model: Optional[str] = None,
    district: Optional[str] = None,
    condition: Optional[str] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
    db: Session = Depends(get_db),
):
    scoped = _apply_listing_scope(_price_query(db), make=make, model=model, district=district, condition=condition)
    median_expr = _median_price_expr(db)
    fields = [
        CarListing.make,
        CarListing.model,
        func.count(CarListing.id).label("count"),
        func.avg(CarListing.price_lkr).label("avg_price"),
        func.min(CarListing.price_lkr).label("min_price"),
        func.max(CarListing.price_lkr).label("max_price"),
        func.avg(CarListing.deal_score).label("avg_deal_score"),
        func.count(func.distinct(CarListing.district)).label("district_count"),
        func.count(func.distinct(CarListing.source)).label("source_count"),
        func.max(func.coalesce(CarListing.last_seen_at, CarListing.scraped_at, CarListing.first_seen_at)).label("latest"),
    ]
    if median_expr is not None:
        fields.append(median_expr)

    rows = (
        scoped.with_entities(*fields)
        .filter(CarListing.make.isnot(None), CarListing.model.isnot(None))
        .group_by(CarListing.make, CarListing.model)
        .order_by(desc("count"))
        .limit(limit)
        .all()
    )

    # Bulk, constant-query-count lookups instead of 3 extra queries per lane.
    top_districts = _bulk_top_label_by_pair(db, scoped, CarListing.district)
    top_sources = _bulk_top_label_by_pair(db, scoped, CarListing.source)
    medians_by_pair = {} if median_expr is not None else _bulk_median_by_pair(db, scoped)
    sparks_by_pair = _bulk_lane_sparks(scoped, [(str(row.make), str(row.model)) for row in rows], now=utc_now())

    lanes: list[ProVehicleLane] = []
    for row in rows:
        pair = (str(row.make), str(row.model))
        median_price = (
            _num(getattr(row, "median_price", None))
            if median_expr is not None
            else medians_by_pair.get(pair)
        )
        spark_6m, new_7d_count = sparks_by_pair.get(pair, ([], 0))
        lanes.append(
            ProVehicleLane(
                make=str(row.make),
                model=str(row.model),
                listing_count=int(row.count or 0),
                avg_price_lkr=_num(row.avg_price),
                median_price_lkr=median_price,
                min_price_lkr=_num(row.min_price),
                max_price_lkr=_num(row.max_price),
                avg_deal_score=_num(row.avg_deal_score),
                district_count=int(row.district_count or 0),
                source_count=int(row.source_count or 0),
                top_district=top_districts.get(pair),
                top_source=top_sources.get(pair),
                latest_seen_at=row.latest,
                spark_6m=spark_6m,
                change_90d_pct=_change_since_oldest(median_price, spark_6m),
                new_7d_count=new_7d_count,
            )
        )

    return lanes


@router.get("/market-pulse", response_model=MarketPulse)
def get_pro_market_pulse(db: Session = Depends(get_db)):
    """One-screen supply and pricing pulse for the whole market.

    Counts, distribution and clearing-time figures come from a handful of
    aggregate queries over the same priced, non-outlier, non-duplicate scope the
    other /pro views use; percentiles and deciles are cut in Python so the
    endpoint behaves identically on SQLite and Postgres.
    """
    now = utc_now()
    priced = _price_query(db)

    day_ago = now - timedelta(hours=24)
    intake = (
        priced.with_entities(
            func.count(CarListing.id).label("new_7d"),
            func.sum(case((CarListing.first_seen_at >= day_ago, 1), else_=0)).label("new_24h"),
        )
        .filter(CarListing.first_seen_at >= now - NEW_LISTING_WINDOW)
        .one()
    )

    first_day = (now - timedelta(days=29)).date()
    supply_rows = (
        priced.with_entities(CarListing.first_seen_at)
        .filter(CarListing.first_seen_at >= datetime(first_day.year, first_day.month, first_day.day))
        .all()
    )
    supply_counts = Counter(
        _naive_utc(first_seen).date() for (first_seen,) in supply_rows if first_seen is not None
    )
    daily_supply = []
    for offset in range(30):
        day = first_day + timedelta(days=offset)
        daily_supply.append(MarketPulseDailySupplyPoint(date=day.isoformat(), count=int(supply_counts.get(day, 0))))

    prices = [float(price) for (price,) in priced.with_entities(CarListing.price_lkr).all() if price is not None]

    score_row = (
        priced.filter(CarListing.deal_score.isnot(None))
        .with_entities(
            func.count(CarListing.id).label("total"),
            func.sum(case((CarListing.deal_score < 0, 1), else_=0)).label("below_0"),
            func.sum(case((and_(CarListing.deal_score >= 0, CarListing.deal_score < 5), 1), else_=0)).label("b0_5"),
            func.sum(case((and_(CarListing.deal_score >= 5, CarListing.deal_score < 10), 1), else_=0)).label("b5_10"),
            func.sum(case((and_(CarListing.deal_score >= 10, CarListing.deal_score < 15), 1), else_=0)).label("b10_15"),
            func.sum(case((CarListing.deal_score >= 15, 1), else_=0)).label("b15_plus"),
        )
        .one()
    )
    scored_total = int(score_row.total or 0)
    band_counts = [
        ("<0", int(score_row.below_0 or 0)),
        ("0-5", int(score_row.b0_5 or 0)),
        ("5-10", int(score_row.b5_10 or 0)),
        ("10-15", int(score_row.b10_15 or 0)),
        (">=15", int(score_row.b15_plus or 0)),
    ]
    deal_score_bands = [
        MarketPulseDealScoreBand(
            label=label,
            count=count,
            share_pct=round(count / scored_total * 100, 2) if scored_total else 0.0,
        )
        for label, count in band_counts
    ]

    return MarketPulse(
        generated_at=now.replace(tzinfo=timezone.utc),
        new_24h=int(intake.new_24h or 0),
        new_7d=int(intake.new_7d or 0),
        daily_supply=daily_supply,
        price_deciles=_price_deciles(prices),
        deal_score_bands=deal_score_bands,
        days_to_clear=_days_to_clear(db),
        price_cut_share=_price_cut_share(db),
    )


@router.get("/districts", response_model=list[ProDistrictProfile])
def get_pro_districts(
    limit: Annotated[int, Query(ge=1, le=60)] = 30,
    db: Session = Depends(get_db),
):
    median_expr = _median_price_expr(db)
    fields = [
        CarListing.district,
        func.count(CarListing.id).label("count"),
        func.avg(CarListing.price_lkr).label("avg_price"),
        func.min(CarListing.price_lkr).label("min_price"),
        func.max(CarListing.price_lkr).label("max_price"),
        func.count(func.distinct(CarListing.source)).label("source_count"),
        func.max(func.coalesce(CarListing.last_seen_at, CarListing.scraped_at, CarListing.first_seen_at)).label("latest"),
    ]
    if median_expr is not None:
        fields.append(median_expr)

    rows = (
        _price_query(db)
        .with_entities(*fields)
        .filter(CarListing.district.isnot(None))
        .group_by(CarListing.district)
        .order_by(desc("count"))
        .limit(limit)
        .all()
    )

    district_names = [str(row.district) for row in rows]
    district_totals = {str(row.district): int(row.count or 0) for row in rows}

    # Bulk, constant-query-count lookups instead of up to 4 extra queries per district.
    top_models_by_district = _bulk_district_top_models(db, district_names, limit=5)
    source_mix_by_district = _bulk_district_source_mix(db, district_names, district_totals, limit=8)
    samples_by_district = _bulk_district_samples(db, district_names, limit=5)
    medians_by_district = {} if median_expr is not None else _bulk_district_medians(db, district_names)

    profiles: list[ProDistrictProfile] = []
    for row in rows:
        district_name = str(row.district)
        median_price = (
            _num(getattr(row, "median_price", None))
            if median_expr is not None
            else medians_by_district.get(district_name)
        )
        top_models = top_models_by_district.get(district_name, [])
        top_model = top_models[0] if top_models else None
        profiles.append(
            ProDistrictProfile(
                district=district_name,
                listing_count=int(row.count or 0),
                avg_price_lkr=_num(row.avg_price),
                median_price_lkr=median_price,
                min_price_lkr=_num(row.min_price),
                max_price_lkr=_num(row.max_price),
                source_count=int(row.source_count or 0),
                top_make=top_model.make if top_model else None,
                top_model=top_model.model if top_model else None,
                latest_seen_at=row.latest,
                top_models=top_models,
                source_mix=source_mix_by_district.get(district_name, []),
                sample_listings=samples_by_district.get(district_name, []),
            )
        )
    return profiles


@router.get("/vehicle-lane-detail", response_model=ProDetailPayload)
def get_pro_vehicle_lane_detail(
    make: str = Query(..., min_length=1),
    model: str = Query(..., min_length=1),
    district: Optional[str] = None,
    condition: Optional[str] = None,
    db: Session = Depends(get_db),
):
    scoped = _apply_listing_scope(_price_query(db), make=make, model=model, district=district, condition=condition)
    metrics = _scope_metrics(db, scoped, include_deal_score=True)
    total = int(metrics["count"])
    avg_price = metrics["avg_price_lkr"]
    median_price = metrics["median_price_lkr"]
    avg_score = metrics["avg_deal_score"]

    district_label = f" in {district}" if district else ""
    return ProDetailPayload(
        kind="vehicle_lane",
        title=f"{make} {model}{district_label}",
        summary=f"{total} priced listings tracked for this lane across Motormila sources.",
        generated_at=utc_now(),
        metrics=[
            ProMetric(label="Listings", value=f"{total:,}", detail="Priced, non-outlier inventory"),
            ProMetric(label="Average price", value=f"Rs. {avg_price:,.0f}" if avg_price else "N/A"),
            ProMetric(label="Median price", value=f"Rs. {median_price:,.0f}" if median_price else "N/A"),
            ProMetric(label="Avg deal score", value=f"{avg_score:.1f}" if avg_score is not None else "N/A"),
        ],
        source_mix=_breakdown(db, CarListing.source, total=total, make=make, model=model, district=district, condition=condition),
        district_mix=_breakdown(db, CarListing.district, total=total, make=make, model=model, condition=condition),
        trend_points=_trend_points(db, make=make, model=model, district=district),
        sample_listings=_samples(db, make=make, model=model, district=district, condition=condition, limit=10),
    )


_MIN_DISTRICT_LISTINGS = 2


def _district_price_buckets(rows) -> dict[str, list[float]]:
    buckets: dict[str, list[float]] = {}
    for district, price in rows:
        if district and price is not None:
            buckets.setdefault(str(district), []).append(float(price))
    return buckets


def _arbitrage_gaps(
    buckets: dict[str, list[float]], *, make: Optional[str] = None, model: Optional[str] = None
) -> list[ProArbitrageGap]:
    district_stats: dict[str, tuple[float, int]] = {}
    for district, prices in buckets.items():
        if len(prices) >= _MIN_DISTRICT_LISTINGS:
            med = _median(prices)
            if med is not None:
                district_stats[district] = (med, len(prices))

    sorted_districts = sorted(district_stats.keys())
    gaps: list[ProArbitrageGap] = []
    for i, d_a in enumerate(sorted_districts):
        for d_b in sorted_districts[i + 1:]:
            med_a, count_a = district_stats[d_a]
            med_b, count_b = district_stats[d_b]
            if med_a == med_b:
                continue
            if med_a < med_b:
                buy_d, sell_d = d_a, d_b
                buy_med, sell_med = med_a, med_b
                buy_count, sell_count = count_a, count_b
            else:
                buy_d, sell_d = d_b, d_a
                buy_med, sell_med = med_b, med_a
                buy_count, sell_count = count_b, count_a
            gap_pct = round((sell_med - buy_med) / buy_med * 100, 2)
            gaps.append(
                ProArbitrageGap(
                    buy_district=buy_d,
                    sell_district=sell_d,
                    buy_median_lkr=buy_med,
                    sell_median_lkr=sell_med,
                    gap_pct=gap_pct,
                    buy_listing_count=buy_count,
                    sell_listing_count=sell_count,
                    make=make,
                    model=model,
                )
            )

    gaps.sort(key=lambda g: g.gap_pct, reverse=True)
    return gaps


def _market_arbitrage_gaps(
    db: Session, *, make: Optional[str], model: Optional[str], limit: int
) -> list[ProArbitrageGap]:
    """Top district spreads across every (make, model) lane with enough depth.

    Two reads: the qualifying lanes, then their district/price rows. Lanes are
    walked in make/model order so equal gaps break deterministically.
    """
    lane_query = _price_query(db).filter(
        CarListing.make.isnot(None), CarListing.model.isnot(None), CarListing.district.isnot(None)
    )
    if make:
        lane_query = lane_query.filter(CarListing.make.ilike(f"%{make.strip()}%"))
    if model:
        lane_query = lane_query.filter(CarListing.model.ilike(f"%{model.strip()}%"))

    lane_rows = (
        lane_query.with_entities(
            CarListing.make.label("make"),
            CarListing.model.label("model"),
            func.count(CarListing.id).label("count"),
        )
        .group_by(CarListing.make, CarListing.model)
        .having(
            func.count(CarListing.id) >= 2 * _MIN_DISTRICT_LISTINGS,
            func.count(func.distinct(CarListing.district)) >= 2,
        )
        .order_by(CarListing.make, CarListing.model)
        .all()
    )
    if not lane_rows:
        return []

    pairs = [(str(row.make), str(row.model)) for row in lane_rows]
    pair_filter = or_(*(and_(CarListing.make == lane_make, CarListing.model == lane_model) for lane_make, lane_model in pairs))
    rows = (
        _price_query(db)
        .with_entities(CarListing.make, CarListing.model, CarListing.district, CarListing.price_lkr)
        .filter(pair_filter, CarListing.district.isnot(None))
        .all()
    )
    buckets_by_lane: dict[tuple[str, str], list[tuple]] = defaultdict(list)
    for lane_make, lane_model, district, price in rows:
        buckets_by_lane[(str(lane_make), str(lane_model))].append((district, price))

    gaps: list[ProArbitrageGap] = []
    for lane_make, lane_model in pairs:
        # A lane's pairs outside its own top `limit` cannot reach the market top
        # `limit`, so trimming per lane bounds memory without changing the answer.
        gaps.extend(
            _arbitrage_gaps(
                _district_price_buckets(buckets_by_lane.get((lane_make, lane_model), [])),
                make=lane_make,
                model=lane_model,
            )[:limit]
        )
    gaps.sort(key=lambda g: g.gap_pct, reverse=True)
    return gaps[:limit]


@router.get("/arbitrage-gaps", response_model=list[ProArbitrageGap])
def get_pro_arbitrage_gaps(
    make: Annotated[Optional[str], Query(min_length=1)] = None,
    model: Annotated[Optional[str], Query(min_length=1)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    db: Session = Depends(get_db),
) -> list[ProArbitrageGap]:
    if not make or not model:
        return _market_arbitrage_gaps(db, make=make, model=model, limit=limit)

    rows = (
        _apply_listing_scope(_price_query(db), make=make, model=model)
        .with_entities(CarListing.district, CarListing.price_lkr)
        .filter(CarListing.district.isnot(None))
        .all()
    )
    return _arbitrage_gaps(_district_price_buckets(rows))[:limit]


@router.get("/district-detail", response_model=ProDetailPayload)
def get_pro_district_detail(
    district: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
):
    scoped = _apply_listing_scope(_price_query(db), district=district)
    metrics = _scope_metrics(db, scoped)
    total = int(metrics["count"])
    avg_price = metrics["avg_price_lkr"]
    median_price = metrics["median_price_lkr"]
    top = _top_models(db, district=district, limit=1)
    top_label = f"{top[0].make} {top[0].model}" if top else "No dominant model yet"

    return ProDetailPayload(
        kind="district",
        title=f"{district} market profile",
        summary=f"{top_label} leads the local sample across {total} priced listings.",
        generated_at=utc_now(),
        metrics=[
            ProMetric(label="Listings", value=f"{total:,}", detail="Priced, non-outlier inventory"),
            ProMetric(label="Average price", value=f"Rs. {avg_price:,.0f}" if avg_price else "N/A"),
            ProMetric(label="Median price", value=f"Rs. {median_price:,.0f}" if median_price else "N/A"),
            ProMetric(label="Top model", value=top_label),
        ],
        source_mix=_breakdown(db, CarListing.source, total=total, district=district),
        district_mix=[],
        trend_points=_trend_points(db, district=district),
        sample_listings=_samples(db, district=district, limit=10),
    )
