"""Public-browse allowlist used by native guest Home / Search / hubs."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.api import _is_public_browse_path, _normalize_browse_path


def test_normalize_browse_path_strips_slashes():
    assert _normalize_browse_path("/api/v1/listings/") == "/api/v1/listings"
    assert _normalize_browse_path("api/v1/stats/summary") == "/api/v1/stats/summary"


def test_guest_home_and_search_paths_are_public():
    for path in (
        "/api/v1/listings",
        "/api/v1/listings/price-drops",
        "/api/v1/listings/makes",
        "/api/v1/listings/search-suggestions",
        "/api/v1/stats/summary",
        "/api/v1/stats/insights",
        "/api/v1/stats/fuel-mix",
        "/api/v1/stats/live",
        "/api/v1/stats/live/stream",
        "/api/v1/stats/make-insight",
        "/api/v1/stats/district-insight",
        # Starter valuation is intentionally public (guest valuation on web
        # and Android); see api.py.
        "/api/v1/listings/estimate",
        "/api/v1/listings/42",
        "/api/v1/listings/42/fmv",
        "/api/v1/ev/chargers",
        "/api/v1/market/signals",
    ):
        assert _is_public_browse_path(_normalize_browse_path(path)), path


def test_gated_product_paths_stay_private():
    for path in (
        "/api/v1/listings/custom-estimate",
        "/api/v1/listings/mine",
        "/api/v1/alerts",
        "/api/v1/pro/snapshot",
        "/api/v1/chat",
        "/api/v1/dealer",
        "/api/v1/calculators/landed-cost",
    ):
        assert not _is_public_browse_path(_normalize_browse_path(path)), path
