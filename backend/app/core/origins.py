"""Single source of truth for which browser origins MotorMila trusts.

Two related but distinct uses:

* CORS response headers (``cors_allowlist``) - which origins may *read*
  credentialed responses cross-origin.
* CSRF / write checks (``is_trusted_write_origin``) - which origins may make
  state-changing requests that ride the ``mm_session`` cookie.

The production web app calls the API same-origin through the Vercel /
Cloudflare Pages ``/api/v1/*`` rewrite, so cross-origin CORS is only really
needed for local development. The Android app sends no ``Origin`` header and
authenticates with a Bearer token, so it needs neither.

Env:
  CORS_ORIGINS            comma-separated extra origins (extends the defaults).
                          A literal ``*`` is honoured for CORS only (and turns
                          credentials off); it never widens the write check.
  CORS_ORIGINS_REPLACE    "true" to make CORS_ORIGINS replace the defaults.
  TRUSTED_ORIGIN_SUFFIXES host suffixes trusted for writes (Vercel previews).
"""

from __future__ import annotations

import os
from typing import Optional
from urllib.parse import urlparse

DEFAULT_ALLOWED_ORIGINS: tuple[str, ...] = (
    "https://motormila.vercel.app",
    "https://motormila.pages.dev",
    # Legacy aliases of the same Vercel project (owner-controlled).
    "https://vehicle-platform-one.vercel.app",
    "https://vehicle-platform-one-suvenseoras-projects.vercel.app",
    # Local development (vite dev / preview).
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
)


def normalize_origin(value: Optional[str]) -> Optional[str]:
    """Canonicalize to ``scheme://host[:port]`` (lowercase, no path)."""
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if candidate == "*":
        return "*"
    try:
        parsed = urlparse(candidate)
    except Exception:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _env_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    out: list[str] = []
    for entry in raw.split(","):
        norm = normalize_origin(entry)
        if norm and norm not in out:
            out.append(norm)
    return out


def cors_allowlist() -> list[str]:
    """Origins that get CORS headers. ``["*"]`` only when explicitly configured."""
    env = _env_origins()
    if "*" in env:
        return ["*"]
    replace = os.getenv("CORS_ORIGINS_REPLACE", "false").strip().lower() in {"1", "true", "yes", "on"}
    base: list[str] = [] if (replace and env) else list(DEFAULT_ALLOWED_ORIGINS)
    for origin in env:
        if origin not in base:
            base.append(origin)
    return base


def write_allowlist() -> set[str]:
    """Exact origins trusted for writes: defaults + CORS_ORIGINS (never ``*``)."""
    allowed = set(DEFAULT_ALLOWED_ORIGINS)
    for origin in _env_origins():
        if origin != "*":
            allowed.add(origin)
    return allowed


def trusted_origin_suffixes() -> tuple[str, ...]:
    raw = os.getenv("TRUSTED_ORIGIN_SUFFIXES", "-suvenseoras-projects.vercel.app")
    return tuple(entry.strip().lower() for entry in raw.split(",") if entry.strip())


def is_trusted_write_origin(origin: Optional[str]) -> bool:
    origin = normalize_origin(origin)
    if not origin or origin == "*":
        return False
    if origin in write_allowlist():
        return True
    parsed = urlparse(origin)
    if parsed.scheme != "https":
        return False
    host = parsed.netloc.lower()
    return any(host.endswith(suffix) for suffix in trusted_origin_suffixes())


def is_cors_allowed(origin: Optional[str]) -> bool:
    origin = normalize_origin(origin)
    if not origin:
        return False
    allow = cors_allowlist()
    return allow == ["*"] or origin in allow
