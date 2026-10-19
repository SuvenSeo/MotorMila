"""Live proof that a detail-scraper source reaches deep pages and every category.

Runs a GenericDetailScraper subclass against the real site but skips the
per-listing detail fetch, so a whole multi-category crawl can be observed
inside a short shell budget.

    python scripts/ops/verify_depth.py riyahub --max-pages 2 --start-page 26

Prints, per category, how many pages were visited, the deepest page number
reached, and how many listing links each yielded. Never writes to a database.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import OrderedDict
from urllib.parse import urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import app.scrapers.generic_detail as generic_detail  # noqa: E402
from app.scrapers.carshop import CarshopScraper  # noqa: E402
from app.scrapers.dimo import DimoScraper  # noqa: E402
from app.scrapers.riyahub import RiyahubScraper  # noqa: E402
from app.scrapers.saleme import SaleMeScraper  # noqa: E402

SCRAPERS = {
    "riyahub": RiyahubScraper,
    "saleme": SaleMeScraper,
    "dimo": DimoScraper,
    "carshop": CarshopScraper,
}


class _NoDb:
    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None


def _category_of(url: str) -> str:
    """Category slug, ignoring any trailing /page/<n> pagination segment."""
    parts = [part for part in urlparse(url).path.strip("/").split("/") if part]
    while parts and (parts[-1].isdigit() or parts[-1] == "page"):
        parts.pop()
    return parts[-1] if parts else "root"


def _page_of(url: str) -> int:
    for token in reversed(urlparse(url).path.split("/")):
        if token.isdigit():
            return int(token)
    for token in urlparse(url).query.split("&"):
        if token.startswith("page=") and token[5:].isdigit():
            return int(token[5:])
    return 1


async def verify(source: str, max_pages: int, start_page: int) -> int:
    scraper_cls = SCRAPERS[source]
    scraper = scraper_cls(db=_NoDb())
    scraper.cleaner = None

    stats: "OrderedDict[str, dict]" = OrderedDict()
    current = [""]
    original_extract = scraper_cls._extract_listing_links

    def counting_extract(soup):
        links = original_extract(soup)
        key = _category_of(current[0])
        entry = stats.setdefault(key, {"pages": 0, "links": 0, "deepest": 0})
        entry["pages"] += 1
        entry["links"] += len(links)
        entry["deepest"] = max(entry["deepest"], _page_of(current[0]))
        return links

    import httpx

    real_client_cls = httpx.AsyncClient

    class _TrackingClient(real_client_cls):
        async def get(self, url, *args, **kwargs):
            current[0] = str(url)
            return await super().get(url, *args, **kwargs)

    httpx.AsyncClient = _TrackingClient  # type: ignore[misc]
    try:
        scraper._extract_listing_links = counting_extract  # type: ignore[method-assign]
        # Skip the detail fetch: we only care how deep the listing crawl goes.
        scraper._build_payload = lambda *a, **k: None  # type: ignore[method-assign]
        os.environ["SCRAPE_START_PAGE"] = str(start_page)
        try:
            await scraper.scrape(max_pages=max_pages)
        finally:
            os.environ.pop("SCRAPE_START_PAGE", None)
    finally:
        httpx.AsyncClient = real_client_cls  # type: ignore[misc]

    total_pages = sum(entry["pages"] for entry in stats.values())
    total_links = sum(entry["links"] for entry in stats.values())
    print(f"source={source} start_page={start_page} max_pages={max_pages}")
    print(f"categories visited: {len(stats)}  pages: {total_pages}  links: {total_links}")
    for key, entry in stats.items():
        print(
            f"  {key:22s} pages={entry['pages']:>3d} deepest={entry['deepest']:>4d} "
            f"links={entry['links']:>5d}"
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", choices=sorted(SCRAPERS))
    parser.add_argument("--max-pages", type=int, default=2)
    parser.add_argument("--start-page", type=int, default=1)
    args = parser.parse_args()
    return asyncio.run(verify(args.source, args.max_pages, args.start_page))


if __name__ == "__main__":
    raise SystemExit(main())
