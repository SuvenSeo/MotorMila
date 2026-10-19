"""Depth guards: every scraper must be able to go as deep as its source allows.

Background: three separate limits stopped sources from ever seeing most of
their catalogue, and none of them were the source's fault.

1. ``page_budget.secondary_page_budget`` hard-capped every non-primary category
   at 25 pages and then divided the requested budget by 4. With the dump
   script's 120-page budget that meant ikman, riyasewana, patpat, saleme,
   riyahub, hitad and auto-lanka never saw more than the first 25 pages of any
   non-primary category. Live probing confirmed those catalogues are much
   deeper: riyahub's "cars" category still returns fresh older listings at page
   26, and hitad advertises a 24-page cars category with more behind it.

2. Only ikman and riyasewana had a start page. Every other paginating scraper
   began at page 1 on every run, so a source whose catalogue is deeper than one
   run can reach spent every run re-reading the same head and never advanced.

3. ``GenericDetailScraper.scrape`` kept a single ``consecutive_empty_pages``
   counter across *all* categories. The moment the first category ran out of
   pages, three empty pages later the whole source stopped — so saleme's 4
   non-car categories, riyahub's 14, dimo's and carshop's were never visited.

These tests fail if any of those regressions come back.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from app.scrapers.auto_lanka_site import AutoLankaSiteScraper
from app.scrapers.autodirect import AutoDirectScraper
from app.scrapers.autolanka import AutoLankaScraper
from app.scrapers.autostream import AutoStreamScraper
from app.scrapers.cartivate import CartivateScraper
from app.scrapers.carshop import CarshopScraper
from app.scrapers.dimo import DimoScraper
from app.scrapers.generic_detail import GenericDetailScraper
from app.scrapers.hitad import HitadScraper
from app.scrapers.page_budget import (
    page_budget_for_category,
    secondary_page_budget,
    should_stop_at_page_hint,
    start_page_from_env,
)
from app.scrapers.patpat import PatpatScraper
from app.scrapers.riyahub import RiyahubScraper
from app.scrapers.saleme import SaleMeScraper

DUMP_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ops" / "manus_scrape_dump.sh"

# Sources whose crawl loop lives in their own module.
OWN_LOOP_SOURCES = {
    "ikman": "ikman.py",
    "riyasewana": "riyasewana.py",
    "patpat": "patpat.py",
    "hitad": "hitad.py",
    "auto-lanka": "auto_lanka_site.py",
    "autolanka": "autolanka.py",
    "autodirect": "autodirect.py",
    "cartivate": "cartivate.py",
}

# Sources that inherit GenericDetailScraper.scrape, so the base class owns the
# start-page read and the per-category loop for them.
BASE_LOOP_SOURCES = {
    "saleme": "saleme.py",
    "riyahub": "riyahub.py",
    "dimo": "dimo.py",
    "carshop": "carshop.py",
}

PAGINATING_SOURCES = tuple(OWN_LOOP_SOURCES) + tuple(BASE_LOOP_SOURCES)


def _module_text(filename: str) -> str:
    return (
        Path(__file__).resolve().parents[1] / "app" / "scrapers" / filename
    ).read_text(encoding="utf-8")


# --- 1. no artificial ceiling ------------------------------------------------


@pytest.mark.parametrize("budget", [5, 8, 40, 120, 800])
def test_secondary_categories_are_not_capped_by_default(budget):
    """A requested budget must reach the whole category, not a quarter of it."""
    assert secondary_page_budget(budget) == budget
    assert page_budget_for_category(is_primary=False, max_pages=budget) == budget


def test_every_scraper_lets_secondary_categories_use_the_full_budget():
    """No scraper may re-introduce a divisor or a hard ceiling of its own."""
    groups = RiyahubScraper(db=None)._build_page_url_groups(120)
    assert len(groups) == len(RiyahubScraper.START_URLS)
    for group in groups:
        assert len(group) == 120, "a secondary category was rationed below the requested budget"

    urls = RiyahubScraper(db=None)._build_page_urls(120)
    assert len(urls) == 120 * len(RiyahubScraper.START_URLS)


def test_riyahub_categories_can_be_crawled_past_page_25():
    """The exact regression: riyahub paginates well past the old 25 ceiling."""
    groups = RiyahubScraper(db=None)._build_page_url_groups(40, start_page=1)
    bikes = next(group for group in groups if "motorcycles" in group[0])
    assert "https://riyahub.lk/vehicle/motorcycles/page/26/" in bikes
    assert "https://riyahub.lk/vehicle/motorcycles/page/40/" in bikes


def test_operator_can_still_ration_secondary_categories(monkeypatch):
    monkeypatch.setenv("SCRAPE_SECONDARY_PAGE_DIVISOR", "4")
    monkeypatch.setenv("SCRAPE_SECONDARY_PAGE_CAP", "25")
    assert page_budget_for_category(is_primary=True, max_pages=800) == 800
    assert page_budget_for_category(is_primary=False, max_pages=800) == 25


# --- 2. start pages ---------------------------------------------------------


def test_start_page_defaults_to_one():
    assert start_page_from_env("anything") == 1


def test_per_source_start_page_wins(monkeypatch):
    monkeypatch.setenv("SCRAPE_START_PAGE", "10")
    monkeypatch.setenv("RIYAHUB_START_PAGE", "41")
    assert start_page_from_env("riyahub") == 41
    assert start_page_from_env("dimo") == 10


def test_start_page_is_clamped_and_never_crashes(monkeypatch):
    monkeypatch.setenv("SCRAPE_START_PAGE", "0")
    assert start_page_from_env("dimo") == 1
    monkeypatch.setenv("SCRAPE_START_PAGE", "-7")
    assert start_page_from_env("dimo") == 1
    monkeypatch.setenv("SCRAPE_START_PAGE", "banana")
    assert start_page_from_env("dimo") == 1
    monkeypatch.setenv("SCRAPE_START_PAGE", "  60  ")
    assert start_page_from_env("dimo") == 60


def test_generic_detail_subclasses_group_pages_per_category():
    """Per-category groups are what let the empty-page counter reset."""
    for scraper_cls in (SaleMeScraper, RiyahubScraper, DimoScraper, CarshopScraper):
        groups = scraper_cls(db=None)._build_page_url_groups(3)
        assert len(groups) == len(scraper_cls.START_URLS), scraper_cls.__name__
        for group in groups:
            assert len(group) == 3, scraper_cls.__name__


def test_generic_detail_subclasses_accept_a_start_page():
    for scraper_cls in (SaleMeScraper, RiyahubScraper, DimoScraper, CarshopScraper):
        groups = scraper_cls(db=None)._build_page_url_groups(3, start_page=50)
        first = groups[0][0]
        assert "50" in first, f"{scraper_cls.__name__} ignored the start page: {first}"
        assert len(groups[0]) == 3


@pytest.mark.parametrize("source,filename", sorted(OWN_LOOP_SOURCES.items()))
def test_own_loop_sources_have_a_wired_start_page(source, filename):
    """No scraper that owns its loop may silently restart at page 1 every run."""
    assert "start_page_from_env" in _module_text(filename), (
        f"{source} has no start-page reader, so it can only ever crawl the head "
        "of its catalogue"
    )


def test_base_loop_sources_get_the_start_page_from_the_shared_base():
    base = _module_text("generic_detail.py")
    assert "start_page_from_env(self.SOURCE)" in base
    for source, filename in BASE_LOOP_SOURCES.items():
        del filename
        assert issubclass(
            {
                "saleme": SaleMeScraper,
                "riyahub": RiyahubScraper,
                "dimo": DimoScraper,
                "carshop": CarshopScraper,
            }[source],
            GenericDetailScraper,
        ), f"{source} no longer inherits the base crawl loop"


def test_start_page_reaches_the_detail_scraper_crawl():
    """The value must be read inside scrape(), not just supported in a helper."""
    import inspect

    base = inspect.getsource(GenericDetailScraper.scrape)
    assert "start_page_from_env(self.SOURCE)" in base
    assert "for category_urls in groups" in base, (
        "scrape() must iterate per-category groups so the empty-page counter "
        "resets between categories"
    )


def test_riyahub_honours_the_shared_start_page_env(monkeypatch):
    from app.scrapers.riyasewana import _start_page

    monkeypatch.setenv("SCRAPE_START_PAGE", "77")
    assert _start_page() == 77
    monkeypatch.setenv("RIYASEWANA_START_PAGE", "5")
    assert _start_page() == 5


# --- 3. one finished category must not end the source -----------------------


def test_empty_page_counter_is_per_category_not_per_source():
    import inspect

    base = inspect.getsource(GenericDetailScraper.scrape)
    reset = "consecutive_empty_pages = 0\n                for page_url"
    assert reset in base, (
        "the empty-page counter must be reset at the top of each category loop"
    )
    assert "seen_urls: set[str] = set()\n        consecutive_empty_pages = 0" not in base, (
        "a source-wide consecutive_empty_pages counter lets the first finished "
        "category abort every category after it"
    )


class _FakeResponse:
    def __init__(self, text: str, url: str = "https://example.test/"):
        self.text = text
        self.url = url
        self.status_code = 200
        self.headers: dict[str, str] = {}
        self.content = text.encode()

    def raise_for_status(self) -> None:
        return None


class _NullSession:
    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None


class _RecordingClient:
    """Minimal httpx stand-in that serves one canned body per URL."""

    def __init__(self, bodies: dict[str, str]):
        self.bodies = bodies
        self.requested: list[str] = []

    async def get(self, url: str, **kwargs):
        self.requested.append(str(url))
        return _FakeResponse(self.bodies.get(str(url), ""), str(url))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def test_a_finished_category_does_not_stop_the_categories_after_it(monkeypatch):
    """The real regression: category 1 ending must not skip categories 2..N.

    ``cars`` is 6 pages long but only pages 1-2 hold listings, so it burns
    through its empty-page limit and finishes. ``vans`` then still has 4 pages
    of fresh listings and must be crawled.
    """
    import app.scrapers.generic_detail as generic_detail

    class _Scraper(GenericDetailScraper):
        SOURCE = "depthtest"
        BASE_URL = "https://example.test/"
        START_URLS = ("https://example.test/cars", "https://example.test/vans")
        EMPTY_PAGE_LIMIT = 3

        def __init__(self):
            self.db = _NullSession()
            self.cleaner = None
            self.blocked_reason = None
            self.seen_listings: list[str] = []

        def _extract_listing_links(self, soup):
            text = soup.get_text(strip=True)
            return [f"https://example.test/detail/{text}"] if text else []

        def _build_payload(self, detail_url, html, *, vehicle_category=None):
            return {"url": detail_url, "vehicle_category": vehicle_category}

        def _upsert_listing(self, payload):
            self.seen_listings.append(str(payload["url"]))

    bodies: dict[str, str] = {}
    for page in range(1, 7):
        suffix = "" if page == 1 else f"?page={page}"
        # cars ends naturally: 2 pages of listings, then the empty tail that
        # trips the limit and finishes the category.
        bodies[f"https://example.test/cars{suffix}"] = (
            f"cars{page}" if page <= 2 else ""
        )
        # vans is a *different* category with its own sparse opening pages
        # before it yields anything. With a source-wide counter it is already
        # at the limit when it starts, so it is skipped whole.
        bodies[f"https://example.test/vans{suffix}"] = (
            f"vans{page}" if page >= 3 else ""
        )

    client = _RecordingClient(bodies)
    monkeypatch.setattr(generic_detail.httpx, "AsyncClient", lambda *a, **k: client)
    monkeypatch.setattr(generic_detail, "flush_upsert_buffer", lambda *a, **k: None)
    monkeypatch.delenv("SCRAPE_START_PAGE", raising=False)
    monkeypatch.delenv("DEPTHTEST_START_PAGE", raising=False)

    scraper = _Scraper()
    asyncio.run(scraper.scrape(max_pages=6))

    visited_vans = [url for url in client.requested if "/vans" in url]
    assert visited_vans, (
        "the vans category was never crawled because cars ran out of pages first"
    )
    assert len(visited_vans) >= 3, visited_vans
    assert any("vans" in item for item in scraper.seen_listings), (
        "vans pages were fetched but never yielded a listing: the empty-page "
        "counter was not reset for the new category"
    )


def test_a_start_page_segments_the_detail_scraper_crawl(monkeypatch):
    """Every category must begin at the requested page, not at page 1."""
    import app.scrapers.generic_detail as generic_detail

    class _Scraper(GenericDetailScraper):
        SOURCE = "depthtest"
        BASE_URL = "https://example.test/"
        START_URLS = ("https://example.test/cars", "https://example.test/vans")

        def __init__(self):
            self.db = None
            self.cleaner = None
            self.blocked_reason = None

        def _extract_listing_links(self, soup):
            return []

        def _build_payload(self, detail_url, html, *, vehicle_category=None):
            return None

    client = _RecordingClient({})
    monkeypatch.setattr(generic_detail.httpx, "AsyncClient", lambda *a, **k: client)
    monkeypatch.setattr(generic_detail, "flush_upsert_buffer", lambda *a, **k: None)
    monkeypatch.setenv("SCRAPE_START_PAGE", "120")

    asyncio.run(_Scraper().scrape(max_pages=5))

    assert client.requested[0] == "https://example.test/cars?page=120"
    assert "https://example.test/cars?page=1" not in client.requested
    assert "https://example.test/vans?page=120" in client.requested


def test_empty_page_limit_is_tunable():
    assert GenericDetailScraper(db=None).empty_page_limit() == 3
    os.environ["SCRAPE_EMPTY_PAGE_LIMIT"] = "12"
    try:
        assert GenericDetailScraper(db=None).empty_page_limit() == 12
        os.environ["SCRAPE_EMPTY_PAGE_LIMIT"] = "0"
        assert GenericDetailScraper(db=None).empty_page_limit() == 3
        os.environ["SCRAPE_EMPTY_PAGE_LIMIT"] = "junk"
        assert GenericDetailScraper(db=None).empty_page_limit() == 3
    finally:
        os.environ.pop("SCRAPE_EMPTY_PAGE_LIMIT", None)


# --- 4. other silent depth losses -------------------------------------------


def test_autostream_does_not_silently_drop_rows():
    """A 120-page budget used to discard everything past 12,000 active rows."""
    import inspect

    source_text = inspect.getsource(AutoStreamScraper.scrape)
    assert "rows_to_process = active_rows" in source_text
    assert "autostream_truncating_active_rows" in source_text, (
        "truncating must be logged, never silent"
    )


def test_a_page_hint_never_stops_a_page_that_is_still_yielding_listings():
    """Sites window their pagination, so a hint is a claim, not a fact.

    Cutting the crawl on the hint alone would silently truncate a deep
    category — the exact failure this change is meant to remove.
    """
    assert should_stop_at_page_hint(5, 5, produced_listings=True) is False
    assert should_stop_at_page_hint(6, 5, produced_listings=True) is False
    assert should_stop_at_page_hint(5, 5, produced_listings=False) is True
    assert should_stop_at_page_hint(9, 5, produced_listings=False) is True
    # No hint at all -> never stop on it; the empty-page detector owns that.
    assert should_stop_at_page_hint(5, None, produced_listings=False) is False


def test_hitad_reads_the_last_page_the_site_advertises():
    import inspect

    source_text = inspect.getsource(HitadScraper.scrape)
    assert "_extract_max_page(soup)" in source_text, "hitad already parses its last page"
    assert "should_stop_at_page_hint" in source_text


def test_cartivate_reads_the_last_page_the_site_advertises():
    import inspect

    source_text = inspect.getsource(CartivateScraper.scrape)
    assert "max_page_hint" in source_text
    assert "should_stop_at_page_hint" in source_text


def test_cards_that_fail_to_parse_do_not_end_a_category():
    """A parsing gap must not be mistaken for the end of the catalogue.

    A hitad/cartivate page can hold cards the cleaner rejects. Ending the
    category on the first such page would silently drop the rest of it, so the
    advertised-last-page hint must only be consulted where the page had no
    cards at all.
    """
    import inspect

    for scraper_cls in (HitadScraper, CartivateScraper):
        source_text = inspect.getsource(scraper_cls.scrape)
        no_cards_index = source_text.index("if not cards:")
        hint_index = source_text.index("should_stop_at_page_hint")
        assert hint_index > no_cards_index, (
            f"{scraper_cls.__name__} must not consult the last-page hint before "
            "it has established that a page held no cards"
        )
        # And the hint must not gate the "no new payloads" branch, which is a
        # parsing outcome rather than an end-of-catalogue signal.
        after_cards = source_text[no_cards_index:]
        assert "should_stop_at_page_hint" not in after_cards.split("if new_on_page == 0:")[-1].split(
            "page_num += 1"
        )[0], (
            f"{scraper_cls.__name__} stops a category on a page that still had "
            "cards; a parse failure is not the end of the catalogue"
        )


def test_dimo_gives_each_entry_point_its_own_page_budget():
    groups = DimoScraper(db=None)._build_page_url_groups(25)
    assert len(groups) == 2
    assert all(len(group) == 25 for group in groups)


def test_remaining_paginators_read_the_start_page():
    for filename in ("hitad.py", "auto_lanka_site.py", "patpat.py", "autolanka.py", "autodirect.py", "cartivate.py"):
        assert "start_page_from_env" in _module_text(filename), filename


# --- 5. the ops script must be able to drive a segment ---------------------


def test_dump_script_can_scrape_a_segment_deeper_into_a_catalogue():
    text = DUMP_SCRIPT.read_text(encoding="utf-8")
    assert "MANUS_START_PAGE" in text
    assert "SCRAPE_START_PAGE" in text, "the segment start must reach the scrapers"
    assert "MANUS_SOURCE_LIST" in text, "a deep catch-up must be able to pick one source"


def test_dump_script_has_no_page_ceiling_of_its_own():
    text = DUMP_SCRIPT.read_text(encoding="utf-8")
    assert "MANUS_MAX_PAGES:-120" in text
    assert "SCRAPE_SECONDARY_PAGE_CAP" not in text, (
        "the dump script must not cap depth below what a source can serve"
    )


def test_backfill_workflows_expose_a_start_page_input():
    """A deep backfill that cannot be segmented can never pass page N."""
    import yaml

    workflow_dir = Path(__file__).resolve().parents[2] / ".github" / "workflows"
    for name, env_name in (
        ("ikman-bulk-backfill.yml", "IKMAN_START_PAGE"),
        ("riyasewana-bulk-backfill.yml", "RIYASEWANA_START_PAGE"),
    ):
        text = (workflow_dir / name).read_text(encoding="utf-8")
        assert "start_page:" in text, f"{name} has no start_page input"
        assert env_name in text, f"{name} does not pass {env_name} to the scraper"
        yaml.safe_load(text)  # must still be valid YAML


def test_catchup_dispatcher_can_walk_segments_deeper():
    text = (
        Path(__file__).resolve().parents[2] / "scripts" / "ops" / "dispatch-catchup.sh"
    ).read_text(encoding="utf-8")
    assert "RIYASEWANA_SEGMENTS" in text
    assert "start_page=${ry_start}" in text, (
        "riyasewana segments must advance the start page, not re-crawl page 1"
    )
