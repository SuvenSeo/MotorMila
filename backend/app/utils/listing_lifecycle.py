"""Dead-listing detection: soft-delete listings that stopped appearing.

A scraped listing not re-sighted at its source for ``stale_days`` (default
30, env ``LISTING_STALE_DAYS``) is marked ``is_active = False`` so it drops
out of counts, aggregates, alerts and search while its detail page stays
readable. Re-sighting flips it back to active (app.utils.listing_upsert).
First-party ``motormila_user`` listings are never swept here.

Guards:
- Failed latest scrape: if a source's most recent ``scrape_runs`` row is
  FAILED, a transient outage must not wipe its inventory, so rows between
  ``stale_days`` and ``hard_max_days`` (default 2x stale_days, env
  ``LISTING_HARD_MAX_DAYS``) are left alone for that source. Rows older than
  ``hard_max_days`` are always deactivated: we cannot honestly show a car
  as live when nobody has seen it for that long.
- Circuit breaker: ``app.utils.scrape_circuit_breaker.CIRCUIT_OPEN_SOURCES``
  (set after a mass-deactivation or price anomaly in this process) skips the
  source entirely for this pass.

The old "skip the source when >30% would be deactivated" cap was removed:
once a deep source's backlog passed 30% it was skipped forever, leaving
~258k ghost listings marked live.
"""

import os
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.utils.scrape_circuit_breaker import CIRCUIT_OPEN_SOURCES
from app.utils.time import utc_now
from db.models import CarListing, ScrapeRun

log = structlog.get_logger()

FIRST_PARTY_SOURCES = frozenset({"motormila_user"})


def _env_int(name: str, default: int) -> int:
    try:
        value = int(str(os.getenv(name, "") or "").strip() or default)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


DEFAULT_STALE_DAYS = _env_int("LISTING_STALE_DAYS", 30)
# Kept for import compatibility; the fraction cap is no longer applied.
DEFAULT_MAX_DEACTIVATION_FRACTION = 1.0


def _naive_utc(value: datetime | None) -> datetime | None:
    """Postgres timestamptz columns come back tz-aware while utc_now() is
    naive-UTC by convention — normalise before comparing (same hazard
    handled in stats_cache._is_fresh)."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _latest_scrape_failed(db: Session) -> dict[str, bool]:
    """``{source: True}`` when the source's most recent scrape run FAILED."""
    try:
        latest = (
            db.query(ScrapeRun.source, func.max(ScrapeRun.started_at).label("started"))
            .group_by(ScrapeRun.source)
            .subquery()
        )
        rows = (
            db.query(ScrapeRun.source, ScrapeRun.status)
            .join(latest, (ScrapeRun.source == latest.c.source) & (ScrapeRun.started_at == latest.c.started))
            .all()
        )
    except Exception as exc:  # noqa: BLE001 - missing table in odd envs
        log.warning("listing_lifecycle_scrape_runs_unreadable", error=str(exc))
        db.rollback()
        return {}
    failed: dict[str, bool] = {}
    for source, status in rows:
        key = str(source or "").strip().lower()
        is_failed = str(status or "").strip().upper() == "FAILED"
        # If several rows share the max started_at, any SUCCESS wins.
        failed[key] = failed.get(key, True) and is_failed
    return failed


def mark_inactive_listings(
    db: Session,
    *,
    stale_days: int | None = None,
    max_deactivation_fraction: float | None = None,  # noqa: ARG001 - legacy, ignored
    hard_max_days: int | None = None,
    now: datetime | None = None,
) -> dict:
    """Deactivate scraped listings unseen for *stale_days*; returns per-source counts."""
    stale_days = int(stale_days or DEFAULT_STALE_DAYS)
    if hard_max_days is None:
        hard_max_days = _env_int("LISTING_HARD_MAX_DAYS", stale_days * 2)
    hard_max_days = max(int(hard_max_days), stale_days)
    current = _naive_utc(now) if now is not None else utc_now()
    cutoff = current - timedelta(days=stale_days)
    hard_cutoff = current - timedelta(days=hard_max_days)

    sources = [
        row[0]
        for row in db.query(CarListing.source)
        .filter(CarListing.is_active == True)  # noqa: E712
        .distinct()
        .all()
        if row[0]
    ]
    failed_latest = _latest_scrape_failed(db)

    deactivated: dict[str, int] = {}
    skipped_sources: list[str] = []
    fraction_guarded: list[str] = []  # legacy key, always empty
    circuit_guarded: list[str] = []
    for source in sources:
        key = source.strip().lower()
        if key in FIRST_PARTY_SOURCES:
            continue
        if key in CIRCUIT_OPEN_SOURCES:
            circuit_guarded.append(source)
            log.warning(
                "listing_lifecycle_circuit_guard",
                source=source,
                reason="circuit_open_after_scrape_anomaly",
            )
            continue

        source_cutoff = cutoff
        if failed_latest.get(key):
            # Latest scrape failed: only expire rows past the hard ceiling.
            skipped_sources.append(source)
            source_cutoff = hard_cutoff
            log.warning(
                "listing_lifecycle_failed_scrape_guard",
                source=source,
                stale_days=stale_days,
                hard_max_days=hard_max_days,
            )

        count = (
            db.query(CarListing)
            .filter(
                CarListing.source == source,
                CarListing.is_active == True,  # noqa: E712
                CarListing.last_seen_at < source_cutoff,
            )
            .update(
                {"is_active": False, "content_updated_at": current},
                synchronize_session=False,
            )
        )
        if count:
            deactivated[source] = count

    db.commit()
    total = sum(deactivated.values())
    log.info(
        "listing_lifecycle_pass_complete",
        deactivated_total=total,
        deactivated_by_source=deactivated,
        failed_scrape_guarded_sources=skipped_sources,
        circuit_guarded_sources=circuit_guarded,
        stale_days=stale_days,
        hard_max_days=hard_max_days,
    )
    return {
        "deactivated_total": total,
        "deactivated_by_source": deactivated,
        "skipped_stale_sources": skipped_sources,
        "fraction_guarded_sources": fraction_guarded,
        "circuit_guarded_sources": circuit_guarded,
    }
