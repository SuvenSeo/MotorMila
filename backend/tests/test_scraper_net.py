from __future__ import annotations

from app.scrapers import net


def _clear_scraper_env(monkeypatch) -> None:
    for env_name in (
        "SCRAPE_PROXY_URL",
        "SCRAPE_PROXIES",
        "SCRAPE_ROTATE_UA",
        "SCRAPE_ROTATE_VIEWPORT",
        "SCRAPE_STEALTH",
    ):
        monkeypatch.delenv(env_name, raising=False)


def test_net_defaults_are_noop(monkeypatch):
    _clear_scraper_env(monkeypatch)
    monkeypatch.setattr(net, "_PROXY_INDEX", 0)

    default_headers = {
        "User-Agent": "Static-UA",
        "Accept": "application/json",
    }

    assert net.get_proxy() is None
    assert net.random_user_agent("Static-UA") == "Static-UA"
    assert net.random_viewport() == {"width": 1920, "height": 1080}
    assert net.playwright_launch_proxy() is None
    assert net.playwright_context_kwargs("Static-UA") == {
        "user_agent": "Static-UA",
        "viewport": {"width": 1920, "height": 1080},
    }
    assert net.stealth_init_script() is None

    kwargs = net.httpx_client_kwargs(default_headers)
    assert kwargs == {"headers": default_headers}
    assert kwargs["headers"] is not default_headers


def test_get_proxy_prefers_single_proxy_env(monkeypatch):
    _clear_scraper_env(monkeypatch)
    monkeypatch.setenv("SCRAPE_PROXY_URL", "http://single.proxy:8080")
    monkeypatch.setenv("SCRAPE_PROXIES", "http://pool-1:8080,http://pool-2:8080")

    assert net.get_proxy() == "http://single.proxy:8080"


def test_get_proxy_rotates_through_proxy_pool(monkeypatch):
    _clear_scraper_env(monkeypatch)
    monkeypatch.setenv("SCRAPE_PROXIES", "http://pool-1:8080,http://pool-2:8080")
    monkeypatch.setattr(net, "_PROXY_INDEX", 0)

    selected = [net.get_proxy() for _ in range(5)]

    assert selected == [
        "http://pool-1:8080",
        "http://pool-2:8080",
        "http://pool-1:8080",
        "http://pool-2:8080",
        "http://pool-1:8080",
    ]


def test_random_user_agent_rotates_from_pool_when_enabled(monkeypatch):
    _clear_scraper_env(monkeypatch)
    monkeypatch.setenv("SCRAPE_ROTATE_UA", "true")

    rotated = net.random_user_agent("Static-UA")

    assert rotated in net.USER_AGENT_POOL


def test_httpx_client_kwargs_includes_proxy_and_rotated_user_agent(monkeypatch):
    _clear_scraper_env(monkeypatch)
    monkeypatch.setenv("SCRAPE_PROXY_URL", "http://single.proxy:8080")
    monkeypatch.setenv("SCRAPE_ROTATE_UA", "1")
    monkeypatch.setattr(net.random, "choice", lambda choices: choices[0])

    kwargs = net.httpx_client_kwargs(
        {
            "User-Agent": "Static-UA",
            "Accept": "application/json",
        }
    )

    assert kwargs["proxy"] == "http://single.proxy:8080"
    assert kwargs["headers"]["User-Agent"] == net.USER_AGENT_POOL[0]
    assert kwargs["headers"]["Accept"] == "application/json"


def test_stealth_script_is_config_gated(monkeypatch):
    _clear_scraper_env(monkeypatch)
    monkeypatch.setenv("SCRAPE_STEALTH", "yes")

    script = net.stealth_init_script()

    assert script is not None
    assert "navigator" in script
    assert "webdriver" in script
