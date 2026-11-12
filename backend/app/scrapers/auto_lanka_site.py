from __future__ import annotations

import re
from urllib.parse import quote, urljoin

import httpx
import structlog
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.page_budget import page_budget_for_category, start_page_from_env
from app.utils.listing_upsert import buffered_upsert_listing, flush_upsert_buffer
from app.utils.time import utc_now

log = structlog.get_logger()


class AutoLankaSiteScraper:
    SOURCE = "auto-lanka"
    # For-sale vehicle types only (skip Rent/Repair/Spare/Dealers). Buses 500s on site.
    VEHICLE_TYPES = (
        "Cars",
        "Motorbikes",
        "Vans",
        "Trucks",
        "Jeeps",
        "Three Wheelers",
    )
    PRIMARY_TYPE = "Cars"
    BASE_URL = "https://auto-lanka.com/Default.aspx?type=Cars&page="

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()

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

    @classmethod
    def _build_page_url(cls, vehicle_type: str, page_num: int) -> str:
        encoded = quote(vehicle_type, safe="")
        # Some types reject page=1 (500); those use legacy page_num+1 → 2,3,4...
        if vehicle_type in {"Cars", "Trucks"}:
            query_page = page_num + 1
        else:
            query_page = page_num
        return f"https://auto-lanka.com/Default.aspx?type={encoded}&page={query_page}"

    @classmethod
    def _page_budget_for_type(cls, vehicle_type: str, max_pages: int) -> int:
        return page_budget_for_category(
            is_primary=vehicle_type == cls.PRIMARY_TYPE,
            max_pages=max_pages,
        )

    @staticmethod
    def _is_vehicle_schema_node(node) -> bool:
        schema_text = node.get_text(" ", strip=True)
        return bool(
            schema_text
            and "/forsale/" in schema_text
            and re.search(r'"@type"\s*:\s*"Vehicle"', schema_text, flags=re.IGNORECASE)
        )

    @staticmethod
    def _district_from_url(listing_url: str) -> str:
        match = re.search(
            r"(?:cars|motorbikes|vans|trucks|jeeps|three-wheelers)-for-sale-in-([^/]+)/",
            listing_url,
            flags=re.IGNORECASE,
        )
        if not match:
            match = re.search(r"for-sale-in-([^/]+)/", listing_url, flags=re.IGNORECASE)
        if not match:
            return ""
        return re.sub(r"[-_]+", " ", match.group(1)).strip().title()

    async def scrape(self, max_pages: int = 5):
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }
        async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
            seen_urls: set[str] = set()
            start_page = start_page_from_env(self.SOURCE)
            for vehicle_type in self.VEHICLE_TYPES:
                page_limit = self._page_budget_for_type(vehicle_type, max_pages)
                consecutive_empty_pages = 0
                consecutive_page_errors = 0
                for page_num in range(start_page, start_page + page_limit):
                    url = self._build_page_url(vehicle_type, page_num)
                    log.info(
                        "scraping_page",
                        source=self.SOURCE,
                        category=vehicle_type,
                        page=page_num,
                        page_limit=page_limit,
                    )

                    try:
                        res = await client.get(url, timeout=30)
                        res.raise_for_status()
                        soup = BeautifulSoup(res.text, "lxml")
                        cards = soup.select("div.avdt-item.row")
                        if not cards:
                            cards = [
                                node
                                for node in soup.select("script[type='application/ld+json']")
                                if self._is_vehicle_schema_node(node)
                            ]
                        if not cards:
                            consecutive_empty_pages += 1
                            log.info(
                                "auto_lanka_no_cards",
                                category=vehicle_type,
                                page=page_num,
                                consecutive_empty_pages=consecutive_empty_pages,
                            )
                            if consecutive_empty_pages >= 10:
                                break
                            continue

                        consecutive_empty_pages = 0
                        consecutive_page_errors = 0

                        for card in cards:
                            try:
                                schema_text = ""
                                if getattr(card, "name", "").lower() == "script":
                                    schema_node = card
                                else:
                                    schema_node = card.select_one(
                                        "script[type='application/ld+json']"
                                    )
                                if schema_node:
                                    schema_text = schema_node.get_text(" ", strip=True)

                                url_match = re.search(
                                    r'"url"\s*:\s*"([^"]+)"',
                                    schema_text,
                                    flags=re.IGNORECASE,
                                )
                                listing_url = url_match.group(1).strip() if url_match else ""
                                if not listing_url:
                                    fallback_match = re.search(
                                        r"(/forsale/[^\"'\s]+\.htm)",
                                        str(card),
                                        flags=re.IGNORECASE,
                                    )
                                    listing_url = (
                                        fallback_match.group(1).strip() if fallback_match else ""
                                    )
                                if not listing_url:
                                    continue

                                listing_url = urljoin("https://auto-lanka.com", listing_url)
                                if listing_url in seen_urls:
                                    continue
                                seen_urls.add(listing_url)

                                title_match = re.search(
                                    r'"name"\s*:\s*"([^"]+)"',
                                    schema_text,
                                    flags=re.IGNORECASE,
                                )
                                title = title_match.group(1).strip() if title_match else ""
                                if not title:
                                    title = self._text(card, [".item-title"])
                                if not title:
                                    continue

                                price_match = re.search(
                                    r'"price"\s*:\s*"([^"]+)"',
                                    schema_text,
                                    flags=re.IGNORECASE,
                                )
                                card_text = card.get_text(" ", strip=True)
                                raw_price = price_match.group(1).strip() if price_match else ""
                                if not raw_price:
                                    raw_price = self._text(card, [".item-price"])

                                district = ""
                                district_match = re.search(
                                    r"Location:\s*(.+?)(?:\s+Fuel\s*:|$)",
                                    card_text,
                                    flags=re.IGNORECASE,
                                )
                                if district_match:
                                    district = district_match.group(1).strip()
                                if "," in district:
                                    district = district.split(",")[-1].strip()
                                if not district:
                                    district = self._district_from_url(listing_url)

                                image_match = re.search(
                                    r'"image"\s*:\s*"([^"]+)"',
                                    schema_text,
                                    flags=re.IGNORECASE,
                                )
                                thumb_url = image_match.group(1).strip() if image_match else ""
                                if not thumb_url:
                                    img = card.find("img")
                                    thumb_url = str(img.get("src") or "").strip() if img else ""
                                thumb_url = (
                                    urljoin("https://auto-lanka.com", thumb_url)
                                    if thumb_url
                                    else ""
                                )

                                data = self.cleaner.clean_title(title)
                                price = self.cleaner.clean_price(raw_price)
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
                                        if vehicle_type == "Motorbikes"
                                        else (
                                            "three-wheelers"
                                            if vehicle_type == "Three Wheelers"
                                            else (
                                                "trucks"
                                                if vehicle_type == "Trucks"
                                                else (
                                                    "jeeps"
                                                    if vehicle_type == "Jeeps"
                                                    else (
                                                        "vans"
                                                        if vehicle_type == "Vans"
                                                        else "cars"
                                                    )
                                                )
                                            )
                                        )
                                    ),
                                    "_text_blobs": title,
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
                                log.error("auto_lanka_item_error", error=str(e))
                                self.db.rollback()
                    except Exception as e:
                        log.error(
                            "auto_lanka_page_error",
                            category=vehicle_type,
                            page=page_num,
                            error=str(e),
                        )
                        consecutive_page_errors += 1
                        if consecutive_page_errors >= 25:
                            break

        flush_upsert_buffer(self)
