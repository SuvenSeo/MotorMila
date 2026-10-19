"""ASGI middlewares: strict CORS header policy and cookie-CSRF origin check.

StrictCORSHeadersMiddleware
    Starlette's CORSMiddleware adds ``Access-Control-Allow-Credentials: true``
    to *every* simple response when credentials are enabled - even for
    origins it does not allow - and the Hugging Face Spaces proxy reflects
    any ``Origin`` into ``Access-Control-Allow-Origin``. Together that made
    every hf.space response credential-readable by any website. This outer
    middleware removes all ``Access-Control-*`` headers whenever the request
    Origin is not on the allowlist (and drops Allow-Credentials when there is
    no Origin at all), so whatever the proxy adds afterwards, browsers never
    see ``Allow-Credentials: true`` for a foreign origin.

CSRFOriginMiddleware
    Any state-changing request (POST/PUT/PATCH/DELETE) that relies on the
    ``mm_session`` cookie - i.e. carries the cookie and no Bearer token - must
    come from a trusted Origin (or Referer when Origin is absent). Requests
    with a Bearer token are not CSRF-able (a foreign page cannot attach the
    header without the token), so the Android app and API clients are
    unaffected. Disable with ``CSRF_PROTECTION=false`` (local debugging only).
"""

from __future__ import annotations

import json
import os
from http.cookies import SimpleCookie
from typing import Iterable

from app.core.origins import is_cors_allowed, is_trusted_write_origin, normalize_origin

SESSION_COOKIE_NAME = "mm_session"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# Server-to-server endpoints authenticated by their own signatures.
CSRF_EXEMPT_PATHS = frozenset({"/api/v1/billing/webhook"})


def _header(scope, name: bytes) -> str:
    for key, value in scope.get("headers") or []:
        if key == name:
            return value.decode("latin-1")
    return ""


def _strip_cors(headers: Iterable[tuple[bytes, bytes]], *, keep_all: bool, keep_credentials: bool):
    out = []
    for key, value in headers:
        lower = key.lower()
        if lower.startswith(b"access-control-"):
            if not keep_all:
                continue
            if lower == b"access-control-allow-credentials" and not keep_credentials:
                continue
        out.append((key, value))
    return out


class StrictCORSHeadersMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        origin = normalize_origin(_header(scope, b"origin"))
        allowed = bool(origin) and is_cors_allowed(origin)
        from app.core.origins import cors_allowlist

        wildcard = cors_allowlist() == ["*"]

        async def _send(message):
            if message.get("type") == "http.response.start":
                message["headers"] = _strip_cors(
                    message.get("headers") or [],
                    keep_all=allowed,
                    # Credentials only for an exact allowlisted origin.
                    keep_credentials=allowed and not wildcard,
                )
            await send(message)

        await self.app(scope, receive, _send)


def csrf_enabled() -> bool:
    return os.getenv("CSRF_PROTECTION", "true").strip().lower() not in {"0", "false", "no", "off"}


def _has_session_cookie(scope) -> bool:
    raw = _header(scope, b"cookie")
    if not raw or SESSION_COOKIE_NAME not in raw:
        return False
    try:
        jar = SimpleCookie()
        jar.load(raw)
    except Exception:
        return True  # unparsable but mentions the cookie: treat as present
    morsel = jar.get(SESSION_COOKIE_NAME)
    return bool(morsel and morsel.value.strip())


def _has_bearer(scope) -> bool:
    auth = _header(scope, b"authorization").strip()
    return auth.lower().startswith("bearer ") and bool(auth[7:].strip())


def request_is_csrf_safe(scope) -> bool:
    """True when this request may proceed under the cookie-CSRF policy."""
    method = str(scope.get("method") or "GET").upper()
    if method not in UNSAFE_METHODS:
        return True
    if scope.get("path") in CSRF_EXEMPT_PATHS:
        return True
    if _has_bearer(scope) or not _has_session_cookie(scope):
        return True
    origin = normalize_origin(_header(scope, b"origin")) or normalize_origin(_header(scope, b"referer"))
    return is_trusted_write_origin(origin)


class CSRFOriginMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") == "http" and csrf_enabled() and not request_is_csrf_safe(scope):
            body = json.dumps(
                {"detail": "Cross-site request blocked: cookie-authenticated writes require a trusted Origin."}
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await self.app(scope, receive, send)
