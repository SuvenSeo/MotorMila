from __future__ import annotations

import asyncio
import json
import os
import random
import re
from urllib.parse import urljoin, urlparse

import httpx
import structlog
from bs4 import BeautifulSoup
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.net import (
    httpx_client_kwargs,
    playwright_context_kwargs,
    playwright_launch_proxy,
    stealth_init_script,
)
from app.scrapers.page_budget import (
    page_budget_for_category,
    secondary_page_budget,
    start_page_from_env,
)
from app.utils.listing_upsert import upsert_listing, upsert_listings_batch
from app.utils.thumbnail_urls import upgrade_thumbnail_url
from app.utils.time import utc_now

log = structlog.get_logger()

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

API_HEADERS = {
    "Accept": "application/json",
    "Application": "web",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


class IkmanApiUnavailable(RuntimeError):
    """Raised when the public api.ikman.lk path cannot serve listings."""


class IkmanCarScraper:
    SOURCE = "ikman"
    # Playwright fallback: for-sale vehicle leaves only (skip parts/services/rentals).
    PLAYWRIGHT_CATEGORY_PATHS = (
        "cars",
        "motorbikes-scooters",
        "three-wheelers",
        "vans",
        "buses",
        "lorries",
        "heavy-duty",
        "tractors",
        "bicycles",
        "boats-water-transport",
    )
    BASE_URL_TEMPLATE = (
        "https://ikman.lk/en/ads/sri-lanka/{category}?sort=date&order=desc&page="
    )
    # Kept for older call sites / docs that still reference a single cars URL.
    BASE_URL = BASE_URL_TEMPLATE.format(category="cars")
    API_BASE_URL = "https://api.ikman.lk"
    # Leaf vehicle categories for sale — not parent 391 (mixes parts/services/rentals).
    CARS_CATEGORY_ID = 392
    VEHICLE_CATEGORY_IDS = (
        392,  # Cars
        402,  # Motorbikes
        911,  # Three Wheelers
        424,  # Vans
        425,  # Buses
        426,  # Lorries & Trucks
        918,  # Heavy Duty
        919,  # Tractors
        603,  # Bicycles
        925,  # Boats & Water Transport
    )
    CATEGORY_SLUGS = {
        392: "cars",
        402: "motorbikes",
        911: "three-wheelers",
        424: "vans",
        425: "buses",
        426: "lorries",
        918: "heavy-duty",
        919: "tractors",
        603: "bicycles",
        925: "boats",
    }
    API_PAGE_DELAY_SECONDS = 0.35
    API_EMPTY_PAGE_LIMIT = 10
    API_PAGE_ERROR_LIMIT = 25

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()

    def _upsert_listing(self, payload: dict):
        return upsert_listing(self.db, self.SOURCE, payload)

    @staticmethod
    def _normalize_public_url(raw_url: str, slug: str | None = None) -> str:
        value = str(raw_url or "").strip()
        if value:
            parsed = urlparse(value)
            path = parsed.path or ""
            if path.startswith("/en/ad/") or path.startswith("/ad/"):
                return f"https://ikman.lk{path}"
            if value.startswith("//"):
                return f"https:{value}"
            if value.startswith("/"):
                return urljoin("https://ikman.lk", value)
            if value.startswith("http://"):
                return "https://" + value[len("http://") :]
            if value.startswith("https://"):
                return value
        slug_token = str(slug or "").strip().strip("/")
        if slug_token:
            return f"https://ikman.lk/en/ad/{slug_token}"
        return ""

    @staticmethod
    def _normalize_thumbnail_url(candidate: str) -> str:
        value = str(candidate or "").strip()
        if not value:
            return ""
        if value.startswith("data:") or value.startswith("javascript:"):
            return ""
        if value.startswith("//"):
            return f"https:{value}"
        if value.startswith("/"):
            return urljoin("https://ikman.lk", value)
        return value

    @staticmethod
    def _is_placeholder_thumbnail(url: str) -> bool:
        token = str(url or "").strip().lower()
        if not token:
            return True
        return any(marker in token for marker in ("placeholder", "no-image", "noimage", "default"))

    @classmethod
    def _api_image_ids(cls, row: dict) -> tuple[str, str, list[str]]:
        """Return (slug, base_uri, image_ids) from an ikman API ad row."""
        slug = str(row.get("slug") or "").strip()
        images = row.get("images") if isinstance(row.get("images"), dict) else {}
        image_ids = images.get("ids") if isinstance(images, dict) else None
        base_uri = str(images.get("base_uri") or "https://i.ikman-st.com").rstrip("/")
        ids: list[str] = []
        if isinstance(image_ids, list):
            for raw_id in image_ids:
                image_id = str(raw_id or "").strip()
                if image_id and image_id not in ids:
                    ids.append(image_id)
        return slug, base_uri, ids

    @classmethod
    def _thumbnail_from_api_images(cls, row: dict) -> str:
        slug, base_uri, image_ids = cls._api_image_ids(row)
        if not slug or not image_ids:
            return ""
        # The grid markup only exposes a 142x107 crop; ikman's CDN serves any
        # size from this path, so store a card-sized crop instead.
        grid_crop = f"{base_uri}/{slug}/{image_ids[0]}/142/107/cropped.jpg"
        return upgrade_thumbnail_url(grid_crop) or grid_crop

    @classmethod
    def _gallery_from_api_images(cls, row: dict) -> list[str]:
        """Every photo on the ad as a full-size CDN URL (first = primary)."""
        slug, base_uri, image_ids = cls._api_image_ids(row)
        if not slug or not image_ids:
            return []
        return [f"{base_uri}/{slug}/{image_id}/1080/810/cropped.jpg" for image_id in image_ids]

    @classmethod
    def _extract_thumbnail_from_detail_html(cls, html: str) -> str:
        if not html:
            return ""

        soup = BeautifulSoup(html, "lxml")

        for selector, attr in (
            ("meta[property='og:image']", "content"),
            ("meta[name='twitter:image']", "content"),
            ("meta[property='og:image:url']", "content"),
        ):
            node = soup.select_one(selector)
            if node:
                value = cls._normalize_thumbnail_url(node.get(attr))
                if value and not cls._is_placeholder_thumbnail(value):
                    return value

        for script in soup.select("script[type='application/ld+json']"):
            raw_json = script.get_text(" ", strip=True)
            if not raw_json:
                continue
            try:
                parsed = json.loads(raw_json)
            except Exception:
                continue

            nodes = parsed if isinstance(parsed, list) else [parsed]
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                image_value = node.get("image")
                image_candidates = image_value if isinstance(image_value, list) else [image_value]
                for candidate in image_candidates:
                    value = cls._normalize_thumbnail_url(candidate)
                    if value and not cls._is_placeholder_thumbnail(value):
                        return value

        for selector, attr in (
            ("img[src]", "src"),
            ("img[data-src]", "data-src"),
            ("img[data-lazy-src]", "data-lazy-src"),
        ):
            for node in soup.select(selector):
                value = cls._normalize_thumbnail_url(node.get(attr))
                if value and not cls._is_placeholder_thumbnail(value):
                    return value

        return ""

    async def _fetch_detail_thumbnail(self, context, listing_url: str) -> str:
        if not listing_url:
            return ""
        try:
            response = await context.request.get(listing_url, timeout=20_000)
            if not response.ok:
                return ""
            html = await response.text()
            return self._extract_thumbnail_from_detail_html(html)
        except Exception as exc:
            log.debug("ikman_detail_thumbnail_failed", url=listing_url, error=str(exc))
            return ""

    @staticmethod
    def _properties_map(row: dict) -> dict[str, str]:
        props = row.get("properties")
        if not isinstance(props, list):
            return {}
        mapped: dict[str, str] = {}
        for item in props:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "").strip().lower()
            value = str(item.get("value") or "").strip()
            if key and value:
                mapped[key] = value
        return mapped

    @staticmethod
    def _parse_mileage(value: str | None) -> int | None:
        text = str(value or "").strip()
        if not text:
            return None
        match = re.search(r"([0-9][0-9,]*)\s*(?:km|kms)?\b", text, flags=re.IGNORECASE)
        if not match:
            return None
        digits = re.sub(r"\D", "", match.group(1))
        if not digits:
            return None
        try:
            return int(digits)
        except ValueError:
            return None

    @staticmethod
    def _parse_engine_cc(value: str | None) -> int | None:
        text = str(value or "").strip().lower().replace(",", "")
        if not text:
            return None
        # A bare 4-digit value with no unit that looks like a manufacture
        # year ("2007") is a mislabeled year, not a displacement — drop it
        # instead of recording 2,007 cc.
        if re.fullmatch(r"(19|20)\d{2}", text):
            return None
        match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:cc|c\.c\.)?\b", text)
        if not match:
            return None
        try:
            numeric = float(match.group(1))
        except ValueError:
            return None
        # Values like "1.5" are litres in some feeds; ikman cars use "1,000 cc".
        if numeric < 20:
            numeric *= 1000
        value_int = int(numeric)
        # Include motorcycle / three-wheeler capacities (e.g. 125 cc).
        return value_int if 50 <= value_int <= 10000 else None

    def _build_payload_from_api_ad(
        self, row: dict, *, vehicle_category: str | None = None
    ) -> dict | None:
        if not isinstance(row, dict):
            return None

        listing_url = self._normalize_public_url(str(row.get("url") or ""), str(row.get("slug") or ""))
        if not listing_url:
            return None

        title = str(row.get("title") or "").strip()
        if not title:
            return None

        money = row.get("money") if isinstance(row.get("money"), dict) else {}
        raw_price = str(money.get("amount") or row.get("info") or "").strip()
        price = self.cleaner.normalize_price_lkr(raw_price)
        if not price:
            return None

        props = self._properties_map(row)
        title_data = self.cleaner.clean_title(title)
        make = str(props.get("brand") or title_data.get("make") or "").strip()
        model = str(props.get("model") or title_data.get("model") or "Other").strip() or "Other"
        year_raw = props.get("model_year") or title_data.get("year")
        try:
            year = int(year_raw) if year_raw not in (None, "") else None
        except (TypeError, ValueError):
            year = title_data.get("year")

        if not make:
            return None

        area = row.get("area") if isinstance(row.get("area"), dict) else {}
        location = row.get("location") if isinstance(row.get("location"), dict) else {}
        district = str(area.get("name") or location.get("name") or "Sri Lanka").strip() or "Sri Lanka"
        city = str(location.get("name") or "").strip() or None

        details = row.get("details") if isinstance(row.get("details"), list) else []
        detail_text = " | ".join(str(item).strip() for item in details if str(item).strip())
        text_blobs = " ".join(
            part
            for part in (
                title,
                detail_text,
                str(props.get("fuel_type") or ""),
                str(props.get("transmission") or ""),
                str(props.get("body") or ""),
                str(props.get("condition") or ""),
                str(props.get("mileage") or ""),
                str(props.get("engine_capacity") or ""),
            )
            if part
        )

        mileage = self._parse_mileage(props.get("mileage"))
        if mileage is None:
            for item in details:
                mileage = self._parse_mileage(str(item))
                if mileage is not None:
                    break

        category_from_row = None
        cat_obj = row.get("category") if isinstance(row.get("category"), dict) else {}
        if cat_obj.get("id") is not None:
            try:
                category_from_row = self.CATEGORY_SLUGS.get(int(cat_obj.get("id")))
            except (TypeError, ValueError):
                category_from_row = None

        payload = {
            "source_id": listing_url,
            "source": self.SOURCE,
            "title": title,
            "make": make,
            "model": model,
            "year": year,
            "price_lkr": price,
            "url": listing_url,
            "thumbnail_url": self._thumbnail_from_api_images(row),
            # Full gallery (primary photo first) — the cleaner serializes
            # this list into the CarListing.images JSON column.
            "images": self._gallery_from_api_images(row),
            "district": district,
            "city": city,
            "mileage": mileage,
            "engine_capacity": self._parse_engine_cc(props.get("engine_capacity")),
            "fuel_type": props.get("fuel_type"),
            "transmission": props.get("transmission"),
            "body_type": props.get("body"),
            "condition": props.get("condition"),
            "vehicle_category": vehicle_category or category_from_row or "cars",
            "_text_blobs": text_blobs,
            "scraped_at": utc_now(),
        }
        return self.cleaner.normalize_listing_payload(payload)

    async def _fetch_api_ad_detail(self, client: httpx.AsyncClient, ad_id: str) -> dict | None:
        ad_id = str(ad_id or "").strip()
        if not ad_id:
            return None
        try:
            response = await client.get(f"{self.API_BASE_URL}/v1/ads/{ad_id}", timeout=30)
            response.raise_for_status()
            payload = response.json()
            ad = payload.get("ad") if isinstance(payload, dict) else None
            return ad if isinstance(ad, dict) else None
        except Exception as exc:
            log.debug("ikman_api_detail_failed", ad_id=ad_id, error=str(exc))
            return None

    @classmethod
    def _secondary_page_budget(cls, max_pages: int) -> int:
        return secondary_page_budget(max_pages)

    @classmethod
    def _page_budget_for_category(cls, category_id: int, max_pages: int) -> int:
        return page_budget_for_category(
            is_primary=int(category_id) == cls.CARS_CATEGORY_ID,
            max_pages=max_pages,
        )

    async def _fetch_serp_page(
        self,
        client: httpx.AsyncClient,
        *,
        category_id: int,
        page_num: int,
        next_page_token: str | None,
        max_retries: int = 3,
    ) -> tuple[list[dict], str | None, dict]:
        params: dict[str, str | int] = {
            "category": int(category_id),
            "page": page_num,
            "sort": "date",
            "order": "desc",
        }
        if next_page_token:
            params["next_page_token"] = next_page_token

        last_exc: Exception | None = None
        for attempt in range(1, max_retries + 1):
            try:
                response = await client.get(f"{self.API_BASE_URL}/v1/serp", params=params, timeout=45)
                response.raise_for_status()
                payload = response.json() if response.content else {}
                if not isinstance(payload, dict):
                    raise IkmanApiUnavailable("ikman serp payload is not an object")

                serp = payload.get("serp") if isinstance(payload.get("serp"), dict) else {}
                results = serp.get("results") if isinstance(serp, dict) else None
                if not isinstance(results, list):
                    results = []

                pagination = payload.get("pagination") if isinstance(payload.get("pagination"), dict) else {}
                token = str(pagination.get("next_page_token") or "").strip() or None
                return [row for row in results if isinstance(row, dict)], token, pagination
            except (httpx.HTTPError, httpx.TimeoutException, json.JSONDecodeError) as exc:
                last_exc = exc
                if attempt < max_retries:
                    backoff = 1.0 * (2 ** (attempt - 1))
                    log.warning(
                        "ikman_serp_fetch_retry",
                        category_id=category_id,
                        page=page_num,
                        attempt=attempt,
                        backoff=backoff,
                        error=str(exc),
                    )
                    await asyncio.sleep(backoff)
                else:
                    break

        if last_exc:
            raise last_exc
        raise RuntimeError("Failed to fetch ikman serp page after retries")

    async def _scrape_category_via_api(
        self,
        client: httpx.AsyncClient,
        *,
        category_id: int,
        max_pages: int,
        start_page: int = 1,
        seen_urls: set[str],
    ) -> int:
        page_limit = self._page_budget_for_category(category_id, max_pages)
        start_page = max(1, int(start_page or 1))
        end_page = start_page + page_limit
        consecutive_empty_pages = 0
        consecutive_page_errors = 0
        next_page_token: str | None = None
        upserted = 0

        for page_num in range(start_page, end_page):
            log.info(
                "scraping_page",
                source=self.SOURCE,
                mode="api",
                category_id=category_id,
                page=page_num,
                page_limit=page_limit,
            )
            try:
                rows, next_page_token, pagination = await self._fetch_serp_page(
                    client,
                    category_id=category_id,
                    page_num=page_num,
                    next_page_token=next_page_token if page_num > start_page else None,
                )
            except Exception as exc:
                consecutive_page_errors += 1
                log.error(
                    "ikman_api_page_error",
                    category_id=category_id,
                    page=page_num,
                    error=str(exc),
                    consecutive_page_errors=consecutive_page_errors,
                )
                if page_num == start_page:
                    raise IkmanApiUnavailable(str(exc)) from exc
                if consecutive_page_errors >= self.API_PAGE_ERROR_LIMIT:
                    break
                continue

            if not rows:
                consecutive_empty_pages += 1
                log.info(
                    "ikman_api_no_results",
                    category_id=category_id,
                    page=page_num,
                    consecutive_empty_pages=consecutive_empty_pages,
                    pagination=pagination,
                )
                if page_num == start_page:
                    raise IkmanApiUnavailable(
                        f"ikman api returned zero results on page {start_page} for category {category_id}"
                    )
                if consecutive_empty_pages >= self.API_EMPTY_PAGE_LIMIT:
                    break
                continue

            consecutive_empty_pages = 0
            consecutive_page_errors = 0
            new_on_page = 0
            page_payloads: list[dict] = []

            for row in rows:
                try:
                    category_slug = self.CATEGORY_SLUGS.get(int(category_id), "cars")
                    payload = self._build_payload_from_api_ad(
                        row, vehicle_category=category_slug
                    )
                    if payload is None:
                        # Title parse miss: enrich once from detail properties.
                        detail = await self._fetch_api_ad_detail(client, str(row.get("id") or ""))
                        if detail:
                            merged = dict(row)
                            merged.update(
                                {
                                    "title": detail.get("title") or row.get("title"),
                                    "url": detail.get("url") or row.get("url"),
                                    "slug": detail.get("slug") or row.get("slug"),
                                    "money": detail.get("money") or row.get("money"),
                                    "properties": detail.get("properties") or row.get("properties"),
                                    "details": detail.get("details") or row.get("details"),
                                    "images": detail.get("images") or row.get("images"),
                                    "area": detail.get("area") or row.get("area"),
                                    "location": detail.get("location") or row.get("location"),
                                }
                            )
                            payload = self._build_payload_from_api_ad(
                                merged, vehicle_category=category_slug
                            )

                    if not payload:
                        continue

                    listing_url = str(payload.get("url") or "")
                    if not listing_url or listing_url in seen_urls:
                        continue
                    seen_urls.add(listing_url)
                    new_on_page += 1
                    page_payloads.append(payload)
                except Exception as exc:
                    log.error(
                        "ikman_api_item_error",
                        category_id=category_id,
                        error=str(exc),
                    )

            if page_payloads:
                inserted = upsert_listings_batch(
                    self.db,
                    self.SOURCE,
                    page_payloads,
                    log_tag="ikman",
                )
                upserted += len(page_payloads)
                if inserted:
                    log.info(
                        "ikman_api_batch_inserted",
                        category_id=category_id,
                        page=page_num,
                        inserted=inserted,
                    )

            log.info(
                "ikman_api_page_complete",
                category_id=category_id,
                page=page_num,
                rows=len(rows),
                upserted_on_page=new_on_page,
                total_upserted=upserted,
                pagination_total=pagination.get("total"),
            )

            if page_num < end_page - 1:
                await asyncio.sleep(self.API_PAGE_DELAY_SECONDS)

        return upserted

    async def _scrape_via_api(self, max_pages: int = 5, *, start_page: int = 1) -> int:
        seen_urls: set[str] = set()
        upserted = 0
        category_failures = 0

        async with httpx.AsyncClient(
            follow_redirects=True, **httpx_client_kwargs(API_HEADERS)
        ) as client:
            for category_id in self.VEHICLE_CATEGORY_IDS:
                try:
                    category_upserted = await self._scrape_category_via_api(
                        client,
                        category_id=category_id,
                        max_pages=max_pages,
                        start_page=start_page,
                        seen_urls=seen_urls,
                    )
                    upserted += category_upserted
                    log.info(
                        "ikman_api_category_complete",
                        category_id=category_id,
                        upserted=category_upserted,
                        total_upserted=upserted,
                    )
                except IkmanApiUnavailable as exc:
                    category_failures += 1
                    log.error(
                        "ikman_api_category_unavailable",
                        category_id=category_id,
                        error=str(exc),
                        category_failures=category_failures,
                    )
                    # Cars is the primary volume source; its failure should trip fallback.
                    if category_id == self.CARS_CATEGORY_ID:
                        raise
                    continue

        if upserted == 0 and category_failures:
            raise IkmanApiUnavailable("ikman api returned no vehicle listings across categories")
        return upserted

    async def _scrape_via_playwright(self, max_pages: int = 5):
        upserted = 0
        async with async_playwright() as p:
            launch_kwargs = {"headless": True}
            launch_proxy = playwright_launch_proxy()
            if launch_proxy:
                launch_kwargs["proxy"] = launch_proxy
            browser = await p.chromium.launch(**launch_kwargs)

            context_opts = playwright_context_kwargs(random.choice(USER_AGENTS))
            context = await browser.new_context(user_agent=context_opts["user_agent"])
            stealth_script = stealth_init_script()
            if stealth_script:
                await context.add_init_script(stealth_script)
            page = await context.new_page()

            async def route_handler(route):
                try:
                    if route.request.resource_type in {"image", "media", "font"}:
                        await route.abort()
                    else:
                        await route.continue_()
                except PlaywrightError:
                    log.debug("ikman_route_ignored", reason="page_or_context_closed")

            await page.route("**/*", route_handler)

            try:
                for category_path in self.PLAYWRIGHT_CATEGORY_PATHS:
                    category_page_limit = (
                        max(1, int(max_pages or 1))
                        if category_path == "cars"
                        else self._secondary_page_budget(max_pages)
                    )
                    consecutive_empty_pages = 0
                    consecutive_page_errors = 0
                    base_url = self.BASE_URL_TEMPLATE.format(category=category_path)

                    for page_num in range(1, category_page_limit + 1):
                        url = f"{base_url}{page_num}"
                        log.info(
                            "scraping_page",
                            source=self.SOURCE,
                            mode="playwright",
                            category=category_path,
                            page=page_num,
                        )

                        try:
                            await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                            try:
                                await page.wait_for_selector("a.gtm-ad-item", timeout=8_000)
                            except PlaywrightTimeoutError:
                                log.info(
                                    "ikman_selector_timeout",
                                    category=category_path,
                                    page=page_num,
                                )

                            listings = await page.query_selector_all("a.gtm-ad-item")
                            if not listings:
                                consecutive_empty_pages += 1
                                log.info(
                                    "ikman_no_cards",
                                    category=category_path,
                                    page=page_num,
                                    consecutive_empty_pages=consecutive_empty_pages,
                                )
                                if consecutive_empty_pages >= 10:
                                    break
                                continue

                            consecutive_empty_pages = 0
                            consecutive_page_errors = 0

                            for listing in listings:
                                try:
                                    url_attr = await listing.get_attribute("href")
                                    listing_url = f"https://ikman.lk{url_attr}" if url_attr else ""

                                    title_elem = await listing.query_selector("h2")
                                    title = (
                                        (await title_elem.inner_text()).strip() if title_elem else ""
                                    )

                                    price_elem = await listing.query_selector("[class*='price']")
                                    raw_price = (
                                        (await price_elem.inner_text()).strip() if price_elem else ""
                                    )

                                    loc_elem = await listing.query_selector("[class*='location']")
                                    location_text = (
                                        (await loc_elem.inner_text()).strip()
                                        if loc_elem
                                        else "Sri Lanka"
                                    )
                                    district = (
                                        location_text.split(",")[-1].strip()
                                        if "," in location_text
                                        else location_text
                                    )

                                    img_elem = await listing.query_selector("img")
                                    thumb_url = ""
                                    if img_elem:
                                        for attr in ("src", "data-src", "data-lazy-src"):
                                            candidate = await img_elem.get_attribute(attr)
                                            normalized = self._normalize_thumbnail_url(candidate)
                                            if normalized:
                                                thumb_url = normalized
                                                break

                                        if not thumb_url:
                                            srcset = await img_elem.get_attribute(
                                                "srcset"
                                            ) or await img_elem.get_attribute("data-srcset")
                                            if srcset:
                                                first_image = (
                                                    srcset.split(",")[0].strip().split(" ")[0]
                                                )
                                                normalized = self._normalize_thumbnail_url(
                                                    first_image
                                                )
                                                if normalized:
                                                    thumb_url = normalized

                                    if not thumb_url or self._is_placeholder_thumbnail(thumb_url):
                                        thumb_url = await self._fetch_detail_thumbnail(
                                            context, listing_url
                                        )

                                    data = self.cleaner.clean_title(title)
                                    price = self.cleaner.clean_price(raw_price)

                                    if not data["make"] or not price:
                                        continue

                                    listing_payload = {
                                        "source_id": listing_url,
                                        "source": self.SOURCE,
                                        "title": title,
                                        "make": data["make"],
                                        "model": data["model"] or "Other",
                                        "year": data["year"],
                                        "price_lkr": price,
                                        "url": listing_url,
                                        "thumbnail_url": thumb_url,
                                        "district": district,
                                        "condition": None,
                                        "vehicle_category": (
                                            "motorbikes"
                                            if category_path == "motorbikes-scooters"
                                            else (
                                                "boats"
                                                if category_path == "boats-water-transport"
                                                else category_path
                                            )
                                        ),
                                        "_text_blobs": (await listing.inner_text()),
                                        "scraped_at": utc_now(),
                                    }

                                    normalized_payload = self.cleaner.normalize_listing_payload(
                                        listing_payload
                                    )
                                    if not normalized_payload:
                                        continue
                                    self._upsert_listing(normalized_payload)
                                    self.db.commit()
                                    upserted += 1
                                except Exception as e:
                                    log.error("listing_save_error", error=str(e))
                                    self.db.rollback()
                        except Exception as e:
                            log.error(
                                "page_scrape_error",
                                category=category_path,
                                page=page_num,
                                error=str(e),
                            )
                            consecutive_page_errors += 1
                            if consecutive_page_errors >= 25:
                                break
                            continue
            finally:
                try:
                    await page.unroute_all(behavior="ignoreErrors")
                except PlaywrightError:
                    log.debug("ikman_unroute_cleanup_skipped")
                await browser.close()
        return upserted

    async def scrape(self, max_pages: int = 5):
        mode = str(os.getenv("IKMAN_SCRAPE_MODE", "auto") or "auto").strip().lower()
        if mode not in {"auto", "api", "playwright"}:
            log.warning("ikman_scrape_mode_unknown", mode=mode, fallback="auto")
            mode = "auto"

        if mode == "playwright":
            return await self._scrape_via_playwright(max_pages)

        try:
            start_page = start_page_from_env("ikman")
            upserted = await self._scrape_via_api(max_pages, start_page=start_page)
            log.info(
                "ikman_api_scrape_complete",
                upserted=upserted,
                max_pages=max_pages,
                start_page=start_page,
            )
            return upserted
        except IkmanApiUnavailable as exc:
            if mode == "api":
                raise
            log.warning(
                "ikman_api_fallback_to_playwright",
                error=str(exc),
                max_pages=max_pages,
            )
            return await self._scrape_via_playwright(max_pages)
