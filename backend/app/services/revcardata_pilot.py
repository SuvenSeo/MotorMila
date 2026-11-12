"""RevCarData 100-record match-rate pilot.

Tooling only: stratified sample, match/false-match/completeness report.
Never writes specs onto listings and never feeds foreign MSRP into LKR FMV.
"""

from __future__ import annotations

import os
import re
from typing import Any, Iterable

import httpx
import structlog
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.services.providers.flags import is_enabled
from app.services.providers.sync import finish_sync_run, start_sync_run
from db.models import CarListing, live_listing_filter

log = structlog.get_logger()

VEHICLES_URL = "https://api.revcardata.com/api/v1/vehicles"
USER_AGENT = "MotorMila/1.0 (+https://motormila.pages.dev)"
MSRP_NOTE = "MSRP is recorded for completeness only and is not used for LKR FMV."
CORE_FIELDS = ("engine", "fuel", "body", "displacement_cc")
JDM_MODELS = frozenset(
    {
        "axio",
        "allion",
        "premio",
        "vezel",
        "fit",
        "aqua",
        "wagon r",
        "wagonr",
        "alto",
        "mira",
        "swift",
        "prius c",
        "grace",
        "fielder",
        "succeed",
        "probox",
        "vitz",
        "passo",
    }
)
_STOP = frozenset({"the", "new", "car", "sedan"})


def _norm(value: Any) -> str:
    cleaned = str(value or "").strip().lower().replace("-", " ").replace("_", " ")
    return " ".join(cleaned.split())


def _tokens(value: Any) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", _norm(value)) if token and token not in _STOP}


def _jaccard(left: Any, right: Any) -> float:
    a, b = _tokens(left), _tokens(right)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _is_hard(listing: CarListing) -> bool:
    model = _norm(listing.model)
    fuel = _norm(listing.fuel_type)
    year = listing.year or 9999
    if model in JDM_MODELS or any(token in model for token in JDM_MODELS):
        return True
    if "electric" in fuel or fuel == "ev":
        return True
    if "hybrid" in fuel or "phev" in fuel:
        return True
    return year <= 2010


def select_pilot_sample(
    db: Session,
    *,
    popular_n: int = 50,
    hard_n: int = 50,
) -> list[CarListing]:
    popular_n = max(0, int(popular_n))
    hard_n = max(0, int(hard_n))
    ranked = (
        db.query(CarListing.make, CarListing.model, func.count(CarListing.id).label("n"))
        .filter(live_listing_filter())
        .group_by(CarListing.make, CarListing.model)
        .order_by(func.count(CarListing.id).desc())
        .limit(popular_n)
        .all()
    )
    chosen: list[CarListing] = []
    seen_ids: set[int] = set()
    seen_models: set[tuple[str, str]] = set()
    for make, model, _count in ranked:
        row = (
            db.query(CarListing)
            .filter(live_listing_filter(), CarListing.make == make, CarListing.model == model)
            .order_by(CarListing.last_seen_at.desc())
            .first()
        )
        if row is None or row.id in seen_ids:
            continue
        chosen.append(row)
        seen_ids.add(row.id)
        seen_models.add((_norm(row.make), _norm(row.model)))
    hard_added = 0
    hard_rows = (
        db.query(CarListing)
        .filter(live_listing_filter())
        .order_by(CarListing.last_seen_at.desc())
        .all()
    )
    for row in hard_rows:
        if hard_added >= hard_n:
            break
        model_key = (_norm(row.make), _norm(row.model))
        if row.id in seen_ids or model_key in seen_models or not _is_hard(row):
            continue
        chosen.append(row)
        seen_ids.add(row.id)
        seen_models.add(model_key)
        hard_added += 1
    return chosen


def match_listing(listing: CarListing, items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = [item for item in items if isinstance(item, dict)]
    listing_make = _norm(listing.make)
    best: dict[str, Any] | None = None
    best_j = -1.0
    for item in rows:
        if _norm(item.get("make") or item.get("Make")) != listing_make:
            continue
        model = item.get("model") or item.get("Model")
        score = _jaccard(listing.model, model)
        if score > best_j:
            best_j = score
            best = item
    base = {
        "listing_id": listing.id,
        "make": listing.make,
        "model": listing.model,
        "year": listing.year,
        "msrp_used_for_fmv": False,
    }
    if best is None:
        return {**base, "outcome": "unmatched", "match_confidence": 0.0, "provider_model": None}
    year_ok = True
    try:
        provider_year = int(best.get("year") or best.get("Year"))
        listing_year = int(listing.year)
        year_ok = abs(provider_year - listing_year) <= 1
    except (TypeError, ValueError):
        year_ok = True
    provider_model = best.get("model") or best.get("Model")
    if best_j >= 0.5 and year_ok:
        return {
            **base,
            "outcome": "match",
            "match_confidence": round(0.7 + 0.25 * best_j, 4),
            "provider_model": provider_model,
            "provider_id": best.get("id"),
        }
    if best_j < 0.3:
        return {
            **base,
            "outcome": "false_match",
            "match_confidence": round(best_j, 4),
            "provider_model": provider_model,
        }
    return {
        **base,
        "outcome": "unmatched",
        "match_confidence": round(best_j, 4),
        "provider_model": provider_model,
    }


def field_completeness(vehicles: list[dict[str, Any]]) -> dict[str, Any]:
    if not vehicles:
        return {"core_fill_rate": 0.0, "msrp_present_rate": 0.0, "msrp_note": MSRP_NOTE}
    filled = 0
    total = 0
    msrp_n = 0
    for vehicle in vehicles:
        for field in CORE_FIELDS:
            total += 1
            value = vehicle.get(field)
            if value not in (None, ""):
                filled += 1
        pricing = vehicle.get("pricing") if isinstance(vehicle.get("pricing"), dict) else {}
        if vehicle.get("base_msrp_usd") not in (None, "") or pricing.get("base_msrp_usd") not in (None, ""):
            msrp_n += 1
    return {
        "core_fill_rate": round(filled / total, 4) if total else 0.0,
        "msrp_present_rate": round(msrp_n / len(vehicles), 4),
        "msrp_note": MSRP_NOTE,
    }


def _items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("items", "data", "vehicles", "results"):
        rows = payload.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def _lookup(listing: CarListing, *, client: httpx.Client, api_key: str) -> list[dict[str, Any]]:
    response = client.get(
        VEHICLES_URL,
        params={"make": listing.make, "model": listing.model, "year": listing.year},
        headers={"X-API-Key": api_key, "User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    response.raise_for_status()
    return _items(response.json())


def run_pilot(
    db: Session,
    *,
    client: httpx.Client | None = None,
    api_key: str | None = None,
    popular_n: int = 50,
    hard_n: int = 50,
) -> dict[str, Any]:
    empty = {
        "matched": 0,
        "unmatched": 0,
        "false_matches": 0,
        "attempted": 0,
        "msrp_used_for_lkr_fmv": False,
    }
    if not is_enabled("revcardata"):
        return {"status": "skipped", "reason": "disabled", **empty}
    key = (api_key if api_key is not None else os.getenv("REVCARDATA_API_KEY", "")).strip()
    if not key:
        return {"status": "skipped", "reason": "missing_key", **empty}

    sample = select_pilot_sample(db, popular_n=popular_n, hard_n=hard_n)
    run = start_sync_run(
        db,
        provider="revcardata",
        details={"popular_n": popular_n, "hard_n": hard_n, "sample": len(sample)},
    )
    owns = client is None
    http = client or httpx.Client(timeout=30.0, follow_redirects=True)
    matched = 0
    unmatched = 0
    false_matches = 0
    matched_vehicles: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    try:
        for listing in sample:
            try:
                items = _lookup(listing, client=http, api_key=key)
            except Exception as exc:
                log.warning("revcardata_lookup_failed", listing_id=listing.id, error=str(exc))
                unmatched += 1
                rows.append(
                    {
                        "listing_id": listing.id,
                        "make": listing.make,
                        "model": listing.model,
                        "outcome": "unmatched",
                        "msrp_used_for_fmv": False,
                    }
                )
                continue
            scored = match_listing(listing, items)
            rows.append(scored)
            if scored["outcome"] == "match":
                matched += 1
                if items:
                    matched_vehicles.append(items[0])
            elif scored["outcome"] == "false_match":
                false_matches += 1
            else:
                unmatched += 1
        completeness = field_completeness(matched_vehicles)
        attempted = len(sample)
        rate = round(matched / attempted, 4) if attempted else 0.0
        report = {
            "status": "success",
            "attempted": attempted,
            "matched": matched,
            "unmatched": unmatched,
            "false_matches": false_matches,
            "match_rate": rate,
            "field_completeness": completeness,
            "msrp_used_for_lkr_fmv": False,
            "limitation": (
                "Pilot only. Foreign MSRP and US/EU specs are not Sri Lanka transaction prices "
                "and are not applied to LKR FMV."
            ),
            "samples": rows[:25],
        }
        finish_sync_run(
            db,
            run,
            status="success",
            rows=matched,
            failures=false_matches + unmatched,
            details={"match_rate": rate, "false_matches": false_matches, "msrp_used_for_lkr_fmv": False},
        )
        return report
    except Exception as exc:
        log.warning("revcardata_pilot_failed", error=str(exc))
        finish_sync_run(db, run, status="failed", error_message=str(exc)[:500])
        return {"status": "failed", "error": str(exc), **empty, "msrp_used_for_lkr_fmv": False}
    finally:
        if owns:
            http.close()
