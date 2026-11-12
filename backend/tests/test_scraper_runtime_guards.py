import asyncio
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

import run_alt_sync
import run_sync
from app.scrapers import ikman as ikman_module
from app.scrapers.autolanka import AutoLankaScraper
from app.scrapers.ikman import IkmanCarScraper
from app.scrapers.patpat import PatpatBlockedError, PatpatScraper
from app.scrapers.riyasewana import RiyasewanaBlockedError, RiyasewanaScraper
from app.utils.listing_upsert import upsert_listing as shared_upsert_listing
from bs4 import BeautifulSoup


class _DummyDB:
    def close(self):
        return None

    def rollback(self):
        return None


class _DummyScraper:
    SOURCE = "dummy"
    init_count = 0
    scrape_count = 0

    def __init__(self, _db):
        type(self).init_count += 1

    async def scrape(self, max_pages: int = 5):
        type(self).scrape_count += 1


class _DummyAggregator:
    init_count = 0
    compute_count = 0

    def __init__(self, _db):
        type(self).init_count += 1
        return None

    def compute_aggregates(self, _year, _month):
        type(self).compute_count += 1
        return None


_bulk_refresh_calls = []


def _dummy_bulk_refresh_deal_scores(_db):
    _bulk_refresh_calls.append(_db)
    return {"updated": 0}


def _reset_dummy_scraper_counts():
    _DummyScraper.init_count = 0
    _DummyScraper.scrape_count = 0


def _reset_dummy_aggregator_counts():
    _DummyAggregator.init_count = 0
    _DummyAggregator.compute_count = 0
    _bulk_refresh_calls.clear()


def test_run_sync_skips_source_when_max_pages_is_zero(monkeypatch):
    _reset_dummy_scraper_counts()
    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())

    asyncio.run(run_sync._run_source(_DummyScraper, max_pages=0, source_timeout_seconds=1))

    assert _DummyScraper.init_count == 0
    assert _DummyScraper.scrape_count == 0


def test_run_alt_sync_skips_source_when_max_pages_is_zero(monkeypatch):
    _reset_dummy_scraper_counts()
    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())

    asyncio.run(run_alt_sync._run_source(_DummyScraper, max_pages=0, source_timeout_seconds=1))

    assert _DummyScraper.init_count == 0
    assert _DummyScraper.scrape_count == 0


def test_run_source_timeout_with_new_listings_counts_as_success(monkeypatch):
    class _SlowScraper:
        SOURCE = "dummy-timeout"

        def __init__(self, _db):
            return None

        async def scrape(self, max_pages: int = 5):
            await asyncio.sleep(1.0)

    finalize_calls = []

    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())
    monkeypatch.setattr(
        run_sync,
        "_count_source_listings_safe",
        lambda _source, _calls=iter([10, 15]): next(_calls),
    )
    monkeypatch.setattr(run_sync, "_start_scrape_run", lambda _db, _source: type("R", (), {"id": 7})())
    monkeypatch.setattr(
        run_sync,
        "_finalize_scrape_run_safe",
        lambda run_id, **kwargs: finalize_calls.append({"run_id": run_id, **kwargs}),
    )
    monkeypatch.setattr(run_sync, "_capture_exception_safely", lambda _exc: None)
    monkeypatch.setattr(run_sync, "_close_db_session", lambda *_args, **_kwargs: None)

    asyncio.run(run_sync._run_source(_SlowScraper, max_pages=2, source_timeout_seconds=0.05))

    assert finalize_calls == [
        {
            "run_id": 7,
            "status": "SUCCESS",
            "listings_found": 15,
            "listings_new": 5,
            "error_message": "Source timed out after 0.05s",
        }
    ]


def test_run_source_timeout_without_new_listings_stays_failed(monkeypatch):
    class _SlowScraper:
        SOURCE = "dummy-timeout-empty"

        def __init__(self, _db):
            return None

        async def scrape(self, max_pages: int = 5):
            await asyncio.sleep(1.0)

    finalize_calls = []

    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())
    monkeypatch.setattr(run_sync, "_count_source_listings_safe", lambda _source: 42)
    monkeypatch.setattr(run_sync, "_start_scrape_run", lambda _db, _source: type("R", (), {"id": 8})())
    monkeypatch.setattr(
        run_sync,
        "_finalize_scrape_run_safe",
        lambda run_id, **kwargs: finalize_calls.append({"run_id": run_id, **kwargs}),
    )
    monkeypatch.setattr(run_sync, "_capture_exception_safely", lambda _exc: None)
    monkeypatch.setattr(run_sync, "_close_db_session", lambda *_args, **_kwargs: None)

    asyncio.run(run_sync._run_source(_SlowScraper, max_pages=2, source_timeout_seconds=0.05))

    assert finalize_calls == [
        {
            "run_id": 8,
            "status": "FAILED",
            "listings_found": 42,
            "listings_new": 0,
            "error_message": "Source timed out after 0.05s",
        }
    ]


def test_coerce_scrape_yield_reads_int_and_dict():
    assert run_sync._coerce_scrape_yield(17) == 17
    assert run_sync._coerce_scrape_yield({"inserted": 4}) == 4
    assert run_sync._coerce_scrape_yield({"upserted": 9}) == 9
    assert run_sync._coerce_scrape_yield(None) is None
    assert run_sync._listings_found_from_scrape({"inserted": 0}, listings_after=86017) == 0
    assert run_sync._listings_found_from_scrape(None, listings_after=86017) == 86017


def test_run_source_uses_scraper_yield_not_inventory_total(monkeypatch):
    class _YieldScraper:
        SOURCE = "dummy-yield"

        def __init__(self, _db):
            return None

        async def scrape(self, max_pages: int = 5):
            return {"inserted": 0}

    finalize_calls = []

    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())
    monkeypatch.setattr(run_sync, "_count_source_listings_safe", lambda _source: 86017)
    monkeypatch.setattr(run_sync, "_start_scrape_run", lambda _db, _source: type("R", (), {"id": 9})())
    monkeypatch.setattr(
        run_sync,
        "_finalize_scrape_run_safe",
        lambda run_id, **kwargs: finalize_calls.append({"run_id": run_id, **kwargs}),
    )
    monkeypatch.setattr(run_sync, "_close_db_session", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(run_sync, "_take_checkpoint_safe", lambda _source: None)

    asyncio.run(run_sync._run_source(_YieldScraper, max_pages=2, source_timeout_seconds=None))

    assert finalize_calls == [
        {
            "run_id": 9,
            "status": "SUCCESS",
            "listings_found": 0,
            "listings_new": 0,
        }
    ]


def test_ikman_playwright_upsert_helper_is_imported():
    assert ikman_module.upsert_listing is shared_upsert_listing


def test_run_sync_main_falls_back_for_non_positive_page_values_and_runs_sequentially(monkeypatch):
    calls = []
    in_flight = 0
    max_in_flight = 0

    async def fake_run_source(scraper_cls, max_pages: int, source_timeout_seconds: int):
        nonlocal in_flight, max_in_flight
        calls.append((scraper_cls.SOURCE, max_pages, source_timeout_seconds))
        in_flight += 1
        max_in_flight = max(max_in_flight, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1

    monkeypatch.setattr(run_sync, "_run_source", fake_run_source)
    monkeypatch.setattr(run_sync, "init_db", lambda: None)
    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())
    monkeypatch.setattr(run_sync, "_try_acquire_market_analysis_lock", lambda _db: False)
    monkeypatch.setattr(run_sync, "CarPriceAggregator", _DummyAggregator)
    monkeypatch.setenv("SCRAPE_PROFILE", "daily")
    monkeypatch.setenv("SCRAPE_MAX_PAGES", "12")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_IKMAN", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_RIYASEWANA", "-7")
    monkeypatch.setenv("SCRAPE_SOURCE_TIMEOUT_SECONDS", "45")

    asyncio.run(run_sync.main())

    call_map = {source: pages for source, pages, _timeout in calls}
    assert call_map == {
        "ikman": 12,
        "riyasewana": 12,
        "carshop": 12,
        "saleme": 12,
        "riyahub": 12,
        "dimo": 12,
    }
    assert all(timeout == 45 for _source, _pages, timeout in calls)
    assert max_in_flight == 1


def test_unified_all_profile_includes_new_scheduled_listing_sources():
    expected = {"carshop", "saleme", "riyahub", "dimo"}
    alt_expected = {"hitad", "cartivate"}

    assert expected <= set(run_sync.SOURCE_PROFILES["all"])
    assert expected <= set(run_sync.SOURCE_PROFILES["daily"])
    assert expected <= set(run_sync.SOURCE_PROFILES["alt"])
    assert expected <= set(run_sync.SOURCE_REGISTRY.keys())
    assert expected <= run_sync.ALT_SOURCES
    assert alt_expected <= set(run_sync.SOURCE_PROFILES["all"])
    assert alt_expected <= set(run_sync.SOURCE_PROFILES["alt"])
    assert alt_expected <= set(run_sync.SOURCE_REGISTRY.keys())
    assert alt_expected <= run_sync.ALT_SOURCES


def test_run_sync_can_skip_market_analysis_without_skipping_sources(monkeypatch):
    _reset_dummy_aggregator_counts()
    calls = []

    async def fake_run_source(scraper_cls, max_pages: int, source_timeout_seconds: int):
        calls.append((scraper_cls.SOURCE, max_pages, source_timeout_seconds))
        await asyncio.sleep(0)

    monkeypatch.setattr(run_sync, "_run_source", fake_run_source)
    monkeypatch.setattr(run_sync, "init_db", lambda: None)
    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())
    monkeypatch.setattr(run_sync, "_try_acquire_market_analysis_lock", lambda _db: True)
    monkeypatch.setattr(run_sync, "CarPriceAggregator", _DummyAggregator)
    monkeypatch.setattr(run_sync, "bulk_refresh_deal_scores", _dummy_bulk_refresh_deal_scores)
    monkeypatch.setenv("SCRAPE_PROFILE", "daily")
    monkeypatch.setenv("RUN_MARKET_ANALYSIS", "false")

    asyncio.run(run_sync.main())

    assert [source for source, _pages, _timeout in calls] == [
        "ikman",
        "riyasewana",
        "carshop",
        "saleme",
        "riyahub",
        "dimo",
    ]
    assert _DummyAggregator.init_count == 0
    assert _DummyAggregator.compute_count == 0
    assert _bulk_refresh_calls == []


def test_run_sync_can_run_market_analysis_without_sources(monkeypatch):
    _reset_dummy_aggregator_counts()
    calls = []
    cache_refresh_calls = []

    async def fake_run_source(scraper_cls, max_pages: int, source_timeout_seconds: int):
        calls.append((scraper_cls.SOURCE, max_pages, source_timeout_seconds))
        await asyncio.sleep(0)

    monkeypatch.setattr(run_sync, "_run_source", fake_run_source)
    monkeypatch.setattr(run_sync, "init_db", lambda: None)
    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())
    monkeypatch.setattr(run_sync, "_try_acquire_market_analysis_lock", lambda _db: True)
    monkeypatch.setattr(run_sync, "_release_market_analysis_lock", lambda _db: None)
    monkeypatch.setattr(run_sync, "CarPriceAggregator", _DummyAggregator)
    monkeypatch.setattr(run_sync, "bulk_refresh_deal_scores", _dummy_bulk_refresh_deal_scores)
    monkeypatch.setattr(
        run_sync,
        "refresh_stats_cache",
        lambda db: cache_refresh_calls.append(db),
    )
    monkeypatch.setenv("SCRAPE_PROFILE", "daily")
    monkeypatch.setenv("RUN_SCRAPERS", "false")
    monkeypatch.setenv("RUN_MARKET_ANALYSIS", "true")
    monkeypatch.setenv("RUN_MARKET_SIGNALS", "false")
    monkeypatch.delenv("RUN_STATS_CACHE_REFRESH", raising=False)

    asyncio.run(run_sync.main())

    assert calls == []
    assert _DummyAggregator.init_count == 1
    assert _DummyAggregator.compute_count == 1
    assert len(_bulk_refresh_calls) == 1
    assert len(cache_refresh_calls) == 1


def test_run_alt_sync_main_falls_back_for_non_positive_source_page_values(monkeypatch):
    calls = []

    async def fake_run_source(scraper_cls, max_pages: int, source_timeout_seconds: int):
        calls.append((scraper_cls.SOURCE, max_pages, source_timeout_seconds))
        await asyncio.sleep(0)

    monkeypatch.setattr(run_sync, "_run_source", fake_run_source)
    monkeypatch.setattr(run_sync, "init_db", lambda: None)
    monkeypatch.setattr(run_sync, "SessionLocal", lambda: _DummyDB())
    monkeypatch.setattr(run_sync, "_try_acquire_market_analysis_lock", lambda _db: False)
    monkeypatch.setattr(run_sync, "CarPriceAggregator", _DummyAggregator)
    monkeypatch.setenv("SCRAPE_MAX_PAGES", "9")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_ALT", "7")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_AUTOLANKA", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_PATPAT", "-1")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_AUTODIRECT", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_AUTO_LANKA_SITE", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_AUTOSTREAM", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_CARSHOP", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_SALEME", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_RIYAHUB", "0")
    monkeypatch.setenv("SCRAPE_MAX_PAGES_DIMO", "0")
    monkeypatch.setenv("SCRAPE_SOURCE_TIMEOUT_SECONDS", "60")

    asyncio.run(run_alt_sync.main())

    call_map = {source: pages for source, pages, _timeout in calls}
    assert call_map == {
        "autolanka": 7,
        "patpat": 7,
        "auto-lanka": 7,
        "autodirect": 7,
        "autostream": 7,
        "carshop": 7,
        "saleme": 7,
        "riyahub": 7,
        "dimo": 7,
        "hitad": 7,
        "cartivate": 7,
    }
    assert all(timeout == 60 for _source, _pages, timeout in calls)


def test_run_alt_sync_enabled_sources_prefers_exact_token(monkeypatch):
    monkeypatch.setenv("SCRAPE_ENABLED_SOURCES", "auto-lanka")

    enabled = run_alt_sync._resolve_enabled_sources(
        ("autolanka", "patpat", "auto-lanka", "autodirect", "autostream")
    )

    assert enabled == {"auto-lanka"}


def test_riyasewana_scraper_uses_async_playwright_api():
    source = Path(__file__).resolve().parents[1] / "app" / "scrapers" / "riyasewana.py"
    text = source.read_text(encoding="utf-8")

    assert "playwright.sync_api" not in text
    assert "async_playwright" in text


def test_autodirect_scraper_uses_direct_api_strategy():
    source = Path(__file__).resolve().parents[1] / "app" / "scrapers" / "autodirect.py"
    text = source.read_text(encoding="utf-8")

    assert "playwright.sync_api" not in text
    assert "api.autodirect.lk" in text


def test_ikman_scraper_uses_public_json_api_with_playwright_fallback():
    source = Path(__file__).resolve().parents[1] / "app" / "scrapers" / "ikman.py"
    text = source.read_text(encoding="utf-8")

    assert "api.ikman.lk" in text
    assert "CARS_CATEGORY_ID = 392" in text
    assert "VEHICLE_CATEGORY_IDS" in text
    assert "402" in text  # Motorbikes
    assert "911" in text  # Three Wheelers
    assert "393" not in text  # Auto Parts excluded
    assert "405" not in text  # Auto Services excluded
    assert "406" not in text  # Rentals excluded
    assert "_scrape_via_api" in text
    assert "_scrape_via_playwright" in text
    assert "IKMAN_SCRAPE_MODE" in text


def test_marketplace_scrapers_are_multi_vehicle():
    riyasewana = (
        Path(__file__).resolve().parents[1] / "app" / "scrapers" / "riyasewana.py"
    ).read_text(encoding="utf-8")
    patpat = (
        Path(__file__).resolve().parents[1] / "app" / "scrapers" / "patpat.py"
    ).read_text(encoding="utf-8")
    hitad = (
        Path(__file__).resolve().parents[1] / "app" / "scrapers" / "hitad.py"
    ).read_text(encoding="utf-8")

    assert "CATEGORY_PATHS" in riyasewana and "motorcycles" in riyasewana
    assert "CATEGORY_PATHS" in patpat and "threewheeler" in patpat
    assert "CATEGORY_KEYWORDS" in hitad and "motorbikes" in hitad


def test_riyasewana_detects_cloudflare_challenge_pages():
    challenge_soup = BeautifulSoup(
        """
        <html>
          <head><title>Attention Required! | Cloudflare</title></head>
          <body>Please verify you are human</body>
        </html>
        """,
        "lxml",
    )
    normal_soup = BeautifulSoup(
        """
        <html>
          <head><title>Cars for Sale on the Largest Car Marketplace in Sri Lanka</title></head>
          <body>Normal listing content</body>
        </html>
        """,
        "lxml",
    )

    assert RiyasewanaScraper._is_challenge_page(challenge_soup) is True
    assert RiyasewanaScraper._is_challenge_page(normal_soup) is False


def test_riyasewana_detects_cloudflare_hard_block_page():
    block_soup = BeautifulSoup(
        """
        <html>
          <head><title>Attention Required! | Cloudflare</title></head>
          <body>
            <h1>Sorry, you have been blocked</h1>
            <p>You are unable to access riyasewana.com</p>
            <p>Please enable cookies.</p>
          </body>
        </html>
        """,
        "lxml",
    )
    challenge_soup = BeautifulSoup(
        """
        <html>
          <head><title>Attention Required! | Cloudflare</title></head>
          <body>Please verify you are human</body>
        </html>
        """,
        "lxml",
    )
    normal_soup = BeautifulSoup(
        """
        <html>
          <head><title>Cars for Sale on the Largest Car Marketplace in Sri Lanka</title></head>
          <body>Normal listing content</body>
        </html>
        """,
        "lxml",
    )

    assert RiyasewanaScraper._is_hard_block_page(block_soup) is True
    assert RiyasewanaScraper._is_hard_block_page(challenge_soup) is False
    assert RiyasewanaScraper._is_hard_block_page(normal_soup) is False
    assert issubclass(RiyasewanaBlockedError, Exception)


def test_riyasewana_extract_cards_falls_back_to_buy_links():
    soup = BeautifulSoup(
        """
        <html>
          <body>
            <article class="result-card">
              <a href="/buy/toyota-prius-123">Toyota Prius 2017</a>
            </article>
          </body>
        </html>
        """,
        "lxml",
    )

    cards = RiyasewanaScraper._extract_cards(soup)

    assert len(cards) == 1
    assert cards[0].name == "article"


def test_autolanka_pagination_hint_detects_only_real_page_navigation():
    no_pagination_soup = BeautifulSoup(
        """
        <html>
          <body>
            <a href="/colombo/cars/toyota/prius/2017-toyota-prius-used-123.html">listing</a>
          </body>
        </html>
        """,
        "lxml",
    )
    pagination_soup = BeautifulSoup(
        """
        <html>
          <body>
            <a href="/cars/2/">2</a>
          </body>
        </html>
        """,
        "lxml",
    )

    assert AutoLankaScraper._has_pagination_hint(no_pagination_soup, current_page=1) is False
    assert AutoLankaScraper._has_pagination_hint(pagination_soup, current_page=1) is True


def test_ikman_detail_thumbnail_parser_extracts_real_image_from_meta():
    html = """
    <html>
      <head>
        <meta property="og:image" content="//img.ikman.lk/sample-car.jpg" />
      </head>
      <body></body>
    </html>
    """

    assert (
        IkmanCarScraper._extract_thumbnail_from_detail_html(html)
        == "https://img.ikman.lk/sample-car.jpg"
    )


def test_ikman_detail_thumbnail_parser_skips_placeholder_and_uses_json_ld():
    html = """
    <html>
      <head>
        <meta property="og:image" content="https://ikman.lk/assets/no-image.png" />
        <script type="application/ld+json">
          {"@type":"Product","image":["https://img.ikman.lk/car-1.jpg"]}
        </script>
      </head>
      <body></body>
    </html>
    """

    assert (
        IkmanCarScraper._extract_thumbnail_from_detail_html(html)
        == "https://img.ikman.lk/car-1.jpg"
    )


def test_patpat_scrape_raises_on_http_403(monkeypatch):
    class _Resp:
        status_code = 403
        text = "<html>blocked</html>"

        def raise_for_status(self):
            raise AssertionError("403 should raise PatpatBlockedError first")

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, timeout=30):
            return _Resp()

    monkeypatch.setattr("app.scrapers.patpat.httpx.AsyncClient", lambda **_kwargs: _Client())
    scraper = PatpatScraper(_DummyDB())
    scraper.CATEGORY_PATHS = ("car",)

    with pytest.raises(PatpatBlockedError, match="HTTP 403"):
        asyncio.run(scraper.scrape(max_pages=1))
