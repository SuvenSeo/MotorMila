"""Vehicle / automotive policy news feed with TTL cache and Sri Lanka RSS fallback.

Primary source: Helakuru Esana community mirror (with backoff when rate-limited).
Fallback sources: EconomyNext and Ada Derana RSS feeds so shared cloud IPs
continue serving relevant vehicle, fuel, tax, and FX policy headlines.
Fail-open: network or schema issues return an empty list (or stale cache) so
the UI never breaks.
"""

from __future__ import annotations

import hashlib
import threading
import time
import xml.etree.ElementTree as ET
from typing import Any

import httpx
import structlog

log = structlog.get_logger()

# The community mirror renamed its route: /EsanaV3/GetRecentNews 404s.
# Current route is GET /EsanaV3 (307-redirects; httpx follows it).
ESANA_RECENT_URL = "https://esana-api.vercel.app/EsanaV3"
FALLBACK_RSS_FEEDS: tuple[tuple[str, str], ...] = (
    ("economynext", "https://economynext.com/feed/"),
    ("ada_derana", "https://www.adaderana.lk/rss.php"),
)
USER_AGENT = "MotorMilaNewsFeed/1.0 (+https://motormila.pages.dev)"

NEWS_CACHE_TTL_SECONDS = 900.0  # 15 minutes
NEWS_STALE_MAX_AGE_SECONDS = 21_600.0  # 6 hours stale-on-error fallback
ESANA_COOLDOWN_SECONDS = 600.0  # Back off when Vercel returns 429

_NEWS_LOCK = threading.Lock()
_news_cache: list[dict[str, Any]] | None = None
_news_cached_at: float = 0.0
_esana_cooldown_until: float = 0.0

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
    "leasing",
    "cbsl",
    "dmt",
    "transport",
    "traffic",
    "rupee",
    "excise",
    "tariff",
    "vat",
    "tax",
    "budget",
    "highway",
    "expressway",
    "වාහන",
    "මෝටර්",
    "ආනයන",
    "ඉන්ධන",
)


def _reset_news_cache() -> None:
    global _news_cache, _news_cached_at, _esana_cooldown_until
    with _NEWS_LOCK:
        _news_cache = None
        _news_cached_at = 0.0
        _esana_cooldown_until = 0.0


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


def _normalize_esana_items(payload: Any, *, limit: int) -> list[dict[str, Any]]:
    items = _pick_items(payload)
    if not items:
        return []
    matched = [row for row in items if _matches_vehicle_topic(row)]
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
        link = row.get("url") or row.get("link") or None
        normalized.append(
            {
                "id": str(news_id) if news_id is not None else None,
                "title": str(title).strip()[:240],
                "thumb": str(thumb) if thumb else None,
                "source": "helakuru_esana",
                "url": str(link) if link else None,
            }
        )
    return normalized


def _parse_rss_items(xml_text: str, source_name: str, *, limit: int) -> list[dict[str, Any]]:
    if not xml_text or "<rss" not in xml_text.lower() and "<feed" not in xml_text.lower():
        return []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    raw_rows: list[dict[str, Any]] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or link or title).strip()
        desc = (item.findtext("description") or "").strip()
        if not title:
            continue
        raw_rows.append(
            {
                "id": hashlib.sha1(guid.encode("utf-8", errors="ignore")).hexdigest()[:12],
                "title": title,
                "description": desc,
                "url": link or None,
            }
        )
    if not raw_rows:
        return []
    matched = [row for row in raw_rows if _matches_vehicle_topic(row)]
    selected = matched[:limit] if matched else raw_rows[: min(3, limit)]
    return [
        {
            "id": str(row["id"]),
            "title": str(row["title"])[:240],
            "thumb": None,
            "source": source_name,
            "url": row["url"],
        }
        for row in selected
    ]


def _fetch_from_upstreams(client: httpx.Client, *, max_items: int, now: float) -> list[dict[str, Any]]:
    global _esana_cooldown_until

    with _NEWS_LOCK:
        skip_esana = now < _esana_cooldown_until

    if not skip_esana:
        try:
            response = client.get(ESANA_RECENT_URL, timeout=8.0)
            if response.status_code == 429:
                with _NEWS_LOCK:
                    _esana_cooldown_until = now + ESANA_COOLDOWN_SECONDS
                log.warning("esana_news_rate_limited", cooldown_seconds=ESANA_COOLDOWN_SECONDS)
            else:
                response.raise_for_status()
                parsed = _normalize_esana_items(response.json(), limit=max_items)
                if parsed:
                    return parsed
        except Exception as exc:
            log.warning("esana_news_fetch_failed", error=str(exc) or type(exc).__name__)

    combined_rss: list[dict[str, Any]] = []
    for source_name, rss_url in FALLBACK_RSS_FEEDS:
        try:
            response = client.get(rss_url, timeout=8.0)
            response.raise_for_status()
            parsed = _parse_rss_items(response.text, source_name, limit=max_items)
            combined_rss.extend(parsed)
        except Exception as exc:
            log.warning(
                "rss_news_fetch_failed",
                source=source_name,
                error=str(exc) or type(exc).__name__,
            )
    return combined_rss[:max_items]


def fetch_vehicle_policy_news(
    *,
    limit: int = 8,
    client: httpx.Client | None = None,
    now: float | None = None,
) -> list[dict[str, Any]]:
    global _news_cache, _news_cached_at
    ts = time.monotonic() if now is None else float(now)

    with _NEWS_LOCK:
        if (
            _news_cache is not None
            and (ts - _news_cached_at) < NEWS_CACHE_TTL_SECONDS
            and (ts - _news_cached_at) >= 0
        ):
            return list(_news_cache[:limit])

    max_fetch = max(20, limit)
    owns_client = client is None
    http = client or httpx.Client(
        timeout=8.0,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )
    try:
        items = _fetch_from_upstreams(http, max_items=max_fetch, now=ts)
    finally:
        if owns_client:
            http.close()

    if items:
        with _NEWS_LOCK:
            _news_cache = list(items)
            _news_cached_at = ts
        return list(items[:limit])

    with _NEWS_LOCK:
        if (
            _news_cache is not None
            and (ts - _news_cached_at) < NEWS_STALE_MAX_AGE_SECONDS
            and (ts - _news_cached_at) >= 0
        ):
            return list(_news_cache[:limit])

    return []
