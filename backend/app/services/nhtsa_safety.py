"""NHTSA safety ratings, recalls, and complaint research (US federal data only)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
import structlog

from app.services.providers.cache import TtlCache
from app.services.providers.envelope import enrichment_ok, enrichment_unavailable
from app.services.providers.flags import is_enabled
from app.services.providers.identity import canonical_vehicle_key

log = structlog.get_logger()

NHTSA_BASE = "https://api.nhtsa.gov"
USER_AGENT = "MotorMila/1.0 (+https://motormila.pages.dev)"
MARKET_SCOPE = "US federal (NHTSA)"
LICENSE_NOTE = "Public US government data. Not a Sri Lankan vehicle history check."
LIMITATION = (
    "US NHTSA safety rating—may vary by trim/market. This is not a verified history "
    "of the individual Sri Lankan vehicle for sale."
)
_CACHE_TTL_SECONDS = 10 * 60
_cache: TtlCache[dict[str, Any]] = TtlCache(ttl_seconds=_CACHE_TTL_SECONDS)


def _unavailable(reason: str, *, limitation: str | None = None) -> dict[str, Any]:
    return enrichment_unavailable(
        provider="nhtsa",
        market_scope=MARKET_SCOPE,
        reason=reason,
        limitation=limitation or LIMITATION,
        license_note=LICENSE_NOTE,
        source_url="https://www.nhtsa.gov/nhtsa-datasets-and-apis",
    )


def _results(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    rows = payload.get("Results") or payload.get("results") or []
    return [row for row in rows if isinstance(row, dict)]


def _get_json(http: httpx.Client, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    query = {"format": "json", **(params or {})}
    response = http.get(url, params=query, timeout=20.0)
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def _normalize_recalls(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    recalls: list[dict[str, Any]] = []
    for row in rows[:12]:
        campaign = str(row.get("NHTSACampaignNumber") or row.get("CampaignNumber") or "").strip()
        summary = str(row.get("Summary") or row.get("ComponentDescription") or "").strip()
        recalls.append(
            {
                "campaign": campaign or None,
                "component": str(row.get("Component") or "").strip() or None,
                "title": summary[:280] if summary else None,
                "risk": str(row.get("Consequence") or "").strip() or None,
                "remedy": str(row.get("Remedy") or "").strip() or None,
            }
        )
    return recalls


def _normalize_complaints(rows: list[dict[str, Any]]) -> dict[str, Any]:
    crash_count = 0
    fire_count = 0
    for row in rows:
        if row.get("crash") in {True, "Y", "y", 1, "1"}:
            crash_count += 1
        if row.get("fire") in {True, "Y", "y", 1, "1"}:
            fire_count += 1
    return {
        "count": len(rows),
        "crash_count": crash_count,
        "fire_count": fire_count,
        "language": "Aggregate US owner-complaint trend — not a quality score for this car.",
    }


def _normalize_rating(detail: dict[str, Any] | None, description: str | None) -> dict[str, Any] | None:
    if not detail:
        return None
    overall = str(detail.get("OverallRating") or "").strip()
    if not overall or overall in {"Not Rated", "N/A"}:
        overall = None
    return {
        "overall": overall,
        "front": str(detail.get("OverallFrontCrashRating") or "").strip() or None,
        "side": str(detail.get("OverallSideCrashRating") or "").strip() or None,
        "rollover": str(detail.get("RolloverRating") or "").strip() or None,
        "variant": description or str(detail.get("VehicleDescription") or "").strip() or None,
        "vehicle_id": detail.get("VehicleId"),
    }


def research_vehicle(
    year: Any,
    make: Any,
    model: Any,
    *,
    client: httpx.Client | None = None,
    db: Any | None = None,
) -> dict[str, Any]:
    if not is_enabled("nhtsa_safety"):
        return _unavailable("disabled", limitation="NHTSA safety research is turned off.")

    vehicle_key = canonical_vehicle_key(year, make, model)
    if vehicle_key is None:
        return _unavailable("incomplete_identity", limitation="Year, make, and model are required for US safety research.")

    if client is None:
        cached = _cache.get(vehicle_key)
        if cached is not None:
            return cached

    owns = client is None
    http = client or httpx.Client(
        timeout=20.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        year_int = int(year)
        make_s = str(make).strip()
        model_s = str(model).strip()
        recalls_payload = _get_json(
            http,
            f"{NHTSA_BASE}/recalls/recallsByVehicle",
            {"make": make_s, "model": model_s, "modelYear": year_int},
        )
        complaints_payload = _get_json(
            http,
            f"{NHTSA_BASE}/complaints/complaintsByVehicle",
            {"make": make_s, "model": model_s, "modelYear": year_int},
        )
        ratings_list = _get_json(
            http,
            (
                f"{NHTSA_BASE}/SafetyRatings/modelyear/{year_int}/make/"
                f"{quote(make_s, safe='')}/model/{quote(model_s, safe='')}"
            ),
        )
        variants = _results(ratings_list)
        rating_detail = None
        variant_desc = None
        if variants:
            vehicle_id = variants[0].get("VehicleId")
            variant_desc = str(variants[0].get("VehicleDescription") or "").strip() or None
            if vehicle_id is not None:
                rating_detail_payload = _get_json(
                    http,
                    f"{NHTSA_BASE}/SafetyRatings/VehicleId/{vehicle_id}",
                )
                detail_rows = _results(rating_detail_payload)
                rating_detail = detail_rows[0] if detail_rows else None
    except Exception as exc:
        log.warning("nhtsa_safety_upstream_failed", vehicle_key=vehicle_key, error=str(exc))
        payload = _unavailable("upstream_error")
        if client is None:
            _cache.set(vehicle_key, payload)
        return payload
    finally:
        if owns:
            http.close()

    recalls = _normalize_recalls(_results(recalls_payload))
    complaints = _normalize_complaints(_results(complaints_payload))
    rating = _normalize_rating(rating_detail, variant_desc)
    has_signal = bool(recalls) or (complaints["count"] > 0) or bool(rating and rating.get("overall"))
    if not has_signal:
        payload = _unavailable(
            "no_us_match",
            limitation="No matching US NHTSA safety record for this year, make, and model.",
        )
        if client is None:
            _cache.set(vehicle_key, payload)
        return payload

    payload = enrichment_ok(
        provider="nhtsa",
        market_scope=MARKET_SCOPE,
        license_note=LICENSE_NOTE,
        match_confidence=0.85,
        source_url="https://www.nhtsa.gov/recalls",
        limitation=LIMITATION,
        data={
            "rating": rating,
            "recalls": recalls,
            "complaints": complaints,
            "vehicle_key": vehicle_key,
        },
    )
    if client is None:
        _cache.set(vehicle_key, payload)
    if db is not None:
        _persist_snapshot(db, vehicle_key, payload)
    return payload


def _persist_snapshot(db: Any, vehicle_key: str, payload: dict[str, Any]) -> None:
    try:
        from db.models import VehicleSafetySnapshot

        row = db.query(VehicleSafetySnapshot).filter(VehicleSafetySnapshot.vehicle_key == vehicle_key).first()
        now = datetime.now(timezone.utc)
        if row is None:
            row = VehicleSafetySnapshot(vehicle_key=vehicle_key, provider="nhtsa", payload=payload)
            db.add(row)
        row.payload = payload
        row.refreshed_at = now
        row.source_version = payload.get("fetched_at")
        db.commit()
    except Exception as exc:
        log.warning("nhtsa_safety_snapshot_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass
