from __future__ import annotations

from datetime import datetime
from app.utils.time import utc_now
import os
import re
from urllib.parse import urljoin, urlparse

import httpx
import structlog
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.net import httpx_client_kwargs, response_blocked_reason
from app.scrapers.page_budget import start_page_from_env
from app.utils.listing_upsert import buffered_upsert_listing, flush_upsert_buffer

log = structlog.get_logger()

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

SRI_LANKA_DISTRICTS = (
    "Ampara",
    "Anuradhapura",
    "Badulla",
    "Batticaloa",
    "Colombo",
    "Galle",
    "Gampaha",
    "Hambantota",
    "Jaffna",
    "Kalutara",
    "Kandy",
    "Kegalle",
    "Kilinochchi",
    "Kurunegala",
    "Mannar",
    "Matale",
    "Matara",
    "Monaragala",
    "Mullaitivu",
    "Nuwara Eliya",
    "Polonnaruwa",
    "Puttalam",
    "Ratnapura",
    "Trincomalee",
    "Vavuniya",
)


class SourceBlockedError(RuntimeError):
    """Raised when a source answers with a bot wall instead of listings.

    Aborting the whole source on the first challenge page is deliberate: these
    walls never clear mid-run, so continuing only burns the source's entire
    wall-clock budget (and the fleet's IP reputation) for zero listings.
    """


class GenericDetailScraper:
    SOURCE = ""
    BASE_URL = ""
    START_URLS: tuple[str, ...] = ()
    EMPTY_PAGE_LIMIT = 3
    ALLOW_UNAVAILABLE_PRICE = False

    def empty_page_limit(self) -> int:
        """Consecutive empty pages tolerated before a category is done.

        Three is enough to clear a real end of catalogue without stalling, and
        it is tunable so a site that interleaves empty pages can be crawled
        further.
        """
        raw = os.getenv("SCRAPE_EMPTY_PAGE_LIMIT")
        if raw is None or str(raw).strip() == "":
            return max(1, int(self.EMPTY_PAGE_LIMIT))
        try:
            parsed = int(str(raw).strip())
        except (TypeError, ValueError):
            return max(1, int(self.EMPTY_PAGE_LIMIT))
        return parsed if parsed >= 1 else max(1, int(self.EMPTY_PAGE_LIMIT))

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()
        # Set to a short reason when the source answered with a bot wall so the
        # caller can record a truthful FAILED run instead of a zero-listing
        # SUCCESS. Checked with getattr() so subclasses that skip __init__ or
        # older scrapers stay safe.
        self.blocked_reason: str | None = None

    def _upsert_listing(self, payload: dict):
        return buffered_upsert_listing(self, payload)

    @staticmethod
    def _absolute_url(base_url: str, href: str) -> str:
        return urljoin(base_url, str(href or "").strip())

    @staticmethod
    def _text(node, selectors: tuple[str, ...] | list[str]) -> str:
        for selector in selectors:
            elem = node.select_one(selector)
            if elem:
                text = elem.get_text(" ", strip=True)
                if text:
                    return text
        return ""

    @staticmethod
    def _attr(node, selectors: tuple[tuple[str, str], ...] | list[tuple[str, str]]) -> str:
        for selector, attr in selectors:
            elem = node.select_one(selector)
            if elem and elem.has_attr(attr):
                value = str(elem.get(attr) or "").strip()
                if value:
                    return value
        return ""

    @staticmethod
    def _visible_text(soup: BeautifulSoup) -> str:
        clone = BeautifulSoup(str(soup), "lxml")
        for tag in clone(["script", "style", "noscript"]):
            tag.extract()
        return re.sub(r"\s+", " ", clone.get_text(" ", strip=True)).strip()

    @staticmethod
    def _dedupe_keep_order(values: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for value in values:
            item = str(value or "").strip()
            if not item or item in seen:
                continue
            seen.add(item)
            ordered.append(item)
        return ordered

    @classmethod
    def _extract_listing_links(cls, soup: BeautifulSoup) -> list[str]:
        raise NotImplementedError

    def _page_url_for(self, start_url: str, page_num: int) -> str:
        if page_num <= 1:
            return start_url
        return f"{start_url.rstrip('/')}?page={page_num}"

    def _build_page_url_groups(
        self,
        max_pages: int,
        *,
        start_page: int = 1,
    ) -> list[list[str]]:
        """Listing-page URLs grouped by category, one group per start URL.

        Grouping matters: a source's categories end at different pages, so the
        "this category is finished" counter has to be per group. A single
        shared counter made a source stop as soon as its *first* category ran
        out of pages, and every remaining category was never visited.
        """
        page_limit = max(1, int(max_pages or 1))
        start = max(1, int(start_page or 1))
        starts = self.START_URLS or (self.BASE_URL,)
        return [
            [self._page_url_for(start_url, page) for page in range(start, start + page_limit)]
            for start_url in starts
        ]

    def _build_page_urls(self, max_pages: int) -> list[str]:
        return [url for group in self._build_page_url_groups(max_pages) for url in group]

    def _extract_title(self, soup: BeautifulSoup) -> str:
        title = self._attr(
            soup,
            (
                ("meta[property='og:title']", "content"),
                ("meta[name='twitter:title']", "content"),
            ),
        )
        if title:
            return title

        title = self._text(
            soup,
            (
                "h1.product_title",
                "h1.entry-title",
                "h1",
                ".ad-title",
                ".listing-title",
                ".title",
                "h2",
            ),
        )
        if title:
            return title

        page_title = self._text(soup, ("title",))
        return re.sub(r"\s*[-|]\s*(AutoLens|Carshop|SaleMe|Riyahub|Cars at DIMO).*$", "", page_title).strip()

    @staticmethod
    def _is_unavailable_price_text(value: str) -> bool:
        text = re.sub(r"\s+", " ", str(value or "")).strip().lower()
        if not text:
            return False
        return bool(
            re.search(
                r"\b(price\s*[:\-]?\s*)?(negotiable|price\s+on\s+request|contact\s+for\s+price|call\s+for\s+price|call\s+for\s+details|poa)\b",
                text,
                flags=re.IGNORECASE,
            )
        )

    def _extract_price_text(self, soup: BeautifulSoup, visible_text: str) -> str:
        for selector, attr in (
            ("meta[property='product:price:amount']", "content"),
            ("meta[itemprop='price']", "content"),
            ("meta[name='product:price:amount']", "content"),
        ):
            node = soup.select_one(selector)
            if node and node.has_attr(attr):
                value = str(node.get(attr) or "").strip()
                if self.cleaner.normalize_price_lkr(value) is not None:
                    return value

        for selector in (
            ".woocommerce-Price-amount",
            ".amount",
            ".price",
            ".ad-price",
            ".listing-price",
            "[class*='price']",
            "[id*='price']",
        ):
            for node in soup.select(selector):
                text = node.get_text(" ", strip=True)
                if self.cleaner.normalize_price_lkr(text) is not None:
                    return text
                if self._is_unavailable_price_text(text):
                    return text

        for pattern in (
            r"(?:Rs\.?|LKR)\s*[:\-]?\s*[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?",
            r"(?:Rs\.?|LKR)\s*[:\-]?\s*[0-9]+(?:\.[0-9]+)?\s*(?:million|mn|m)\b",
        ):
            match = re.search(pattern, visible_text, flags=re.IGNORECASE)
            if match and self.cleaner.normalize_price_lkr(match.group(0)) is not None:
                return match.group(0)

        unavailable_match = re.search(
            r"\bprice\s*[:\-]?\s*(negotiable|price\s+on\s+request|contact\s+for\s+price|call\s+for\s+price)\b",
            visible_text,
            flags=re.IGNORECASE,
        )
        if unavailable_match:
            return unavailable_match.group(0)

        return ""

    def _extract_thumbnail(self, soup: BeautifulSoup, detail_url: str) -> str:
        candidate = self._attr(
            soup,
            (
                ("meta[property='og:image']", "content"),
                ("meta[name='twitter:image']", "content"),
                ("meta[property='og:image:url']", "content"),
                ("img[data-src]", "data-src"),
                ("img[data-lazy-src]", "data-lazy-src"),
                ("img[src]", "src"),
            ),
        )
        if not candidate:
            return ""
        return urljoin(detail_url, candidate)

    @staticmethod
    def _extract_district_from_text(text: str) -> str:
        for district in SRI_LANKA_DISTRICTS:
            if re.search(rf"\b{re.escape(district)}\b", text, flags=re.IGNORECASE):
                return district
        return ""

    @staticmethod
    def _extract_district_from_url(url: str) -> str:
        path = urlparse(url).path.lower()
        slug = re.sub(r"[-_]+", " ", path)
        return GenericDetailScraper._extract_district_from_text(slug)

    @staticmethod
    def _extract_mileage(text: str) -> int | None:
        match = re.search(r"([0-9][0-9,]{2,})\s*(?:km|kms|kilometers)\b", text, flags=re.IGNORECASE)
        if not match:
            return None
        digits = re.sub(r"\D", "", match.group(1))
        return int(digits) if digits else None

    @staticmethod
    def _extract_engine_capacity(text: str) -> int | None:
        # The unit is REQUIRED: with an optional unit, a bare manufacture year
        # ("Toyota Vitz 2007") matched as 2,007 cc and polluted listings with
        # year-as-displacement values (plus bogus "near 1,500cc cliff" badges).
        match = re.search(r"\b([1-9][0-9]{2,4})\s*(?:cc|c\.c\.)\b", text, flags=re.IGNORECASE)
        if not match:
            return None
        try:
            value = int(match.group(1))
        except ValueError:
            return None
        return value if 300 <= value <= 10000 else None

    @staticmethod
    def _clean_mercedes_model(data: dict, title: str) -> dict:
        if not str(data.get("make") or "").lower().startswith("mercedes"):
            return data
        if str(data.get("model") or "").lower() != "benz":
            return data

        match = re.search(r"\bmercedes(?:[-\s]+benz)?\s+([a-z0-9][a-z0-9-]*)", title, flags=re.IGNORECASE)
        if match:
            data = dict(data)
            data["model"] = match.group(1).title()
        return data

    def _build_payload(self, detail_url: str, html: str, *, vehicle_category: str | None = None) -> dict | None:
        soup = BeautifulSoup(html, "lxml")
        visible_text = self._visible_text(soup)
        title = self._extract_title(soup)
        if not title:
            return None

        data = self._clean_mercedes_model(self.cleaner.clean_title(title), title)
        raw_price = self._extract_price_text(soup, visible_text)
        price = self.cleaner.normalize_price_lkr(raw_price)
        has_unavailable_price = self.ALLOW_UNAVAILABLE_PRICE and self._is_unavailable_price_text(
            raw_price or visible_text
        )
        if not data["make"] or (price is None and not has_unavailable_price):
            return None

        district = self._extract_district_from_text(visible_text) or self._extract_district_from_url(detail_url)
        payload = {
            "source_id": detail_url,
            "source": self.SOURCE,
            "title": title,
            "make": data["make"],
            "model": data["model"] or "Other",
            "year": data["year"],
            "price_lkr": price,
            "url": detail_url,
            "thumbnail_url": self._extract_thumbnail(soup, detail_url),
            "mileage": self._extract_mileage(visible_text),
            "engine_capacity": self._extract_engine_capacity(visible_text),
            "district": district or "Sri Lanka",
            "vehicle_category": vehicle_category or "cars",
            "_text_blobs": visible_text,
            "_allow_missing_price": has_unavailable_price,
            "scraped_at": utc_now(),
        }
        return self.cleaner.normalize_listing_payload(payload)

    @staticmethod
    def _category_from_page_url(page_url: str) -> str:
        path = str(urlparse(page_url).path or "").lower()
        if "vans,-buses" in path or "vans-buses" in path:
            return "vans"
        if "motorbikes" in path:
            return "motorbikes"
        for token in (
            "motorcycles",
            "three-wheels",
            "three-wheelers",
            "vans",
            "buses",
            "lorries",
            "trucks",
            "tractors",
            "heavy-duties",
            "heavy-duty",
            "bicycles",
            "push-cycles",
            "boats",
            "suvs",
            "wagons",
            "pickups",
            "crew-cabs",
            "sports",
            "others",
            "cars",
        ):
            if f"/{token}" in path or path.rstrip("/").endswith(token):
                if token == "motorcycles":
                    return "motorbikes"
                if token == "three-wheels":
                    return "three-wheelers"
                if token == "heavy-duties":
                    return "heavy-duty"
                if token == "push-cycles":
                    return "bicycles"
                return token
        return "cars"

    async def scrape(self, max_pages: int = 5):
        if max_pages <= 0:
            return

        seen_urls: set[str] = set()
        blocked = False
        block_reason: str | None = None

        start_page = start_page_from_env(self.SOURCE)
        empty_page_limit = self.empty_page_limit()
        groups = self._build_page_url_groups(max_pages, start_page=start_page)
        if start_page > 1:
            log.info(
                "generic_detail_segment_start",
                source=self.SOURCE,
                start_page=start_page,
                max_pages=max_pages,
                categories=len(groups),
            )

        async with httpx.AsyncClient(
            follow_redirects=True, **httpx_client_kwargs(DEFAULT_HEADERS)
        ) as client:
            for category_urls in groups:
                # Per-category, not per-source: one category running out of
                # pages must never end the crawl for the categories after it.
                consecutive_empty_pages = 0
                for page_url in category_urls:
                    log.info("scraping_page", source=self.SOURCE, url=page_url)
                    try:
                        response = await client.get(page_url, timeout=30)
                        page_blocked = response_blocked_reason(response)
                        if page_blocked:
                            raise SourceBlockedError(page_blocked)
                        response.raise_for_status()
                        soup = BeautifulSoup(response.text, "lxml")
                        listing_urls = self._extract_listing_links(soup)
                    except SourceBlockedError as exc:
                        log.warning(
                            "generic_detail_source_blocked",
                            source=self.SOURCE,
                            url=page_url,
                            reason=str(exc),
                        )
                        blocked = True
                        block_reason = str(exc)
                        break
                    except Exception as exc:
                        log.error("generic_detail_page_error", source=self.SOURCE, url=page_url, error=str(exc))
                        continue

                    if not listing_urls:
                        consecutive_empty_pages += 1
                        log.info(
                            "generic_detail_empty_page",
                            source=self.SOURCE,
                            url=page_url,
                            consecutive_empty_pages=consecutive_empty_pages,
                            limit=empty_page_limit,
                        )
                        if consecutive_empty_pages >= empty_page_limit:
                            break
                        continue

                    consecutive_empty_pages = 0
                    new_on_page = 0
                    page_category = self._category_from_page_url(page_url)
                    for detail_url in listing_urls:
                        if detail_url in seen_urls:
                            continue
                        seen_urls.add(detail_url)
                        try:
                            detail = await client.get(detail_url, timeout=30)
                            detail_blocked = response_blocked_reason(detail)
                            if detail_blocked:
                                raise SourceBlockedError(detail_blocked)
                            detail.raise_for_status()
                            payload = self._build_payload(
                                str(detail.url),
                                detail.text,
                                vehicle_category=page_category,
                            )
                            if not payload:
                                continue
                            self._upsert_listing(payload)
                            self.db.commit()
                            new_on_page += 1
                        except SourceBlockedError as exc:
                            self.db.rollback()
                            log.warning(
                                "generic_detail_source_blocked",
                                source=self.SOURCE,
                                url=detail_url,
                                reason=str(exc),
                            )
                            blocked = True
                            block_reason = str(exc)
                            break
                        except Exception as exc:
                            self.db.rollback()
                            log.error("generic_detail_item_error", source=self.SOURCE, url=detail_url, error=str(exc))

                    if new_on_page == 0:
                        consecutive_empty_pages += 1
                        if consecutive_empty_pages >= empty_page_limit:
                            break

                    if blocked:
                        break

                if blocked:
                    break

        flush_upsert_buffer(self)
        if blocked:
            self.blocked_reason = block_reason or "bot_wall:unknown"
            log.warning(
                "generic_detail_source_gave_up_blocked",
                source=self.SOURCE,
                reason=self.blocked_reason,
            )
