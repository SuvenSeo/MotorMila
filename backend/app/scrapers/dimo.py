from __future__ import annotations

from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.scrapers.generic_detail import GenericDetailScraper


class DimoScraper(GenericDetailScraper):
    SOURCE = "dimo"
    BASE_URL = "https://carsatdimo.lk"
    ALLOW_UNAVAILABLE_PRICE = True
    START_URLS = (
        "https://carsatdimo.lk/product-category/all-vehicles/",
        "https://carsatdimo.lk/",
    )

    def _page_url_for(self, start_url: str, page_num: int) -> str:
        if page_num <= 1:
            return start_url
        return f"{start_url.rstrip('/')}/page/{page_num}/"

    def _build_page_url_groups(
        self,
        max_pages: int,
        *,
        start_page: int = 1,
    ) -> list[list[str]]:
        # The paginated archive and the site root are independent entry points,
        # so each gets its own page budget instead of sharing one global pool
        # where the root URL consumed a slot of the archive's depth.
        page_limit = max(1, int(max_pages or 1))
        start = max(1, int(start_page or 1))
        return [
            [self._page_url_for(start_url, page) for page in range(start, start + page_limit)]
            for start_url in self.START_URLS
        ]

    @classmethod
    def _extract_listing_links(cls, soup: BeautifulSoup) -> list[str]:
        links: list[str] = []
        for link in soup.select("a[href*='/product/']"):
            href = urljoin(cls.BASE_URL, str(link.get("href") or "").strip())
            parsed = urlparse(href)
            if parsed.netloc and parsed.netloc != "carsatdimo.lk":
                continue
            if "/product-category/" in parsed.path:
                continue
            if "/product/" not in parsed.path:
                continue
            links.append(href)
        return cls._dedupe_keep_order(links)
