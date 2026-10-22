from __future__ import annotations

import re
from urllib.parse import urljoin

import httpx
import structlog
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.net import httpx_client_kwargs
from app.scrapers.page_budget import (
    page_budget_for_category,
    should_stop_at_page_hint,
    start_page_from_env,
)
from app.utils.listing_upsert import buffered_upsert_listing, flush_upsert_buffer
from app.utils.time import utc_now

log = structlog.get_logger()

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class HitadScraper:
    SOURCE = "hitad"
    # Leaf vehicle keywords only — skip broad "vehicles" and parts/services.
    CATEGORY_KEYWORDS = (
        "cars",
        "motorbikes",
        "three-wheelers",
        "vans",
        "buses",
        "lorries-trucks",
        "tractors",
        "heavy-duty",
        "bicycles",
        "boats-water-transport",
    )
    PRIMARY_CATEGORY = "cars"
    BASE_URL = "https://www.hitad.lk/search-sl?keyword=cars"

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()

    def _upsert_listing(self, payload: dict):
        return buffered_upsert_listing(self, payload)

    @staticmethod
    def _page_url(keyword: str, page_num: int) -> str:
        base = f"https://www.hitad.lk/search-sl?keyword={keyword}"
        if page_num <= 1:
            return base
        return f"{base}&page={page_num}"

    @classmethod
    def _page_budget_for_category(cls, keyword: str, max_pages: int) -> int:
        return page_budget_for_category(
            is_primary=keyword == cls.PRIMARY_CATEGORY,
            max_pages=max_pages,
        )

    @staticmethod
    def _extract_max_page(soup: BeautifulSoup) -> int | None:
        max_page = 0
        for link in soup.select("a[href*='page=']"):
            href = str(link.get("href") or "")
            match = re.search(r"[?&]page=(\d+)", href)
            if match:
                max_page = max(max_page, int(match.group(1)))
        return max_page if max_page > 0 else None

    @staticmethod
    def _extract_district(card: BeautifulSoup) -> str:
        cat = card.select_one(".item-cat")
        if not cat:
            return ""
        spans = [span.get_text(" ", strip=True) for span in cat.select("span")]
        for span_text in spans:
            token = span_text.strip()
            if token and token.lower() not in {
                "cars",
                "vehicles",
                "motorbikes",
                "three-wheelers",
                "vans",
                "buses",
                "lorries-trucks",
                "tractors",
                "heavy-duty",
                "bicycles",
                "boats-water-transport",
            }:
                return token
        return ""

    @staticmethod
    def _extract_thumbnail(card: BeautifulSoup) -> str:
        img = card.select_one("img[src], img[data-src]")
        if not img:
            return ""
        candidate = str(img.get("src") or img.get("data-src") or "").strip()
        if not candidate or "hitad-logo" in candidate.lower():
            return ""
        return urljoin("https://www.hitad.lk", candidate)

    def _build_payload_from_card(
        self, card: BeautifulSoup, *, vehicle_category: str | None = None
    ) -> dict | None:
        link = card.select_one("a[href*='/details/']")
        if not link:
            return None

        listing_url = urljoin("https://www.hitad.lk", str(link.get("href") or "").strip())
        if not listing_url:
            return None

        title_node = card.select_one("h4.item-title a, .item-title a, h4.item-title")
        title = ""
        if title_node:
            title = str(title_node.get("title") or "").strip()
            if not title:
                title = title_node.get_text(" ", strip=True)
        if not title:
            return None

        price_node = card.select_one("h3.item-price, .item-price")
        raw_price = price_node.get_text(" ", strip=True) if price_node else ""
        district = self._extract_district(card)
        card_text = card.get_text(" ", strip=True)

        data = self.cleaner.clean_title(title)
        price = self.cleaner.normalize_price_lkr(raw_price)
        has_unavailable_price = bool(
            re.search(
                r"\b(negotiable|price\s+on\s+request|contact\s+for\s+price|call\s+for\s+price|poa)\b",
                raw_price or card_text,
                flags=re.IGNORECASE,
            )
        )
        if not data["make"] or (price is None and not has_unavailable_price):
            return None

        payload = {
            "source_id": listing_url,
            "source": self.SOURCE,
            "title": title,
            "make": data["make"],
            "model": data["model"] or "Other",
            "year": data["year"],
            "price_lkr": price,
            "url": listing_url,
            "thumbnail_url": self._extract_thumbnail(card),
            "district": district or "Sri Lanka",
            "condition": None,
            "vehicle_category": vehicle_category or "cars",
            "_text_blobs": card_text,
            "_allow_missing_price": has_unavailable_price and price is None,
            "scraped_at": utc_now(),
        }
        return self.cleaner.normalize_listing_payload(payload)

    async def scrape(self, max_pages: int = 5):
        seen_urls: set[str] = set()
        start_page = start_page_from_env(self.SOURCE)

        async with httpx.AsyncClient(
            follow_redirects=True, **httpx_client_kwargs(DEFAULT_HEADERS)
        ) as client:
            for keyword in self.CATEGORY_KEYWORDS:
                page_limit = self._page_budget_for_category(keyword, max_pages)
                page_num = start_page
                stop_at_page = start_page + page_limit
                consecutive_empty_pages = 0
                consecutive_page_errors = 0
                max_page_hint: int | None = None

                while page_num < stop_at_page:
                    url = self._page_url(keyword, page_num)
                    log.info(
                        "scraping_page",
                        source=self.SOURCE,
                        category=keyword,
                        page=page_num,
                        page_limit=page_limit,
                        start_page=start_page,
                    )

                    try:
                        response = await client.get(url, timeout=30)
                        response.raise_for_status()
                        soup = BeautifulSoup(response.text, "lxml")
                        cards = soup.select("div.listing-card")

                        if not cards:
                            consecutive_empty_pages += 1
                            log.info(
                                "hitad_no_cards",
                                category=keyword,
                                page=page_num,
                                consecutive_empty_pages=consecutive_empty_pages,
                            )
                            # A dry page past the site's advertised last page
                            # is a confirmed end, so stop now instead of
                            # spending the whole empty-page budget proving it.
                            if should_stop_at_page_hint(
                                page_num, max_page_hint, produced_listings=False
                            ):
                                log.info(
                                    "hitad_reached_last_page",
                                    category=keyword,
                                    page=page_num,
                                    last_page=max_page_hint,
                                )
                                break
                            if consecutive_empty_pages >= 10:
                                break
                            page_num += 1
                            continue

                        # Remember the advertised last page; it is only ever used
                        # to end a dry tail, never to cut short a page that is
                        # still yielding cards.
                        page_hint = self._extract_max_page(soup)
                        if page_hint and (max_page_hint is None or page_hint > max_page_hint):
                            max_page_hint = page_hint

                        new_on_page = 0

                        for card in cards:
                            try:
                                payload = self._build_payload_from_card(
                                card, vehicle_category=keyword
                            )
                                if not payload:
                                    continue
                                listing_url = str(payload.get("url") or "")
                                if not listing_url or listing_url in seen_urls:
                                    continue
                                seen_urls.add(listing_url)
                                new_on_page += 1
                                self._upsert_listing(payload)
                                self.db.commit()
                            except Exception as exc:
                                log.error(
                                    "hitad_item_error",
                                    category=keyword,
                                    error=str(exc),
                                )
                                self.db.rollback()

                        if new_on_page == 0:
                            # Cards were present but none parsed. That is a
                            # parsing gap, not the end of the catalogue, so the
                            # crawl keeps going.
                            consecutive_empty_pages += 1
                            if consecutive_empty_pages >= 10:
                                break
                            page_num += 1
                            continue

                        consecutive_empty_pages = 0
                        consecutive_page_errors = 0
                        page_num += 1
                    except Exception as exc:
                        log.error(
                            "hitad_page_error",
                            category=keyword,
                            page=page_num,
                            error=str(exc),
                        )
                        consecutive_page_errors += 1
                        if consecutive_page_errors >= 25:
                            break
                        page_num += 1

        flush_upsert_buffer(self)
