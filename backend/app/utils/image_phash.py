"""Perceptual-hash (pHash) image dedup + background job queue.

Reverses the earlier "do not build" call on photo AI: full inspection-grade
photo AI is still out of scope, but a 64-bit perceptual hash of each
listing's thumbnail is cheap and lets the listing-history report catch the
same physical vehicle re-listed with an edited year, district, or price —
the cases spec-based heuristic matching misses entirely.

``compute_phash`` never raises: a fetch/decode failure just means that
listing has no hash yet and is skipped by hash-based matching, which
degrades gracefully to the existing heuristic.

Queue model: ``image_phash_jobs`` holds pending listing IDs. Sync enqueues
rows that still need a hash, then ``process_phash_queue`` drains them with
a thread pool so scrape latency is not blocked on image I/O.
"""

from __future__ import annotations

import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Iterable, Optional

import httpx
import imagehash
import structlog
from PIL import Image
from sqlalchemy.orm import Session

from db.models import CarListing, ImagePhashJob

log = structlog.get_logger()

_FETCH_TIMEOUT_SECONDS = 5.0
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB guard against oversized/hostile responses
_DEFAULT_BATCH_LIMIT = 200
_DEFAULT_WORKERS = 4
_MAX_ATTEMPTS = 3

# Two 64-bit pHashes differing by this many bits or fewer are treated as the
# same photo. 10 is a widely used near-duplicate threshold (out of 64 bits).
PHASH_MATCH_THRESHOLD = 10


def compute_phash(url: str, timeout: float = _FETCH_TIMEOUT_SECONDS) -> str | None:
    """Fetch *url* and return its 64-bit pHash as a 16-char hex string, or None."""
    if not url or not url.strip():
        return None
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            if len(resp.content) > _MAX_IMAGE_BYTES:
                return None
            image = Image.open(io.BytesIO(resp.content))
            image.load()
        return str(imagehash.phash(image))
    except Exception as exc:
        log.debug("image_phash_compute_failed", url=url, error=str(exc))
        return None


def hamming_distance(hash_a: str | None, hash_b: str | None) -> int | None:
    """Bit distance between two hex-encoded pHashes, or None if either is missing/invalid."""
    if not hash_a or not hash_b:
        return None
    try:
        return imagehash.hex_to_hash(hash_a) - imagehash.hex_to_hash(hash_b)
    except (ValueError, TypeError):
        return None


def is_same_photo(hash_a: str | None, hash_b: str | None, threshold: int = PHASH_MATCH_THRESHOLD) -> bool:
    distance = hamming_distance(hash_a, hash_b)
    return distance is not None and distance <= threshold


def enqueue_phash_jobs(db: Session, listing_ids: Iterable[int]) -> int:
    """Insert pending jobs for listing IDs that are not already queued/done."""
    ids = sorted({int(i) for i in listing_ids if i is not None})
    if not ids:
        return 0

    existing = {
        int(row.listing_id)
        for row in db.query(ImagePhashJob.listing_id)
        .filter(
            ImagePhashJob.listing_id.in_(ids),
            ImagePhashJob.status.in_(("pending", "processing", "done")),
        )
        .all()
    }
    created = 0
    for listing_id in ids:
        if listing_id in existing:
            continue
        db.add(ImagePhashJob(listing_id=listing_id, status="pending", attempts=0))
        created += 1
    if created:
        db.commit()
    return created


def enqueue_missing_phash_listings(db: Session, batch_limit: int = _DEFAULT_BATCH_LIMIT) -> int:
    """Queue listings that have a thumbnail but no hash yet."""
    rows = (
        db.query(CarListing.id)
        .filter(
            CarListing.thumbnail_url.isnot(None),
            CarListing.image_phash.is_(None),
        )
        .limit(batch_limit)
        .all()
    )
    return enqueue_phash_jobs(db, [int(r.id) for r in rows])


def _claim_pending_jobs(db: Session, batch_limit: int) -> list[ImagePhashJob]:
    jobs = (
        db.query(ImagePhashJob)
        .filter(ImagePhashJob.status == "pending")
        .order_by(ImagePhashJob.id.asc())
        .limit(batch_limit)
        .all()
    )
    now = datetime.now(timezone.utc)
    for job in jobs:
        job.status = "processing"
        job.attempts = int(job.attempts or 0) + 1
        job.updated_at = now
    if jobs:
        db.commit()
        for job in jobs:
            db.refresh(job)
    return jobs


def process_phash_queue(
    db: Session,
    batch_limit: int = _DEFAULT_BATCH_LIMIT,
    workers: int = _DEFAULT_WORKERS,
) -> dict[str, int]:
    """Drain pending pHash jobs with a thread pool. Fail-open per job."""
    jobs = _claim_pending_jobs(db, batch_limit)
    if not jobs:
        return {"claimed": 0, "done": 0, "failed": 0}

    listing_ids = [int(j.listing_id) for j in jobs]
    listings = {
        int(row.id): row
        for row in db.query(CarListing).filter(CarListing.id.in_(listing_ids)).all()
    }

    work: list[tuple[int, Optional[str]]] = []
    for job in jobs:
        listing = listings.get(int(job.listing_id))
        url = listing.thumbnail_url if listing is not None else None
        work.append((int(job.id), url))

    results: dict[int, tuple[Optional[str], Optional[str]]] = {}

    def _run(job_id: int, url: Optional[str]) -> tuple[int, Optional[str], Optional[str]]:
        if not url:
            return job_id, None, "missing_thumbnail"
        try:
            return job_id, compute_phash(url), None
        except Exception as exc:  # noqa: BLE001
            return job_id, None, str(exc)[:300]

    worker_count = max(1, min(workers, len(work)))
    with ThreadPoolExecutor(max_workers=worker_count) as pool:
        futures = [pool.submit(_run, job_id, url) for job_id, url in work]
        for fut in as_completed(futures):
            job_id, phash, err = fut.result()
            results[job_id] = (phash, err)

    done = 0
    failed = 0
    now = datetime.now(timezone.utc)
    for job in jobs:
        phash, err = results.get(int(job.id), (None, "no_result"))
        listing = listings.get(int(job.listing_id))
        if phash and listing is not None:
            listing.image_phash = phash
            job.status = "done"
            job.last_error = None
            job.updated_at = now
            done += 1
        else:
            attempts = int(job.attempts or 0)
            job.last_error = err or "compute_failed"
            job.updated_at = now
            if attempts >= _MAX_ATTEMPTS:
                job.status = "failed"
                failed += 1
            else:
                job.status = "pending"
                failed += 1

    db.commit()
    return {"claimed": len(jobs), "done": done, "failed": failed}


def backfill_image_phash(db: Session, batch_limit: int = _DEFAULT_BATCH_LIMIT) -> int:
    """Enqueue missing hashes then drain the queue (sync-compatible entrypoint)."""
    enqueue_missing_phash_listings(db, batch_limit=batch_limit)
    result = process_phash_queue(db, batch_limit=batch_limit)
    return int(result.get("done") or 0)
