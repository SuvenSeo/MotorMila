"""Shared listing upsert with per-listing price-history recording.

Every scraper funnels through :func:`upsert_listing` so a price change is
never silently overwritten: the first sighting and each subsequent change
insert a row into ``vehicle_price_history``. Unchanged prices do not add
rows, keeping the table proportional to real market movement.
"""

from decimal import Decimal, InvalidOperation

import structlog
from sqlalchemy.orm import Session

from app.utils.time import utc_now
from db.models import CarListing, VehiclePriceHistory

log = structlog.get_logger()

# Re-scrapes and dump merges send a fresh scraped_at (and sometimes a dump
# first_seen_at). Discovery time must stay the original sighting or the
# public "newest" grid keeps surfacing the same dealer stock.
_UPDATE_IMMUTABLE_KEYS = frozenset({"id", "first_seen_at", "source", "source_id"})

# Columns that must never be overwritten with an empty value on update.
# ``images`` is only populated by scrapers that enumerate full galleries; an
# older dump (or a scraper that only knows the thumbnail) carries NULL, and
# writing that would wipe a gallery the merged DB already has.
_UPDATE_SKIP_EMPTY_KEYS = frozenset({"images"})


def _as_decimal(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _record_price_point(db: Session, listing_id: int, price) -> None:
    price_dec = _as_decimal(price)
    if price_dec is None:
        return
    db.add(
        VehiclePriceHistory(
            vehicle_id=listing_id,
            price_lkr=price_dec,
            scraped_at=utc_now(),
        )
    )


def upsert_listings_batch(
    db: Session,
    source: str,
    payloads: list[dict],
    *,
    log_tag: str = "listing_batch",
) -> int:
    """Upsert many listings with a single commit.

    Scrapers previously called :func:`upsert_listing` + ``db.commit()`` once
    per listing — on a remote Postgres that's one network round-trip per row
    (~44 per riyasewana page), which dominates crawl time.  Batching to one
    commit per page cuts that ~44x.  Each row runs in its own savepoint so a
    bad row only drops that row, never the whole page.

    Returns how many rows were newly inserted.
    """
    inserted = 0
    for payload in payloads:
        try:
            with db.begin_nested():
                if upsert_listing(db, source, payload):
                    inserted += 1
        except Exception:
            # Savepoint already rolled back; sibling rows survive.
            log.warning(
                f"{log_tag}_row_skipped",
                source=source,
                source_id=str(payload.get("source_id") or "")[:200],
            )
    db.commit()
    return inserted


def buffered_upsert_listing(scraper, payload: dict, *, batch_size: int = 40) -> bool:
    """Buffer a payload on the scraper, flushing to the DB when full.

    Many scrapers call ``_upsert_listing(payload)`` followed by
    ``db.commit()`` once per row.  Buffering here turns N per-row commits
    into N/batch_size commits; the caller's leftover ``db.commit()`` becomes
    a no-op (verified: an idle commit sends zero SQL).  Call
    :func:`flush_upsert_buffer` at the end of a scrape to persist trailing
    rows.
    """
    buffer = getattr(scraper, "_upsert_buffer", None)
    if buffer is None:
        buffer = scraper._upsert_buffer = []
    if len(buffer) >= batch_size:
        flush_upsert_buffer(scraper)
        buffer = scraper._upsert_buffer
    buffer.append(payload)
    return True


def flush_upsert_buffer(scraper) -> None:
    """Persist any rows still sitting in the scraper's upsert buffer."""
    pending = getattr(scraper, "_upsert_buffer", None)
    if not pending:
        return
    upsert_listings_batch(
        scraper.db,
        scraper.SOURCE,
        pending,
        log_tag=f"{scraper.SOURCE}_batch",
    )
    scraper._upsert_buffer = []


def upsert_listing(
    db: Session,
    source: str,
    payload: dict,
    *,
    preserve_lifecycle: bool = False,
) -> bool:
    """Insert or update a listing keyed on (source, source_id).

    Returns True when a new listing was created, False on update.
    Records a ``vehicle_price_history`` row on first sighting and whenever
    the price changes on re-scrape.

    When *preserve_lifecycle* is True (dump-merge path), do NOT force
    ``is_active=True`` or stamp ``last_seen_at=now()`` — merging an old dump
    must not resurrect lifecycle-deactivated listings or falsify freshness.
    """
    existing = (
        db.query(CarListing)
        .filter(
            CarListing.source == source,
            CarListing.source_id == payload["source_id"],
        )
        .first()
    )

    if existing:
        old_price = _as_decimal(existing.price_lkr)
        was_active = bool(existing.is_active)
        for key, value in payload.items():
            if key in _UPDATE_IMMUTABLE_KEYS:
                continue
            if key in _UPDATE_SKIP_EMPTY_KEYS and not value:
                # Never let an older dump / thumbnail-only scrape wipe a
                # gallery the row already has.
                continue
            setattr(existing, key, value)
        if not preserve_lifecycle:
            existing.last_seen_at = utc_now()
            existing.is_active = True  # re-sighted at source: live again

        new_price = _as_decimal(payload.get("price_lkr"))
        price_changed = new_price is not None and new_price != old_price
        status_changed = not preserve_lifecycle and not was_active  # flipped inactive → active
        if price_changed:
            _record_price_point(db, existing.id, new_price)
            log.info(
                "price_change_recorded",
                source=source,
                source_id=payload["source_id"],
                old_price=str(old_price) if old_price is not None else None,
                new_price=str(new_price),
            )
        if price_changed or status_changed:
            existing.content_updated_at = utc_now()
        return False

    listing = CarListing(**payload)
    db.add(listing)
    db.flush()  # assign listing.id for the initial history row
    now = utc_now()
    if listing.content_updated_at is None:
        listing.content_updated_at = now
    _record_price_point(db, listing.id, payload.get("price_lkr"))
    return True
