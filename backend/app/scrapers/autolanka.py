from datetime import datetime
from app.utils.time import utc_now
import re
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
import structlog
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.page_budget import start_page_from_env
from app.utils.listing_upsert import buffered_upsert_listing, flush_upsert_buffer

log = structlog.get_logger()


class AutoLankaScraper:
    SOURCE = "autolanka"
    BASE_URL = "https://www.autolanka.com/cars/"

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
    def _is_listing_href(href: str) -> bool:
        absolute = urljoin("https://www.autolanka.com", href)
        path = urlparse(absolute).path.lower()
        return (
            "/cars/" in path
            and path.endswith(".html")
            and bool(re.search(r"/(?:19|20)\d{2}-.+-\d+\.html$", path))
        )

    @staticmethod
    def _link_title_score(link) -> int:
        text = link.get_text(" ", strip=True)
        score = 0
        if re.search(r"\b(19|20)\d{2}\b", text):
            score += 2
        if "," in text:
            score += 1
        if "pic" in text.lower():
            score -= 1
        return score

    @classmethod
    def _extract_listing_links(cls, soup: BeautifulSoup) -> list:
        links_by_url = {}
        for link in soup.select("a[href$='.html']"):
            href = str(link.get("href") or "").strip()
            if not href or not cls._is_listing_href(href):
                continue
            listing_url = urljoin("https://www.autolanka.com", href)
            existing_link = links_by_url.get(listing_url)
            if existing_link and cls._link_title_score(existing_link) >= cls._link_title_score(link):
                continue
            links_by_url[listing_url] = link
        return list(links_by_url.values())

    @staticmethod
    def _district_from_url(listing_url: str) -> str:
        path_parts = [part for part in urlparse(listing_url).path.split("/") if part]
        if not path_parts or path_parts[0].lower() == "cars":
            return ""
        return re.sub(r"[-_]+", " ", path_parts[0]).strip().title()

    def _build_page_url(self, page_num: int) -> str:
        return self.BASE_URL if page_num == 1 else f"https://www.autolanka.com/cars/index{page_num}.html"

    @staticmethod
    def _has_pagination_hint(soup: BeautifulSoup, current_page: int) -> bool:
        for link in soup.select("a[href]"):
            href = str(link.get("href") or "").strip()
            if not href:
                continue
            absolute = urljoin("https://www.autolanka.com", href)
            parsed = urlparse(absolute)
            query_page = parse_qs(parsed.query).get("page")
            if query_page:
                try:
                    if int(query_page[0]) > current_page:
                        return True
                except Exception:
                    pass

            path = parsed.path.lower().rstrip("/")
            page_match = re.fullmatch(r"/cars/(\d+)", path)
            if page_match and int(page_match.group(1)) > current_page:
                return True

            page_match_html = re.fullmatch(r"/cars-(\d+)\.html", path)
            if page_match_html and int(page_match_html.group(1)) > current_page:
                return True

            page_match_index = re.fullmatch(r"/cars/index(\d+)\.html", path)
            if page_match_index and int(page_match_index.group(1)) > current_page:
                return True

            label = link.get_text(" ", strip=True).lower()
            if label in {"next", "older", ">", "›", "next »"} and path.startswith("/cars"):
                return True

        return False

    async def _fetch_detail_fields(self, client: httpx.AsyncClient, listing_url: str) -> tuple[str, str, str]:
        detail_res = await client.get(listing_url, timeout=25)
        detail_res.raise_for_status()
        detail_soup = BeautifulSoup(detail_res.text, "lxml")

        raw_price = self._text(
            detail_soup,
            [
                "#df_field_price span",
                "#df_field_price",
                ".price-tag span",
                ".price-tag",
                "[itemprop='price']",
                "[class*='price']",
                "[id*='price']",
            ],
        )
        if raw_price and self.cleaner.normalize_price_lkr(raw_price) is None:
            raw_price = ""
        if not raw_price:
            raw_price = self._attr(
                detail_soup,
                [
                    ("meta[name='twitter:data1']", "content"),
                    ("meta[property='product:price:amount']", "content"),
                    ("meta[itemprop='price']", "content"),
                ],
            )
        if raw_price and self.cleaner.normalize_price_lkr(raw_price) is None:
            raw_price = ""
        if not raw_price:
            for script in detail_soup.select("script[type='application/ld+json']"):
                script_text = script.get_text(" ", strip=True)
                price_match = re.search(
                    r'"price"\s*:\s*"?(?:Rs\.?|LKR)?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{5,12}(?:\.[0-9]+)?)',
                    script_text,
                    flags=re.IGNORECASE,
                )
                if price_match:
                    raw_price = price_match.group(1)
                    break
        if not raw_price:
            detail_text = detail_soup.get_text(" ", strip=True)
            price_match = re.search(
                r"(?:Rs\.?|LKR|Rs:)\s*[:.]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)",
                detail_text,
                flags=re.IGNORECASE,
            )
            raw_price = price_match.group(0) if price_match else ""

        district = self._text(
            detail_soup,
            [
                "#df_field_city .value",
                "#df_field_city_level1 .value",
                ".location #df_field_city .value",
                ".location #df_field_city_level1 .value",
            ],
        )
        if not district:
            district = self._district_from_url(listing_url)

        thumb_url = self._attr(
            detail_soup,
            [
                ("meta[property='og:image']", "content"),
                ("img[src]", "src"),
            ],
        )

        return raw_price, district, thumb_url

    async def scrape(self, max_pages: int = 5):
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }

        page_limit = max_pages if max_pages > 0 else None
        page_num = start_page_from_env(self.SOURCE)
        seen_urls: set[str] = set()
        consecutive_empty_pages = 0
        consecutive_page_errors = 0
        previous_page_signature: frozenset[str] | None = None
        repeated_page_signatures = 0

        async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
            while True:
                if page_limit is not None and page_num > page_limit:
                    break

                url = self._build_page_url(page_num)
                log.info("scraping_page", source=self.SOURCE, page=page_num)

                try:
                    res = await client.get(url, timeout=30)
                    res.raise_for_status()
                    soup = BeautifulSoup(res.text, "lxml")
                    listing_links = self._extract_listing_links(soup)
                    if not listing_links:
                        consecutive_empty_pages += 1
                        log.info(
                            "autolanka_no_cards",
                            page=page_num,
                            consecutive_empty_pages=consecutive_empty_pages,
                        )
                        if consecutive_empty_pages >= 10:
                            break
                        page_num += 1
                        continue

                    new_on_page = 0
                    page_listing_urls: set[str] = set()

                    for link in listing_links:
                        try:
                            listing_url = str(link.get("href") or "").strip()
                            if not listing_url:
                                continue
                            listing_url = urljoin("https://www.autolanka.com", listing_url)
                            page_listing_urls.add(listing_url)
                            if listing_url in seen_urls:
                                continue

                            seen_urls.add(listing_url)

                            title = str(link.get("title") or "").strip()
                            if not title:
                                title = link.get_text(" ", strip=True)
                            if not title:
                                continue

                            card = link.find_parent(["article", "li", "div"]) or link
                            raw_price = str(card.get("data-listing-price") or "").strip()
                            thumb_url = str(card.get("data-listing-picture") or "").strip()
                            district = ""

                            try:
                                detail_price, detail_district, detail_thumb = await self._fetch_detail_fields(
                                    client, listing_url
                                )
                                raw_price = detail_price or raw_price
                                district = detail_district or district
                                thumb_url = detail_thumb or thumb_url
                            except Exception as detail_error:
                                log.error(
                                    "autolanka_detail_error",
                                    url=listing_url,
                                    error=str(detail_error),
                                )

                            thumb_url = urljoin("https://www.autolanka.com", thumb_url) if thumb_url else ""

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
                                "condition": None, "_text_blobs": title,
                                "scraped_at": utc_now(),
                            }
                            normalized_payload = self.cleaner.normalize_listing_payload(payload)
                            if not normalized_payload:
                                continue
                            self._upsert_listing(normalized_payload)
                            self.db.commit()
                            new_on_page += 1
                        except Exception as e:
                            log.error("autolanka_item_error", error=str(e))
                            self.db.rollback()

                    current_page_signature = frozenset(page_listing_urls)
                    has_pagination_hint = self._has_pagination_hint(soup, page_num)
                    if current_page_signature and current_page_signature == previous_page_signature:
                        repeated_page_signatures += 1
                        log.warning(
                            "autolanka_repeating_page_signature",
                            page=page_num,
                            repeated_page_signatures=repeated_page_signatures,
                            listing_count=len(current_page_signature),
                        )
                        # Some AutoLanka page URLs occasionally repeat identical card sets.
                        # Stop early to avoid burning the page budget on duplicate pages.
                        if repeated_page_signatures >= 1:
                            break
                    else:
                        repeated_page_signatures = 0
                    if current_page_signature:
                        previous_page_signature = current_page_signature

                    if new_on_page == 0:
                        consecutive_empty_pages += 1
                        log.info(
                            "autolanka_empty_page",
                            page=page_num,
                            consecutive_empty_pages=consecutive_empty_pages,
                        )
                        if consecutive_empty_pages >= 10:
                            break
                        page_num += 1
                        continue

                    if not has_pagination_hint:
                        break

                    consecutive_empty_pages = 0
                    page_num += 1
                    consecutive_page_errors = 0
                except Exception as e:
                    log.error("autolanka_page_error", page=page_num, error=str(e))
                    consecutive_page_errors += 1
                    if consecutive_page_errors >= 25:
                        break
                    page_num += 1

        flush_upsert_buffer(self)

