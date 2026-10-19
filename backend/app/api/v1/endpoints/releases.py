"""Public app-release metadata for the Android in-app update checker.

Resolution order for GET /releases/app:
1. APP_RELEASE_* env vars — explicit override (pin / rollback / air-gapped).
2. The release manifest published with the site itself
   (``/app/latest-release.json`` on the public web origin — written by the
   android-release workflow alongside the APK). The source repository is
   private, so nothing here defaults to api.github.com/raw.githubusercontent.
3. GitHub Releases API — only when GITHUB_RELEASES_REPO is explicitly set
   (self-hosters with a public mirror). Cached in-process for
   RELEASES_CACHE_TTL_SECONDS so many app cold-starts don't chew through the
   unauthenticated API budget.

Always returns 200; unknown fields are null when no release is published, so
installed apps treat the response as "up to date" and move on.
"""

from __future__ import annotations

import os
import time
import urllib.request
from typing import Any, Optional

import structlog
from fastapi import APIRouter

log = structlog.get_logger()

router = APIRouter()

PUBLIC_APP_ORIGIN = os.getenv("PUBLIC_APP_ORIGIN", "https://motormila.pages.dev").rstrip("/")
RELEASE_MANIFEST_URL = (
    os.getenv("APP_RELEASE_MANIFEST_URL", "").strip()
    or f"{PUBLIC_APP_ORIGIN}/app/latest-release.json"
)
# Opt-in only: unset by default so the private source repo is never queried
# (or named) from the public API.
GITHUB_REPO = os.getenv("GITHUB_RELEASES_REPO", "").strip()
GITHUB_API_RELEASES = (
    f"https://api.github.com/repos/{GITHUB_REPO}/releases" if GITHUB_REPO else ""
)
RELEASES_CACHE_TTL_SECONDS = 300  # 5 min

# ``fetched_at`` is None until a fetch actually happens. A numeric 0.0
# sentinel would look "fresh" on any host whose monotonic clock is younger
# than the TTL (freshly booted CI VMs), pinning an empty payload for 5 min.
_cache: dict[str, Any] = {"fetched_at": None, "payload": None}


def _env(name: str) -> Optional[str]:
    value = os.getenv(name, "").strip()
    return value or None


def _env_payload() -> Optional[dict]:
    version = _env("APP_RELEASE_VERSION")
    if not version:
        return None
    version_code = _env("APP_RELEASE_VERSION_CODE")
    return {
        "version": version,
        "version_code": int(version_code) if (version_code or "").isdigit() else None,
        "apk_url": _env("APP_RELEASE_APK_URL"),
        "notes": _env("APP_RELEASE_NOTES"),
        "published_at": _env("APP_RELEASE_PUBLISHED_AT"),
        "source": "env",
    }


def _cache_is_fresh(now: float) -> bool:
    """True only when a payload was actually fetched and is still within TTL."""
    fetched_at = _cache["fetched_at"]
    if fetched_at is None:
        return False
    return (now - fetched_at) < RELEASES_CACHE_TTL_SECONDS


def _github_payload() -> Optional[dict]:
    now = time.monotonic()
    if _cache_is_fresh(now):
        return _cache["payload"]

    payload = _manifest_payload()
    try:
        if payload is None and GITHUB_API_RELEASES:
            payload = _releases_api_payload()
    except Exception as exc:  # noqa: BLE001 — never fail the endpoint
        log.warning("releases_github_fetch_failed", error=str(exc))

    _cache["fetched_at"] = now
    _cache["payload"] = payload
    return payload


def _manifest_payload() -> Optional[dict]:
    """The android-release workflow publishes /app/latest-release.json with the
    site on every release — cheapest source, and it never names the repo."""
    try:
        req = urllib.request.Request(
            RELEASE_MANIFEST_URL,
            headers={"User-Agent": "motormila-backend"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            import json

            data = json.loads(resp.read().decode("utf-8"))
        version_code = data.get("version_code")
        apk_url = str(data.get("apk_url") or "").strip()
        version = str(data.get("version") or "").strip()
        if not version or not apk_url:
            return None
        return {
            "version": version,
            "version_code": int(version_code) if str(version_code or "").isdigit() else None,
            "apk_url": apk_url,
            "notes": None,
            "published_at": data.get("published_at"),
            # SHA-256 of the APK: the Android updater refuses to install without it.
            "sha256": data.get("sha256"),
            "source": "site-manifest",
        }
    except Exception as exc:  # noqa: BLE001
        log.info("releases_manifest_unavailable", error=str(exc))
        return None


def _releases_api_payload() -> Optional[dict]:
    now = time.monotonic()
    payload: Optional[dict] = None
    try:
        req = urllib.request.Request(
            GITHUB_API_RELEASES + "?per_page=20",
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "motormila-backend",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            import json

            releases = json.loads(resp.read().decode("utf-8"))
        for release in releases or []:
            tag = str(release.get("tag_name", ""))
            if not tag.startswith("android-v"):
                continue
            assets = release.get("assets") or []
            apk = next(
                (a for a in assets if str(a.get("name", "")).endswith(".apk")),
                None,
            )
            if apk is None:
                continue
            version = tag.removeprefix("android-v")
            body = str(release.get("body") or "").strip() or None
            payload = {
                "version": version,
                "version_code": None,  # versionCode comes from the app's gradle; frontend relies on tag semver order
                "apk_url": apk.get("browser_download_url"),
                "notes": (body[:400] if body else None),
                "published_at": release.get("published_at"),
                "source": "github",
            }
            break
    except Exception as exc:  # noqa: BLE001 — never fail the endpoint
        log.warning("releases_github_fetch_failed", error=str(exc))

    _cache["fetched_at"] = now
    _cache["payload"] = payload
    return payload


@router.get("/app", response_model=dict)
def latest_app_release() -> dict:
    """Latest sideload APK release info (public, cheap, no PII)."""
    env_payload = _env_payload()
    if env_payload:
        env_payload["min_supported_version_code"] = int(_env("APP_RELEASE_MIN_VERSION_CODE") or "0")
        return env_payload

    github_payload = _github_payload() or {}
    return {
        "version": github_payload.get("version"),
        "version_code": github_payload.get("version_code"),
        "apk_url": github_payload.get("apk_url"),
        "notes": github_payload.get("notes"),
        "published_at": github_payload.get("published_at"),
        "min_supported_version_code": 0,
        "source": github_payload.get("source") or "none",
    }
