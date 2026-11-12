"""Cross-source duplicate detection helpers for CarListing records.

Matching criteria for a duplicate pair:
- Normalised make and model are equal (strip punctuation, case-insensitive)
- Year matches exactly (both None counts as equal)
- price_lkr within 3% of each other — both sides MUST have a price
  (both-null prices are not a match; distinct unpriced cars must not collapse)
- mileage within 5% of each other, OR either side has mileage IS NULL
- Listings must belong to different sources
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import and_, false, or_, text, update
from sqlalchemy.orm import Session

from db.models import CarListing

log = structlog.get_logger()

_STRIP_NON_ALNUM = re.compile(r"[^a-z0-9]")

PRICE_TOLERANCE = 0.03  # 3 %
MILEAGE_TOLERANCE = 0.05  # 5 %


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _norm(value: Optional[str]) -> str:
    """Lowercase and strip non-alphanumeric characters for fuzzy comparison."""
    if not value:
        return ""
    return _STRIP_NON_ALNUM.sub("", value.lower())


def _price_band(price) -> Optional[tuple[float, float]]:
    """Return (low, high) inclusive price band at PRICE_TOLERANCE, or None."""
    if price is None:
        return None
    p = float(price)
    if p <= 0:
        return None
    return p * (1 - PRICE_TOLERANCE), p * (1 + PRICE_TOLERANCE)


def _mileage_band(mileage: Optional[int]) -> Optional[tuple[int, int]]:
    """Return (low, high) inclusive mileage band at MILEAGE_TOLERANCE, or None."""
    if mileage is None:
        return None
    m = int(mileage)
    if m < 0:
        return None
    return int(m * (1 - MILEAGE_TOLERANCE)), int(m * (1 + MILEAGE_TOLERANCE))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def find_duplicate_candidates(
    db: Session,
    listing: CarListing,
    limit: int = 5,
) -> list[CarListing]:
    """Return up to *limit* listings from a *different* source that look like
    duplicates of *listing*.

    The DB query applies year / price / mileage range filters to narrow the
    candidate set; a final in-Python pass checks normalised make and model
    because the DB cannot easily strip punctuation in a portable way.
    """
    norm_make = _norm(listing.make)
    norm_model = _norm(listing.model)

    if not norm_make or not norm_model:
        return []

    price_band = _price_band(listing.price_lkr)
    mileage_band = _mileage_band(listing.mileage)

    filters = [
        CarListing.id != listing.id,
        CarListing.source != listing.source,
        CarListing.is_duplicate == False,  # noqa: E712
    ]

    # Year — exact match (NULL == NULL treated as match)
    if listing.year is not None:
        filters.append(CarListing.year == listing.year)
    else:
        filters.append(CarListing.year.is_(None))

    # Price — within band; both-null prices must NOT match (would collapse
    # distinct unpriced cars).
    if price_band is not None:
        low_p, high_p = price_band
        filters.append(CarListing.price_lkr.between(low_p, high_p))
    else:
        # No price on the listing: never treat as a duplicate on price alone.
        filters.append(false())

    # Mileage — within band OR candidate mileage is NULL; skip filter when
    # listing mileage itself is NULL (any mileage is acceptable)
    if mileage_band is not None:
        low_m, high_m = mileage_band
        filters.append(
            or_(
                CarListing.mileage.is_(None),
                CarListing.mileage.between(low_m, high_m),
            )
        )

    # Over-fetch so the in-Python normalisation pass can still return *limit*.
    rows: list[CarListing] = (
        db.query(CarListing)
        .filter(and_(*filters))
        .limit(limit * 20)
        .all()
    )

    results = [
        r for r in rows if _norm(r.make) == norm_make and _norm(r.model) == norm_model
    ]
    return results[:limit]


def _price_match(listing, candidate) -> bool:
    """Replicate the DB-side price filter of :func:`find_duplicate_candidates`
    for the *listing* being scanned: a candidate matches when both sides have
    a non-null price within the 3% band. Both-null prices are NOT a match —
    distinct unpriced cars would otherwise collapse into one row."""
    band = _price_band(listing.price_lkr)
    if band is None:
        return False
    low, high = band
    return candidate.price_lkr is not None and low <= float(candidate.price_lkr) <= high


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalise to tz-aware UTC so in-memory comparisons are safe
    (SQLite returns naive datetimes, *since* arrives tz-aware)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _mileage_match(listing, candidate) -> bool:
    """Replicate the DB-side mileage filter of :func:`find_duplicate_candidates`
    for the *listing* being scanned: no constraint when the listing has no
    usable mileage, otherwise candidate must be NULL or within the 5% band."""
    band = _mileage_band(listing.mileage)
    if band is None:
        return True
    low, high = band
    return candidate.mileage is None or low <= int(candidate.mileage) <= high


def mark_duplicates_batch(
    db: Session,
    batch_size: int = 1000,
    since: Optional[datetime] = None,
) -> int:
    """Scan non-duplicate listings and flag the lower-id record as
    ``is_duplicate=True`` when a cross-source duplicate pair is detected.

    Matching (mirrors :func:`find_duplicate_candidates`): normalised make and
    model equal, year equal (None counts as equal), price within 3% (or both
    null-priced), mileage within 5% or either side unknown.  For each scanned
    listing the *lower*-id member of the pair is flagged as the duplicate and
    ``duplicate_of`` points at the higher-id canonical record.

    Implementation: the old version issued one candidate SELECT per listing
    (~one round-trip per row on remote Neon — over an hour on a 190k-row
    table).  This version fetches the candidate set once and resolves pairs in
    memory, then writes flags with batched statements (one round-trip per
    ``batch_size`` rows).

    When *since* is provided, only listings whose ``scraped_at`` is at or
    after *since* are scanned. A scanned listing still resolves pairs against
    older, unscanned candidates (the lower-id member gets flagged regardless
    of which member is scanned). Pass ``since=None`` for a full pass.

    Returns the number of listings newly marked as duplicates.
    """
    filters = [CarListing.is_duplicate == False]  # noqa: E712
    rows = (
        db.query(
            CarListing.id,
            CarListing.source,
            CarListing.make,
            CarListing.model,
            CarListing.year,
            CarListing.price_lkr,
            CarListing.mileage,
            CarListing.scraped_at,
        )
        .filter(and_(*filters))
        .all()
    )

    # Bucket by (normalised make, normalised model, year) — make/model/year
    # equality is a hard requirement, so only members of the same bucket can
    # ever match. Buckets are small (avg ~6 members), so pairwise checks are
    # cheap and stay in memory.
    buckets: dict[tuple[str, str, Optional[int]], list] = {}
    for row in rows:
        key = (_norm(row.make), _norm(row.model), row.year)
        if not key[0] or not key[1]:
            continue  # no usable make/model — the query path matches nothing
        buckets.setdefault(key, []).append(row)
    del rows

    total_marked = 0
    flagged_ids: set[int] = set()
    flag_updates: list[dict] = []

    for bucket in buckets.values():
        bucket.sort(key=lambda r: r.id)
        for listing in bucket:
            if since is not None and _as_utc(listing.scraped_at) < since:
                continue

            # Best (lowest-id) matching candidate that is not already flagged
            # and comes from a different source.
            best = None
            for candidate in bucket:
                if candidate.id == listing.id or candidate.source == listing.source:
                    continue
                if candidate.id in flagged_ids:
                    continue
                if not _price_match(listing, candidate):
                    continue
                if not _mileage_match(listing, candidate):
                    continue
                if best is None or candidate.id < best.id:
                    best = candidate
            if best is None:
                continue

            if best.id < listing.id:
                lower, higher = best, listing
            else:
                lower, higher = listing, best

            flag_updates.append(
                {
                    "id": int(lower.id),
                    "duplicate_of": int(higher.id),
                    "is_duplicate": True,
                }
            )
            flagged_ids.add(int(lower.id))
            total_marked += 1

            log.info(
                "duplicate_flagged",
                duplicate_id=int(lower.id),
                canonical_id=int(higher.id),
                source_duplicate=lower.source,
                source_canonical=higher.source,
                make=lower.make,
                model=lower.model,
                year=lower.year,
            )

    # Persist flags: one statement per batch (single round-trip on Postgres).
    if db.bind.dialect.name == "postgresql":
        for start in range(0, len(flag_updates), batch_size):
            chunk = flag_updates[start : start + batch_size]
            rows_sql = ", ".join(
                f"(:id_{i}, :dup_{i})" for i in range(len(chunk))
            )
            params: dict = {}
            for i, row in enumerate(chunk):
                params[f"id_{i}"] = row["id"]
                params[f"dup_{i}"] = row["duplicate_of"]
            _execute_with_deadlock_retry(
                db,
                text(
                    "UPDATE car_listings SET is_duplicate = true, "
                    "duplicate_of = v.dup_id "
                    f"FROM (VALUES {rows_sql}) AS v(id, dup_id) "
                    "WHERE car_listings.id = v.id"
                ),
                params,
            )
            db.commit()
    else:
        for start in range(0, len(flag_updates), batch_size):
            chunk = flag_updates[start : start + batch_size]
            db.execute(update(CarListing), chunk)
            db.commit()

    log.info("dedup_batch_complete", total_marked=total_marked)
    # Duplicates change the live listing set every aggregate reads — drop cache.
    try:
        from app.utils.stats_cache import invalidate_stats_cache

        invalidate_stats_cache(db)
    except Exception:
        log.warning("stats_cache_invalidate_failed", exc_info=True)
    return total_marked


def _execute_with_deadlock_retry(db: Session, statement, params: dict, retries: int = 3) -> None:
    """Execute a statement, retrying on Postgres deadlocks.

    Concurrent scrapers and analysis jobs both batch-update ``car_listings``;
    two such transactions can deadlock (Postgres aborts one with
    DeadlockDetected). The UPDATE is idempotent, so rolling back the aborted
    transaction and re-executing is safe.
    """
    import time

    for attempt in range(retries + 1):
        try:
            db.execute(statement, params)
            return
        except Exception as exc:  # noqa: BLE001 - need dialect-agnostic catch
            is_deadlock = "deadlock" in str(type(exc).__name__).lower() or "deadlock" in str(exc).lower()
            if not is_deadlock or attempt >= retries:
                raise
            log.warning("deadlock_retry", attempt=attempt + 1, retries=retries)
            db.rollback()
            time.sleep(0.5 * (attempt + 1))
