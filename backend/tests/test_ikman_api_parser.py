import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.scrapers.ikman import IkmanCarScraper


def test_ikman_builds_payload_from_api_serp_ad():
    row = {
        "id": "6a4bb08e8d7d9da79f91e502",
        "slug": "honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63",
        "title": "Honda Vezel Z PLAY MOON ROOF 2026",
        "url": "http://ikman.lk/en/ad/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63",
        "money": {"label": "Price", "amount": "Rs 19,278,000"},
        "details": ["20 km", "SUV / 4x4", "Import"],
        "area": {"id": 1506, "name": "Colombo"},
        "location": {"id": 2151, "name": "Kohuwala"},
        "images": {
            "ids": ["ff1ac77f-bd5a-4281-9791-ba3226d9605a"],
            "base_uri": "https://i.ikman-st.com",
        },
        "properties": [
            {"key": "model_year", "value": "2026"},
        ],
    }

    payload = IkmanCarScraper(db=None)._build_payload_from_api_ad(row)

    assert payload is not None
    assert payload["source"] == "ikman"
    assert payload["make"] == "Honda"
    assert payload["model"] == "Vezel"
    assert payload["year"] == 2026
    assert payload["price_lkr"] == 19_278_000
    assert payload["district"] == "Colombo"
    assert payload["city"] == "Kohuwala"
    assert payload["mileage"] == 20
    assert payload["url"] == (
        "https://ikman.lk/en/ad/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63"
    )
    assert payload["source_id"] == (
        "/en/ad/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63"
    )
    assert "ff1ac77f-bd5a-4281-9791-ba3226d9605a" in (payload.get("thumbnail_url") or "")


def test_ikman_prefers_structured_brand_model_from_api_properties():
    row = {
        "slug": "volkswagen-polo-r-line-2020-for-sale-colombo-8",
        "title": "Polo R-Line 2020",
        "url": "https://ikman.lk/en/ad/volkswagen-polo-r-line-2020-for-sale-colombo-8",
        "money": {"amount": "Rs 9,190,000"},
        "details": ["69,000 km", "Hatchback", "Used"],
        "area": {"name": "Colombo"},
        "location": {"name": "Colombo 10"},
        "properties": [
            {"key": "brand", "value": "Volkswagen"},
            {"key": "model", "value": "Polo"},
            {"key": "model_year", "value": "2020"},
            {"key": "condition", "value": "Used"},
            {"key": "transmission", "value": "Automatic"},
            {"key": "body", "value": "Hatchback"},
            {"key": "fuel_type", "value": "Petrol"},
            {"key": "engine_capacity", "value": "1,000 cc"},
            {"key": "mileage", "value": "69,000 km"},
        ],
    }

    payload = IkmanCarScraper(db=None)._build_payload_from_api_ad(row)

    assert payload is not None
    assert payload["make"] == "Volkswagen"
    assert payload["model"] == "Polo"
    assert payload["year"] == 2020
    assert payload["mileage"] == 69_000
    assert payload["engine_capacity"] == 1000
    assert payload["fuel_type"] == "petrol"
    assert payload["transmission"] == "automatic"
    assert payload["body_type"] == "hatchback"
    assert payload["condition"] == "used"


def test_ikman_api_rejects_missing_price():
    row = {
        "slug": "toyota-aqua-for-sale-kandy",
        "title": "Toyota Aqua 2018",
        "url": "https://ikman.lk/en/ad/toyota-aqua-for-sale-kandy",
        "money": {"amount": "Negotiable"},
        "area": {"name": "Kandy"},
        "location": {"name": "Kandy"},
        "details": [],
        "properties": [],
    }

    assert IkmanCarScraper(db=None)._build_payload_from_api_ad(row) is None


def test_ikman_scrape_defaults_to_api_mode_auto(monkeypatch):
    calls: list[str] = []

    async def fake_api(self, max_pages: int = 5, *, start_page: int = 1):
        calls.append(f"api:{max_pages}:{start_page}")
        return 3

    async def fake_playwright(self, max_pages: int = 5):
        calls.append(f"playwright:{max_pages}")

    monkeypatch.delenv("IKMAN_SCRAPE_MODE", raising=False)
    monkeypatch.setattr(IkmanCarScraper, "_scrape_via_api", fake_api)
    monkeypatch.setattr(IkmanCarScraper, "_scrape_via_playwright", fake_playwright)

    import asyncio

    asyncio.run(IkmanCarScraper(db=None).scrape(max_pages=2))
    assert calls == ["api:2:1"]


def test_ikman_api_start_page_can_resume_older_results(monkeypatch):
    calls: list[tuple[int, int]] = []

    async def fake_api(self, max_pages: int = 5, *, start_page: int = 1):
        calls.append((max_pages, start_page))
        return 1

    monkeypatch.setenv("IKMAN_SCRAPE_MODE", "api")
    monkeypatch.setenv("IKMAN_START_PAGE", "201")
    monkeypatch.setattr(IkmanCarScraper, "_scrape_via_api", fake_api)

    import asyncio

    asyncio.run(IkmanCarScraper(db=None).scrape(max_pages=200))
    assert calls == [(200, 201)]


def test_ikman_vehicle_categories_cover_all_for_sale_leaves():
    ids = set(IkmanCarScraper.VEHICLE_CATEGORY_IDS)
    assert IkmanCarScraper.CARS_CATEGORY_ID in ids
    # Core non-car vehicle leaves
    assert {402, 911, 424, 425, 426, 918, 919, 603, 925}.issubset(ids)
    # Parent vehicles + parts/services/rentals must stay out
    assert 391 not in ids
    assert not ids.intersection({393, 394, 405, 406})


def test_ikman_page_budget_keeps_full_depth_for_cars():
    assert IkmanCarScraper._page_budget_for_category(392, 40) == 40
    assert IkmanCarScraper._page_budget_for_category(402, 40) == 40
    assert IkmanCarScraper._page_budget_for_category(911, 8) == 8
    assert IkmanCarScraper._page_budget_for_category(402, 1) == 1


def test_ikman_parses_motorcycle_engine_cc():
    assert IkmanCarScraper._parse_engine_cc("125 cc") == 125
    assert IkmanCarScraper._parse_engine_cc("1,000 cc") == 1000
