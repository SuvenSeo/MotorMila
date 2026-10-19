from __future__ import annotations

import time
from datetime import datetime

import structlog
from sqlalchemy import and_, case, func, select, text, update
from sqlalchemy.orm import Session

from db.models import CarListing, PriceAggregate, live_listing_filter

logger = structlog.get_logger()

# Listings whose market median is below this LKR threshold are skipped – the
# aggregate data is considered too sparse to be meaningful.
_MIN_MEDIAN_LKR = 100_000.0
_SCORE_MAX = 100.0
_SCORE_MIN = -100.0

# Suppression guardrails (AutoTrader pattern): rather than showing a
# low-confidence rating, show none. Suppressed listings get deal_score and
# market_median_lkr set to NULL so stale badges from earlier runs disappear.
_MIN_COMPARABLES = 5
_MAX_VEHICLE_AGE_YEARS = 15
_MIN_PRICE_FOR_SCORE_LKR = 300_000.0


def _clamp_score(raw: float) -> float:
    """Clamp raw deal score to [-100, 100] and round to one decimal place."""
    return max(_SCORE_MIN, min(_SCORE_MAX, round(raw, 1)))


def _build_listing_median_select():
    """
    Return a SQLAlchemy Core SELECT that produces (id, price_lkr, best_median)
    for every eligible car listing.

    Eligibility: price_lkr IS NOT NULL, is_outlier = False, is_duplicate = False.

    best_median resolution (mirrors existing aggregator logic):
      1. District-specific median from the most recent period for
         (make, model, year, district) — preferred.
      2. National median — average of all district medians from the most recent
         period for (make, model, year) — used as fallback.

    Listings that match no aggregate row receive NULL for best_median and are
    excluded from updates by the caller.
    """
    # ------------------------------------------------------------------ #
    # Subquery 1: latest period stamp per (make, model, year)             #
    # Used to anchor the national median to the most recent data.         #
    # ------------------------------------------------------------------ #
    nat_latest_sq = (
        select(
            PriceAggregate.make,
            PriceAggregate.model,
            PriceAggregate.year,
            func.max(
                PriceAggregate.period_year * 100 + PriceAggregate.period_month
            ).label("max_ym"),
        )
        .group_by(PriceAggregate.make, PriceAggregate.model, PriceAggregate.year)
        .subquery("nat_latest")
    )

    # ------------------------------------------------------------------ #
    # Subquery 2: national (cross-district) average median per group      #
    # Averaging mirrors CarPriceAggregator.update_deal_scores n_map logic #
    # ------------------------------------------------------------------ #
    nat_agg_sq = (
        select(
            PriceAggregate.make,
            PriceAggregate.model,
            PriceAggregate.year,
            # Count-weighted average of district medians — a raw avg() lets a
            # 1-listing district pull the national figure as hard as a
            # 200-listing one.
            (
                func.sum(PriceAggregate.median_price_lkr * PriceAggregate.listing_count)
                / func.nullif(func.sum(PriceAggregate.listing_count), 0)
            ).label("median"),
            func.sum(PriceAggregate.listing_count).label("comparables"),
        )
        .join(
            nat_latest_sq,
            and_(
                PriceAggregate.make == nat_latest_sq.c.make,
                PriceAggregate.model == nat_latest_sq.c.model,
                PriceAggregate.year == nat_latest_sq.c.year,
                (PriceAggregate.period_year * 100 + PriceAggregate.period_month)
                == nat_latest_sq.c.max_ym,
            ),
        )
        .group_by(PriceAggregate.make, PriceAggregate.model, PriceAggregate.year)
        .subquery("nat_agg")
    )

    # ------------------------------------------------------------------ #
    # Subquery 3: latest period stamp per (make, model, year, district)   #
    # Only non-NULL districts are considered for district-level lookup.   #
    # ------------------------------------------------------------------ #
    dist_latest_sq = (
        select(
            PriceAggregate.make,
            PriceAggregate.model,
            PriceAggregate.year,
            PriceAggregate.district,
            func.max(
                PriceAggregate.period_year * 100 + PriceAggregate.period_month
            ).label("max_ym"),
        )
        .where(PriceAggregate.district.isnot(None))
        .group_by(
            PriceAggregate.make,
            PriceAggregate.model,
            PriceAggregate.year,
            PriceAggregate.district,
        )
        .subquery("dist_latest")
    )

    # ------------------------------------------------------------------ #
    # Subquery 4: district-specific median per group                      #
    # ------------------------------------------------------------------ #
    dist_agg_sq = (
        select(
            PriceAggregate.make,
            PriceAggregate.model,
            PriceAggregate.year,
            PriceAggregate.district,
            PriceAggregate.median_price_lkr.label("median"),
            PriceAggregate.listing_count.label("listing_count"),
        )
        .join(
            dist_latest_sq,
            and_(
                PriceAggregate.make == dist_latest_sq.c.make,
                PriceAggregate.model == dist_latest_sq.c.model,
                PriceAggregate.year == dist_latest_sq.c.year,
                PriceAggregate.district == dist_latest_sq.c.district,
                (PriceAggregate.period_year * 100 + PriceAggregate.period_month)
                == dist_latest_sq.c.max_ym,
            ),
        )
        .subquery("dist_agg")
    )

    # ------------------------------------------------------------------ #
    # Main SELECT: listings LEFT JOINed to both aggregate subqueries      #
    # ------------------------------------------------------------------ #
    return (
        select(
            CarListing.id,
            CarListing.price_lkr,
            CarListing.year,
            # Prefer the district median only when the district cohort is
            # thick enough to be meaningful; otherwise fall back to national.
            func.coalesce(
                case(
                    (dist_agg_sq.c.listing_count >= 5, dist_agg_sq.c.median),
                    else_=None,
                ),
                nat_agg_sq.c.median,
            ).label("best_median"),
            # Cohort size always comes from the national latest-period sum —
            # a single district row can look thin while the model is liquid.
            nat_agg_sq.c.comparables.label("comparables"),
        )
        .select_from(CarListing)
        .outerjoin(
            dist_agg_sq,
            and_(
                CarListing.make == dist_agg_sq.c.make,
                CarListing.model == dist_agg_sq.c.model,
                CarListing.year == dist_agg_sq.c.year,
                CarListing.district == dist_agg_sq.c.district,
            ),
        )
        .outerjoin(
            nat_agg_sq,
            and_(
                CarListing.make == nat_agg_sq.c.make,
                CarListing.model == nat_agg_sq.c.model,
                CarListing.year == nat_agg_sq.c.year,
            ),
        )
        .where(
            CarListing.price_lkr.isnot(None),
            live_listing_filter(),  # noqa: E712 – SQLAlchemy requires == not is
            CarListing.is_duplicate == False,  # noqa: E712
        )
    )


def _apply_score_batch(db: Session, batch: list[dict]) -> None:
    """Write one batch of (id, deal_score, market_median_lkr) rows.

    On Postgres a single ``UPDATE ... FROM (VALUES ...)`` statement updates
    the whole batch in one round-trip.  (``executemany`` UPDATE is one
    round-trip per row, which on a remote Neon DB is ~5000x slower.)  SQLite
    (used by the test suite) falls back to executemany UPDATE.
    """
    if db.bind.dialect.name == "postgresql":
        rows = ", ".join(
            f"(:id_{i}, :score_{i}, :med_{i})" for i in range(len(batch))
        )
        params: dict = {}
        for i, row in enumerate(batch):
            params[f"id_{i}"] = row["id"]
            params[f"score_{i}"] = row["deal_score"]
            params[f"med_{i}"] = row["market_median_lkr"]
        statement = text(
            "UPDATE car_listings SET deal_score = v.deal_score, "
            "market_median_lkr = v.market_median_lkr "
            f"FROM (VALUES {rows}) AS v(id, deal_score, market_median_lkr) "
            "WHERE car_listings.id = v.id"
        )
        _execute_with_deadlock_retry(db, statement, params)
    else:
        db.execute(update(CarListing), batch)


def _execute_with_deadlock_retry(db: Session, statement, params: dict, retries: int = 3) -> None:
    """Execute a statement, retrying on Postgres deadlocks.

    Concurrent scrapers and analysis jobs both batch-update ``car_listings``;
    two such transactions can deadlock (Postgres aborts one with
    DeadlockDetected). The UPDATE is idempotent, so rolling back the aborted
    transaction and re-executing is safe. ``statement`` may be either a
    SQLAlchemy Core construct or a ``text()`` — callers pass what they already
    build; we only need ``db.execute`` to work on it.
    """
    for attempt in range(retries + 1):
        try:
            db.execute(statement, params)
            return
        except Exception as exc:  # noqa: BLE001 - need dialect-agnostic catch
            is_deadlock = "deadlock" in str(type(exc).__name__).lower() or "deadlock" in str(exc).lower()
            if not is_deadlock or attempt >= retries:
                raise
            logger.warning("deadlock_retry", attempt=attempt + 1, retries=retries)
            db.rollback()
            time.sleep(0.5 * (attempt + 1))


def bulk_refresh_deal_scores(db: Session, *, batch_size: int = 5000) -> dict:
    """
    Bulk-refresh ``deal_score`` and ``market_median_lkr`` on all eligible
    ``car_listings`` rows using a single SQL JOIN against ``price_aggregates``.

    Replaces the slow per-row Python loop in
    ``CarPriceAggregator.update_deal_scores`` with batched Core UPDATE
    statements (SQLAlchemy ``executemany`` at the driver level).

    Eligibility:
      - ``price_lkr`` is set
      - ``is_outlier = False``
      - ``is_duplicate = False``

    Median resolution: district-specific aggregate > national (cross-district)
    average, both anchored to the most recent ``period_year``/``period_month``.

    Args:
        db: Active SQLAlchemy session (commits incrementally per batch).
        batch_size: Number of rows per ``executemany`` batch / commit cycle.
                    Tune for memory vs. transaction size trade-off.

    Returns:
        ``{"updated": int, "skipped_no_median": int, "batches": int}``
    """
    logger.info("bulk_refresh_deal_scores_start", batch_size=batch_size)

    stmt = _build_listing_median_select()
    rows = db.execute(stmt).fetchall()

    current_year = datetime.now().year
    min_year_for_score = current_year - _MAX_VEHICLE_AGE_YEARS

    updated = 0
    skipped_no_median = 0
    suppressed = 0
    batches = 0
    batch: list[dict] = []
    suppress_ids: list[int] = []

    def _suppression_reason(row) -> str | None:
        price = float(row.price_lkr)
        if price < _MIN_PRICE_FOR_SCORE_LKR:
            return "price_below_floor"
        if row.year is not None and int(row.year) < min_year_for_score:
            return "vehicle_too_old"
        comparables = int(row.comparables or 0)
        if comparables < _MIN_COMPARABLES:
            return "thin_cohort"
        return None

    for row in rows:
        best_median = row.best_median

        if best_median is None or float(best_median) < _MIN_MEDIAN_LKR:
            # No usable market context — clear any stale badge too.
            suppress_ids.append(row.id)
            skipped_no_median += 1
            continue

        price = float(row.price_lkr)
        median = float(best_median)

        if price <= 0 or median <= 0:
            suppress_ids.append(row.id)
            skipped_no_median += 1
            continue

        if _suppression_reason(row) is not None:
            suppress_ids.append(row.id)
            suppressed += 1
            continue

        raw_score = (1.0 - price / median) * 100.0
        batch.append(
            {
                "id": row.id,
                "market_median_lkr": round(median, 2),
                "deal_score": _clamp_score(raw_score),
            }
        )

        if len(batch) >= batch_size:
            _apply_score_batch(db, batch)
            db.commit()
            updated += len(batch)
            batches += 1
            logger.info(
                "bulk_refresh_deal_scores_batch",
                batch=batches,
                cumulative_updated=updated,
            )
            batch = []

    if batch:
        _apply_score_batch(db, batch)
        db.commit()
        updated += len(batch)
        batches += 1

    # Suppressed/uncontextualized rows lose their badge entirely — a missing
    # rating is honest; a stale or low-confidence one is misleading.
    for start in range(0, len(suppress_ids), batch_size):
        chunk = suppress_ids[start : start + batch_size]
        db.execute(
            update(CarListing)
            .where(CarListing.id.in_(chunk))
            .values(deal_score=None, market_median_lkr=None)
        )
        db.commit()

    logger.info(
        "bulk_refresh_deal_scores_done",
        updated=updated,
        skipped_no_median=skipped_no_median,
        suppressed=suppressed,
        batches=batches,
    )
    # Deal scores feed summary/good-deals/trends — drop the materialized
    # cache so the next read reflects the refresh instead of a 15min–24h TTL.
    try:
        from app.utils.stats_cache import invalidate_stats_cache

        invalidate_stats_cache(db)
    except Exception:
        logger.warning("stats_cache_invalidate_failed", exc_info=True)
    return {
        "updated": updated,
        "skipped_no_median": skipped_no_median,
        "suppressed": suppressed,
        "batches": batches,
    }
