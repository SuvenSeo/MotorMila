"""Weekly ProblemsByVin dataset ingest and reliability lookup."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from sqlalchemy.orm import Session

from app.services.providers.envelope import enrichment_ok, enrichment_unavailable
from app.services.providers.flags import is_enabled
from app.services.providers.identity import canonical_vehicle_key
from app.services.providers.sync import finish_sync_run, start_sync_run
from db.models import VehicleReliabilitySnapshot

log = structlog.get_logger()

DATA_BASE = "https://problemsbyvin.com/data"
USER_AGENT = "MotorMila/1.0 (+https://motormila.pages.dev)"
MARKET_SCOPE = "US NHTSA-derived (ProblemsByVin)"
LICENSE_NOTE = "CC BY 4.0. Attribution: ProblemsByVin (https://problemsbyvin.com)."
LIMITATION = (
    "Reliability score is a transparent complaint-and-recall-volume heuristic, "
    "not a per-capita failure rate, and is not this car's Sri Lankan service history."
)
TSB_NOTE = "A TSB is not a recall."

DATASETS = {
    "scorecard": f"{DATA_BASE}/vehicle-reliability-scorecard.json",
    "failures": f"{DATA_BASE}/failure-mileage-distribution.json",
    "tsb": f"{DATA_BASE}/tsb-index.json",
}


def _unavailable(reason: str, *, limitation: str | None = None) -> dict[str, Any]:
    return enrichment_unavailable(
        provider="problemsbyvin",
        market_scope=MARKET_SCOPE,
        reason=reason,
        limitation=limitation or LIMITATION,
        license_note=LICENSE_NOTE,
        source_url=f"{DATA_BASE}/",
    )


def _download_json(http: httpx.Client, url: str) -> tuple[list[dict[str, Any]], bytes]:
    response = http.get(url, timeout=60.0)
    response.raise_for_status()
    raw = response.content or b""
    payload = response.json()
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        rows = payload["data"]
    elif isinstance(payload, list):
        rows = payload
    else:
        raise ValueError(f"Unexpected schema from {url}")
    cleaned = [row for row in rows if isinstance(row, dict)]
    return cleaned, raw


def _issue_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "component": str(row.get("component") or "").strip() or None,
        "complaints": row.get("complaints"),
        "mileage_median": row.get("mileage_median"),
        "mileage_p25": row.get("mileage_p25"),
        "mileage_p75": row.get("mileage_p75"),
        "severity": row.get("severity"),
        "url": row.get("url"),
    }


def ingest_datasets(db: Session, *, client: httpx.Client | None = None) -> dict[str, Any]:
    if not is_enabled("problemsbyvin"):
        return {"status": "skipped", "rows": 0, "checksum": None}

    run = start_sync_run(db, provider="problemsbyvin")
    owns = client is None
    http = client or httpx.Client(
        timeout=60.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    digest = hashlib.sha256()
    merged: dict[str, dict[str, Any]] = {}
    try:
        for name, url in DATASETS.items():
            rows, raw = _download_json(http, url)
            digest.update(raw)
            for row in rows:
                key = canonical_vehicle_key(row.get("year"), row.get("make"), row.get("model"))
                if not key:
                    continue
                bucket = merged.setdefault(
                    key,
                    {
                        "vehicle_key": key,
                        "year": row.get("year"),
                        "make": row.get("make"),
                        "model": row.get("model"),
                        "scorecard": None,
                        "known_issues": [],
                        "tsb": None,
                    },
                )
                if name == "scorecard":
                    bucket["scorecard"] = {
                        "reliability_score": row.get("reliability_score"),
                        "complaints": row.get("complaints"),
                        "recalls": row.get("recalls"),
                        "investigations": row.get("investigations"),
                        "top_component": row.get("top_component"),
                        "top_component_complaints": row.get("top_component_complaints"),
                        "worst_severity": row.get("worst_severity"),
                        "url": row.get("url"),
                    }
                elif name == "failures":
                    bucket["known_issues"].append(_issue_row(row))
                elif name == "tsb":
                    bucket["tsb"] = {
                        "tsb_count": row.get("tsb_count"),
                        "top_category": row.get("top_category"),
                        "note": TSB_NOTE,
                        "url": row.get("url"),
                    }

        checksum = digest.hexdigest()
        now = datetime.now(timezone.utc)
        source_version = now.date().isoformat()
        for key, payload in merged.items():
            row = (
                db.query(VehicleReliabilitySnapshot)
                .filter(VehicleReliabilitySnapshot.vehicle_key == key)
                .first()
            )
            if row is None:
                row = VehicleReliabilitySnapshot(
                    vehicle_key=key,
                    provider="problemsbyvin",
                    payload=payload,
                )
                db.add(row)
            row.payload = payload
            row.checksum = checksum
            row.source_version = source_version
            row.refreshed_at = now
        db.commit()
        finish_sync_run(
            db,
            run,
            status="success",
            rows=len(merged),
            failures=0,
            checksum=checksum,
        )
        return {"status": "success", "rows": len(merged), "checksum": checksum}
    except Exception as exc:
        log.warning("problemsbyvin_ingest_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass
        finish_sync_run(db, run, status="failed", error_message=str(exc)[:500])
        return {"status": "failed", "rows": 0, "checksum": None, "error": str(exc)}
    finally:
        if owns:
            http.close()


def lookup_reliability(
    db: Session | None,
    year: Any,
    make: Any,
    model: Any,
) -> dict[str, Any]:
    if not is_enabled("problemsbyvin"):
        return _unavailable("disabled")
    vehicle_key = canonical_vehicle_key(year, make, model)
    if vehicle_key is None:
        return _unavailable("incomplete_identity")
    if db is None:
        return _unavailable("no_snapshot")
    try:
        row = (
            db.query(VehicleReliabilitySnapshot)
            .filter(VehicleReliabilitySnapshot.vehicle_key == vehicle_key)
            .first()
        )
    except Exception as exc:
        log.warning("problemsbyvin_lookup_failed", error=str(exc))
        return _unavailable("no_snapshot")
    if row is None or not isinstance(row.payload, dict):
        return _unavailable("no_snapshot", limitation="US reliability research is not available for this model.")
    payload = json.loads(json.dumps(row.payload))
    for issue in payload.get("known_issues") or []:
        if isinstance(issue, dict):
            issue.pop("est_repair_usd", None)
    return enrichment_ok(
        provider="problemsbyvin",
        market_scope=MARKET_SCOPE,
        license_note=LICENSE_NOTE,
        match_confidence=0.85,
        source_url=f"{DATA_BASE}/",
        limitation=LIMITATION,
        data=payload,
    )
