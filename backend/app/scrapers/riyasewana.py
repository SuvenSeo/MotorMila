import asyncio
import os
import re
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
import structlog
from bs4 import BeautifulSoup
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.net import (
    httpx_client_kwargs,
    playwright_context_kwargs,
)
from app.scrapers.polite import RobotsDisallowedError, polite_goto
from app.utils.time import utc_now
from app.scrapers.page_budget import page_budget_for_category, start_page_from_env
from app.services.historical_archive import (
    fetch_cdx_hits,
    fetch_wayback_html,
    parse_riyasewana_serp_html,
)
from app.utils.listing_upsert import upsert_listing, upsert_listings_batch

log = structlog.get_logger()


class RiyasewanaBlockedError(RuntimeError):
    """Raised when riyasewana.com blocks / challenges / rate-limits us.

    Policy: we back off and skip the source for this run. We never retry
    through a challenge, switch to a browser, rotate IPs or impersonate a
    browser TLS fingerprint to get past a block.
    """


# Wayback Machine fallback is OFF by default: re-reading a site's archived
# copies right after it blocked us is still working around the block.
_ARCHIVE_FALLBACK_ENABLED = os.getenv("RIYASEWANA_ARCHIVE_FALLBACK", "0").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _archive_fallback_enabled() -> bool:
    return _ARCHIVE_FALLBACK_ENABLED


# Scrape mode: "http" (default; plain HTTP with the honest bot UA) or
# "playwright" (explicit opt-in browser, same honest UA, no stealth). "auto"
# is accepted for backwards compatibility and means "http": a block is never
# answered by falling back to a browser.
_DEFAULT_SCRAPE_MODE = str(os.getenv("RIYASEWANA_SCRAPE_MODE", "http") or "http").strip().lower()
_VALID_SCRAPE_MODES = {"auto", "http", "playwright"}
_BLOCKED_HTTP_STATUSES = frozenset({401, 403, 405, 406, 429})

# When true, every category gets the full requested page budget instead of the
# rationed secondary share (see page_budget.py).  Kept for callers that still
# want to force the behaviour regardless of the SCRAPE_SECONDARY_* env knobs.
_FLAT_BUDGET_ENABLED = str(os.getenv("RIYASEWANA_FLAT_BUDGET", "") or "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _start_page() -> int:
    """First page to crawl, so a deep backfill can be run in segments.

    Without this every run re-crawls pages 1..N from scratch, so a crawl
    budgeted to reach page 200 spends its whole window re-reading the head of
    the catalogue and never gets deeper. Delegates to the shared reader so
    every scraper segments the same way, and also honours the fleet-wide
    ``SCRAPE_START_PAGE``.
    """
    raw = str(os.getenv("RIYASEWANA_START_PAGE", "") or "").strip()
    if raw:
        try:
            int(raw)
        except (TypeError, ValueError):
            log.warning("riyasewana_start_page_invalid", value=raw, fallback=1)
            return 1
    return start_page_from_env("riyasewana")


class RiyasewanaScraper:
    SOURCE = "riyasewana"
    # For-sale vehicle leaves only (skip rentals/parts via category choice).
    CATEGORY_PATHS = (
        "cars",
        "motorcycles",
        "three-wheels",
        "vans",
        "buses",
        "lorries",
        "trucks",
        "suvs",
        "pickups",
        "crew-cabs",
        "wagons",
        "tractors",
        "heavy-duty",
        "bicycles",
    )
    PRIMARY_CATEGORY = "cars"
    BASE_URL = "https://riyasewana.com/search/cars"
    LISTING_SELECTOR = "ul.v-list li.v-card"
    LISTING_SELECTORS = (
        "ul.v-list li.v-card",
        "li.v-card",
        "div.v-card",
        "li[class*='v-card']",
    )

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()
        # First page to crawl; scrape() refreshes it from RIYASEWANA_START_PAGE.
        # Defaulted here so the private crawl methods are safe to call directly.
        self._start_page = 1

    def _upsert_listing(self, payload: dict):
        return upsert_listing(self.db, self.SOURCE, payload)

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
    def _extract_page_num(href: str) -> int | None:
        parsed = urlparse(urljoin("https://riyasewana.com", href))
        page_values = parse_qs(parsed.query).get("page")
        if not page_values:
            return None
        try:
            return int(page_values[0])
        except Exception:
            return None

    def _parse_pagination(self, soup: BeautifulSoup, current_page: int) -> tuple[bool, int]:
        has_next = False
        max_page_hint = current_page

        for link in soup.select("div.pagination a[href]"):
            href = str(link.get("href") or "").strip()
            if not href:
                continue

            label = link.get_text(" ", strip=True).lower()
            if label == "next":
                has_next = True

            page_num = self._extract_page_num(href)
            if page_num and page_num > max_page_hint:
                max_page_hint = page_num

        return has_next, max_page_hint

    @classmethod
    def _extract_cards(cls, soup: BeautifulSoup) -> list:
        for selector in cls.LISTING_SELECTORS:
            cards = soup.select(selector)
            if cards:
                return cards

        fallback_cards = []
        seen_nodes: set[int] = set()
        for link in soup.select("a[href*='/buy/']"):
            card = link.find_parent(["li", "div", "article"])
            if card is None:
                continue
            node_id = id(card)
            if node_id in seen_nodes:
                continue
            seen_nodes.add(node_id)
            fallback_cards.append(card)
        return fallback_cards

    def _process_cards(
        self,
        cards: list,
        category_path: str,
        page_num: int,
        seen_urls: set[str],
    ) -> int:
        """Parse SERP cards into listings and upsert them.

        Shared by the Playwright and plain-HTTP scrape paths so both keep
        identical parsing/upsert behavior.  Returns how many cards were new
        (not already seen this run).  Parsing happens first, then the page is
        upserted in ONE commit (44x fewer DB round-trips than commit-per-row).
        """
        new_on_page = 0
        payloads: list[dict] = []

        for card in cards:
            try:
                link = card.select_one(
                    "div.v-card-title a[href*='/buy/']"
                ) or card.select_one("a[href*='/buy/']")
                if not link:
                    continue

                listing_url = urljoin(
                    "https://riyasewana.com",
                    str(link.get("href") or "").strip(),
                )
                if not listing_url or listing_url in seen_urls:
                    continue

                seen_urls.add(listing_url)
                new_on_page += 1

                title = link.get_text(" ", strip=True)
                if not title:
                    continue

                raw_price = self._text(
                    card, ["div.v-card-price", ".price", "[class*='price']"]
                )
                price = self.cleaner.normalize_price_lkr(raw_price)
                if price is None:
                    continue

                data = self.cleaner.clean_title(title)
                year_text = self._text(
                    card, ["div.v-card-year", ".year", "[class*='year']"]
                )
                if not data["year"]:
                    year_match = re.search(r"\b(19|20)\d{2}\b", year_text)
                    if year_match:
                        data["year"] = int(year_match.group(0))

                if not data["make"]:
                    continue

                meta_text = self._text(
                    card, ["div.v-card-meta", ".meta", "[class*='meta']"]
                )
                district = (
                    meta_text.split("·", 1)[0].strip()
                    if meta_text
                    else "Sri Lanka"
                )

                thumb_url = self._attr(
                    card,
                    [
                        ("div.v-card-img img[src]", "src"),
                        ("div.v-card-img img[data-src]", "data-src"),
                    ],
                )
                thumb_url = (
                    urljoin("https://riyasewana.com", thumb_url)
                    if thumb_url
                    else ""
                )

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
                        if category_path == "motorcycles"
                        else (
                            "three-wheelers"
                            if category_path == "three-wheels"
                            else category_path
                        )
                    ),
                    # Include meta + card text so fuel/gear/body
                    # keywords outside the title still enrich.
                    "_text_blobs": [
                        title,
                        meta_text,
                        card.get_text(" ", strip=True),
                    ],
                    "scraped_at": utc_now(),
                }

                normalized_payload = self.cleaner.normalize_listing_payload(
                    payload
                )
                if not normalized_payload:
                    continue

                payloads.append(normalized_payload)
            except Exception as e:
                log.error(
                    "riyasewana_item_error",
                    category=category_path,
                    page=page_num,
                    error=str(e),
                )

        if payloads:
            upsert_listings_batch(
                self.db,
                self.SOURCE,
                payloads,
                log_tag="riyasewana",
            )

        return new_on_page

    @staticmethod
    def _is_challenge_page(soup: BeautifulSoup) -> bool:
        title = soup.title.get_text(" ", strip=True).lower() if soup.title else ""
        if "attention required" in title or "just a moment" in title:
            return True

        body_text = soup.get_text(" ", strip=True).lower()
        return (
            "verify you are human" in body_text
            or "checking your browser before accessing" in body_text
        )

    @staticmethod
    def _is_hard_block_page(soup: BeautifulSoup) -> bool:
        title = soup.title.get_text(" ", strip=True).lower() if soup.title else ""
        if "attention required" not in title:
            return False

        body_text = soup.get_text(" ", strip=True).lower()
        return any(
            marker in body_text
            for marker in (
                "sorry, you have been blocked",
                "you are unable to access",
                "please enable cookies",
                "your current ip address has been blocked",
            )
        )

    async def _load_page_with_retries(self, page, page_url: str, page_num: int) -> tuple[BeautifulSoup, list]:
        """Load one SERP page once. A challenge/block page aborts the source."""
        await polite_goto(page, page_url, wait_until="domcontentloaded", timeout=45_000)
        try:
            await page.wait_for_selector(self.LISTING_SELECTOR, timeout=20_000)
        except PlaywrightTimeoutError:
            pass
        soup = BeautifulSoup(await page.content(), "lxml")
        if self._is_hard_block_page(soup) or self._is_challenge_page(soup):
            title = soup.title.get_text(strip=True) if soup.title else "(no title)"
            log.error("riyasewana_blocked_backoff", page=page_num, title=title)
            raise RiyasewanaBlockedError(
                f"riyasewana.com served a block/challenge page on page {page_num} "
                f"(title={title!r}); backing off and skipping source"
            )
        return soup, self._extract_cards(soup)

    @classmethod
    def _category_base_url(cls, category_path: str) -> str:
        return f"https://riyasewana.com/search/{category_path}"

    @classmethod
    def _page_budget_for_category(cls, category_path: str, max_pages: int) -> int:
        if _FLAT_BUDGET_ENABLED:
            return max(1, int(max_pages or 1))
        return page_budget_for_category(
            is_primary=category_path == cls.PRIMARY_CATEGORY,
            max_pages=max_pages,
        )

    async def _scrape_live(self, max_pages: int = 5):
        seen_urls: set[str] = set()
        context_opts = playwright_context_kwargs()

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            )
            context = await browser.new_context(
                user_agent=context_opts["user_agent"],
                viewport=context_opts["viewport"],
            )
            page = await context.new_page()

            try:
                for category_path in self.CATEGORY_PATHS:
                    page_limit = self._page_budget_for_category(category_path, max_pages)
                    base_url = self._category_base_url(category_path)
                    page_num = self._start_page
                    consecutive_empty_pages = 0
                    consecutive_page_errors = 0

                    while page_num <= page_limit:
                        page_url = base_url if page_num == 1 else f"{base_url}?page={page_num}"
                        log.info(
                            "scraping_page",
                            source=self.SOURCE,
                            category=category_path,
                            page=page_num,
                            page_limit=page_limit,
                        )

                        try:
                            soup, cards = await self._load_page_with_retries(
                                page, page_url, page_num
                            )
                            if not cards:
                                consecutive_empty_pages += 1
                                title = soup.title.get_text(strip=True) if soup.title else "(no title)"
                                log.info(
                                    "riyasewana_no_cards",
                                    category=category_path,
                                    page=page_num,
                                    challenge_page=self._is_challenge_page(soup),
                                    page_title=title,
                                )
                                if consecutive_empty_pages == 1:
                                    try:
                                        with open(
                                            f"debug_riyasewana_{category_path}_p{page_num}.html",
                                            "w",
                                            encoding="utf-8",
                                        ) as f:
                                            f.write(soup.prettify()[:50_000])
                                    except Exception:
                                        pass
                                if consecutive_empty_pages >= 10:
                                    break
                                page_num += 1
                                continue

                            new_on_page = self._process_cards(
                                cards, category_path, page_num, seen_urls
                            )

                            if new_on_page == 0:
                                consecutive_empty_pages += 1
                                log.info(
                                    "riyasewana_empty_page",
                                    category=category_path,
                                    page=page_num,
                                    consecutive_empty_pages=consecutive_empty_pages,
                                )
                                if consecutive_empty_pages >= 10:
                                    break
                                page_num += 1
                                continue

                            consecutive_empty_pages = 0
                            page_num += 1
                            consecutive_page_errors = 0
                        except RiyasewanaBlockedError:
                            raise
                        except RobotsDisallowedError:
                            log.info("riyasewana_robots_skip_category", category=category_path)
                            break
                        except Exception as e:
                            log.error(
                                "riyasewana_page_error",
                                category=category_path,
                                page=page_num,
                                error=str(e),
                            )
                            consecutive_page_errors += 1
                            if consecutive_page_errors >= 25:
                                break
                            page_num += 1
            finally:
                await context.close()
                await browser.close()

    @staticmethod
    def _http_status_is_block(status_code: int) -> bool:
        try:
            return int(status_code) in _BLOCKED_HTTP_STATUSES
        except (TypeError, ValueError):
            return False

    async def _http_fetch_page(self, client: Any, page_url: str, page_num: int) -> BeautifulSoup:
        """Fetch one SERP page with the honest bot client.

        Any block, challenge or rate-limit answer raises
        :class:`RiyasewanaBlockedError` immediately (no retry through it).
        Plain network errors are retried once with backoff.
        """
        last_exc: Exception | None = None
        for attempt in range(1, 3):
            try:
                response = await client.get(page_url)
                if self._http_status_is_block(response.status_code):
                    raise RiyasewanaBlockedError(
                        f"HTTP {response.status_code} for {page_url}"
                    )
                soup = BeautifulSoup(response.text, "lxml")
                if self._is_hard_block_page(soup) or self._is_challenge_page(soup):
                    title = soup.title.get_text(strip=True) if soup.title else "(no title)"
                    log.error("riyasewana_blocked_backoff", page=page_num, title=title)
                    raise RiyasewanaBlockedError(
                        f"riyasewana.com served a block/challenge page on page {page_num} "
                        f"(title={title!r}); backing off and skipping source"
                    )
                if response.status_code != 200:
                    raise RuntimeError(f"HTTP {response.status_code} for {page_url}")
                return soup
            except (RiyasewanaBlockedError, RobotsDisallowedError):
                raise
            except Exception as exc:
                last_exc = exc
                log.warning(
                    "riyasewana_http_retry",
                    page=page_num,
                    attempt=attempt,
                    error=str(exc),
                )
                if attempt < 2:
                    await asyncio.sleep(10 * attempt)
                    continue
        if last_exc is not None:
            raise last_exc
        return BeautifulSoup("", "lxml")

    async def _scrape_via_http(self, max_pages: int = 5, *, mode: str = "http"):
        """Plain-HTTP crawl of riyasewana SERP pages (server-rendered HTML).

        Uses the shared polite client: honest MotorMilaBot UA, robots.txt
        check per URL, one request at a time per host with a 2-5 s delay.
        No TLS impersonation and no proxies. Card parsing lives in
        :meth:`_process_cards`.
        """
        seen_urls: set[str] = set()
        upserted = 0

        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30.0,
            **httpx_client_kwargs({"Accept": "text/html,application/xhtml+xml"}),
        ) as client:
            for category_path in self.CATEGORY_PATHS:
                page_limit = self._page_budget_for_category(category_path, max_pages)
                base_url = self._category_base_url(category_path)
                page_num = self._start_page
                consecutive_empty_pages = 0
                consecutive_page_errors = 0
                stop_at_page: int | None = None

                while page_num <= page_limit:
                    if stop_at_page is not None and page_num > stop_at_page:
                        break
                    page_url = base_url if page_num == 1 else f"{base_url}?page={page_num}"
                    log.info(
                        "scraping_page_http",
                        source=self.SOURCE,
                        category=category_path,
                        page=page_num,
                        page_limit=page_limit,
                    )
                    try:
                        soup = await self._http_fetch_page(client, page_url, page_num)
                    except RiyasewanaBlockedError:
                        raise
                    except RobotsDisallowedError:
                        log.info("riyasewana_robots_skip_category", category=category_path, url=page_url)
                        break
                    except Exception as e:
                        log.error(
                            "riyasewana_http_page_error",
                            category=category_path,
                            page=page_num,
                            error=str(e),
                        )
                        consecutive_page_errors += 1
                        if consecutive_page_errors >= 5:
                            log.warning(
                                "riyasewana_http_errors_skip_category",
                                category=category_path,
                                consecutive_page_errors=consecutive_page_errors,
                            )
                            break
                        page_num += 1
                        continue

                    cards = self._extract_cards(soup)
                    if not cards:
                        consecutive_empty_pages += 1
                        log.info(
                            "riyasewana_http_no_cards",
                            category=category_path,
                            page=page_num,
                            consecutive_empty_pages=consecutive_empty_pages,
                        )
                        if consecutive_empty_pages >= 10:
                            break
                        page_num += 1
                        continue

                    new_on_page = self._process_cards(cards, category_path, page_num, seen_urls)
                    upserted += new_on_page

                    # The SERP advertises its last page via the pagination block;
                    # honor it so deep crawls stop at the true end instead of
                    # burning requests on exhausted pages.
                    if stop_at_page is None:
                        _has_next, max_page_hint = self._parse_pagination(soup, page_num)
                        if max_page_hint and max_page_hint > page_num:
                            stop_at_page = min(max_page_hint, page_limit)
                        elif not _has_next:
                            stop_at_page = page_num

                    if new_on_page == 0:
                        consecutive_empty_pages += 1
                        if consecutive_empty_pages >= 10:
                            break
                    else:
                        consecutive_empty_pages = 0

                    consecutive_page_errors = 0
                    page_num += 1

        return upserted

    def _recover_from_live_block(self, max_pages: int, reason: str) -> dict[str, Any]:
        """Wayback fallback after Cloudflare/WAF blocks the live site.

        A zero-insert archive result must not look like a successful scrape —
        hosted runners used to mark SUCCESS after inserting nothing, which hid
        days of stale riyasewana data.
        """
        if not _archive_fallback_enabled():
            raise RiyasewanaBlockedError(
                f"riyasewana.com blocked the live scrape ({reason}); archive fallback disabled"
            )
        log.warning(
            "riyasewana_archive_fallback",
            max_pages=max_pages,
            reason=reason,
        )
        result = self._run_archive_fallback(max_pages=max_pages)
        inserted = int((result or {}).get("inserted") or 0)
        if inserted <= 0:
            raise RiyasewanaBlockedError(
                f"riyasewana.com blocked the live scrape ({reason}) and archive fallback inserted 0 listings"
            )
        return result

    async def scrape(self, max_pages: int = 5):
        mode = _DEFAULT_SCRAPE_MODE
        if mode not in _VALID_SCRAPE_MODES:
            log.warning(
                "riyasewana_scrape_mode_unknown",
                mode=mode,
                fallback="auto",
            )
            mode = "http"
        if mode == "auto":
            mode = "http"

        start_page = _start_page()
        # Stored on the instance rather than threaded through the private
        # scrape methods, so their signatures (and any test doubles for them)
        # stay exactly as they were.
        self._start_page = start_page
        if start_page > 1:
            log.info("riyasewana_segment_start", start_page=start_page, max_pages=max_pages)

        if mode == "playwright":
            try:
                return await self._scrape_live(max_pages=max_pages)
            except RiyasewanaBlockedError as exc:
                log.warning("source_blocked_backoff", source=self.SOURCE, error=str(exc))
                return self._recover_from_live_block(max_pages, "playwright_blocked")

        # http (and legacy "auto"): never fall back to a browser on a block.
        try:
            return await self._scrape_via_http(max_pages=max_pages, mode=mode)
        except RiyasewanaBlockedError as exc:
            log.warning("source_blocked_backoff", source=self.SOURCE, error=str(exc))
            return self._recover_from_live_block(max_pages, "http_blocked")

    def _run_archive_fallback(self, max_pages: int = 5) -> dict[str, Any]:
        """Upsert listings parsed from the most recent Wayback snapshot of the
        riyasewana search page, tagged with the snapshot URL."""
        from_ts = (utc_now() - timedelta(days=120)).strftime("%Y%m%d")
        to_ts = utc_now().strftime("%Y%m%d")
        hits = fetch_cdx_hits(
            self.BASE_URL,
            from_ts=from_ts,
            to_ts=to_ts,
            limit=max_pages,
        )
        if not hits:
            log.warning("riyasewana_archive_no_snapshots", base_url=self.BASE_URL)
            return {"snapshot": None, "inserted": 0}

        hit = hits[-1]
        html = fetch_wayback_html(hit)
        rows = parse_riyasewana_serp_html(
            html,
            observed_at=utc_now(),
            snapshot_url=hit.raw_url,
            original_url=self.BASE_URL,
        )
        inserted = 0
        for row in rows:
            try:
                normalized = self.cleaner.normalize_listing_payload(
                    {
                        "source_id": row["source_id"],
                        "source": self.SOURCE,
                        "title": row["title"],
                        "make": row["make"],
                        "model": row["model"] or "Other",
                        "year": row["year"],
                        "price_lkr": row["price_lkr"],
                        "url": row["url"],
                        "thumbnail_url": row.get("thumbnail_url", ""),
                        "district": row.get("district") or "Sri Lanka",
                        "condition": row.get("condition", "used"),
                        "vehicle_category": row.get("vehicle_category") or "cars",
                        "scraped_at": row["observed_at"],
                        "archive_url": hit.raw_url,
                    }
                )
                if not normalized:
                    continue
                normalized.pop("archive_url", None)
                if self._upsert_listing(normalized):
                    inserted += 1
                self.db.commit()
            except Exception as e:
                self.db.rollback()
                log.error(
                    "riyasewana_archive_row_error",
                    url=row.get("url"),
                    error=str(e),
                )

        if inserted == 0:
            soup = BeautifulSoup(html, "lxml")
            cards = self._extract_cards(soup)
            if cards:
                live_inserted = self._process_cards(cards, "cars", 1, set())
                inserted += int(live_inserted or 0)
                log.info(
                    "riyasewana_archive_live_parser_upserted",
                    snapshot=hit.raw_url,
                    inserted=live_inserted,
                )

        log.info(
            "riyasewana_archive_upserted",
            snapshot=hit.raw_url,
            inserted=inserted,
        )
        return {"snapshot": hit.raw_url, "inserted": inserted}

