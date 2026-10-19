"""Honest, polite crawling primitives shared by every source fetcher.

Policy (see docs/legal/data-sourcing.md):

* One honest User-Agent that names MotorMila and gives a contact URL/email.
  No browser impersonation, no UA/viewport/proxy rotation, no stealth.
* robots.txt is fetched once per host (cached) and every request URL is
  checked against it. Disallowed URLs are skipped, never worked around.
* At most one in-flight request per host, with a polite delay (default
  2-5 s, jittered) between requests to the same host.
* If a host answers with a block / challenge / rate limit, the caller backs
  off and skips the source for this run. We never retry through a challenge.
* Sources are opt-in per run via ``SOURCES_ENABLED``; ikman is OFF by default
  (a partnership / data feed is the intended path).
"""
from __future__ import annotations

import asyncio
import os
import random
import re
import threading
import time
import urllib.robotparser
from urllib.parse import unquote, urlsplit

import httpx
import structlog

log = structlog.get_logger()

BOT_NAME = "MotorMilaBot"
BOT_VERSION = "1.0"
BOT_INFO_URL = "https://motormila.vercel.app/bot"


def bot_user_agent() -> str:
    contact = str(os.getenv("BOT_CONTACT", "") or "").strip()
    suffix = f"; {contact}" if contact else ""
    return f"{BOT_NAME}/{BOT_VERSION} (+{BOT_INFO_URL}{suffix})"


# Evaluated at import for convenience; call bot_user_agent() when env may change.
BOT_USER_AGENT = bot_user_agent()


# ---------------------------------------------------------------------------
# Source enable flags
# ---------------------------------------------------------------------------

# Sources that stay OFF unless explicitly listed in SOURCES_ENABLED.
# ikman: we do not have permission to use api.ikman.lk; the intended path is a
# partnership / feed. Its public HTML crawler can be opted in explicitly.
DEFAULT_DISABLED_SOURCES = frozenset({"ikman"})


def _parse_source_list(raw: str) -> set[str]:
    return {item.strip().lower() for item in str(raw or "").split(",") if item.strip()}


def source_enabled(source: str) -> bool:
    """Is ``source`` allowed to be crawled this run?

    ``SOURCES_ENABLED`` (comma list) is an allow-list: when set, only those
    sources run (``all`` enables every source including default-off ones).
    ``SOURCES_DISABLED`` always wins. When ``SOURCES_ENABLED`` is unset every
    source runs except :data:`DEFAULT_DISABLED_SOURCES`.
    """
    key = str(source or "").strip().lower()
    disabled = _parse_source_list(os.getenv("SOURCES_DISABLED", ""))
    if key in disabled:
        return False
    enabled = _parse_source_list(os.getenv("SOURCES_ENABLED", ""))
    if enabled:
        return "all" in enabled or key in enabled
    return key not in DEFAULT_DISABLED_SOURCES


class SourceDisabledError(RuntimeError):
    """Raised when a scraper is invoked for a source that is switched off."""


# ---------------------------------------------------------------------------
# robots.txt
# ---------------------------------------------------------------------------


class RobotsDisallowedError(httpx.RequestError):
    """The URL is disallowed for our User-Agent by the host's robots.txt."""


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, "") or "").strip() or default)
    except (TypeError, ValueError):
        return default


def robots_enforced() -> bool:
    # Tests may turn this off; production must never set it.
    return str(os.getenv("SCRAPE_ROBOTS_ENFORCED", "1")).strip().lower() not in {"0", "false", "no", "off"}


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme or 'https'}://{parts.netloc.lower()}"


class RobotsRules:
    """robots.txt rules for one origin.

    Uses :mod:`urllib.robotparser` for parsing basics and ``Crawl-delay``, plus
    an RFC 9309 path matcher because ``robotparser`` does not understand the
    ``*`` / ``$`` wildcards that ikman relies on (``Disallow: /*?*sort=*``).
    """

    def __init__(self, text: str = "", *, allow_all: bool = False, disallow_all: bool = False):
        self.allow_all = allow_all
        self.disallow_all = disallow_all
        self.parser = urllib.robotparser.RobotFileParser()
        self.groups: list[tuple[list[str], list[tuple[bool, str]]]] = []
        if text and not (allow_all or disallow_all):
            lines = text.splitlines()
            self.parser.parse(lines)
            self._parse_groups(lines)

    def _parse_groups(self, lines: list[str]) -> None:
        agents: list[str] = []
        rules: list[tuple[bool, str]] = []
        last_was_rule = False
        for raw in lines:
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if key == "user-agent":
                if last_was_rule:
                    self.groups.append((agents, rules))
                    agents, rules = [], []
                    last_was_rule = False
                agents.append(value.lower())
            elif key in ("allow", "disallow"):
                if not agents:
                    continue
                last_was_rule = True
                if key == "disallow" and not value:
                    continue  # empty Disallow = allow everything
                rules.append((key == "allow", value))
        if agents:
            self.groups.append((agents, rules))

    def _rules_for(self, agent: str) -> list[tuple[bool, str]]:
        token = agent.split("/", 1)[0].strip().lower()
        specific: list[tuple[bool, str]] = []
        star: list[tuple[bool, str]] = []
        matched_specific = False
        for agents, rules in self.groups:
            if any(a != "*" and a and a in token for a in agents):
                specific.extend(rules)
                matched_specific = True
            elif "*" in agents:
                star.extend(rules)
        return specific if matched_specific else star

    @staticmethod
    def _pattern_regex(pattern: str) -> "re.Pattern[str]":
        anchored = pattern.endswith("$")
        body = pattern[:-1] if anchored else pattern
        regex = "".join(".*" if ch == "*" else re.escape(ch) for ch in body)
        return re.compile(regex + ("$" if anchored else ""))

    def can_fetch(self, agent: str, url: str) -> bool:
        if self.disallow_all:
            return False
        if self.allow_all:
            return True
        parts = urlsplit(url)
        target = unquote(parts.path or "/") + (f"?{unquote(parts.query)}" if parts.query else "")
        best_len = -1
        best_allow = True
        for allow, pattern in self._rules_for(agent):
            pat = unquote(pattern)
            if not self._pattern_regex(pat).match(target):
                continue
            length = len(pat)
            if length > best_len or (length == best_len and allow):
                best_len = length
                best_allow = allow
        return best_allow

    def crawl_delay(self, agent: str) -> float | None:
        if self.allow_all or self.disallow_all:
            return None
        try:
            delay = self.parser.crawl_delay(agent)
            return float(delay) if delay is not None else None
        except Exception:  # noqa: BLE001
            return None


class RobotsCache:
    """Per-origin robots.txt cache.

    Status handling follows RFC 9309: 4xx (other than 401/403/429) means no
    rules (allow); 401/403/429, 5xx, challenge pages and network failures mean
    "assume disallow" so we never crawl a host we could not ask.
    """

    def __init__(self, ttl_seconds: float | None = None, fetcher=None):
        self.ttl = ttl_seconds if ttl_seconds is not None else _env_float("SCRAPE_ROBOTS_TTL_SECONDS", 6 * 3600)
        self._fetcher = fetcher or self._default_fetch
        self._cache: dict[str, tuple[float, RobotsRules]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _default_fetch(robots_url: str) -> tuple[int, str]:
        try:
            with httpx.Client(
                headers={"User-Agent": bot_user_agent()},
                timeout=15.0,
                follow_redirects=True,
            ) as client:
                resp = client.get(robots_url)
                return resp.status_code, resp.text
        except Exception as exc:  # noqa: BLE001
            log.warning("robots_fetch_failed", url=robots_url, error=str(exc))
            return 0, ""

    def _build(self, origin: str) -> RobotsRules:
        robots_url = f"{origin}/robots.txt"
        status, text = self._fetcher(robots_url)
        lowered = (text or "")[:4000].lower()
        looks_like_challenge = "<html" in lowered and (
            "just a moment" in lowered or "attention required" in lowered or "captcha" in lowered
        )
        if status in (401, 403, 429) or status >= 500 or status == 0 or looks_like_challenge:
            log.warning("robots_unavailable_assume_disallow", origin=origin, status=status,
                        challenge=looks_like_challenge)
            return RobotsRules(disallow_all=True)
        if 400 <= status < 500:
            return RobotsRules(allow_all=True)
        return RobotsRules(text or "")

    def parser_for(self, url: str) -> RobotsRules:
        origin = _origin(url)
        now = time.monotonic()
        with self._lock:
            hit = self._cache.get(origin)
            if hit and (now - hit[0]) < self.ttl:
                return hit[1]
        rules = self._build(origin)
        with self._lock:
            self._cache[origin] = (now, rules)
        return rules

    def allowed(self, url: str, user_agent: str | None = None) -> bool:
        if not robots_enforced():
            return True
        if urlsplit(url).path.endswith("/robots.txt"):
            return True
        return self.parser_for(url).can_fetch(user_agent or BOT_NAME, url)

    def crawl_delay(self, url: str) -> float | None:
        try:
            return self.parser_for(url).crawl_delay(BOT_NAME)
        except Exception:  # noqa: BLE001
            return None

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


ROBOTS = RobotsCache()


def robots_allowed(url: str) -> bool:
    return ROBOTS.allowed(url)


# ---------------------------------------------------------------------------
# Per-host throttle (concurrency 1 + polite delay)
# ---------------------------------------------------------------------------


def host_delay_bounds() -> tuple[float, float]:
    lo = max(0.0, _env_float("SCRAPE_HOST_DELAY_MIN", 2.0))
    hi = max(lo, _env_float("SCRAPE_HOST_DELAY_MAX", 5.0))
    return lo, hi


class HostThrottle:
    """Serialises requests per host and spaces them by a jittered delay."""

    def __init__(self):
        self._last: dict[str, float] = {}
        self._thread_locks: dict[str, threading.Lock] = {}
        self._async_locks: dict[tuple[int, str], asyncio.Lock] = {}
        self._guard = threading.Lock()

    def _wait_seconds(self, host: str, url: str) -> float:
        lo, hi = host_delay_bounds()
        delay = random.uniform(lo, hi) if hi > 0 else 0.0
        robots_delay = ROBOTS.crawl_delay(url) if robots_enforced() else None
        if robots_delay:
            delay = max(delay, robots_delay)
        last = self._last.get(host)
        if last is None:
            return 0.0
        return max(0.0, last + delay - time.monotonic())

    def _thread_lock(self, host: str) -> threading.Lock:
        with self._guard:
            return self._thread_locks.setdefault(host, threading.Lock())

    def _async_lock(self, host: str) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        key = (id(loop), host)
        with self._guard:
            lock = self._async_locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._async_locks[key] = lock
            return lock

    def mark(self, host: str) -> None:
        self._last[host] = time.monotonic()

    def reset(self) -> None:
        with self._guard:
            self._last.clear()
            self._async_locks.clear()


THROTTLE = HostThrottle()


def _host(url: str) -> str:
    return urlsplit(str(url)).netloc.lower()


# ---------------------------------------------------------------------------
# httpx transports
# ---------------------------------------------------------------------------


def _prepare(request: httpx.Request) -> None:
    request.headers["User-Agent"] = bot_user_agent()
    url = str(request.url)
    if not ROBOTS.allowed(url):
        log.info("robots_disallowed_skip", url=url)
        raise RobotsDisallowedError(f"robots.txt disallows {url}", request=request)


class PoliteAsyncTransport(httpx.AsyncBaseTransport):
    def __init__(self, inner: httpx.AsyncBaseTransport | None = None):
        self._inner = inner or httpx.AsyncHTTPTransport(retries=0)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        _prepare(request)
        host = _host(request.url)
        lock = THROTTLE._async_lock(host)
        async with lock:
            wait = THROTTLE._wait_seconds(host, str(request.url))
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                response = await self._inner.handle_async_request(request)
            finally:
                THROTTLE.mark(host)
        return response

    async def aclose(self) -> None:
        await self._inner.aclose()


class PoliteTransport(httpx.BaseTransport):
    def __init__(self, inner: httpx.BaseTransport | None = None):
        self._inner = inner or httpx.HTTPTransport(retries=0)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        _prepare(request)
        host = _host(request.url)
        with THROTTLE._thread_lock(host):
            wait = THROTTLE._wait_seconds(host, str(request.url))
            if wait > 0:
                time.sleep(wait)
            try:
                response = self._inner.handle_request(request)
            finally:
                THROTTLE.mark(host)
        return response

    def close(self) -> None:
        self._inner.close()


def polite_async_client(headers: dict | None = None, **kwargs) -> httpx.AsyncClient:
    merged = dict(headers or {})
    merged["User-Agent"] = bot_user_agent()
    kwargs.setdefault("follow_redirects", True)
    kwargs.setdefault("timeout", 30.0)
    return httpx.AsyncClient(headers=merged, transport=PoliteAsyncTransport(), **kwargs)


def polite_client(headers: dict | None = None, **kwargs) -> httpx.Client:
    merged = dict(headers or {})
    merged["User-Agent"] = bot_user_agent()
    kwargs.setdefault("follow_redirects", True)
    kwargs.setdefault("timeout", 30.0)
    return httpx.Client(headers=merged, transport=PoliteTransport(), **kwargs)


# ---------------------------------------------------------------------------
# Playwright helper (for the few sources that still need a browser)
# ---------------------------------------------------------------------------


async def polite_goto(page, url: str, **kwargs):
    """``page.goto`` gated by robots.txt and the per-host throttle."""
    if not ROBOTS.allowed(url):
        log.info("robots_disallowed_skip", url=url, mode="playwright")
        raise RobotsDisallowedError(f"robots.txt disallows {url}")
    host = _host(url)
    lock = THROTTLE._async_lock(host)
    async with lock:
        wait = THROTTLE._wait_seconds(host, url)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            return await page.goto(url, **kwargs)
        finally:
            THROTTLE.mark(host)
