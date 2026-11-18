"""Unit tests for vehicle/policy news feed caching and RSS fallback (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services import vehicle_news


class _MockResponse:
    def __init__(self, *, status_code: int = 200, json_data=None, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._json_data


class _MockClient:
    def __init__(self, routes: dict[str, _MockResponse]):
        self.routes = routes
        self.calls: list[str] = []

    def get(self, url: str, **kwargs):
        self.calls.append(url)
        return self.routes.get(url, _MockResponse(status_code=404))


_SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>EconomyNext</title>
    <item>
      <title>Sri Lanka customs vehicle import tax update</title>
      <link>https://economynext.com/vehicle-tax/</link>
      <guid>econ-1</guid>
      <description>Customs duty and vehicle import rules</description>
    </item>
    <item>
      <title>Weather outlook remains fair</title>
      <link>https://economynext.com/weather/</link>
      <guid>econ-2</guid>
      <description>No policy impact</description>
    </item>
  </channel>
</rss>
"""


@pytest.fixture(autouse=True)
def _reset():
    vehicle_news._reset_news_cache()
    yield
    vehicle_news._reset_news_cache()


def test_esana_429_falls_back_to_rss_and_caches():
    client = _MockClient(
        {
            vehicle_news.ESANA_RECENT_URL: _MockResponse(status_code=429),
            "https://economynext.com/feed/": _MockResponse(status_code=200, text=_SAMPLE_RSS),
            "https://www.adaderana.lk/rss.php": _MockResponse(status_code=200, text=""),
        }
    )
    items = vehicle_news.fetch_vehicle_policy_news(limit=5, client=client, now=1000.0)
    assert len(items) == 1
    assert items[0]["source"] == "economynext"
    assert "vehicle import tax" in items[0]["title"]
    assert items[0]["url"] == "https://economynext.com/vehicle-tax/"

    calls_after_first = len(client.calls)
    cached = vehicle_news.fetch_vehicle_policy_news(limit=5, client=client, now=1200.0)
    assert cached == items
    assert len(client.calls) == calls_after_first


def test_stale_cache_served_when_all_upstreams_later_fail():
    ok_client = _MockClient(
        {
            vehicle_news.ESANA_RECENT_URL: _MockResponse(
                status_code=200,
                json_data=[{"id": "1", "title_en": "Fuel price adjustment announced"}],
            ),
        }
    )
    items = vehicle_news.fetch_vehicle_policy_news(limit=5, client=ok_client, now=1000.0)
    assert len(items) == 1
    assert items[0]["source"] == "helakuru_esana"

    broken_client = _MockClient(
        {
            vehicle_news.ESANA_RECENT_URL: _MockResponse(status_code=503),
            "https://economynext.com/feed/": _MockResponse(status_code=503),
            "https://www.adaderana.lk/rss.php": _MockResponse(status_code=503),
        }
    )
    stale = vehicle_news.fetch_vehicle_policy_news(limit=5, client=broken_client, now=5000.0)
    assert stale == items
