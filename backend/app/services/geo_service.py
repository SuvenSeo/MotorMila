"""Provider-neutral listing geocode. Geoapify is the current adapter.

Keys stay server-side. Results live in listing_geo_enrichment so we never
overwrite car_listings.raw_location. Lookups are cached until the source
location text changes. A circuit breaker stops hammering Geoapify after
repeated upstream failures.
"""

from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from sqlalchemy.orm import Session

from app.services.providers.envelope import enrichment_ok, enrichment_unavailable
from app.services.providers.flags import is_enabled
from app.services.providers.sync import finish_sync_run, start_sync_run
from db.models import CarListing, ListingGeoEnrichment, live_listing_filter

log = structlog.get_logger()

GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
USER_AGENT = "MotorMila/1.0 (+https://motormila.pages.dev)"
MARKET_SCOPE = "Sri Lanka (geocoded ad location)"
LICENSE_NOTE = "Geoapify geocoding. Derived from listing location text, not vehicle telemetry."
LIMITATION = (
    "Geocoded from the ad location text. This is not a GPS pin of the individual vehicle."
)
SOURCE_URL = "https://www.geoapify.com/geocoding-api/"
CIRCUIT_FAILURE_THRESHOLD = 5
CIRCUIT_COOLDOWN_SECONDS = 900
_LOW_TYPES = frozenset({"country", "continent", "unknown", ""})
_TYPE_FLOOR = {
    "amenity": 0.94,
    "building": 0.92,
    "street": 0.88,
    "suburb": 0.75,
    "district": 0.68,
    "city": 0.68,
    "county": 0.52,
    "state": 0.45,
    "postcode": 0.6,
}

_failures = 0
_opened_at: float | None = None


def reset_circuit() -> None:
    global _failures, _opened_at
    _failures = 0
    _opened_at = None


def _circuit_open() -> bool:
    global _failures, _opened_at
    if _opened_at is None:
        return False
    if time.monotonic() - _opened_at >= CIRCUIT_COOLDOWN_SECONDS:
        _failures = 0
        _opened_at = None
        return False
    return True


def _record_success() -> None:
    reset_circuit()


def _record_failure() -> None:
    global _failures, _opened_at
    _failures += 1
    if _failures >= CIRCUIT_FAILURE_THRESHOLD:
        _opened_at = time.monotonic()


def _unavailable(reason: str) -> dict[str, Any]:
    return enrichment_unavailable(
        provider="geoapify",
        market_scope=MARKET_SCOPE,
        reason=reason,
        limitation=LIMITATION,
        license_note=LICENSE_NOTE,
        source_url=SOURCE_URL,
    )


def source_location_key(
    raw_location: str | None,
    district: str | None,
    city: str | None,
) -> str:
    parts = [
        " ".join(str(raw_location or "").strip().lower().split()),
        " ".join(str(district or "").strip().lower().split()),
        " ".join(str(city or "").strip().lower().split()),
    ]
    blob = "|".join(parts)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _query_text(listing: CarListing) -> str:
    parts = [
        str(listing.raw_location or "").strip(),
        str(listing.city or "").strip(),
        str(listing.district or "").strip(),
    ]
    seen: list[str] = []
    for part in parts:
        if part and part.lower() not in {item.lower() for item in seen}:
            seen.append(part)
    if not seen:
        return ""
    text = ", ".join(seen)
    if "sri lanka" not in text.lower():
        text = f"{text}, Sri Lanka"
    return text


def _confidence(result_type: str, rank: dict[str, Any]) -> float:
    raw = rank.get("confidence")
    try:
        score = float(raw) if raw is not None else 0.0
    except (TypeError, ValueError):
        score = 0.0
    if score <= 0:
        score = _TYPE_FLOOR.get(result_type, 0.5)
    score = min(max(score, 0.0), 1.0)
    if result_type in _LOW_TYPES:
        return round(min(score, 0.25), 4)
    return round(score, 4)


def _parse_feature(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    features = payload.get("features") or []
    if not features or not isinstance(features[0], dict):
        return None
    feature = features[0]
    props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    country = str(props.get("country_code") or "").strip().lower()
    if country and country != "lk":
        return None
    result_type = str(props.get("result_type") or "").strip().lower()
    if result_type in _LOW_TYPES:
        return None
    try:
        lat = float(props.get("lat"))
        lng = float(props.get("lon") if props.get("lon") is not None else props.get("lng"))
    except (TypeError, ValueError):
        geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
        coords = geometry.get("coordinates") if isinstance(geometry.get("coordinates"), list) else []
        if len(coords) < 2:
            return None
        try:
            lng = float(coords[0])
            lat = float(coords[1])
        except (TypeError, ValueError):
            return None
    rank = props.get("rank") if isinstance(props.get("rank"), dict) else {}
    confidence = _confidence(result_type, rank)
    if confidence <= 0:
        return None
    return {
        "lat": lat,
        "lng": lng,
        "formatted": str(props.get("formatted") or "").strip() or None,
        "result_type": result_type or "unknown",
        "match_confidence": confidence,
        "city": props.get("city"),
        "suburb": props.get("suburb"),
    }


def _from_row(row: ListingGeoEnrichment) -> dict[str, Any]:
    data = {
        "lat": float(row.lat) if row.lat is not None else None,
        "lng": float(row.lng) if row.lng is not None else None,
        "formatted": row.formatted_address,
        "result_type": row.result_type,
    }
    confidence = float(row.match_confidence) if row.match_confidence is not None else 0.0
    return enrichment_ok(
        provider=row.provider or "geoapify",
        market_scope=MARKET_SCOPE,
        license_note=LICENSE_NOTE,
        match_confidence=confidence,
        source_url=row.source_url or SOURCE_URL,
        data=data,
        limitation=LIMITATION,
    )


def _persist(
    db: Session,
    listing: CarListing,
    *,
    location_hash: str,
    parsed: dict[str, Any],
) -> ListingGeoEnrichment:
    row = db.query(ListingGeoEnrichment).filter(ListingGeoEnrichment.listing_id == listing.id).first()
    now = datetime.now(timezone.utc)
    if row is None:
        row = ListingGeoEnrichment(listing_id=listing.id)
        db.add(row)
    row.provider = "geoapify"
    row.source_location_hash = location_hash
    row.lat = parsed["lat"]
    row.lng = parsed["lng"]
    row.formatted_address = parsed.get("formatted")
    row.result_type = parsed.get("result_type")
    row.match_confidence = parsed.get("match_confidence")
    row.payload = parsed
    row.source_url = SOURCE_URL
    row.fetched_at = now
    db.commit()
    db.refresh(row)
    return row


def _geocode(
    *,
    text: str,
    client: httpx.Client | None,
    api_key: str,
) -> dict[str, Any] | None:
    owns = client is None
    http = client or httpx.Client(
        timeout=20.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        response = http.get(
            GEOCODE_URL,
            params={
                "text": text,
                "apiKey": api_key,
                "filter": "countrycode:lk",
                "bias": "countrycode:lk",
                "limit": 1,
                "format": "geojson",
            },
        )
        response.raise_for_status()
        return _parse_feature(response.json())
    finally:
        if owns:
            http.close()


def enrich_listing(
    db: Session,
    listing: CarListing,
    *,
    client: httpx.Client | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    try:
        if not is_enabled("geoapify"):
            return _unavailable("disabled")

        location_hash = source_location_key(listing.raw_location, listing.district, listing.city)
        existing = (
            db.query(ListingGeoEnrichment)
            .filter(ListingGeoEnrichment.listing_id == listing.id)
            .first()
        )
        if existing is not None and existing.source_location_hash == location_hash:
            return _from_row(existing)

        if _circuit_open():
            return _unavailable("circuit_open")
        key = (api_key if api_key is not None else os.getenv("GEOAPIFY_API_KEY", "")).strip()
        if not key:
            return _unavailable("missing_key")

        text = _query_text(listing)
        if not text:
            return _unavailable("incomplete_location")

        try:
            parsed = _geocode(text=text, client=client, api_key=key)
        except Exception as exc:
            log.warning("geoapify_geocode_failed", listing_id=listing.id, error=str(exc))
            _record_failure()
            return _unavailable("upstream_error")

        if parsed is None:
            _record_success()
            return _unavailable("no_lk_match")

        _record_success()
        row = _persist(db, listing, location_hash=location_hash, parsed=parsed)
        return _from_row(row)
    except Exception as exc:
        log.warning("geo_enrich_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass
        return _unavailable("upstream_error")


def sample_geocode(
    db: Session,
    *,
    limit: int = 100,
    client: httpx.Client | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    if not is_enabled("geoapify"):
        return {"status": "skipped", "reason": "disabled", "attempted": 0, "matched": 0}
    key = (api_key if api_key is not None else os.getenv("GEOAPIFY_API_KEY", "")).strip()
    if not key:
        return {"status": "skipped", "reason": "missing_key", "attempted": 0, "matched": 0}

    cap = max(1, min(int(limit), 100))
    run = start_sync_run(db, provider="geoapify", details={"limit": cap})
    rows = (
        db.query(CarListing)
        .filter(live_listing_filter())
        .order_by(CarListing.last_seen_at.desc())
        .limit(cap)
        .all()
    )
    attempted = 0
    matched = 0
    failures = 0
    samples: list[dict[str, Any]] = []
    for listing in rows:
        attempted += 1
        payload = enrich_listing(db, listing, client=client, api_key=key)
        if payload.get("available"):
            matched += 1
            data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
            samples.append(
                {
                    "listing_id": listing.id,
                    "match_confidence": payload.get("match_confidence"),
                    "result_type": data.get("result_type"),
                    "formatted": data.get("formatted"),
                }
            )
        elif payload.get("unavailable_reason") == "upstream_error":
            failures += 1
        if _circuit_open():
            break
    status = "success" if failures == 0 else ("partial" if matched else "failed")
    finish_sync_run(
        db,
        run,
        status=status,
        rows=matched,
        failures=failures,
        details={"attempted": attempted, "matched": matched},
    )
    rate = round(matched / attempted, 4) if attempted else 0.0
    return {
        "status": status,
        "attempted": attempted,
        "matched": matched,
        "failures": failures,
        "match_rate": rate,
        "samples": samples[:20],
    }
