"""/listings pagination bounds and the /listings/makes|models TTL cache."""

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app
from db.models import Base, CarListing
from db.session import get_db


@pytest.fixture()
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()

    def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    counter = {"n": 0, "sql": []}

    @event.listens_for(engine, "before_cursor_execute")
    def _count(_conn, _cur, statement, *_a):
        counter["n"] += 1
        counter["sql"].append(statement)

    try:
        yield TestClient(app), db, counter
    finally:
        app.dependency_overrides.pop(get_db, None)


def _seed(db, make, model="Axio", sid=None):
    db.add(
        CarListing(
            source="ikman", source_id=sid or f"{make}-{model}", scraped_at=datetime.now(timezone.utc),
            title=f"{make} {model}", make=make, model=model, year=2020, price_lkr=3_500_000,
            district="Colombo", is_active=True,
        )
    )


def test_page_above_cap_is_rejected(env):
    client, _, _ = env
    assert client.get("/api/v1/listings", params={"page": 1001}).status_code == 422


def test_offset_above_cap_is_rejected(env):
    client, _, _ = env
    resp = client.get("/api/v1/listings", params={"page": 1000, "size": 100})
    assert resp.status_code == 400


def test_page_within_cap_still_works(env):
    client, db, _ = env
    _seed(db, "Toyota")
    db.commit()
    assert client.get("/api/v1/listings", params={"page": 2, "size": 10}).status_code == 200


def test_makes_cached_between_calls(env):
    client, db, counter = env
    _seed(db, "Toyota")
    db.commit()
    first = client.get("/api/v1/listings/makes").json()
    _seed(db, "Honda")
    db.commit()
    counter["n"] = 0
    second = client.get("/api/v1/listings/makes").json()
    assert second == first
    assert counter["n"] == 0


def test_models_reuses_make_index_and_caches(env):
    client, db, counter = env
    _seed(db, "Toyota", "Axio")
    _seed(db, "TOYOTA", "Vitz")
    db.commit()
    client.get("/api/v1/listings/makes")  # warms the shared make index
    counter["n"] = 0
    counter["sql"].clear()
    rows = client.get("/api/v1/listings/models", params={"make": "toyota"}).json()
    assert {r["model"] for r in rows} == {"Axio", "Vitz"}
    # Only the per-make model aggregate ran; no DISTINCT scan of all makes.
    assert counter["n"] == 1
    assert not any("DISTINCT" in s.upper() for s in counter["sql"])
    counter["n"] = 0
    assert client.get("/api/v1/listings/models", params={"make": "Toyota"}).json() == rows
    assert counter["n"] == 0


def test_unknown_make_returns_empty_and_is_not_cached(env):
    client, _, _ = env
    from app.utils import memory_cache

    assert client.get("/api/v1/listings/models", params={"make": "Nonexistentbrand"}).json() == []
    assert memory_cache.get_cached("listings:catalog:models:Nonexistentbrand", 600) is memory_cache.MISSING


def test_catalog_cache_can_be_disabled(env, monkeypatch):
    monkeypatch.setenv("LISTINGS_CATALOG_CACHE_TTL_SECONDS", "0")
    client, db, _ = env
    _seed(db, "Toyota")
    db.commit()
    assert {r["make"] for r in client.get("/api/v1/listings/makes").json()} == {"Toyota"}
    _seed(db, "Honda")
    db.commit()
    assert {r["make"] for r in client.get("/api/v1/listings/makes").json()} == {"Toyota", "Honda"}
