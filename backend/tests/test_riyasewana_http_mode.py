"""Tests for the riyasewana scraper's fast plain-HTTP mode."""

import asyncio
from pathlib import Path

import pytest
from bs4 import BeautifulSoup
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.scrapers.riyasewana as riyasewana_module
from app.scrapers.riyasewana import RiyasewanaBlockedError, RiyasewanaScraper
from db.models import Base, CarListing

SERP_FIXTURE = (
    Path(__file__).parent / "fixtures" / "riyasewana_serp_http_snippet.html"
)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def scraper(db_session):
    return RiyasewanaScraper(db=db_session)


def _soup() -> BeautifulSoup:
    return BeautifulSoup(SERP_FIXTURE.read_text(encoding="utf-8"), "lxml")


def test_process_cards_upserts_listings(db_session, scraper):
    soup = _soup()
    cards = scraper._extract_cards(soup)
    assert len(cards) == 3

    seen: set[str] = set()
    new_on_page = scraper._process_cards(cards, "cars", 1, seen)

    assert new_on_page == 3
    rows = db_session.query(CarListing).filter(CarListing.source == "riyasewana").all()
    assert len(rows) == 3

    yaris = next(r for r in rows if "yaris" in r.title.lower())
    assert yaris.price_lkr == 10_650_000
    assert yaris.make == "Toyota"
    assert yaris.year == 2026
    assert yaris.district == "Kadawatha"
    assert yaris.url.startswith("https://riyasewana.com/buy/")
    assert yaris.thumbnail_url.startswith("https://riyasewana.com/thumb/")


def test_process_cards_dedupes_within_run(scraper, db_session):
    soup = _soup()
    cards = scraper._extract_cards(soup)

    seen: set[str] = set()
    first = scraper._process_cards(cards, "cars", 1, seen)
    second = scraper._process_cards(cards, "cars", 1, seen)

    assert first == 3
    assert second == 0
    rows = db_session.query(CarListing).filter(CarListing.source == "riyasewana").all()
    assert len(rows) == 3


def test_flat_budget_gives_full_budget_to_all_categories(scraper, monkeypatch):
    monkeypatch.setattr(riyasewana_module, "_FLAT_BUDGET_ENABLED", True)
    assert scraper._page_budget_for_category("cars", 800) == 800
    assert scraper._page_budget_for_category("motorcycles", 800) == 800
    assert scraper._page_budget_for_category("vans", 800) == 800


def test_default_budget_lets_secondary_categories_use_the_full_budget(scraper, monkeypatch):
    monkeypatch.setattr(riyasewana_module, "_FLAT_BUDGET_ENABLED", False)
    assert scraper._page_budget_for_category("cars", 800) == 800
    # No artificial ceiling: a secondary category may use the whole budget
    # unless the operator asks for rationing via SCRAPE_SECONDARY_PAGE_*.
    assert scraper._page_budget_for_category("motorcycles", 800) == 800
    assert scraper._page_budget_for_category("vans", 800) == 800


def test_secondary_rationing_is_still_available_for_secondary_categories(scraper, monkeypatch):
    monkeypatch.setattr(riyasewana_module, "_FLAT_BUDGET_ENABLED", False)
    monkeypatch.setenv("SCRAPE_SECONDARY_PAGE_DIVISOR", "4")
    monkeypatch.setenv("SCRAPE_SECONDARY_PAGE_CAP", "25")
    assert scraper._page_budget_for_category("cars", 800) == 800
    assert scraper._page_budget_for_category("motorcycles", 800) == 25
    assert scraper._page_budget_for_category("vans", 800) == 25


def test_parse_pagination_honors_serp_last_page(scraper):
    soup = _soup()
    has_next, max_page_hint = scraper._parse_pagination(soup, 1)
    assert max_page_hint == 534
    assert has_next is False  # riyasewana renders the arrow, not the word "next"


def test_http_fetch_page_raises_blocked_on_403(scraper):
    class _FakeClient:
        async def get(self, url):
            return type("R", (), {"status_code": 403, "text": "<html>blocked</html>"})()

    async def _run():
        with pytest.raises(RiyasewanaBlockedError, match="HTTP 403"):
            await scraper._http_fetch_page(
                _FakeClient(), "https://riyasewana.com/search/cars", 1
            )

    asyncio.run(_run())


def test_http_fetch_page_raises_on_hard_block(scraper):
    class _FakeClient:
        def __init__(self):
            self.response = type(
                "R",
                (),
                {
                    "status_code": 200,
                    "text": (
                        "<html><head><title>Attention Required! | Cloudflare</title></head>"
                        "<body>Sorry, you have been blocked</body></html>"
                    ),
                },
            )()

        async def get(self, url):
            return self.response

    async def _run():
        with pytest.raises(RiyasewanaBlockedError):
            await scraper._http_fetch_page(_FakeClient(), "https://riyasewana.com/search/cars", 1)

    asyncio.run(_run())


def test_http_fetch_page_returns_soup_on_success(scraper):
    class _FakeClient:
        async def get(self, url):
            return type(
                "R",
                (),
                {"status_code": 200, "text": SERP_FIXTURE.read_text(encoding="utf-8")},
            )()

    async def _run():
        soup = await scraper._http_fetch_page(_FakeClient(), "https://riyasewana.com/search/cars", 1)
        assert len(soup.select("li.v-card")) == 3

    asyncio.run(_run())


def test_scrape_auto_uses_http_and_falls_back_to_playwright(scraper, monkeypatch, db_session):
    """auto mode: http first; RiyasewanaBlockedError from http routes to Playwright."""
    monkeypatch.setattr(riyasewana_module, "_DEFAULT_SCRAPE_MODE", "auto")
    calls = {"http": 0, "playwright": 0}

    async def fake_http(max_pages: int = 5, *, mode: str = "auto"):
        calls["http"] += 1
        raise RiyasewanaBlockedError("http blocked")

    async def fake_playwright(max_pages: int = 5):
        calls["playwright"] += 1
        return {"status": "ok"}

    monkeypatch.setattr(scraper, "_scrape_via_http", fake_http)
    monkeypatch.setattr(scraper, "_scrape_live", fake_playwright)

    result = asyncio.run(scraper.scrape(max_pages=5))
    assert calls == {"http": 1, "playwright": 1}
    assert result == {"status": "ok"}


def test_scrape_auto_rate_limit_falls_back_to_playwright(scraper, monkeypatch):
    """auto mode: sustained HTTP errors (rate limit) raise a block so Playwright takes over."""
    monkeypatch.setattr(riyasewana_module, "_DEFAULT_SCRAPE_MODE", "auto")
    calls = {"playwright": 0}

    class _FakeClient:
        async def get(self, url):
            return type("R", (), {"status_code": 403, "text": "<html></html>"})()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

    async def fake_playwright(max_pages: int = 5):
        calls["playwright"] += 1
        return {"status": "ok"}

    monkeypatch.setattr(
        riyasewana_module,
        "CurlCffiAsyncSession",
        lambda **kwargs: _FakeClient(),
    )
    monkeypatch.setattr(scraper, "_scrape_live", fake_playwright)
    monkeypatch.setattr(scraper, "CATEGORY_PATHS", ("cars",))

    result = asyncio.run(scraper.scrape(max_pages=30))
    assert calls["playwright"] == 1
    assert result == {"status": "ok"}


def test_scrape_http_mode_routes_to_archive_on_block(scraper, monkeypatch):
    monkeypatch.setattr(riyasewana_module, "_DEFAULT_SCRAPE_MODE", "http")
    monkeypatch.setattr(riyasewana_module, "_archive_fallback_enabled", lambda: True)

    async def fake_http(max_pages: int = 5, *, mode: str = "auto"):
        raise RiyasewanaBlockedError("http blocked")

    def fake_fallback(max_pages: int = 5):
        return {
            "snapshot": "https://web.archive.org/web/0id_/http://riyasewana.com/search/cars",
            "inserted": 4,
        }

    monkeypatch.setattr(scraper, "_scrape_via_http", fake_http)
    monkeypatch.setattr(scraper, "_run_archive_fallback", fake_fallback)

    result = asyncio.run(scraper.scrape(max_pages=3))
    assert result["inserted"] == 4
    assert result["snapshot"].startswith("https://web.archive.org/")


def test_scrape_http_mode_raises_when_archive_inserts_nothing(scraper, monkeypatch):
    monkeypatch.setattr(riyasewana_module, "_DEFAULT_SCRAPE_MODE", "http")
    monkeypatch.setattr(riyasewana_module, "_archive_fallback_enabled", lambda: True)

    async def fake_http(max_pages: int = 5, *, mode: str = "auto"):
        raise RiyasewanaBlockedError("http blocked")

    def fake_fallback(max_pages: int = 5):
        return {
            "snapshot": "https://web.archive.org/web/0id_/http://riyasewana.com/search/cars",
            "inserted": 0,
        }

    monkeypatch.setattr(scraper, "_scrape_via_http", fake_http)
    monkeypatch.setattr(scraper, "_run_archive_fallback", fake_fallback)

    with pytest.raises(RiyasewanaBlockedError, match="archive fallback inserted 0"):
        asyncio.run(scraper.scrape(max_pages=3))


def test_scrape_playwright_mode_skips_http(scraper, monkeypatch):
    monkeypatch.setattr(riyasewana_module, "_DEFAULT_SCRAPE_MODE", "playwright")
    calls = {"http": 0, "playwright": 0}

    async def fake_http(max_pages: int = 5, *, mode: str = "auto"):
        calls["http"] += 1

    async def fake_playwright(max_pages: int = 5):
        calls["playwright"] += 1

    monkeypatch.setattr(scraper, "_scrape_via_http", fake_http)
    monkeypatch.setattr(scraper, "_scrape_live", fake_playwright)

    asyncio.run(scraper.scrape(max_pages=5))
    assert calls == {"http": 0, "playwright": 1}
