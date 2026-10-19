from __future__ import annotations

from app.scrapers.polite import (  # noqa: F401 - re-exported for scrapers
    BOT_USER_AGENT,
    PoliteAsyncTransport,
    PoliteTransport,
    RobotsDisallowedError,
    bot_user_agent,
    polite_async_client,
    polite_client,
    polite_goto,
    robots_allowed,
    source_enabled,
)

# Honest-crawling policy: MotorMila identifies itself with one static bot
# User-Agent, never impersonates a browser, never rotates UAs, viewports or
# proxies and never injects anti-detection ("stealth") scripts. The helpers
# below keep their historical names so call sites stay small, but they now
# always return the honest configuration. The SCRAPE_PROXY_URL /
# SCRAPE_PROXIES / SCRAPE_ROTATE_UA / SCRAPE_STEALTH env vars are ignored.

DEFAULT_VIEWPORT = {"width": 1280, "height": 800}


def get_proxy() -> str | None:
    """Proxies are not used (no IP rotation / residential proxies)."""
    return None


def random_user_agent(default: str = "") -> str:  # noqa: ARG001 - legacy signature
    return bot_user_agent()


def random_viewport() -> dict:
    return dict(DEFAULT_VIEWPORT)


def httpx_client_kwargs(default_headers: dict) -> dict:
    """Kwargs for ``httpx.AsyncClient``: honest UA + robots/throttle transport."""
    headers = dict(default_headers or {})
    headers["User-Agent"] = bot_user_agent()
    return {"headers": headers, "transport": PoliteAsyncTransport()}


def playwright_context_kwargs(default_ua: str = "") -> dict:  # noqa: ARG001
    return {"user_agent": bot_user_agent(), "viewport": random_viewport()}


def playwright_launch_proxy() -> dict | None:
    return None


def stealth_init_script() -> str | None:
    """Anti-detection scripts are never injected."""
    return None


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
