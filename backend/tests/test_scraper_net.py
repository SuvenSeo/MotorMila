"""Honest-crawling policy: one bot UA, no proxies/rotation/stealth, robots + throttle."""
from __future__ import annotations

import asyncio
import time
from pathlib import Path

import httpx
import pytest

from app.scrapers import net, polite


def test_bot_user_agent_is_honest_and_has_contact(monkeypatch):
    monkeypatch.setenv("BOT_CONTACT", "bot@example.lk")
    ua = polite.bot_user_agent()
    assert ua.startswith("MotorMilaBot/1.0 (+https://motormila.vercel.app/bot")
    assert "bot@example.lk" in ua
    assert "Mozilla" not in ua and "Chrome" not in ua


def test_legacy_evasion_env_vars_are_ignored(monkeypatch):
    monkeypatch.setenv("SCRAPE_PROXY_URL", "http://single.proxy:8080")
    monkeypatch.setenv("SCRAPE_PROXIES", "http://p1:1,http://p2:2")
    monkeypatch.setenv("SCRAPE_ROTATE_UA", "1")
    monkeypatch.setenv("SCRAPE_STEALTH", "1")
    assert net.get_proxy() is None
    assert net.playwright_launch_proxy() is None
    assert net.stealth_init_script() is None
    assert net.random_user_agent("Mozilla/5.0 Chrome") == polite.bot_user_agent()
    kwargs = net.httpx_client_kwargs({"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    assert "proxy" not in kwargs
    assert kwargs["headers"]["User-Agent"] == polite.bot_user_agent()
    assert kwargs["headers"]["Accept"] == "text/html"
    assert isinstance(kwargs["transport"], polite.PoliteAsyncTransport)
    assert net.playwright_context_kwargs("X")["user_agent"] == polite.bot_user_agent()


def test_no_impersonation_or_internal_api_left_in_scrapers():
    root = Path(__file__).resolve().parents[1] / "app" / "scrapers"
    for path in root.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "curl_cffi" not in text, path.name
        assert 'impersonate="chrome"' not in text, path.name
        assert "navigator, 'webdriver'" not in text, path.name
        assert "AutomationControlled" not in text, path.name
    ikman = (root / "ikman.py").read_text(encoding="utf-8")
    assert "https://api.ikman.lk" not in ikman
    assert "sort=" not in ikman.split("BASE_URL_TEMPLATE =", 1)[1].split("\n", 1)[0]


# --- robots.txt --------------------------------------------------------------

IKMAN_LIKE_ROBOTS = """
User-Agent: *
Disallow: /*?*sort=*
Disallow: /*?*query=*
Allow: /

User-Agent: CCBot
Disallow: /
"""


def _robots(status: int, text: str) -> polite.RobotsCache:
    return polite.RobotsCache(ttl_seconds=60, fetcher=lambda url: (status, text))


def test_robots_disallows_sort_urls(monkeypatch):
    monkeypatch.setenv("SCRAPE_ROBOTS_ENFORCED", "1")
    cache = _robots(200, IKMAN_LIKE_ROBOTS)
    assert not cache.allowed("https://ikman.lk/en/ads/sri-lanka/cars?sort=date&order=desc&page=1")
    assert not cache.allowed("https://ikman.lk/en/ads/sri-lanka/cars?page=1&query=vitz")
    assert cache.allowed("https://ikman.lk/en/ads/sri-lanka/cars?page=2")
    assert not cache.allowed("https://ikman.lk/en/ads", "CCBot/2.0")
    assert cache.allowed("https://ikman.lk/en/ads/sri-lanka/cars")


def test_robots_disallow_all_on_403_challenge_and_network_error(monkeypatch):
    monkeypatch.setenv("SCRAPE_ROBOTS_ENFORCED", "1")
    assert not _robots(403, "").allowed("https://riyasewana.com/search/cars")
    assert not _robots(503, "").allowed("https://riyasewana.com/search/cars")
    assert not _robots(0, "").allowed("https://riyasewana.com/search/cars")
    challenge = "<html><title>Attention Required! | Cloudflare</title></html>"
    assert not _robots(200, challenge).allowed("https://riyasewana.com/search/cars")


def test_robots_404_means_allow(monkeypatch):
    monkeypatch.setenv("SCRAPE_ROBOTS_ENFORCED", "1")
    assert _robots(404, "").allowed("https://example.lk/anything")


def test_robots_specific_disallow(monkeypatch):
    monkeypatch.setenv("SCRAPE_ROBOTS_ENFORCED", "1")
    cache = _robots(200, "User-agent: *\nDisallow: /get-phone.php\nAllow: /\n")
    assert not cache.allowed("https://riyasewana.com/get-phone.php?id=1")
    assert cache.allowed("https://riyasewana.com/search/cars")


def test_robots_cache_fetches_once_per_origin(monkeypatch):
    monkeypatch.setenv("SCRAPE_ROBOTS_ENFORCED", "1")
    calls: list[str] = []

    def fetch(url):
        calls.append(url)
        return 200, "User-agent: *\nAllow: /\n"

    cache = polite.RobotsCache(ttl_seconds=60, fetcher=fetch)
    for i in range(5):
        cache.allowed(f"https://hitad.lk/page/{i}")
    cache.allowed("https://saleme.lk/x")
    assert calls == ["https://hitad.lk/robots.txt", "https://saleme.lk/robots.txt"]


def test_transport_raises_on_disallowed_url(monkeypatch):
    monkeypatch.setenv("SCRAPE_ROBOTS_ENFORCED", "1")
    monkeypatch.setattr(polite, "ROBOTS", _robots(200, "User-agent: *\nDisallow: /private\n"))
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["User-Agent"])
        return httpx.Response(200, text="ok")

    async def run():
        transport = polite.PoliteAsyncTransport(inner=httpx.MockTransport(handler))
        async with httpx.AsyncClient(transport=transport, headers={"User-Agent": "Mozilla"}) as client:
            ok = await client.get("https://example.lk/public")
            assert ok.status_code == 200
            with pytest.raises(polite.RobotsDisallowedError):
                await client.get("https://example.lk/private/1")

    asyncio.run(run())
    assert seen == [polite.bot_user_agent()]


def test_transport_spaces_requests_per_host(monkeypatch):
    monkeypatch.setenv("SCRAPE_HOST_DELAY_MIN", "0.2")
    monkeypatch.setenv("SCRAPE_HOST_DELAY_MAX", "0.2")
    stamps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        stamps.append(time.monotonic())
        return httpx.Response(200, text="ok")

    async def run():
        transport = polite.PoliteAsyncTransport(inner=httpx.MockTransport(handler))
        async with httpx.AsyncClient(transport=transport) as client:
            await asyncio.gather(*(client.get(f"https://one.lk/{i}") for i in range(3)))

    asyncio.run(run())
    assert len(stamps) == 3
    gaps = [b - a for a, b in zip(stamps, stamps[1:])]
    assert all(gap >= 0.18 for gap in gaps), gaps


def test_default_host_delay_is_at_least_two_seconds(monkeypatch):
    monkeypatch.delenv("SCRAPE_HOST_DELAY_MIN", raising=False)
    monkeypatch.delenv("SCRAPE_HOST_DELAY_MAX", raising=False)
    lo, hi = polite.host_delay_bounds()
    assert lo >= 2.0 and hi >= lo


# --- source flags ------------------------------------------------------------


def test_ikman_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SOURCES_ENABLED", raising=False)
    monkeypatch.delenv("SOURCES_DISABLED", raising=False)
    assert not polite.source_enabled("ikman")
    assert polite.source_enabled("riyasewana")


def test_sources_enabled_allow_list_and_disabled_wins(monkeypatch):
    monkeypatch.setenv("SOURCES_ENABLED", "ikman,hitad")
    monkeypatch.setenv("SOURCES_DISABLED", "hitad")
    assert polite.source_enabled("ikman")
    assert not polite.source_enabled("hitad")
    assert not polite.source_enabled("riyasewana")
