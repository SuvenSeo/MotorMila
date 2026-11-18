"""Open Charge Map Sri Lanka cache. Query local rows per page view — never the public API."""

from __future__ import annotations

import math
import os
import re
import zlib
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
OVERPASS_URLS: tuple[str, ...] = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)
LK_OVERPASS_QUERY = (
    "[out:json][timeout:30];"
    'nwr["amenity"="charging_station"](5.85,79.55,9.95,81.95);'
    "out center;"
)
USER_AGENT = "MotorMila/1.0 (+https://motormila.pages.dev)"
ATTRIBUTION = "Data © Open Charge Map contributors, OpenStreetMap contributors (ODbL), and original data providers."
COLOMBO = (6.9271, 79.8612)

_OSM_SOCKET_LABELS: dict[str, str] = {
    "type2": "Type 2",
    "type2_combo": "CCS (Type 2)",
    "ccs": "CCS",
    "chademo": "CHAdeMO",
    "type1": "Type 1",
    "type1_combo": "CCS (Type 1)",
    "schuko": "Schuko",
    "bs1363": "BS 1363 (3-pin)",
    "cee_blue": "CEE Blue",
    "cee_red": "CEE Red",
    "domestic_g": "BS 1363 (3-pin)",
    "tesla_supercharger": "Tesla Supercharger",
}
_POWER_KW_RE = re.compile(r"(\d+(?:\.\d+)?)\s*k\s*w\b", re.IGNORECASE)
_POWER_W_RE = re.compile(r"(\d+(?:\.\d+)?)\s*w\b", re.IGNORECASE)
_PLAIN_NUM_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*$")


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


def _parse_power_kw(raw: Any) -> float | None:
    text = str(raw or "").strip()
    if not text:
        return None
    m = _POWER_KW_RE.search(text)
    if m:
        try:
            return round(float(m.group(1)), 2)
        except ValueError:
            return None
    m_w = _POWER_W_RE.search(text)
    if m_w:
        try:
            return round(float(m_w.group(1)) / 1000.0, 2)
        except ValueError:
            return None
    m_num = _PLAIN_NUM_RE.match(text)
    if m_num:
        try:
            val = float(m_num.group(1))
            # Bare OSM output numbers under 1000 are typically kW.
            if 0 < val < 1000:
                return round(val, 2)
        except ValueError:
            return None
    return None


def _osm_station_id(elem_type: str, osm_id: int, used: set[int]) -> int:
    """Deterministically map 64-bit OSM (type, id) into negative signed 32-bit ints."""
    crc = zlib.crc32(f"osm:{elem_type}:{osm_id}".encode("utf-8"))
    candidate = -(1_000_000 + (crc % 2_000_000_000))
    while candidate in used:
        candidate -= 1
        if candidate < -2_147_483_648:
            candidate = -1_000_000
    used.add(candidate)
    return candidate


def _osm_connectors(tags: dict[str, Any]) -> tuple[list[dict[str, Any]], float | None]:
    rows: list[dict[str, Any]] = []
    max_power = (
        _parse_power_kw(tags.get("charging_station:output"))
        or _parse_power_kw(tags.get("output"))
        or _parse_power_kw(tags.get("power"))
        or _parse_power_kw(tags.get("rating"))
    )
    socket_kinds: list[str] = []
    for key, val in sorted(tags.items()):
        if not key.startswith("socket:"):
            continue
        parts = key.split(":")
        if len(parts) != 2:
            continue
        val_str = str(val or "").strip().lower()
        if val_str in {"", "no", "0", "false"}:
            continue
        socket_kinds.append(parts[1])

    for kind in socket_kinds:
        socket_power = (
            _parse_power_kw(tags.get(f"socket:{kind}:output"))
            or _parse_power_kw(tags.get(f"socket:{kind}:power"))
            or _parse_power_kw(tags.get(f"socket:{kind}:rating"))
        )
        if socket_power is not None:
            max_power = socket_power if max_power is None else max(max_power, socket_power)
        label = _OSM_SOCKET_LABELS.get(kind, kind.replace("_", " ").title())
        rows.append(
            {
                "type": label,
                "power_kw": socket_power,
                "level": "Level 3 (DC)" if (socket_power or 0) >= 24 else ("Level 2" if socket_power else None),
            }
        )
    if not rows and max_power is not None:
        rows.append({"type": "EV Charger", "power_kw": max_power, "level": None})
    return rows, max_power


def _osm_address_and_town(tags: dict[str, Any]) -> tuple[str | None, str | None]:
    town = ""
    for k in ("addr:city", "addr:town", "addr:suburb", "addr:village", "addr:district"):
        val = str(tags.get(k) or "").strip()
        if val:
            town = val
            break
    full = str(tags.get("addr:full") or "").strip()
    if full:
        return full[:300], (town[:100] if town else None)
    street = str(tags.get("addr:street") or "").strip()
    housenumber = str(tags.get("addr:housenumber") or "").strip()
    street_part = " ".join(part for part in (housenumber, street) if part)
    parts: list[str] = []
    for p in (street_part, town):
        if p and p.lower() not in {x.lower() for x in parts}:
            parts.append(p)
    address = ", ".join(parts)
    return (address[:300] if address else None), (town[:100] if town else None)


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


def ingest_osm_lk_stations(
    db: Session,
    *,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Ingest Sri Lanka EV charging stations from OpenStreetMap Overpass API."""
    if not is_enabled("open_charge_map"):
        return {"status": "skipped", "rows": 0, "reason": "disabled"}

    run = start_sync_run(db, provider="open_charge_map", details={"source": "osm_overpass"})
    owns = client is None
    http = client or httpx.Client(
        timeout=40.0,
        follow_redirects=True,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )
    endpoints = (OVERPASS_URLS[0],) if not owns else OVERPASS_URLS
    try:
        payload: dict[str, Any] | None = None
        last_exc: Exception | None = None
        for url in endpoints:
            try:
                response = http.post(url, data={"data": LK_OVERPASS_QUERY})
                response.raise_for_status()
                parsed = response.json()
                if not isinstance(parsed, dict) or not isinstance(parsed.get("elements"), list):
                    raise ValueError("Overpass payload missing elements list")
                payload = parsed
                break
            except Exception as exc:
                last_exc = exc
                log.warning("osm_overpass_endpoint_failed", url=url, error=str(exc))
        if payload is None:
            raise last_exc or RuntimeError("All Overpass endpoints failed")

        now = datetime.now(timezone.utc)
        used_ids: set[int] = set()
        stored = 0
        elements = sorted(
            (e for e in payload["elements"] if isinstance(e, dict)),
            key=lambda e: (str(e.get("type") or ""), str(e.get("id") or "")),
        )
        for elem in elements:
            elem_type = str(elem.get("type") or "").strip().lower()
            raw_id = elem.get("id")
            if elem_type not in {"node", "way", "relation"} or raw_id is None:
                continue
            tags = elem.get("tags") if isinstance(elem.get("tags"), dict) else {}
            if tags.get("disused:amenity") or str(tags.get("access") or "").strip().lower() == "no":
                continue

            center = elem.get("center") if isinstance(elem.get("center"), dict) else {}
            lat_raw = elem.get("lat") if elem.get("lat") is not None else center.get("lat")
            lng_raw = elem.get("lon") if elem.get("lon") is not None else center.get("lon")
            try:
                lat = float(lat_raw)
                lng = float(lng_raw)
            except (TypeError, ValueError):
                continue
            if not (5.7 <= lat <= 10.1 and 79.4 <= lng <= 82.1):
                continue

            station_id = _osm_station_id(elem_type, int(raw_id), used_ids)
            address, town = _osm_address_and_town(tags)
            operator = (
                str(tags.get("operator") or tags.get("network") or tags.get("brand") or "")
                .strip()[:120]
                or None
            )
            name = (
                str(tags.get("name") or tags.get("brand") or tags.get("operator") or "")
                .strip()[:200]
                or (f"EV Charging Station ({town})" if town else "EV Charging Station")
            )
            connectors, power_kw = _osm_connectors(tags)
            op_status = str(tags.get("operational_status") or "").strip().lower()
            access = str(tags.get("access") or "").strip().lower()
            if op_status in {"closed", "out_of_order", "broken"}:
                status_text = "Out of service"
            elif access == "private":
                status_text = "Private access"
            elif access == "customers":
                status_text = "Customers only"
            else:
                status_text = "Operational (OpenStreetMap)"

            row = db.query(ChargePoint).filter(ChargePoint.ocm_id == station_id).first()
            if row is None:
                row = ChargePoint(ocm_id=station_id, lat=lat, lng=lng)
                db.add(row)
            row.name = name
            row.operator = operator
            row.address = address
            row.town = town
            row.lat = lat
            row.lng = lng
            row.status = status_text[:40]
            row.connectors = connectors
            row.power_kw = power_kw
            row.data_provider = "OpenStreetMap contributors (Overpass)"
            row.license_note = "ODbL 1.0"
            row.attribution = f"OpenStreetMap contributors (ODbL). {ATTRIBUTION}"
            row.source_updated_at = str(elem.get("timestamp") or "")[:40] or None
            row.refreshed_at = now
            stored += 1

        db.commit()
        finish_sync_run(
            db,
            run,
            status="success",
            rows=stored,
            failures=0,
            details={"source": "osm_overpass"},
        )
        return {"status": "success", "rows": stored, "source": "osm_overpass", "checksum": None}
    except Exception as exc:
        log.warning("osm_overpass_ingest_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass
        finish_sync_run(
            db,
            run,
            status="failed",
            error_message=str(exc)[:500],
            details={"source": "osm_overpass"},
        )
        return {"status": "failed", "rows": 0, "source": "osm_overpass", "error": str(exc)}
    finally:
        if owns:
            http.close()


def ingest_lk_stations_best_effort(
    db: Session,
    *,
    ocm_client: httpx.Client | None = None,
    osm_client: httpx.Client | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Use Open Charge Map when configured, else fall back to OSM Overpass."""
    ocm_result = ingest_lk_stations(db, client=ocm_client, api_key=api_key)
    if ocm_result.get("reason") == "disabled":
        return ocm_result
    if ocm_result.get("status") == "success" and int(ocm_result.get("rows") or 0) > 0:
        return ocm_result
    return ingest_osm_lk_stations(db, client=osm_client)


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
    return scored[: max(1, min(limit, 500))]
