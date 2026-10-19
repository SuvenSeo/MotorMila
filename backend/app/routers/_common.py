"""Small helpers shared by the money/legal routers."""

from __future__ import annotations

import hashlib
import os
import re

from fastapi import Request

from app.services.rate_limit import RateLimiter, _client_key

_PHONE_RE = re.compile(r"^(?:\+?94|0)?7\d{8}$|^(?:\+?94|0)?[1-9]\d{8}$")


def scoped_limiter(scope: str, *, max_requests: int, window_seconds: int, message: str) -> RateLimiter:
    """RateLimiter whose bucket is ``<scope>:<client ip>`` so it does not share
    a bucket with every other limiter keyed on the bare IP."""

    def _key(request: Request) -> str:
        return f"{scope}:{_client_key(request)}"

    return RateLimiter(max_requests=max_requests, window_seconds=window_seconds, message=message, key_func=_key)


def ip_hash(request: Request) -> str:
    """Salted SHA-256 of the client IP: enough to spot abuse, not a stored IP."""
    salt = os.getenv("LEADS_IP_SALT", "motormila-leads")
    raw = f"{salt}:{_client_key(request)}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def normalise_phone(value: str) -> str | None:
    """Return a compact Sri Lankan phone (digits, optional leading +) or None."""
    digits = re.sub(r"[\s\-()]", "", value or "")
    if not _PHONE_RE.match(digits):
        return None
    return digits
