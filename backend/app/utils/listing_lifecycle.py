"""Dead-listing detection: soft-delete listings that stopped appearing.

A listing not re-sighted at its source for ``stale_days`` is marked
``is_active = False`` so it drops out of market aggregates, alerts, and
search while remaining readable on its detail page. Re-sighting flips it
back to active (handled in app.utils.listing_upsert).

Three guards protect against mass-deactivation:
- Per-source freshness: a source is only swept when it has at least one
  fresh sighting inside the window — a scraper that has been failing
  outright for days must not mass-deactivate its own inventory.
- Deactivation-fraction cap: if more than ``max_deactivation_fraction`` of
  a source's active listings would be deactivated in one pass (e.g. the
  crawl only reaches the first N pages of a deep source, so older-but-live
  listings are never re-sighted), the source is skipped and logged instead.
- Circuit breaker: ``app.utils.scrape_circuit_breaker.CIRCUIT_OPEN_SOURCES``
  is checked per-source.  When a source's circuit is open (set by
  ``trip_if_needed`` after a mass-deactivation or price-anomaly warning),
  that source is unconditionally skipped here.  The circuit resets on the
  next process start.
"""

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.utils.scrape_circuit_breaker import CIRCUIT_OPEN_SOURCES
from app.utils.time import utc_now
from db.models import CarListing

log = structlog.get_logger()

DEFAULT_STALE_DAYS = 7
DEFAULT_MAX_DEACTIVATION_FRACTION = 0.3


def _naive_utc(value: datetime | None) -> datetime | None:
    """Postgres timestamptz columns come back tz-aware while utc_now() is
    naive-UTC by convention — normalise before comparing (same hazard
    handled in stats_cache._is_fresh)."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def mark_inactive_listings(
    db: Session,
    *,
    stale_days: int = DEFAULT_STALE_DAYS,
    max_deactivation_fraction: float = DEFAULT_MAX_DEACTIVATION_FRACTION,
    now: datetime | None = None,
) -> dict:
    """Deactivate listings unseen for *stale_days*; returns per-source counts.

    Consults ``scrape_circuit_breaker.CIRCUIT_OPEN_SOURCES`` before sweeping
    each source.  A source whose circuit is open is added to
    ``circuit_guarded_sources`` and skipped unconditionally.
    """
    current = _naive_utc(now) if now is not None else utc_now()
    cutoff = current - timedelta(days=stale_days)

    freshest_per_source = dict(
        db.query(CarListing.source, func.max(CarListing.last_seen_at))
        .group_by(CarListing.source)
        .all()
    )

    deactivated: dict[str, int] = {}
    skipped_sources: list[str] = []
    fraction_guarded: list[str] = []
    circuit_guarded: list[str] = []
    for source, freshest in freshest_per_source.items():
        if source.strip().lower() in CIRCUIT_OPEN_SOURCES:
            circuit_guarded.append(source)
            log.warning(
                "listing_lifecycle_circuit_guard",
                source=source,
                reason="circuit_open_after_scrape_anomaly",
            )
            continue

        freshest = _naive_utc(freshest)
        if freshest is None or freshest < cutoff:
            # Whole source is stale — scraper likely broken; do not sweep.
            skipped_sources.append(source)
            continue

        stale_query = db.query(CarListing).filter(
            CarListing.source == source,
            CarListing.is_active == True,  # noqa: E712
            CarListing.last_seen_at < cutoff,
        )
        active_total = (
            db.query(func.count(CarListing.id))
            .filter(CarListing.source == source, CarListing.is_active == True)  # noqa: E712
            .scalar()
            or 0
        )
        stale_count = stale_query.count()
        if active_total and stale_count / active_total > max_deactivation_fraction:
            # A sweep this large means "not re-sighted" ≠ "dead" for this
            # source (crawl horizon shallower than its inventory). Skip.
            fraction_guarded.append(source)
            log.warning(
                "listing_lifecycle_fraction_guard",
                source=source,
                stale_count=stale_count,
                active_total=active_total,
                max_fraction=max_deactivation_fraction,
            )
            continue

        count = stale_query.update(
            {"is_active": False, "content_updated_at": current},
            synchronize_session=False,
        )
        if count:
            deactivated[source] = count

    db.commit()
    total = sum(deactivated.values())
    log.info(
        "listing_lifecycle_pass_complete",
        deactivated_total=total,
        deactivated_by_source=deactivated,
        skipped_stale_sources=skipped_sources,
        fraction_guarded_sources=fraction_guarded,
        circuit_guarded_sources=circuit_guarded,
        stale_days=stale_days,
    )
    return {
        "deactivated_total": total,
        "deactivated_by_source": deactivated,
        "skipped_stale_sources": skipped_sources,
        "fraction_guarded_sources": fraction_guarded,
        "circuit_guarded_sources": circuit_guarded,
    }
