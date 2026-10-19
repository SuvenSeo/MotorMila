"""Read-only diagnostic: probe a source's live listing page and report what the
scraper's own extractor finds. Does not write to any database.

Usage:
    python scripts/ops/probe_source.py riyahub
    python scripts/ops/probe_source.py saleme --url https://www.saleme.lk/ads/sri-lanka/cars
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import httpx  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

from app.scrapers.net import USER_AGENT_POOL  # noqa: E402
from db.session import SessionLocal  # noqa: E402
from run_sync import SOURCE_REGISTRY  # noqa: E402

HEADERS = {
    "User-Agent": USER_AGENT_POOL[0],
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def probe(source: str, url: str | None, timeout: float) -> int:
    registry = SOURCE_REGISTRY.get(source)
    if registry is None:
        print(f"unknown source: {source}", file=sys.stderr)
        return 2

    scraper_cls = registry["scraper"]
    db = SessionLocal()
    try:
        scraper = scraper_cls(db)
        starts = getattr(scraper, "START_URLS", ()) or (scraper.BASE_URL,)
        target = url or starts[0]
    finally:
        db.close()

    started = time.monotonic()
    try:
        response = httpx.get(target, headers=HEADERS, timeout=timeout, follow_redirects=True)
    except Exception as exc:  # noqa: BLE001 - diagnostic surface
        print(f"FETCH-ERROR {type(exc).__name__}: {exc}")
        return 1
    elapsed = time.monotonic() - started

    body = response.text
    soup = BeautifulSoup(body, "lxml")

    print(f"source={source}")
    print(f"url={target}")
    print(f"status={response.status_code} bytes={len(body)} elapsed={elapsed:.1f}s")
    print(f"final_url={response.url}")
    print(f"title={(soup.title.get_text(strip=True) if soup.title else None)!r}")

    try:
        links = scraper._extract_listing_links(soup)
    except Exception as exc:  # noqa: BLE001 - diagnostic surface
        print(f"EXTRACT-ERROR {type(exc).__name__}: {exc}")
        return 1

    print(f"extracted_links={len(links)}")
    for link in links[:8]:
        print(f"  - {link}")

    # Show the anchor patterns that exist on the page so parser drift is visible.
    seen: dict[str, int] = {}
    for anchor in soup.select("a[href]"):
        href = str(anchor.get("href") or "").strip()
        if not href:
            continue
        parts = [p for p in href.split("?")[0].split("/") if p]
        key = "/" + "/".join(parts[:2]) if len(parts) >= 2 else href
        seen[key] = seen.get(key, 0) + 1
    top = sorted(seen.items(), key=lambda item: -item[1])[:12]
    print("top_link_prefixes:")
    for key, count in top:
        print(f"  {count:5d}  {key}")

    if not links:
        print("VERDICT=PARSER-MISMATCH (page fetched, zero listing links extracted)")
        return 1
    print("VERDICT=OK")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("--url", default=None)
    parser.add_argument("--timeout", type=float, default=45.0)
    args = parser.parse_args()
    return probe(args.source, args.url, args.timeout)


if __name__ == "__main__":
    raise SystemExit(main())
