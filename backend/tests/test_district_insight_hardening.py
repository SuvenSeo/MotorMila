"""/stats/district-insight: bounded input, escaped LIKE, no scan for unknown
districts, and per-district caching in market_stats_cache."""

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import stats
from app.utils.stats_cache import district_insight_cache_key
from db.models import Base, CarListing, MarketStatsCache


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)(), engine


def _car(sid, price, *, district="Kandy", url=None):
    now = datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc)
    return CarListing(
        source="ikman", source_id=sid, scraped_at=now, first_seen_at=now, last_seen_at=now,
        make="Toyota", model="Vitz", year=2018, price_lkr=price, district=district, city=district,
        title=f"Toyota Vitz {sid}", url=url or f"https://example.com/{sid}", is_outlier=False,
    )


def _count_queries(engine):
    counter = {"n": 0}

    @event.listens_for(engine, "before_cursor_execute")
    def _inc(*_a, **_k):
        counter["n"] += 1

    return counter


def test_unknown_district_returns_empty_without_querying():
    db, engine = _session()
    counter = _count_queries(engine)
    payload = stats.get_district_quick_insight(district="%%_not_a_district", db=db)
    assert payload["listing_count"] == 0
    assert payload["top_models"] == []
    assert counter["n"] == 0


def test_result_is_cached_per_district():
    db, engine = _session()
    db.add_all([_car("k1", 5_000_000), _car("k2", 7_000_000)])
    db.commit()

    first = stats.get_district_quick_insight(district="kandy", db=db)
    assert first["listing_count"] == 2
    assert db.query(MarketStatsCache).filter(
        MarketStatsCache.cache_key == district_insight_cache_key("Kandy")
    ).count() == 1

    # New data is not visible until the cache entry is dropped (1 h TTL).
    db.add(_car("k3", 9_000_000))
    db.commit()
    counter = _count_queries(engine)
    second = stats.get_district_quick_insight(district="Kandy", db=db)
    assert second["listing_count"] == 2
    assert counter["n"] == 1  # single cache read

    db.query(MarketStatsCache).delete()
    db.commit()
    assert stats.get_district_quick_insight(district="Kandy", db=db)["listing_count"] == 3


def test_url_fallback_only_for_rows_without_district():
    db, _ = _session()
    db.add_all(
        [
            _car("tagged", 5_000_000, district="Kandy"),
            _car("untagged", 6_000_000, district=None, url="https://ikman.lk/en/ad/toyota-vitz-for-sale-kandy-1"),
            # Has its own district: must not be pulled into Kandy by its URL.
            _car("other", 7_000_000, district="Gampaha", url="https://ikman.lk/en/ad/toyota-vitz-for-sale-kandy-2"),
        ]
    )
    db.commit()
    payload = stats.get_district_quick_insight(district="Kandy", db=db)
    assert payload["listing_count"] == 2


def test_escape_like_neutralises_wildcards():
    assert stats._escape_like("a%b_c\\") == "a\\%b\\_c\\\\"


def test_district_param_is_length_capped():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    resp = client.get("/api/v1/stats/district-insight", params={"district": "x" * 200})
    assert resp.status_code == 422
