from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.scrapers.generic_detail import GenericDetailScraper
from app.scrapers.page_budget import page_budget_for_category


class RiyahubScraper(GenericDetailScraper):
    SOURCE = "riyahub"
    BASE_URL = "https://riyahub.lk"
    ALLOW_UNAVAILABLE_PRICE = True
    PRIMARY_CATEGORY = "cars"
    START_URLS = (
        "https://riyahub.lk/vehicle/cars",
        "https://riyahub.lk/vehicle/suvs",
        "https://riyahub.lk/vehicle/wagons",
        "https://riyahub.lk/vehicle/pickups",
        "https://riyahub.lk/vehicle/crew-cabs",
        "https://riyahub.lk/vehicle/motorcycles",
        "https://riyahub.lk/vehicle/three-wheels",
        "https://riyahub.lk/vehicle/vans",
        "https://riyahub.lk/vehicle/buses",
        "https://riyahub.lk/vehicle/lorries",
        "https://riyahub.lk/vehicle/trucks",
        "https://riyahub.lk/vehicle/tractors",
        "https://riyahub.lk/vehicle/heavy-duties",
        "https://riyahub.lk/vehicle/sports",
        "https://riyahub.lk/vehicle/others",
    )
    CATEGORY_PATHS = {
        "/vehicle",
        "/vehicle/",
        "/vehicle/cars",
        "/vehicle/cars/",
        "/vehicle/suvs",
        "/vehicle/suvs/",
        "/vehicle/wagons",
        "/vehicle/wagons/",
        "/vehicle/pickups",
        "/vehicle/pickups/",
        "/vehicle/crew-cabs",
        "/vehicle/crew-cabs/",
        "/vehicle/motorcycles",
        "/vehicle/motorcycles/",
        "/vehicle/three-wheels",
        "/vehicle/three-wheels/",
        "/vehicle/vans",
        "/vehicle/vans/",
        "/vehicle/buses",
        "/vehicle/buses/",
        "/vehicle/lorries",
        "/vehicle/lorries/",
        "/vehicle/trucks",
        "/vehicle/trucks/",
        "/vehicle/tractors",
        "/vehicle/tractors/",
        "/vehicle/heavy-duties",
        "/vehicle/heavy-duties/",
        "/vehicle/sports",
        "/vehicle/sports/",
        "/vehicle/others",
        "/vehicle/others/",
    }

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
        # riyahub paginates well past page 25 (verified live: page 26 returns
        # older listings than page 1, so the catalogue keeps going), which is
        # why the old hard 25-page ceiling plus a missing start page meant no
        # riyahub category could ever be crawled past its first 25 pages.
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

    @classmethod
    def _extract_listing_links(cls, soup: BeautifulSoup) -> list[str]:
        links: list[str] = []
        for link in soup.select("a[href*='/vehicle/']"):
            href = urljoin(cls.BASE_URL, str(link.get("href") or "").strip())
            parsed = urlparse(href)
            if parsed.netloc and parsed.netloc != "riyahub.lk":
                continue
            path = parsed.path.rstrip("/") or "/"
            if path in {item.rstrip("/") or "/" for item in cls.CATEGORY_PATHS}:
                continue
            parts = [part for part in path.split("/") if part]
            if len(parts) < 3 or parts[0] != "vehicle":
                continue
            links.append(href)

        for link in soup.select("a[href]"):
            href = urljoin(cls.BASE_URL, str(link.get("href") or "").strip())
            parsed = urlparse(href)
            if parsed.netloc and parsed.netloc != "riyahub.lk":
                continue
            if not re_fullmatch_sale_path(parsed.path):
                continue
            links.append(href)
        return cls._dedupe_keep_order(links)


def re_fullmatch_sale_path(path: str) -> bool:
    return bool(re.fullmatch(r"/[a-z0-9][a-z0-9-]+-sale-\d+/?", str(path or "").lower()))
