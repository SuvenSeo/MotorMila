"""Regression tests for the Android QA backend bugs (fix/backend-qa, Oct 2026).

B1 sign-in during the Neon quota outage (failover diagnostics, account-write
   guard, optional dedicated account store)
B2 district filter was a substring match (Galle also returned Kegalle/Tangalle)
B3 body_type filter leaked other body types (jeep -> suv/van, luxury, mini)
B4 sort=mileage_asc put rows without mileage first
B5 public browse reads answered 401 signed-out; empty permit market
B6 slow filtered listings (count cache, anonymous response cache, N+1 loads)
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from itertools import count
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app
from db.models import Base, CarListing, PlatformUser, VehiclePermit
from db.session import get_db

_ids = count(1)


@pytest.fixture()
def db_env(monkeypatch):
    monkeypatch.setattr("app.main.SKIP_DB_INIT", True)
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield engine, Session, TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def _listing(**overrides) -> CarListing:
    n = next(_ids)
    now = datetime.now(timezone.utc)
    data = dict(
        source="ikman",
        source_id=f"qa-{n}",
        url=f"https://ikman.lk/en/ad/qa-{n}",
        title="Toyota Aqua 2015",
        make="Toyota",
        model="Aqua",
        year=2015,
        price_lkr=Decimal("6500000"),
        scraped_at=now,
        first_seen_at=now - timedelta(minutes=n),
        last_seen_at=now,
        is_active=True,
        is_duplicate=False,
        is_outlier=False,
        user_listing_status="scraped",
    )
    data.update(overrides)
    return CarListing(**data)


def _seed(Session, rows):
    db = Session()
    try:
        db.add_all(rows)
        db.commit()
    finally:
        db.close()


def _get(client, query: str) -> dict:
    response = client.get(f"/api/v1/listings?size=100&{query}")
    assert response.status_code == 200, response.text
    return response.json()


# --------------------------------------------------------------------------- B2


def test_district_filter_is_exact_not_substring(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [
            _listing(district="Galle"),
            _listing(district="galle"),
            _listing(district="Kegalle"),
            _listing(district="Tangalle"),
            _listing(district="Colombo"),
        ],
    )
    for value in ("Galle", "galle", " GALLE ", "galle-"):
        body = _get(client, f"district={value}")
        districts = sorted(item["district"] for item in body["items"])
        assert districts == ["Galle", "galle"], (value, districts)
        assert body["total"] == 2


def test_district_filter_normalises_spacing_and_known_spellings(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [
            _listing(district="Nuwara Eliya"),
            _listing(district="Nuwara-Eliya"),
            _listing(district="Anuradapura"),
            _listing(district="Anuradhapura"),
        ],
    )
    assert _get(client, "district=nuwara-eliya")["total"] == 2
    assert _get(client, "district=Nuwara%20%20Eliya")["total"] == 2
    assert _get(client, "district=Anuradhapura")["total"] == 2


# --------------------------------------------------------------------------- B3


def test_body_type_jeep_excludes_other_tagged_body_types(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [
            _listing(title="Mahindra Jeep 1995", make="Mahindra", model="Jeep", body_type="jeep"),
            _listing(title="Land Rover Defender jeep 2005", make="Land Rover", body_type=None),
            _listing(title="Untagged 4x4", vehicle_category="jeeps", body_type=None),
            _listing(title="Toyota Prado jeep 2012", make="Toyota", body_type="SUV"),
            _listing(title="Nissan Caravan jeep look", body_type="van", vehicle_category="jeeps"),
            _listing(title="Jeep Renegade 2018", make="Jeep", body_type="suv"),
        ],
    )
    body = _get(client, "body_type=jeep")
    assert body["total"] == 3
    assert {str(item["body_type"]) for item in body["items"]} <= {"jeep", "None"}


def test_body_type_luxury_and_mini_only_use_heuristics_for_untagged_rows(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [
            _listing(title="Mercedes-Benz C200", make="Mercedes-Benz", body_type="luxury"),
            _listing(title="BMW 520d", make="BMW", body_type=None),
            _listing(title="Mercedes-Benz Sprinter", make="Mercedes-Benz", body_type="van"),
            _listing(title="Toyota Premio premium", make="Toyota", body_type="sedan"),
            _listing(title="Mini Cooper S", make="Mini", body_type=None),
            _listing(title="Suzuki Alto", make="Suzuki", body_type="mini"),
            _listing(title="Micro Panda", make="Micro", body_type="suv"),
        ],
    )
    luxury = _get(client, "body_type=luxury")
    assert sorted(item["title"] for item in luxury["items"]) == ["BMW 520d", "Mercedes-Benz C200"]
    mini = _get(client, "body_type=mini")
    assert sorted(item["title"] for item in mini["items"]) == ["Mini Cooper S", "Suzuki Alto"]


def test_body_type_plain_types_match_aliases_only(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [
            _listing(body_type="SUV"),
            _listing(body_type="Sport Utility Vehicle"),
            _listing(body_type="van"),
            _listing(body_type=None, title="Toyota RAV4 SUV"),
        ],
    )
    assert _get(client, "body_type=suv")["total"] == 2


# --------------------------------------------------------------------------- B4


def test_mileage_sort_puts_missing_mileage_last(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [
            _listing(mileage=None),
            _listing(mileage=85000),
            _listing(mileage=None),
            _listing(mileage=12000),
        ],
    )
    mileages = [item["mileage"] for item in _get(client, "sort=mileage_asc")["items"]]
    assert mileages == [12000, 85000, None, None]


def test_price_sorts_keep_order(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [_listing(price_lkr=Decimal(p)) for p in ("7000000", "5000000", "9000000")],
    )
    asc = [float(i["price_lkr"]) for i in _get(client, "sort=price_asc")["items"]]
    desc = [float(i["price_lkr"]) for i in _get(client, "sort=price_desc")["items"]]
    assert asc == sorted(asc)
    assert desc == sorted(desc, reverse=True)


# --------------------------------------------------------------------------- B5


def test_public_browse_reads_open_signed_out_and_pro_stays_gated(db_env, monkeypatch):
    _engine, Session, client = db_env
    monkeypatch.setenv("APP_ACCESS_ENFORCED", "true")
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "qa-secret")
    _seed(Session, [_listing(id=4242)])

    import app.api.v1.endpoints.calculators as calculators
    import app.api.v1.endpoints.listings as listings
    import app.api.v1.endpoints.vehicles as vehicles

    monkeypatch.setattr(calculators, "fetch_vehicle_policy_news", lambda limit=8: [])
    monkeypatch.setattr(vehicles, "combined_research", lambda **kwargs: {"ok": True})
    monkeypatch.setattr(listings, "combined_research", lambda **kwargs: {"ok": True})
    monkeypatch.setattr(listings, "enrich_listing", lambda db, listing: {"lat": None, "lng": None})

    for path in (
        "/api/v1/calculators/permits",
        "/api/v1/calculators/vehicle-news",
        "/api/v1/vehicles/safety-research?make=Toyota&model=Aqua&year=2015",
        "/api/v1/listings/4242/history-report",
        "/api/v1/listings/4242/safety-research",
        "/api/v1/listings/4242/geo",
        "/api/v1/listings/4242/seller-profile",
    ):
        response = client.get(path)
        assert response.status_code not in (401, 403), (path, response.status_code, response.text)

    # Paid surfaces stay gated.
    assert client.get("/api/v1/pro/market-snapshot").status_code in (401, 403)
    assert client.get("/api/v1/pro/districts").status_code in (401, 403)
    # Writes stay gated / CSRF-protected.
    assert client.post("/api/v1/calculators/permits", json={}).status_code in (401, 403, 422)


def test_permits_fall_back_to_baseline_when_table_is_empty(db_env):
    _engine, Session, client = db_env
    body = client.get("/api/v1/calculators/permits").json()
    assert len(body) >= 4
    assert all(row["baseline"] is True for row in body)
    prices = [row["market_price_lkr"] for row in body]
    assert prices == sorted(prices, reverse=True)


def test_permits_prefer_real_rows(db_env):
    _engine, Session, client = db_env
    _seed(
        Session,
        [VehiclePermit(permit_name="Live Permit", permit_type="ev", market_price_lkr=Decimal("2100000"))],
    )
    body = client.get("/api/v1/calculators/permits").json()
    assert [row["permit_name"] for row in body] == ["Live Permit"]
    assert body[0]["baseline"] is False


# --------------------------------------------------------------------------- B6


def _count_selects(engine):
    seen = {"count": 0, "select": 0}

    @event.listens_for(engine, "before_cursor_execute")
    def _on(conn, cursor, statement, params, context, executemany):  # noqa: ANN001
        if "car_listings" in statement and statement.lstrip().upper().startswith("SELECT"):
            seen["select"] += 1
            if "count(" in statement.lower():
                seen["count"] += 1

    return seen


def test_listing_page_has_no_per_row_lazy_loads(db_env):
    engine, Session, client = db_env
    _seed(Session, [_listing() for _ in range(15)])
    seen = _count_selects(engine)
    _get(client, "")
    # One page query + one count query; no per-row images/is_active loads.
    assert seen["select"] <= 3, seen


def test_count_and_anonymous_response_are_cached(db_env, monkeypatch):
    engine, Session, client = db_env
    monkeypatch.setenv("LISTINGS_CACHE_FORCE", "true")
    _seed(Session, [_listing(district="Galle") for _ in range(3)])
    seen = _count_selects(engine)

    first = _get(client, "district=Galle")
    after_first = dict(seen)
    second = _get(client, "district=Galle")
    assert second == first
    assert seen == after_first  # anonymous response served from cache

    # Another page / sort of the same filters reuses the cached count.
    _get(client, "district=Galle&sort=price_asc")
    assert seen["count"] == after_first["count"]


def test_listing_cache_disabled_by_default_under_pytest(db_env):
    from app.utils import listing_cache

    listing_cache.put("x", 1)
    assert listing_cache.get("x") is listing_cache.MISSING


def test_listing_cache_is_bounded(monkeypatch):
    from app.utils import listing_cache

    monkeypatch.setenv("LISTINGS_CACHE_FORCE", "true")
    monkeypatch.setenv("LISTINGS_CACHE_MAX_ENTRIES", "3")
    for i in range(10):
        listing_cache.put(f"k{i}", i)
    assert listing_cache.size() == 3
    assert listing_cache.get("k9") == 9
    assert listing_cache.get("k0") is listing_cache.MISSING


def test_live_browse_index_patch_is_registered():
    from db.schema_patches import _INDEX_PATCHES

    names = {name for name, _table, _cols in _INDEX_PATCHES}
    assert "idx_car_listings_live_browse" in names


# --------------------------------------------------------------------------- B1


def test_classify_primary_error_recognises_neon_quota():
    from db.sqlite_failover import classify_primary_error

    assert classify_primary_error(None) == "ok"
    assert (
        classify_primary_error(
            'connection to server at "ep-x-pooler.neon.tech", port 5432 failed: ERROR:  '
            "Your account or project has exceeded the quota. Upgrade your plan to increase limits."
        )
        == "quota_exceeded"
    )
    assert classify_primary_error("could not translate host name") == "unreachable"
    assert classify_primary_error("password authentication failed for user") == "auth_failed"


def test_probe_records_primary_status(monkeypatch):
    from db import sqlite_failover

    class _Boom:
        def connect(self):
            raise RuntimeError("Your account or project has exceeded the quota.")

        def dispose(self):
            pass

    monkeypatch.setattr(sqlite_failover, "create_engine", lambda *a, **k: _Boom())
    assert sqlite_failover._probe_url("postgresql://u:p@h/db") is False
    assert sqlite_failover.failover_status()["primary_status"] == "quota_exceeded"


def test_health_reports_primary_status(db_env):
    _engine, _Session, client = db_env
    body = client.get("/health").json()
    assert "primary_status" in body


def test_account_writes_answer_503_in_failover_mode(db_env, monkeypatch):
    _engine, _Session, client = db_env
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "qa-secret")
    monkeypatch.setenv("SELF_SIGNUP", "true")
    import db.sqlite_failover as failover

    monkeypatch.setattr(failover, "_activated", True)
    invite = client.get("/api/v1/auth/invite/some-token")
    assert invite.status_code == 503
    assert invite.json()["code"] == "db_unavailable"
    signup = client.post(
        "/api/v1/auth/signup",
        json={"token": "some-token-long-enough-123", "name": "QA", "password": "a-long-password-1"},
    )
    assert signup.status_code == 503
    self_signup = client.post(
        "/api/v1/auth/self-signup",
        json={"email": "qa@example.com", "name": "QA", "password": "a-long-password-1"},
    )
    assert self_signup.status_code == 503


def test_unknown_account_login_in_failover_is_503_not_401(db_env, monkeypatch):
    _engine, _Session, client = db_env
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "qa-secret")
    import db.sqlite_failover as failover

    monkeypatch.setattr(failover, "_activated", True)
    response = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"}
    )
    assert response.status_code == 503


def test_dedicated_auth_store_routes_accounts_and_survives_failover_rebind(tmp_path, monkeypatch):
    from app.api.v1.endpoints import auth
    from db import session as db_session

    auth_db = tmp_path / "auth.db"
    catalog_db = tmp_path / "catalog.db"
    original_url = db_session.HOT_URL
    try:
        db_session.configure_auth_store(f"sqlite:///{auth_db}")
        db_session.init_db()
        assert db_session.has_dedicated_auth_store()

        db = db_session.HotSessionLocal()
        try:
            db.add(PlatformUser(email="kept@example.com", password_hash="x", name="Kept"))
            db.commit()
        finally:
            db.close()

        # Failover rebinds the catalog engine; accounts stay on the auth store.
        db_session.reattach_engines(f"sqlite:///{catalog_db}")
        import db.sqlite_failover as failover

        monkeypatch.setattr(failover, "_activated", True)
        assert auth._accounts_store_degraded() is False
        db = db_session.HotSessionLocal()
        try:
            row = db.query(PlatformUser).filter(PlatformUser.email == "kept@example.com").first()
            assert row is not None
            assert db.get_bind(CarListing).url.database == str(catalog_db)
        finally:
            db.close()
    finally:
        db_session.configure_auth_store(None)
        db_session.reattach_engines(original_url)
    assert not db_session.has_dedicated_auth_store()
