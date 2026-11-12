from __future__ import annotations

import os
import random
import threading

DEFAULT_VIEWPORT = {"width": 1920, "height": 1080}
USER_AGENT_POOL = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
)
VIEWPORT_POOL = (
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1600, "height": 900},
)
_TRUTHY_VALUES = {"1", "true", "yes", "on"}
_PROXY_INDEX = 0
_PROXY_LOCK = threading.Lock()


def _env_truthy(name: str) -> bool:
    return str(os.getenv(name, "")).strip().lower() in _TRUTHY_VALUES


def _parse_proxy_pool() -> list[str]:
    raw = str(os.getenv("SCRAPE_PROXIES", "")).strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def get_proxy() -> str | None:
    single_proxy = str(os.getenv("SCRAPE_PROXY_URL", "")).strip()
    if single_proxy:
        return single_proxy

    proxy_pool = _parse_proxy_pool()
    if not proxy_pool:
        return None

    if len(proxy_pool) == 1:
        return proxy_pool[0]

    global _PROXY_INDEX
    with _PROXY_LOCK:
        proxy = proxy_pool[_PROXY_INDEX % len(proxy_pool)]
        _PROXY_INDEX += 1
    return proxy


def random_user_agent(default: str) -> str:
    if not _env_truthy("SCRAPE_ROTATE_UA"):
        return default
    return random.choice(USER_AGENT_POOL)


def random_viewport() -> dict:
    if not (_env_truthy("SCRAPE_ROTATE_UA") or _env_truthy("SCRAPE_ROTATE_VIEWPORT")):
        return dict(DEFAULT_VIEWPORT)
    return dict(random.choice(VIEWPORT_POOL))


def httpx_client_kwargs(default_headers: dict) -> dict:
    headers = dict(default_headers or {})
    default_ua = str(headers.get("User-Agent") or "")
    headers["User-Agent"] = random_user_agent(default_ua)

    kwargs: dict = {"headers": headers}
    proxy = get_proxy()
    if proxy:
        # httpx>=0.28 uses singular "proxy" argument for AsyncClient.
        kwargs["proxy"] = proxy
    return kwargs


def playwright_context_kwargs(default_ua: str) -> dict:
    return {
        "user_agent": random_user_agent(default_ua),
        "viewport": random_viewport(),
    }


def playwright_launch_proxy() -> dict | None:
    proxy = get_proxy()
    if not proxy:
        return None
    return {"server": proxy}


def stealth_init_script() -> str | None:
    if not _env_truthy("SCRAPE_STEALTH"):
        return None
    return """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'platform', { get: () => navigator.platform || 'Win32' });
window.chrome = window.chrome || { runtime: {} };
"""

# Status codes that mean "a bot wall answered", not "the page is missing".
# 405 is included because patpat.lk answers GETs with 405 + a
# "Human Verification" interstitial instead of a 403.
BLOCKED_STATUS_CODES = frozenset({401, 403, 405, 406, 429})
_BLOCK_TITLE_MARKERS = (
    "just a moment",
    "attention required",
    "checking your browser",
    "human verification",
    "verify you are human",
    "are you a robot",
    "security check",
    "access denied",
    "enable javascript and cookies",
    "ddos protection",
)


def blocked_response_reason(
    status_code: int | None,
    text: str = "",
    headers: dict | None = None,
) -> str | None:
    """Return why a response looks like a bot wall, or ``None`` when it is real content.

    Sources behind Cloudflare / DataDome answer with a 200 or 403 plus an HTML
    challenge page. Parsing that challenge yields zero listings but the scraper
    happily keeps paginating until its whole wall-clock budget is gone, so a
    single blocked source used to eat ~10 minutes per run and still report
    nothing. Scrapers call this to abort the source immediately instead.

    Only the challenge markers are trusted for 2xx/5xx responses; a bare
    ``status_code >= 400`` is *not* enough because some sources 404 on pages
    past the end of their catalogue and that must stay non-fatal.
    """
    try:
        code = int(status_code or 0)
    except (TypeError, ValueError):
        code = 0

    body = str(text or "")
    lowered = body.lower()

    # Cloudflare advertises the block via a header even on a 200 challenge page.
    try:
        header_map = {str(k).lower(): str(v).lower() for k, v in (headers or {}).items()}
    except Exception:  # noqa: BLE001 - header shapes vary by client
        header_map = {}
    if header_map.get("cf-mitigated") == "challenge":
        return f"bot_wall:cf_mitigated:{code}"

    title = ""
    marker_index = lowered.find("<title")
    if marker_index != -1:
        close = lowered.find("</title>", marker_index)
        if close != -1:
            title = lowered[marker_index:close]

    for marker in _BLOCK_TITLE_MARKERS:
        if marker in title:
            return f"bot_wall:title:{marker.replace(' ', '_')}:{code}"

    if code in BLOCKED_STATUS_CODES:
        # A 4xx/5xx with a challenge-looking body is a wall; otherwise only the
        # unambiguous auth/rate-limit codes count.
        if any(token in lowered for token in ("cloudflare", "cf-browser-verification", "captcha", "datadome")):
            return f"bot_wall:body:{code}"
        if code in {401, 403, 405, 406, 429}:
            return f"bot_wall:status:{code}"
    return None


def response_blocked_reason(response) -> str | None:
    """:func:`blocked_response_reason` for a response object.

    Reads status/text/headers defensively so a response-like object that omits
    ``headers`` cannot turn a clean "this source is walled" signal into an
    unrelated AttributeError. Keeps every call site to one line.
    """
    try:
        return blocked_response_reason(
            getattr(response, "status_code", None),
            getattr(response, "text", "") or "",
            dict(getattr(response, "headers", None) or {}),
        )
    except Exception:  # noqa: BLE001 - never let diagnostics mask the fetch
        return None
