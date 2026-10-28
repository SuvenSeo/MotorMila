"""/calculators/macro must be cached, non-blocking, and stale-on-error."""

import inspect
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import calculators
from app.services.macro_feeds import FxQuote, MacroSnapshot


def _snap(rate: float, source: str = "cbsl_via_macro_publisher") -> MacroSnapshot:
    return MacroSnapshot(
        fx=FxQuote(usd_lkr=rate, reference_date=None, source=source, source_url="https://x", fetched_at="t"),
        inflation=None,
    )


@pytest.fixture(autouse=True)
def _reset():
    calculators._reset_macro_cache()
    yield
    calculators._reset_macro_cache()


def test_macro_route_is_sync_so_it_runs_in_threadpool():
    assert not inspect.iscoroutinefunction(calculators.get_macro_context)


def test_macro_snapshot_is_cached_within_ttl(monkeypatch):
    calls = []
    monkeypatch.setattr(calculators, "fetch_macro_snapshot", lambda: calls.append(1) or _snap(300.0))
    a = calculators.get_cached_macro_snapshot(now=1000.0)
    b = calculators.get_cached_macro_snapshot(now=1000.0 + 600)
    assert a is b
    assert len(calls) == 1
    calculators.get_cached_macro_snapshot(now=1000.0 + 1801)
    assert len(calls) == 2


def test_macro_serves_stale_on_upstream_error(monkeypatch):
    monkeypatch.setattr(calculators, "fetch_macro_snapshot", lambda: _snap(300.0))
    good = calculators.get_cached_macro_snapshot(now=1000.0)

    def boom():
        raise RuntimeError("upstream down")

    monkeypatch.setattr(calculators, "fetch_macro_snapshot", boom)
    assert calculators.get_cached_macro_snapshot(now=10_000.0) is good


def test_macro_prefers_stale_real_rate_over_fallback_constant(monkeypatch):
    monkeypatch.setattr(calculators, "fetch_macro_snapshot", lambda: _snap(300.0))
    good = calculators.get_cached_macro_snapshot(now=1000.0)
    monkeypatch.setattr(calculators, "fetch_macro_snapshot", lambda: _snap(999.0, "fallback_constant"))
    assert calculators.get_cached_macro_snapshot(now=10_000.0) is good


def test_macro_raises_when_no_cache_and_upstream_fails(monkeypatch):
    def boom():
        raise RuntimeError("upstream down")

    monkeypatch.setattr(calculators, "fetch_macro_snapshot", boom)
    with pytest.raises(RuntimeError):
        calculators.get_cached_macro_snapshot(now=1000.0)


def test_macro_endpoint_returns_cached_payload(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    calls = []
    monkeypatch.setattr(calculators, "fetch_macro_snapshot", lambda: calls.append(1) or _snap(301.5))
    calculators._calculators_rate_limiter.reset()
    client = TestClient(app)
    r1 = client.get("/api/v1/calculators/macro")
    r2 = client.get("/api/v1/calculators/macro")
    assert r1.status_code == 200, r1.text
    assert r2.json()["usd_lkr"] == 301.5
    assert len(calls) == 1
