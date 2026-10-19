import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.scrapers.auto_lanka_site import AutoLankaSiteScraper
from app.scrapers.hitad import HitadScraper
from app.scrapers.ikman import IkmanCarScraper
from app.scrapers.page_budget import page_budget_for_category, secondary_page_budget
from app.scrapers.patpat import PatpatScraper
from app.scrapers.riyahub import RiyahubScraper
from app.scrapers.riyasewana import RiyasewanaScraper
from app.scrapers.saleme import SaleMeScraper


def test_secondary_page_budget_never_exceeds_max_pages():
    assert secondary_page_budget(1) == 1
    assert secondary_page_budget(8) == 8
    assert secondary_page_budget(40) == 40
    assert page_budget_for_category(is_primary=True, max_pages=40) == 40
    assert page_budget_for_category(is_primary=False, max_pages=40) == 40


def test_secondary_budget_does_not_impose_a_page_ceiling(monkeypatch):
    """A 120-page budget must reach far past the old hard-coded 25 ceiling."""
    assert secondary_page_budget(120) == 120
    assert secondary_page_budget(800) == 800

    monkeypatch.setenv("SCRAPE_SECONDARY_PAGE_CAP", "25")
    assert secondary_page_budget(800) == 25
    monkeypatch.delenv("SCRAPE_SECONDARY_PAGE_CAP")

    monkeypatch.setenv("SCRAPE_SECONDARY_PAGE_DIVISOR", "4")
    assert secondary_page_budget(800) == 200
    monkeypatch.delenv("SCRAPE_SECONDARY_PAGE_DIVISOR")

    # Junk must not silently shrink a crawl.
    monkeypatch.setenv("SCRAPE_SECONDARY_PAGE_CAP", "not-a-number")
    assert secondary_page_budget(800) == 800


def test_marketplace_scrapers_cover_non_car_vehicle_categories():
    assert "motorcycles" in RiyasewanaScraper.CATEGORY_PATHS
    assert "three-wheels" in RiyasewanaScraper.CATEGORY_PATHS
    assert "lorries" in RiyasewanaScraper.CATEGORY_PATHS

    assert "bike" in PatpatScraper.CATEGORY_PATHS
    assert "threewheeler" in PatpatScraper.CATEGORY_PATHS
    assert "truck" in PatpatScraper.CATEGORY_PATHS

    assert "motorbikes" in HitadScraper.CATEGORY_KEYWORDS
    assert "three-wheelers" in HitadScraper.CATEGORY_KEYWORDS
    assert "vehicles" not in HitadScraper.CATEGORY_KEYWORDS

    assert "Motorbikes" in AutoLankaSiteScraper.VEHICLE_TYPES
    assert "Three Wheelers" in AutoLankaSiteScraper.VEHICLE_TYPES

    assert any("motorcycles" in url for url in RiyahubScraper.START_URLS)
    assert any("three-wheels" in url for url in RiyahubScraper.START_URLS)
    assert any("vans" in url for url in RiyahubScraper.START_URLS)

    assert any("motorbikes" in url for url in SaleMeScraper.START_URLS)
    assert any("three-wheelers" in url for url in SaleMeScraper.START_URLS)
    assert any("vans" in url for url in SaleMeScraper.START_URLS)

    assert 402 in IkmanCarScraper.VEHICLE_CATEGORY_IDS
    assert 911 in IkmanCarScraper.VEHICLE_CATEGORY_IDS


def test_riyahub_page_urls_budget_per_category():
    urls = RiyahubScraper(db=None)._build_page_urls(max_pages=8)
    cars = [
        url
        for url in urls
        if url.rstrip("/").endswith("/vehicle/cars") or "/vehicle/cars/page/" in url
    ]
    bikes = [url for url in urls if "/vehicle/motorcycles" in url]
    assert len(cars) == 8  # primary full depth
    assert len(bikes) == 8  # secondary categories get the full budget too


def test_auto_lanka_page_url_indexing():
    assert AutoLankaSiteScraper._build_page_url("Cars", 1).endswith("page=2")
    assert AutoLankaSiteScraper._build_page_url("Trucks", 1).endswith("page=2")
    assert AutoLankaSiteScraper._build_page_url("Motorbikes", 1).endswith("page=1")
    assert "Three%20Wheelers" in AutoLankaSiteScraper._build_page_url("Three Wheelers", 1)
