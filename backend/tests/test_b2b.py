"""Tests for the B2B collateral-value API."""

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import b2b
from app.main import app
from db.models import Base, CarListing
from db.session import get_db


_NOW = datetime(2026, 7, 16, 10, 0)


def setup_function():
    b2b._b2b_rate_limiter.reset()


def _client_with_data(rows):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    for r in rows:
        db.add(r)
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app), db


def _car(sid, *, price, make="Toyota", model="Premio", year=2019, first_days_ago=10):
    seen = _NOW - timedelta(days=first_days_ago)
    return CarListing(
        source="ikman", source_id=sid, scraped_at=_NOW, first_seen_at=seen, last_seen_at=_NOW,
        make=make, model=model, year=year, price_lkr=price, district="Colombo",
        title=f"{make} {model}", url=f"https://ex.com/{sid}", is_active=True,
    )


def test_requires_key(monkeypatch):
    monkeypatch.setenv("B2B_API_KEYS", "secret-key-1")
    client, _ = _client_with_data([_car("a", price=9_000_000)])
    try:
        assert client.get("/api/v1/b2b/collateral-value?make=Toyota&model=Premio").status_code == 401
        assert client.get(
            "/api/v1/b2b/collateral-value?make=Toyota&model=Premio",
            headers={"X-API-Key": "wrong"},
        ).status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_requires_key_uses_compare_digest(monkeypatch):
    monkeypatch.setenv("B2B_API_KEYS", "secret-key-1,secret-key-2")
    compare_calls: list[tuple[str, str]] = []

    def fake_compare_digest(provided: str, configured: str) -> bool:
        compare_calls.append((provided, configured))
        return provided == configured

    monkeypatch.setattr(b2b.secrets, "compare_digest", fake_compare_digest)

    with pytest.raises(HTTPException) as excinfo:
        b2b.require_b2b_key("wrong-key")

    assert excinfo.value.status_code == 401
    assert len(compare_calls) == 2


def test_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("B2B_API_KEYS", raising=False)
    client, _ = _client_with_data([_car("a", price=9_000_000)])
    try:
        r = client.get("/api/v1/b2b/collateral-value?make=Toyota&model=Premio", headers={"X-API-Key": "x"})
        assert r.status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_valuation_computed(monkeypatch):
    monkeypatch.setenv("B2B_API_KEYS", "k1")
    rows = [_car(str(i), price=8_000_000 + i * 200_000) for i in range(10)]
    client, _ = _client_with_data(rows)
    try:
        r = client.get(
            "/api/v1/b2b/collateral-value?make=Toyota&model=Premio&year=2019",
            headers={"X-API-Key": "k1"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["comparable_count"] == 10
        assert body["market_median_lkr"] > 8_000_000
        assert body["p25_lkr"] < body["market_median_lkr"] < body["p75_lkr"]
        assert body["confidence"] == "medium"  # 6-19 comparables
        assert body["median_days_on_market"] is not None
    finally:
        app.dependency_overrides.clear()


def test_no_comparables(monkeypatch):
    monkeypatch.setenv("B2B_API_KEYS", "k1")
    client, _ = _client_with_data([_car("a", price=9_000_000, make="Toyota", model="Premio")])
    try:
        r = client.get(
            "/api/v1/b2b/collateral-value?make=BMW&model=X5",
            headers={"X-API-Key": "k1"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["comparable_count"] == 0
        assert body["confidence"] == "none"
        assert body["market_median_lkr"] is None
    finally:
        app.dependency_overrides.clear()


def test_rate_limit_isolated_per_api_key(monkeypatch):
    monkeypatch.setenv("B2B_API_KEYS", "k1,k2")
    client, _ = _client_with_data([_car("a", price=9_000_000)])
    original_max_requests = b2b._b2b_rate_limiter.max_requests
    original_window_seconds = b2b._b2b_rate_limiter.window_seconds
    b2b._b2b_rate_limiter.max_requests = 2
    b2b._b2b_rate_limiter.window_seconds = 60

    try:
        endpoint = "/api/v1/b2b/collateral-value?make=Toyota&model=Premio"
        assert client.get(endpoint, headers={"X-API-Key": "k1"}).status_code == 200
        assert client.get(endpoint, headers={"X-API-Key": "k1"}).status_code == 200
        assert client.get(endpoint, headers={"X-API-Key": "k1"}).status_code == 429

        # A different API key gets an independent bucket.
        assert client.get(endpoint, headers={"X-API-Key": "k2"}).status_code == 200
    finally:
        b2b._b2b_rate_limiter.max_requests = original_max_requests
        b2b._b2b_rate_limiter.window_seconds = original_window_seconds
        app.dependency_overrides.clear()


def test_rotating_invalid_keys_share_one_ip_bucket(monkeypatch):
    """Fake keys must not mint fresh limiter buckets: invalid keys are keyed by IP."""
    monkeypatch.setenv("B2B_API_KEYS", "k1")
    client, _ = _client_with_data([_car("a", price=9_000_000)])
    original_max_requests = b2b._b2b_rate_limiter.max_requests
    b2b._b2b_rate_limiter.max_requests = 2

    try:
        endpoint = "/api/v1/b2b/collateral-value?make=Toyota&model=Premio"
        assert client.get(endpoint, headers={"X-API-Key": "fake-1"}).status_code == 401
        assert client.get(endpoint, headers={"X-API-Key": "fake-2"}).status_code == 401
        assert client.get(endpoint, headers={"X-API-Key": "fake-3"}).status_code == 429
        assert client.get(endpoint).status_code == 429
        # A valid key still has its own bucket.
        assert client.get(endpoint, headers={"X-API-Key": "k1"}).status_code == 200
    finally:
        b2b._b2b_rate_limiter.max_requests = original_max_requests
        app.dependency_overrides.clear()


def test_rate_limit_key_hashes_valid_key_and_uses_ip_for_invalid(monkeypatch):
    monkeypatch.setenv("B2B_API_KEYS", "secret-key-1")
    monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)
    monkeypatch.delenv("SPACE_ID", raising=False)

    class _Req:
        def __init__(self, key):
            self.headers = {"x-api-key": key} if key else {}
            self.client = type("C", (), {"host": "198.51.100.3"})()

    valid = b2b._b2b_rate_limit_key(_Req("secret-key-1"))
    assert valid.startswith("key:") and "secret-key-1" not in valid
    assert b2b._b2b_rate_limit_key(_Req("bogus")) == "ip:198.51.100.3"
    assert b2b._b2b_rate_limit_key(_Req(None)) == "ip:198.51.100.3"
