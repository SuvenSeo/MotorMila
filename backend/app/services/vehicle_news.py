"""Optional Helakuru Esana news feed filtered for vehicle / policy keywords.

Fail-open: network or schema issues return an empty list so the UI never breaks.
Uses the unofficial Helakuru-Esana-API community mirror.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

log = structlog.get_logger()

# The community mirror renamed its route: /EsanaV3/GetRecentNews 404s.
# Current route is GET /EsanaV3 (307-redirects; httpx follows it).
ESANA_RECENT_URL = "https://esana-api.vercel.app/EsanaV3"

VEHICLE_KEYWORDS = (
    "vehicle",
    "car",
    "motor",
    "import",
    "customs",
    "fuel",
    "petrol",
    "diesel",
    "electric",
    "hybrid",
    "lease",
    "cbsl",
    "dmt",
    "transport",
    "traffic",
    "වාහන",
    "මෝටර්",
    "ආනයන",
    "ඉන්ධන",
)


def _pick_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("News", "news", "data", "Data", "items", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    return []


def _matches_vehicle_topic(row: dict[str, Any]) -> bool:
    haystack = " ".join(
        str(row.get(key) or "")
        for key in (
            "title",
            "title_en",
            "Title",
            "TitleEn",
            "titleEn",
            "titleSi",
            "description",
            "Description",
            "summary",
        )
    ).lower()
    return any(keyword.lower() in haystack for keyword in VEHICLE_KEYWORDS)


def fetch_vehicle_policy_news(*, limit: int = 8) -> list[dict[str, Any]]:
    try:
        with httpx.Client(timeout=6.0, follow_redirects=True) as client:
            response = client.get(ESANA_RECENT_URL)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        log.warning("esana_news_fetch_failed", error=str(exc))
        return []

    items = _pick_items(payload)
    matched = [row for row in items if _matches_vehicle_topic(row)]
    # If the keyword filter is too aggressive for Sinhala-only headlines, fall
    # back to the freshest handful so the pulse desk still has content.
    selected = matched[:limit] if matched else items[: min(3, limit)]

    normalized: list[dict[str, Any]] = []
    for row in selected:
        news_id = row.get("id") or row.get("Id") or row.get("news_id")
        title = (
            row.get("title_en")
            or row.get("TitleEn")
            or row.get("titleEn")
            or row.get("title")
            or row.get("Title")
            or row.get("titleSi")
            or "News"
        )
        thumb = row.get("thumb") or row.get("Thumb") or row.get("image") or None
        normalized.append(
            {
                "id": str(news_id) if news_id is not None else None,
                "title": str(title)[:240],
                "thumb": str(thumb) if thumb else None,
                "source": "helakuru_esana",
            }
        )
    return normalized
