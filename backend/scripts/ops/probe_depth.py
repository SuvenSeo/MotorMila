"""Read-only probe: how deep does each source actually paginate?

Answers the question the scrapers cannot: is a page budget of 5 / 25 / 120
artificial, or is it the real end of the catalogue?

For each source it walks a bounded number of pages, follows any pagination
hint it finds (last page number, "Page X of Y" text, next link), and reports
the deepest page that still returned listings plus the pagination hint.

    python scripts/ops/probe_depth.py --source hitad --max-pages 40
    python scripts/ops/probe_depth.py --all --timeout 150

Never writes to the database.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import time
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.scrapers.net import httpx_client_kwargs, response_blocked_reason  # noqa: E402

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}


@dataclass
class ProbeResult:
    source: str
    pages_fetched: int = 0
    deepest_page_with_listings: int = 0
    listings_seen: int = 0
    max_page_hint: int | None = None
    blocked: str | None = None
    error: str | None = None
    notes: list[str] = field(default_factory=list)

    def summary(self) -> str:
        if self.blocked:
            return f"{self.source:12s} BLOCKED  {self.blocked}"
        if self.error and self.pages_fetched == 0:
            return f"{self.source:12s} ERROR    {self.error}"
        return (
            f"{self.source:12s} pages={self.pages_fetched:>3d} "
            f"deepest_with_listings={self.deepest_page_with_listings:>3d} "
            f"listings={self.listings_seen:>5d} "
            f"max_page_hint={self.max_page_hint if self.max_page_hint is not None else '-'}"
        )


def _max_page_from_pagination(soup: BeautifulSoup) -> int | None:
    """Largest page number referenced by any pagination control."""
    best = 0
    for link in soup.select("a[href], li a[href], .pagination a"):
        href = str(link.get("href") or "")
        if not href:
            continue
        parsed = urlparse(href)
        for value in parse_qs(parsed.query).get("page", []):
            if str(value).isdigit():
                best = max(best, int(value))
        for match in re.finditer(r"(?:index|page)[/-]?(\d+)", parsed.path, flags=re.IGNORECASE):
            if match:
                best = max(best, int(match.group(1)))
    text = soup.get_text(" ", strip=True)
    for pattern in (r"Page\s+\d+\s+of\s+(\d+)", r"page\s+\d+\s+/\s*(\d+)", r"(\d+)\s+pages?\b"):
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            best = max(best, int(match.group(1)))
    return best or None


# --- per-source: url builder + card/link extractor -------------------------


def _hitad_url(keyword: str, page: int) -> str:
    base = f"https://www.hitad.lk/search-sl?keyword={keyword}"
    return base if page <= 1 else f"{base}&page={page}"


def _hitad_cards(soup: BeautifulSoup) -> list:
    return soup.select("div.listing-card")


HITAD_KEYWORDS = ("cars", "motorbikes", "three-wheelers", "vans", "buses")


def _cartivate_url(page: int) -> str:
    return "https://cartivatemotors.lk/listing/" if page <= 1 else f"https://cartivatemotors.lk/listing/?paged={page}"


def _cartivate_cards(soup: BeautifulSoup) -> list:
    return soup.select("div.tfcl-listing-card") or soup.select("div.listing-item")


def _saleme_url(slug: str, page: int) -> str:
    base = f"https://www.saleme.lk/ads/sri-lanka/{slug}"
    return base if page <= 1 else f"{base}?page={page}"


def _saleme_cards(soup: BeautifulSoup) -> list:
    return [link for link in soup.select("a[href*='/ad/']") if "/ad/" in str(link.get("href") or "")]


def _riyahub_url(slug: str, page: int) -> str:
    base = f"https://riyahub.lk/vehicle/{slug}"
    return base if page <= 1 else f"{base}/page/{page}/"


def _riyahub_cards(soup: BeautifulSoup) -> list:
    links = soup.select("a[href*='/vehicle/']")
    return [link for link in links if "/vehicle/" in str(link.get("href") or "")]


RIYAHUB_SLUGS = ("cars", "motorcycles", "three-wheels", "vans")


def _patpat_url(slug: str, page: int) -> str:
    base = f"https://patpat.lk/en/sri-lanka/vehicle/{slug}"
    return base if page <= 1 else f"{base}?page={page}"


def _patpat_cards(soup: BeautifulSoup) -> list:
    return soup.select("div.listing-card") or soup.select("li.card-item")


def _autolanka_url(page: int) -> str:
    return "https://www.autolanka.com/cars/" if page <= 1 else f"https://www.autolanka.com/cars/index{page}.html"


def _autolanka_cards(soup: BeautifulSoup) -> list:
    return soup.select("a[href$='.html']")


def _auto_lanka_url(kind: str, page: int) -> str:
    from urllib.parse import quote

    encoded = quote(kind, safe="")
    query_page = page + 1 if kind in {"Cars", "Trucks"} else page
    return f"https://auto-lanka.com/Default.aspx?type={encoded}&page={query_page}"


def _auto_lanka_cards(soup: BeautifulSoup) -> list:
    cards = soup.select("div.avdt-item.row")
    if cards:
        return cards
    return [
        node
        for node in soup.select("script[type='application/ld+json']")
        if "/forsale/" in node.get_text(" ", strip=True)
    ]


def _dimo_url(page: int) -> str:
    base = "https://carsatdimo.lk/product-category/all-vehicles/"
    return base if page <= 1 else f"{base}page/{page}/"


def _dimo_cards(soup: BeautifulSoup) -> list:
    return soup.select("a[href*='/product/']")


async def _walk(
    client: httpx.AsyncClient,
    result: ProbeResult,
    url_for_page,
    cards,
    *,
    max_pages: int,
    delay: float = 0.4,
) -> ProbeResult:
    for page in range(1, max_pages + 1):
        url = url_for_page(page)
        try:
            response = await client.get(url, timeout=25)
        except Exception as exc:  # noqa: BLE001 - probe must never crash
            result.error = f"page {page}: {type(exc).__name__}: {exc}"
            break

        result.pages_fetched += 1
        blocked = response_blocked_reason(response)
        if blocked:
            result.blocked = f"HTTP {response.status_code}: {blocked}"
            break

        if response.status_code >= 400:
            result.error = f"page {page}: HTTP {response.status_code}"
            break

        soup = BeautifulSoup(response.text, "lxml")
        found = cards(soup)
        if found:
            result.deepest_page_with_listings = page
            result.listings_seen += len(found)
        hint = _max_page_from_pagination(soup)
        if hint and (result.max_page_hint is None or hint > result.max_page_hint):
            result.max_page_hint = hint
        if result.max_page_hint and page >= result.max_page_hint:
            result.notes.append(f"reached advertised last page {result.max_page_hint}")
            break
        if page < max_pages:
            await asyncio.sleep(delay)
    return result


async def probe_source(source: str, max_pages: int, timeout: float) -> ProbeResult:
    started = time.time()
    async with httpx.AsyncClient(
        follow_redirects=True, **httpx_client_kwargs(HEADERS)
    ) as client:
        if source == "hitad":
            total = ProbeResult(source)
            for keyword in HITAD_KEYWORDS:
                sub = await _walk(
                    client, ProbeResult(source), lambda p, k=keyword: _hitad_url(k, p), _hitad_cards, max_pages=max_pages
                )
                total.pages_fetched += sub.pages_fetched
                total.listings_seen += sub.listings_seen
                total.deepest_page_with_listings = max(
                    total.deepest_page_with_listings, sub.deepest_page_with_listings
                )
                if sub.max_page_hint:
                    total.max_page_hint = max(total.max_page_hint or 0, sub.max_page_hint)
                if sub.blocked:
                    total.blocked = sub.blocked
                    break
                if time.time() - started > timeout:
                    total.notes.append("time budget hit")
                    break
            return total
        if source == "saleme":
            total = ProbeResult(source)
            for slug in ("cars", "motorbikes-&-scooters", "three-wheelers"):
                sub = await _walk(
                    client, ProbeResult(source), lambda p, s=slug: _saleme_url(s, p), _saleme_cards, max_pages=max_pages
                )
                total.pages_fetched += sub.pages_fetched
                total.listings_seen += sub.listings_seen
                total.deepest_page_with_listings = max(
                    total.deepest_page_with_listings, sub.deepest_page_with_listings
                )
                if sub.max_page_hint:
                    total.max_page_hint = max(total.max_page_hint or 0, sub.max_page_hint)
                if sub.blocked:
                    total.blocked = sub.blocked
                    break
            return total
        if source == "riyahub":
            total = ProbeResult(source)
            for slug in RIYAHUB_SLUGS:
                sub = await _walk(
                    client, ProbeResult(source), lambda p, s=slug: _riyahub_url(s, p), _riyahub_cards, max_pages=max_pages
                )
                total.pages_fetched += sub.pages_fetched
                total.listings_seen += sub.listings_seen
                total.deepest_page_with_listings = max(
                    total.deepest_page_with_listings, sub.deepest_page_with_listings
                )
                if sub.max_page_hint:
                    total.max_page_hint = max(total.max_page_hint or 0, sub.max_page_hint)
                if sub.blocked:
                    total.blocked = sub.blocked
                    break
            return total
        if source == "patpat":
            return await _walk(
                client, ProbeResult(source), lambda p: _patpat_url("car", p), _patpat_cards, max_pages=max_pages
            )
        if source == "autolanka":
            return await _walk(
                client, ProbeResult(source), _autolanka_url, _autolanka_cards, max_pages=max_pages
            )
        if source == "auto-lanka":
            return await _walk(
                client, ProbeResult(source), lambda p: _auto_lanka_url("Cars", p), _auto_lanka_cards, max_pages=max_pages
            )
        if source == "cartivate":
            return await _walk(
                client, ProbeResult(source), _cartivate_url, _cartivate_cards, max_pages=max_pages
            )
        if source == "dimo":
            return await _walk(client, ProbeResult(source), _dimo_url, _dimo_cards, max_pages=max_pages)

    result = ProbeResult(source)
    result.error = "no probe definition"
    return result


ALL_SOURCES = ("hitad", "saleme", "riyahub", "patpat", "autolanka", "auto-lanka", "cartivate", "dimo")


async def main_async(args: argparse.Namespace) -> int:
    sources = ALL_SOURCES if args.all else tuple(args.source)
    if args.all:
        results = await asyncio.gather(
            *(probe_source(name, args.max_pages, args.timeout) for name in sources)
        )
    else:
        results = [await probe_source(name, args.max_pages, args.timeout) for name in sources]
    for result in results:
        print(result.summary())
        for note in result.notes:
            print(f"             note: {note}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", default=[])
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--max-pages", type=int, default=12)
    parser.add_argument("--timeout", type=float, default=60.0, help="per-source seconds")
    args = parser.parse_args()
    if not args.all and not args.source:
        parser.error("pass --source NAME (repeatable) or --all")
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
