from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.scrapers.cleaner import CarCleaner
from app.scrapers.generic_detail import GenericDetailScraper
from app.scrapers.page_budget import page_budget_for_category


class SaleMeScraper(GenericDetailScraper):
    SOURCE = "saleme"
    BASE_URL = "https://www.saleme.lk"
    PRIMARY_CATEGORY = "cars"
    # Site uses ampersands/commas in category slugs.
    START_URLS = (
        "https://www.saleme.lk/ads/sri-lanka/cars",
        "https://www.saleme.lk/ads/sri-lanka/motorbikes-&-scooters",
        "https://www.saleme.lk/ads/sri-lanka/three-wheelers",
        "https://www.saleme.lk/ads/sri-lanka/push-cycles",
        "https://www.saleme.lk/ads/sri-lanka/vans,-buses-&-lorries",
    )
    ALLOW_UNAVAILABLE_PRICE = True
    _cleaner = CarCleaner()

    def _build_page_url_groups(
        self,
        max_pages: int,
        *,
        start_page: int = 1,
    ) -> list[list[str]]:
        start = max(1, int(start_page or 1))
        groups: list[list[str]] = []
        for start_url in self.START_URLS:
            slug = start_url.rstrip("/").rsplit("/", 1)[-1]
            page_limit = page_budget_for_category(
                is_primary=slug == self.PRIMARY_CATEGORY,
                max_pages=max_pages,
            )
            groups.append(
                [self._page_url_for(start_url, page) for page in range(start, start + page_limit)]
            )
        return groups

    def _extract_title(self, soup: BeautifulSoup) -> str:
        candidates: list[str] = []
        for selector, attr in (
            ("meta[property='og:title']", "content"),
            ("meta[name='twitter:title']", "content"),
        ):
            node = soup.select_one(selector)
            if node and node.has_attr(attr):
                candidates.append(str(node.get(attr) or ""))

        candidates.extend(node.get_text(" ", strip=True) for node in soup.select("h3, h1"))
        for candidate in candidates:
            title = re.sub(r"\s+", " ", candidate).strip(" -|")
            if self.cleaner.clean_title(title).get("make"):
                return title
        return super()._extract_title(soup)

    @classmethod
    def _looks_like_vehicle_ad(cls, link_text: str, href: str) -> bool:
        text = f"{link_text} {href}".lower()
        if "/ad/" not in href:
            return False
        if re.search(r"\b(rent|rental|transport|office transport|wanted|spare|parts?)\b", text):
            return False
        if re.search(r"\b(?:19|20)\d{2}\b", text):
            return True
        return bool(cls._cleaner.clean_title(text).get("make"))

    @classmethod
    def _extract_listing_links(cls, soup: BeautifulSoup) -> list[str]:
        links: list[str] = []
        for link in soup.select("a[href*='/ad/']"):
            href = urljoin(cls.BASE_URL, str(link.get("href") or "").strip())
            parsed = urlparse(href)
            if parsed.netloc and "saleme.lk" not in parsed.netloc:
                continue
            if not cls._looks_like_vehicle_ad(link.get_text(" ", strip=True), href):
                continue
            links.append(href)
        return cls._dedupe_keep_order(links)
