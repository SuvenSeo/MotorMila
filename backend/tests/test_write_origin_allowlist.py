"""Regression tests for the write-origin allowlist (CSRF gate on unsafe methods).

Bug: `_cors_allowed_origins()` returned the CORS_ORIGINS env value *instead of*
the built-in first-party list. A Space secret that listed only the API host
therefore revoked the frontend's own origin, and every authenticated write
(POST /alerts, PATCH alert channels, POST /listings/custom-estimate) failed with
"Writes require a trusted Origin." — the site blocking itself.

These tests pin the allowlist behaviour directly, without booting the whole app
(app.main needs Python 3.12; CI runs 3.12).
"""
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints.auth import (
    FIRST_PARTY_ORIGINS,
    _cors_allowed_origins,
    _is_trusted_origin,
    _normalize_origin,
    _request_origin,
    _trusted_origin_suffixes,
)

APP_ORIGIN = "https://motormila.vercel.app"


class _Req:
    def __init__(self, headers, method="POST"):
        self.headers = headers
        self.method = method


def test_app_origin_trusted_when_cors_origins_unset(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert APP_ORIGIN in _cors_allowed_origins()


def test_cors_origins_extends_and_never_shrinks(monkeypatch):
    """A CORS_ORIGINS value must not be able to revoke the app's own origin."""
    monkeypatch.setenv("CORS_ORIGINS", "https://seo292-vehicle-platform-backend.hf.space")
    allowed = _cors_allowed_origins()
    assert "https://seo292-vehicle-platform-backend.hf.space" in allowed  # extended
    assert APP_ORIGIN in allowed  # but first-party trust survives
    assert FIRST_PARTY_ORIGINS.issubset(allowed)


def test_cors_origins_adds_custom_deploys(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://motormila-abc123-team.vercel.app")
    allowed = _cors_allowed_origins()
    assert "https://motormila-abc123-team.vercel.app" in allowed
    assert APP_ORIGIN in allowed


def test_wildcard_never_widens_the_write_gate(monkeypatch):
    """A wildcard CORS config is a valid operator escape hatch for the response
    headers, but it must NOT become a blanket CSRF pass for cookie-borne writes —
    that would defeat the origin check entirely. The write gate keeps first-party
    trust and drops the wildcard."""
    monkeypatch.setenv("CORS_ORIGINS", "*")
    allowed = _cors_allowed_origins()
    assert "*" not in allowed
    assert APP_ORIGIN in allowed
    assert allowed == set(FIRST_PARTY_ORIGINS)


def test_request_origin_normalizes_trailing_slash_and_case(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    allowed = _cors_allowed_origins()
    for raw in [APP_ORIGIN + "/", APP_ORIGIN.upper()]:
        assert _request_origin(_Req({"origin": raw})) in allowed


def test_request_origin_falls_back_to_referer():
    assert _request_origin(_Req({"referer": "https://motormila.vercel.app/alerts?x=1"})) == APP_ORIGIN


def test_request_origin_none_when_absent():
    assert _request_origin(_Req({})) is None


def test_cross_origin_still_rejected(monkeypatch):
    """Hardening must not turn the gate into a no-op."""
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert _request_origin(_Req({"origin": "https://evil.example.com"})) not in _cors_allowed_origins()


def test_normalize_origin_rejects_junk():
    assert _normalize_origin("not a url") is None
    assert _normalize_origin("") is None
    assert _normalize_origin(None) is None


# --- Vercel preview deployments -------------------------------------------------
# Previews get a unique hashed hostname per deployment, so exact-match
# allowlisting can never cover them. Regression: POST /listings/mine from a
# preview URL 403'd with "Writes require a trusted Origin." while production
# worked fine.

PREVIEW_ORIGIN = "https://vehicle-platform-rgkfpssr0-suvenseoras-projects.vercel.app"


def test_preview_origin_trusted_via_team_suffix(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("TRUSTED_ORIGIN_SUFFIXES", raising=False)
    assert _is_trusted_origin(PREVIEW_ORIGIN) is True
    # Referer fallback works too (same-origin rewrite carries no Origin header).
    assert _is_trusted_origin(_request_origin(_Req({"referer": PREVIEW_ORIGIN + "/sell"}))) is True


def test_preview_origin_case_insensitive(monkeypatch):
    monkeypatch.delenv("TRUSTED_ORIGIN_SUFFIXES", raising=False)
    assert _is_trusted_origin(PREVIEW_ORIGIN.upper()) is True


def test_production_origin_still_trusted(monkeypatch):
    monkeypatch.delenv("TRUSTED_ORIGIN_SUFFIXES", raising=False)
    assert _is_trusted_origin(APP_ORIGIN) is True


def test_suffix_spoof_rejected(monkeypatch):
    """A hostile host that merely *contains* the team scope must not pass."""
    monkeypatch.delenv("TRUSTED_ORIGIN_SUFFIXES", raising=False)
    assert _is_trusted_origin("https://suvenseoras-projects.vercel.app.evil.com") is False
    assert _is_trusted_origin("https://evilsuvenseoras-projects.vercel.app") is False
    assert _is_trusted_origin("https://evil.example.com") is False


def test_missing_origin_rejected(monkeypatch):
    monkeypatch.delenv("TRUSTED_ORIGIN_SUFFIXES", raising=False)
    assert _is_trusted_origin(None) is False
    assert _is_trusted_origin("") is False


def test_suffix_env_extends(monkeypatch):
    monkeypatch.setenv("TRUSTED_ORIGIN_SUFFIXES", "-suvenseoras-projects.vercel.app, .example.lk")
    assert ".example.lk" in _trusted_origin_suffixes()
    assert _is_trusted_origin("https://shop.example.lk") is True
    assert _is_trusted_origin(PREVIEW_ORIGIN) is True  # default survives extension


def test_suffix_default_when_env_unset(monkeypatch):
    monkeypatch.delenv("TRUSTED_ORIGIN_SUFFIXES", raising=False)
    assert _trusted_origin_suffixes() == ("-suvenseoras-projects.vercel.app",)
