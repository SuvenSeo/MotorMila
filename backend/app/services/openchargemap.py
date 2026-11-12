"""Open Charge Map Sri Lanka cache. Query local rows per page view — never the public API."""

from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from sqlalchemy.orm import Session

from app.services.providers.flags import is_enabled
from app.services.providers.sync import finish_sync_run, start_sync_run
from db.models import ChargePoint

log = structlog.get_logger()

OCM_POI_URL = "https://api.openchargemap.io/v3/poi/"
USER_AGENT = "MotorMila/1.0 (+https://motormila.pages.dev)"
ATTRIBUTION = "Data © Open Charge Map contributors and original data providers."
COLOMBO = (6.9271, 79.8612)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(min(1.0, a)))


def _connectors(poi: dict[str, Any]) -> tuple[list[dict[str, Any]], float | None]:
    rows: list[dict[str, Any]] = []
    max_power = None
    for item in poi.get("Connections") or []:
        if not isinstance(item, dict):
            continue
        conn_type = item.get("ConnectionType") if isinstance(item.get("ConnectionType"), dict) else {}
        level = item.get("Level") if isinstance(item.get("Level"), dict) else {}
        power = item.get("PowerKW")
        try:
            power_f = float(power) if power is not None else None
        except (TypeError, ValueError):
            power_f = None
        if power_f is not None:
            max_power = power_f if max_power is None else max(max_power, power_f)
        rows.append(
            {
                "type": conn_type.get("Title") or item.get("ConnectionTypeID"),
                "power_kw": power_f,
                "level": level.get("Title"),
            }
        )
    return rows, max_power


def ingest_lk_stations(
    db: Session,
    *,
    client: httpx.Client | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    if not is_enabled("open_charge_map"):
        return {"status": "skipped", "rows": 0, "reason": "disabled"}
    key = (api_key if api_key is not None else os.getenv("OPENCHARGEMAP_API_KEY", "")).strip()
    if not key:
        return {"status": "skipped", "rows": 0, "reason": "missing_key"}

    run = start_sync_run(db, provider="open_charge_map")
    owns = client is None
    http = client or httpx.Client(
        timeout=60.0,
        follow_redirects=True,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "X-API-Key": key,
        },
    )
    try:
        response = http.get(
            OCM_POI_URL,
            params={
                "output": "json",
                "countrycode": "LK",
                "maxresults": 5000,
                "opendata": "true",
                "compact": "false",
                "verbose": "false",
            },
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise ValueError("OCM POI payload was not a list")
        now = datetime.now(timezone.utc)
        stored = 0
        for poi in payload:
            if not isinstance(poi, dict):
                continue
            address = poi.get("AddressInfo") if isinstance(poi.get("AddressInfo"), dict) else {}
            try:
                lat = float(address.get("Latitude"))
                lng = float(address.get("Longitude"))
            except (TypeError, ValueError):
                continue
            ocm_id = poi.get("ID")
            if ocm_id is None:
                continue
            operator = poi.get("OperatorInfo") if isinstance(poi.get("OperatorInfo"), dict) else {}
            status = poi.get("StatusType") if isinstance(poi.get("StatusType"), dict) else {}
            provider = poi.get("DataProvider") if isinstance(poi.get("DataProvider"), dict) else {}
            connectors, power_kw = _connectors(poi)
            line = ", ".join(
                part
                for part in [
                    str(address.get("AddressLine1") or "").strip(),
                    str(address.get("Town") or "").strip(),
                ]
                if part
            )
            attribution = str(provider.get("Title") or "Open Charge Map contributors").strip()
            row = db.query(ChargePoint).filter(ChargePoint.ocm_id == int(ocm_id)).first()
            if row is None:
                row = ChargePoint(ocm_id=int(ocm_id), lat=lat, lng=lng)
                db.add(row)
            row.name = str(address.get("Title") or "").strip() or None
            row.operator = str(operator.get("Title") or "").strip() or None
            row.address = line or None
            row.town = str(address.get("Town") or "").strip() or None
            row.lat = lat
            row.lng = lng
            row.status = str(status.get("Title") or "").strip() or None
            row.connectors = connectors
            row.power_kw = power_kw
            row.data_provider = attribution
            row.license_note = str(provider.get("License") or "Open data / mixed OCM licences").strip()
            row.attribution = f"{attribution}. {ATTRIBUTION}"
            row.source_updated_at = str(poi.get("DateLastStatusUpdate") or "")[:40] or None
            row.refreshed_at = now
            stored += 1
        db.commit()
        finish_sync_run(db, run, status="success", rows=stored, failures=0)
        return {"status": "success", "rows": stored, "checksum": None}
    except Exception as exc:
        log.warning("ocm_ingest_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass
        finish_sync_run(db, run, status="failed", error_message=str(exc)[:500])
        return {"status": "failed", "rows": 0, "error": str(exc)}
    finally:
        if owns:
            http.close()


def nearby_stations(
    db: Session,
    *,
    lat: float,
    lng: float,
    radius_km: float = 25.0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    try:
        rows = db.query(ChargePoint).all()
    except Exception as exc:
        log.warning("ocm_nearby_query_failed", error=str(exc))
        return []
    scored: list[dict[str, Any]] = []
    for row in rows:
        try:
            distance = _haversine_km(lat, lng, float(row.lat), float(row.lng))
        except (TypeError, ValueError):
            continue
        if distance > radius_km:
            continue
        scored.append(
            {
                "ocm_id": row.ocm_id,
                "name": row.name,
                "operator": row.operator,
                "lat": float(row.lat),
                "lng": float(row.lng),
                "address": row.address,
                "town": row.town,
                "status": row.status,
                "connectors": row.connectors or [],
                "power_kw": float(row.power_kw) if row.power_kw is not None else None,
                "distance_km": round(distance, 2),
                "data_provider": row.data_provider,
                "attribution": row.attribution or ATTRIBUTION,
            }
        )
    scored.sort(key=lambda item: item["distance_km"])
    return scored[: max(1, min(limit, 100))]
