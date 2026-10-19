"""Statistical price-outlier detection (IQR fences per make/model/year).

Flags ``is_outlier`` with an ``iqr:``-prefixed ``outlier_reason`` so the
pass can safely re-evaluate its own flags on every run without clobbering
manual or ingest-time flags. Groups smaller than ``min_group_size`` are
left untouched — a thin cohort cannot support a fence.

Egress note: this pass is part of the weekly heavy-maintenance run against
Neon. The old implementation streamed every priced listing (~240k rows) to
the runner to bucket in Python — roughly 60-80 MB of Neon transfer *per
pass*. On Postgres the fences are now computed entirely inside the database
(one quantile aggregation + two set-based UPDATEs); only the per-group
fence rows (~a few thousand small tuples) and the changed rows travel.
SQLite (tests / local dev) keeps the original in-Python path via
``_mark_price_outliers_python`` so behavior there is byte-identical.
"""

from __future__ import annotations

from statistics import quantiles

import structlog
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.models import CarListing

log = structlog.get_logger()

REASON_PREFIX = "iqr:"
DEFAULT_MIN_GROUP_SIZE = 8
DEFAULT_IQR_MULTIPLIER = 1.5

# Postgres fencing pipeline. All three steps are server-side:
#   1. flag       — price outside its cohort fence, not already manually
#                   flagged (reason not iqr:) → set is_outlier + reason.
#   2. clear      — previously iqr:-flagged rows back inside the fence (or
#                   whose cohort dissolved) → clear the flag and reason.
#   3. summary    — counts for logging, no rows transferred.
#
# NOTE: SQLAlchemy text() treats ":word" as a bind parameter, so the iqr:
# prefix is matched with left(reason, 4) instead of LIKE 'iqr:%'.
_POSTGRES_FLAG_SQL = text(
    """
    WITH live_priced AS (
        SELECT id, make, model, year, price_lkr::double precision AS price,
               is_outlier, outlier_reason
        FROM car_listings
        WHERE is_active = true
          AND price_lkr IS NOT NULL
          AND make IS NOT NULL
          AND model IS NOT NULL
    ),
    fences AS (
        SELECT
            lower(make) AS make_key,
            lower(model) AS model_key,
            year,
            count(*) AS n,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY price) AS q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY price) AS q3
        FROM live_priced
        GROUP BY lower(make), lower(model), year
        HAVING count(*) >= :min_group_size
    ),
    fenced AS (
        SELECT
            f.make_key, f.model_key, f.year, f.n,
            f.q1 - :iqr_multiplier * (f.q3 - f.q1) AS low,
            f.q3 + :iqr_multiplier * (f.q3 - f.q1) AS high
        FROM fences f
    ),
    to_flag AS (
        SELECT l.id,
               'iqr: price ' || (round(l.price)::bigint)::text ||
               ' outside [' || (round(greatest(f.low, 0))::bigint)::text ||
               '–' || (round(f.high)::bigint)::text || '] for ' ||
               f.make_key || ' ' || f.model_key || ' ' ||
               coalesce(f.year::text, 'unknown-year') ||
               ' (n=' || f.n::text || ')' AS reason
        FROM live_priced l
        JOIN fenced f
          ON lower(l.make) = f.make_key
         AND lower(l.model) = f.model_key
         AND l.year IS NOT DISTINCT FROM f.year
        WHERE (l.price < f.low OR l.price > f.high)
          AND (NOT l.is_outlier OR left(l.outlier_reason, 4) = 'iqr:')
    )
    UPDATE car_listings c
    SET is_outlier = true, outlier_reason = t.reason
    FROM to_flag t
    WHERE c.id = t.id
      AND (c.is_outlier = false OR c.outlier_reason IS DISTINCT FROM t.reason)
    """
)

_POSTGRES_CLEAR_SQL = text(
    """
    WITH live_priced AS (
        SELECT id, make, model, year, price_lkr::double precision AS price,
               is_outlier, outlier_reason
        FROM car_listings
        WHERE is_active = true
          AND price_lkr IS NOT NULL
          AND make IS NOT NULL
          AND model IS NOT NULL
    ),
    fences AS (
        SELECT
            lower(make) AS make_key,
            lower(model) AS model_key,
            year,
            count(*) AS n,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY price) AS q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY price) AS q3
        FROM live_priced
        GROUP BY lower(make), lower(model), year
        HAVING count(*) >= :min_group_size
    ),
    fenced AS (
        SELECT
            f.make_key, f.model_key, f.year,
            f.q1 - :iqr_multiplier * (f.q3 - f.q1) AS low,
            f.q3 + :iqr_multiplier * (f.q3 - f.q1) AS high
        FROM fences f
    ),
    to_clear AS (
        SELECT l.id
        FROM live_priced l
        JOIN fenced f
          ON lower(l.make) = f.make_key
         AND lower(l.model) = f.model_key
         AND l.year IS NOT DISTINCT FROM f.year
        WHERE l.is_outlier = true
          AND left(l.outlier_reason, 4) = 'iqr:'
          AND l.price BETWEEN f.low AND f.high
        UNION
        -- iqr:-flagged rows whose cohort dissolved below min_group_size or
        -- vanished entirely must also be cleared (mirrors the Python path).
        SELECT l.id
        FROM live_priced l
        LEFT JOIN fenced f
          ON lower(l.make) = f.make_key
         AND lower(l.model) = f.model_key
         AND l.year IS NOT DISTINCT FROM f.year
        WHERE l.is_outlier = true
          AND left(l.outlier_reason, 4) = 'iqr:'
          AND f.make_key IS NULL
    )
    UPDATE car_listings c
    SET is_outlier = false, outlier_reason = NULL
    FROM to_clear t
    WHERE c.id = t.id
    """
)

_POSTGRES_SUMMARY_SQL = text(
    "SELECT count(*) FILTER (WHERE is_outlier = true) AS flagged, "
    "count(*) AS total FROM car_listings "
    "WHERE is_active = true AND price_lkr IS NOT NULL"
)


def _fences(prices: list[float], multiplier: float) -> tuple[float, float]:
    q1, _q2, q3 = quantiles(prices, n=4, method="inclusive")
    iqr = q3 - q1
    return q1 - multiplier * iqr, q3 + multiplier * iqr


def mark_price_outliers(
    db: Session,
    *,
    min_group_size: int = DEFAULT_MIN_GROUP_SIZE,
    iqr_multiplier: float = DEFAULT_IQR_MULTIPLIER,
) -> dict:
    """Set/clear IQR-based outlier flags; returns {"flagged": n, "cleared": n}.

    On Postgres the whole pass runs server-side (no table stream); SQLite
    falls back to the original in-Python algorithm.
    """
    bind = db.bind
    dialect = getattr(bind, "dialect", None)
    if dialect is not None and dialect.name == "postgresql":
        result = _mark_price_outliers_postgres(
            db, min_group_size=min_group_size, iqr_multiplier=iqr_multiplier
        )
    else:
        result = _mark_price_outliers_python(
            db, min_group_size=min_group_size, iqr_multiplier=iqr_multiplier
        )
    # Outlier flags feed medians/deal-scores/summary — drop the stats cache.
    try:
        from app.utils.stats_cache import invalidate_stats_cache

        invalidate_stats_cache(db)
    except Exception:
        log.warning("stats_cache_invalidate_failed", exc_info=True)
    return result


def _mark_price_outliers_postgres(
    db: Session,
    *,
    min_group_size: int,
    iqr_multiplier: float,
) -> dict:
    params = {"min_group_size": min_group_size, "iqr_multiplier": iqr_multiplier}
    before = db.execute(_POSTGRES_SUMMARY_SQL).scalar() or 0
    db.execute(_POSTGRES_FLAG_SQL, params)
    db.execute(_POSTGRES_CLEAR_SQL, params)
    db.commit()
    after = db.execute(_POSTGRES_SUMMARY_SQL).scalar() or 0
    log.info(
        "outlier_pass_complete_sql",
        flagged=after,
        cleared=max(0, int(before) - int(after)),
        groups_evaluated=None,
        min_group_size=min_group_size,
        engine="postgres-server-side",
    )
    return {"flagged": int(after), "cleared": max(0, int(before) - int(after))}


def _mark_price_outliers_python(
    db: Session,
    *,
    min_group_size: int,
    iqr_multiplier: float,
) -> dict:
    rows = (
        db.query(
            CarListing.id,
            CarListing.make,
            CarListing.model,
            CarListing.year,
            CarListing.price_lkr,
            CarListing.is_outlier,
            CarListing.outlier_reason,
        )
        .filter(
            CarListing.is_active == True,  # noqa: E712
            CarListing.price_lkr.isnot(None),
            CarListing.make.isnot(None),
            CarListing.model.isnot(None),
        )
        .all()
    )

    groups: dict[tuple, list] = {}
    for row in rows:
        key = (
            (row.make or "").strip().lower(),
            (row.model or "").strip().lower(),
            row.year,
        )
        groups.setdefault(key, []).append(row)

    # Accumulate pending mutations and flush with two bulk UPDATE statements
    # instead of one UPDATE round-trip per row (~4k round-trips per pass).
    flag_updates: list[dict] = []
    clear_updates: list[dict] = []
    flagged = 0
    cleared = 0
    for key, members in groups.items():
        prices = [float(m.price_lkr) for m in members]
        if len(prices) < min_group_size:
            # Too thin for a fence — clear only flags this pass created earlier.
            for m in members:
                if m.is_outlier and (m.outlier_reason or "").startswith(REASON_PREFIX):
                    clear_updates.append({"id": m.id, "is_outlier": False, "outlier_reason": None})
                    cleared += 1
            continue

        low, high = _fences(prices, iqr_multiplier)
        for m in members:
            price = float(m.price_lkr)
            is_iqr_flag = (m.outlier_reason or "").startswith(REASON_PREFIX)
            if price < low or price > high:
                if m.is_outlier and not is_iqr_flag:
                    continue  # keep manual/ingest flags untouched
                reason = (
                    f"{REASON_PREFIX}price {price:,.0f} outside "
                    f"[{max(low, 0):,.0f}–{high:,.0f}] for "
                    f"{key[0]} {key[1]} {key[2] or 'unknown-year'} (n={len(prices)})"
                )
                if not m.is_outlier or m.outlier_reason != reason:
                    flag_updates.append({"id": m.id, "is_outlier": True, "outlier_reason": reason})
                    flagged += 1
            elif m.is_outlier and is_iqr_flag:
                # Back inside the fence (price corrected or cohort shifted).
                clear_updates.append({"id": m.id, "is_outlier": False, "outlier_reason": None})
                cleared += 1

    if flag_updates:
        db.bulk_update_mappings(CarListing, flag_updates)
    if clear_updates:
        db.bulk_update_mappings(CarListing, clear_updates)
    db.commit()
    log.info(
        "outlier_pass_complete",
        flagged=flagged,
        cleared=cleared,
        groups_evaluated=len(groups),
        min_group_size=min_group_size,
    )
    return {"flagged": flagged, "cleared": cleared}
