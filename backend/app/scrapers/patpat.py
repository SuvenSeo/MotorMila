from datetime import datetime
from app.utils.time import utc_now
import re
from urllib.parse import urljoin

import httpx
import structlog
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.net import httpx_client_kwargs, response_blocked_reason
from app.scrapers.page_budget import page_budget_for_category, start_page_from_env
from app.utils.listing_upsert import buffered_upsert_listing, flush_upsert_buffer

log = structlog.get_logger()


class PatpatBlockedError(RuntimeError):
    """Raised when patpat.lk hard-blocks the scraper (Cloudflare / WAF)."""


class PatpatScraper:
    SOURCE = "patpat"
    # For-sale vehicle type leaves (skip rentals/parts).
    CATEGORY_PATHS = (
        "car",
        "bike",
        "threewheeler",
        "van",
        "bus",
        "truck",
        "suv",
        "pickup",
        "tractor",
        "heavy",
        "tipper",
    )
    PRIMARY_CATEGORY = "car"
    BASE_URL = "https://patpat.lk/en/sri-lanka/vehicle/car"

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()
        # Mirrors GenericDetailScraper so run_sync can record a truthful FAILED
        # run instead of a zero-listing SUCCESS when the wall is hit.
        self.blocked_reason: str | None = None

    def _upsert_listing(self, payload: dict):
        return buffered_upsert_listing(self, payload)

    @staticmethod
    def _text(node, selectors: list[str]) -> str:
        for selector in selectors:
            elem = node.select_one(selector)
            if elem:
                text = elem.get_text(" ", strip=True)
                if text:
                    return text
        return ""

    @staticmethod
    def _attr(node, selectors: list[tuple[str, str]]) -> str:
        for selector, attr in selectors:
            elem = node.select_one(selector)
            if elem and elem.has_attr(attr):
                value = str(elem.get(attr) or "").strip()
                if value:
                    return value
        return ""

    @staticmethod
    def _extract_max_page(soup: BeautifulSoup) -> int | None:
        max_page = 0

        for link in soup.select(".pagination a[href*='page=']"):
            href = str(link.get("href") or "")
            match = re.search(r"[?&]page=(\d+)", href)
            if match:
                max_page = max(max_page, int(match.group(1)))

        page_summary = soup.get_text(" ", strip=True)
        summary_match = re.search(r"Page\s+\d+\s+of\s+(\d+)", page_summary, flags=re.IGNORECASE)
        if summary_match:
            max_page = max(max_page, int(summary_match.group(1)))

        return max_page if max_page > 0 else None

    def _extract_price_text(self, card: BeautifulSoup) -> str:
        for selector in (
            "span[class*='text-2xl'][class*='font-semibold']",
            "[class*='price']",
        ):
            elem = card.select_one(selector)
            if elem:
                text = elem.get_text(" ", strip=True)
                if text:
                    return text

        card_text = card.get_text(" ", strip=True)
        match = re.search(
            r"(?:Rs\.?|LKR|Rs:)\s*([0-9][0-9,]*(?:\.[0-9]+)?)",
            card_text,
            flags=re.IGNORECASE,
        )
        # Keep the currency marker so price normalization can parse grouped values (e.g. Rs: 10,500,000).
        return match.group(0) if match else ""

    @staticmethod
    def _extract_district(card_text: str) -> str:
        match = re.search(
            r"\|\s*([A-Za-z][A-Za-z\s\-]+?)\s*(?:[0-9][0-9,]*\s*km|km\b|$)",
            card_text,
            flags=re.IGNORECASE,
        )
        if not match:
            return ""
        return match.group(1).strip()

    @classmethod
    def _category_base_url(cls, category_path: str) -> str:
        return f"https://patpat.lk/en/sri-lanka/vehicle/{category_path}"

    @classmethod
    def _page_budget_for_category(cls, category_path: str, max_pages: int) -> int:
        return page_budget_for_category(
            is_primary=category_path == cls.PRIMARY_CATEGORY,
            max_pages=max_pages,
        )

    async def scrape(self, max_pages: int = 5):
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }

        seen_urls: set[str] = set()
        start_page = start_page_from_env(self.SOURCE)

        async with httpx.AsyncClient(
            follow_redirects=True, **httpx_client_kwargs(headers)
        ) as client:
            for category_path in self.CATEGORY_PATHS:
                page_limit = self._page_budget_for_category(category_path, max_pages)
                base_url = self._category_base_url(category_path)
                page_num = start_page
                stop_at_page = start_page + page_limit
                consecutive_empty_pages = 0
                consecutive_page_errors = 0

                while page_num < stop_at_page:
                    url = base_url if page_num == 1 else f"{base_url}?page={page_num}"
                    log.info(
                        "scraping_page",
                        source=self.SOURCE,
                        category=category_path,
                        page=page_num,
                        page_limit=page_limit,
                    )

                    try:
                        res = await client.get(url, timeout=30)
                        # Uses the shared detector rather than a status check:
                        # patpat.lk answers blocked GETs with 405 + a
                        # "Human Verification" interstitial (not a 403), so the
                        # old status-only guard never fired and every page fell
                        # through to the generic error path — up to 25 errors
                        # per category across 11 categories of pure wall.
                        blocked = response_blocked_reason(res)
                        if blocked:
                            raise PatpatBlockedError(
                                f"patpat.lk blocked the request for {url} "
                                f"(HTTP {res.status_code}: {blocked})"
                            )
                        res.raise_for_status()
                        soup = BeautifulSoup(res.text, "lxml")

                        cards = soup.select("div.listing-card")
                        if not cards:
                            cards = soup.select("li.card-item")

                        if not cards:
                            consecutive_empty_pages += 1
                            log.info(
                                "patpat_no_cards",
                                category=category_path,
                                page=page_num,
                                consecutive_empty_pages=consecutive_empty_pages,
                            )
                            if consecutive_empty_pages >= 10:
                                break
                            page_num += 1
                            continue

                        new_on_page = 0

                        for card in cards:
                            try:
                                link = card.select_one("a[href*='/en/ad/vehicle/']")
                                if not link:
                                    continue

                                listing_url = str(link.get("href") or "").strip()
                                if not listing_url:
                                    continue

                                listing_url = urljoin("https://patpat.lk", listing_url)
                                if listing_url in seen_urls:
                                    continue

                                seen_urls.add(listing_url)
                                new_on_page += 1

                                title = self._text(card, [".line-clamp-2", "h2", "h3"])
                                if not title:
                                    title = str(link.get("title") or "").strip()
                                if not title:
                                    title = link.get_text(" ", strip=True)
                                if not title:
                                    continue

                                raw_price = self._extract_price_text(card)
                                card_text = card.get_text(" ", strip=True)
                                district = self._extract_district(card_text)

                                img = card.select_one("img[src]") or card.select_one(
                                    "img[data-src]"
                                )
                                thumb_url = (
                                    str(img.get("src") or img.get("data-src") or "").strip()
                                    if img
                                    else ""
                                )
                                thumb_url = (
                                    urljoin("https://patpat.lk", thumb_url) if thumb_url else ""
                                )

                                data = self.cleaner.clean_title(title)
                                price = self.cleaner.normalize_price_lkr(raw_price)
                                if not data["make"] or not price:
                                    continue

                                payload = {
                                    "source_id": listing_url,
                                    "source": self.SOURCE,
                                    "title": title,
                                    "make": data["make"],
                                    "model": data["model"] or "Other",
                                    "year": data["year"],
                                    "price_lkr": price,
                                    "url": listing_url,
                                    "thumbnail_url": thumb_url,
                                    "district": district or "Sri Lanka",
                                    "condition": None,
                                    "vehicle_category": (
                                        "motorbikes"
                                        if category_path == "bike"
                                        else (
                                            "three-wheelers"
                                            if category_path == "threewheeler"
                                            else (
                                                "trucks"
                                                if category_path in {"truck", "tipper"}
                                                else (
                                                    "heavy-duty"
                                                    if category_path == "heavy"
                                                    else category_path
                                                )
                                            )
                                        )
                                    ),
                                    "_text_blobs": card_text,
                                    "scraped_at": utc_now(),
                                }

                                normalized_payload = self.cleaner.normalize_listing_payload(
                                    payload
                                )
                                if not normalized_payload:
                                    continue

                                self._upsert_listing(normalized_payload)
                                self.db.commit()
                            except Exception as e:
                                log.error(
                                    "patpat_item_error",
                                    category=category_path,
                                    error=str(e),
                                )
                                self.db.rollback()

                        if new_on_page == 0:
                            consecutive_empty_pages += 1
                            log.info(
                                "patpat_empty_page",
                                category=category_path,
                                page=page_num,
                                consecutive_empty_pages=consecutive_empty_pages,
                            )
                            if consecutive_empty_pages >= 10:
                                break
                            page_num += 1
                            continue

                        consecutive_empty_pages = 0
                        consecutive_page_errors = 0
                        page_num += 1
                    except PatpatBlockedError as blocked_exc:
                        self.blocked_reason = str(blocked_exc)
                        raise
                    except Exception as e:
                        log.error(
                            "patpat_page_error",
                            category=category_path,
                            page=page_num,
                            error=str(e),
                        )
                        consecutive_page_errors += 1
                        if consecutive_page_errors >= 25:
                            break
                        page_num += 1

        flush_upsert_buffer(self)

