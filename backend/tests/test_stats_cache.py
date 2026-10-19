"""Tests for the stats materialized cache layer.

Covers:
  - MarketStatsCache model round-trip
  - _is_fresh TTL logic
  - refresh_stats_cache populates summary, district_prices, district_velocity, trends, insights, price_index
  - get_cached_summary / get_cached_district_prices / get_cached_district_velocity honour staleness
  - allow_stale=True serves expired summary / district_prices / district_velocity payloads
  - store_summary_cache / store_district_prices_cache / store_district_velocity_cache helpers
  - stats summary endpoint uses cache on hit, stores on miss, stale fallback on compute failure
  - district-prices endpoint uses cache on hit, stores on miss, stale fallback on compute failure
  - district-velocity endpoint uses cache on hit and stale fallback on compute failure
  - trends/insights/price-index endpoints use cache on hit, store on miss, stale fallback on failure
  - trends cache keys vary by significant query params
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import stats as stats_module
from app.models.schemas import DistrictVelocityResponse, StatsSummary
from app.utils import stats_cache
from app.utils.stats_cache import (
    CACHE_TTL_SECONDS,
    PRICE_INDEX_TTL_SECONDS,
    TRENDS_TTL_SECONDS,
    _is_fresh,
    build_trends_cache_key,
    get_cache_meta,
    get_cached_district_prices,
    get_cached_district_velocity,
    get_cached_insights,
    get_cached_price_index,
    get_cached_summary,
    get_cached_trends,
    read_export_section,
    refresh_stats_cache,
    store_district_prices_cache,
    store_district_velocity_cache,
    store_insights_cache,
    store_price_index_cache,
    store_summary_cache,
    store_trends_cache,
    ttl_for_key,
    with_degraded_flag,
)
from db.models import Base, CarListing, MarketStatsCache, PriceAggregate
from unittest.mock import MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _listing(
    source_id: str,
    price_lkr: int | None,
    deal_score: float,
    *,
    make: str = "Toyota",
    model: str = "Vitz",
    district: str = "Colombo",
) -> CarListing:
    now = datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc)
    return CarListing(
        source="ikman",
        source_id=source_id,
        scraped_at=now,
        first_seen_at=now,
        last_seen_at=now,
        make=make,
        model=model,
        year=2018,
        price_lkr=price_lkr,
        deal_score=deal_score,
        district=district,
        city=district,
        title=f"{make} {model} {source_id}",
        url=f"https://example.com/{source_id}",
        is_outlier=False,
    )


def _fresh_summary_entry(db, *, total_listings: int = 5) -> MarketStatsCache:
    payload = StatsSummary(
        total_listings=total_listings,
        avg_price_lkr=7_500_000.0,
        good_deals_count=2,
        listings_this_week=3,
        districts_covered=4,
        source_count=2,
    ).model_dump(mode="json")
    now = datetime.now(timezone.utc)
    entry = MarketStatsCache(cache_key="summary", payload=payload, refreshed_at=now)
    db.add(entry)
    db.commit()
    return entry


def _stale_summary_entry(db) -> MarketStatsCache:
    payload = StatsSummary(
        total_listings=99,
        avg_price_lkr=1_000_000.0,
        good_deals_count=0,
        listings_this_week=0,
        districts_covered=1,
        source_count=1,
    ).model_dump(mode="json")
    stale_time = datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 60)
    entry = MarketStatsCache(cache_key="summary", payload=payload, refreshed_at=stale_time)
    db.add(entry)
    db.commit()
    return entry


# ---------------------------------------------------------------------------
# _is_fresh
# ---------------------------------------------------------------------------


def test_is_fresh_returns_true_for_recent_entry():
    entry = MarketStatsCache(
        cache_key="summary",
        payload={},
        refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=60),
    )
    assert _is_fresh(entry) is True


def test_is_fresh_returns_false_when_older_than_ttl():
    entry = MarketStatsCache(
        cache_key="summary",
        payload={},
        refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 1),
    )
    assert _is_fresh(entry) is False


def test_is_fresh_treats_naive_datetime_as_utc():
    # Simulate a naive datetime stored by a driver that strips tzinfo
    naive_recent = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=30)
    entry = MarketStatsCache(cache_key="summary", payload={}, refreshed_at=naive_recent)
    assert _is_fresh(entry) is True


def test_is_fresh_returns_false_when_refreshed_at_is_none():
    entry = MarketStatsCache(cache_key="summary", payload={}, refreshed_at=None)
    assert _is_fresh(entry) is False


# ---------------------------------------------------------------------------
# get_cached_summary
# ---------------------------------------------------------------------------


def test_get_cached_summary_returns_none_when_no_entry():
    db = _session()
    assert get_cached_summary(db) is None


def test_get_cached_summary_returns_none_when_stale():
    db = _session()
    _stale_summary_entry(db)
    assert get_cached_summary(db, allow_stale=False) is None


def test_get_cached_summary_allow_stale_returns_stale_entry():
    db = _session()
    _stale_summary_entry(db)
    assert get_cached_summary(db, allow_stale=False) is None
    stale = get_cached_summary(db, allow_stale=True)
    assert stale is not None
    assert stale.total_listings == 99


def test_get_cached_summary_defaults_to_allow_stale_swr():
    db = _session()
    _stale_summary_entry(db)
    stale = get_cached_summary(db)
    assert stale is not None
    assert stale.total_listings == 99


def test_get_cached_summary_returns_summary_when_fresh():
    db = _session()
    _fresh_summary_entry(db, total_listings=42)
    result = get_cached_summary(db)
    assert result is not None
    assert isinstance(result, StatsSummary)
    assert result.total_listings == 42


def test_get_cached_summary_returns_none_on_corrupt_payload():
    db = _session()
    entry = MarketStatsCache(
        cache_key="summary",
        payload={"this_is": "garbage_that_wont_validate"},
        refreshed_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()
    # Should not raise, returns None gracefully
    assert get_cached_summary(db) is None


# ---------------------------------------------------------------------------
# get_cached_district_prices
# ---------------------------------------------------------------------------


def test_get_cached_district_prices_returns_none_when_no_entry():
    db = _session()
    assert get_cached_district_prices(db) is None


def test_get_cached_district_prices_returns_none_when_stale():
    db = _session()
    stale_time = datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 60)
    entry = MarketStatsCache(
        cache_key="district_prices",
        payload={"points": []},
        refreshed_at=stale_time,
    )
    db.add(entry)
    db.commit()
    assert get_cached_district_prices(db, allow_stale=False) is None


def test_get_cached_district_prices_allow_stale_returns_stale_entry():
    db = _session()
    stale_time = datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 60)
    expected = {"points": [{"district": "Gampaha", "count": 7}]}
    db.add(
        MarketStatsCache(
            cache_key="district_prices",
            payload=expected,
            refreshed_at=stale_time,
        )
    )
    db.commit()
    assert get_cached_district_prices(db, allow_stale=False) is None
    stale = get_cached_district_prices(db, allow_stale=True)
    assert stale is not None
    assert stale["points"][0]["district"] == "Gampaha"


def test_get_cached_district_prices_returns_dict_when_fresh():
    db = _session()
    expected = {"points": [{"district": "Colombo", "count": 10, "avg_price_lkr": 7_000_000.0}]}
    db.add(
        MarketStatsCache(
            cache_key="district_prices",
            payload=expected,
            refreshed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    result = get_cached_district_prices(db)
    assert result is not None
    assert result["points"][0]["district"] == "Colombo"


# ---------------------------------------------------------------------------
# store_summary_cache / store_district_prices_cache
# ---------------------------------------------------------------------------


def test_store_summary_cache_creates_entry():
    db = _session()
    summary = StatsSummary(
        total_listings=10,
        avg_price_lkr=8_000_000.0,
        good_deals_count=1,
        listings_this_week=2,
        districts_covered=3,
        source_count=2,
    )
    store_summary_cache(db, summary)
    result = get_cached_summary(db)
    assert result is not None
    assert result.total_listings == 10


def test_store_summary_cache_updates_existing_entry():
    db = _session()
    summary_v1 = StatsSummary(
        total_listings=5,
        good_deals_count=0,
        listings_this_week=0,
        districts_covered=1,
        source_count=1,
    )
    store_summary_cache(db, summary_v1)

    summary_v2 = StatsSummary(
        total_listings=999,
        good_deals_count=5,
        listings_this_week=10,
        districts_covered=4,
        source_count=3,
    )
    store_summary_cache(db, summary_v2)

    result = get_cached_summary(db)
    assert result is not None
    assert result.total_listings == 999


def test_store_district_prices_cache_creates_entry():
    db = _session()
    payload = {"points": [{"district": "Kandy"}]}
    store_district_prices_cache(db, payload)
    result = get_cached_district_prices(db)
    assert result is not None
    assert result["points"][0]["district"] == "Kandy"


def test_store_summary_cache_is_nonfatal_on_db_error(monkeypatch):
    db = _session()

    def _boom(*args, **kwargs):
        raise RuntimeError("injected failure")

    monkeypatch.setattr(stats_cache, "_upsert", _boom)
    summary = StatsSummary(
        total_listings=1,
        good_deals_count=0,
        listings_this_week=0,
        districts_covered=1,
        source_count=1,
    )
    # Must not raise
    store_summary_cache(db, summary)


# ---------------------------------------------------------------------------
# trends / insights / price-index cache helpers
# ---------------------------------------------------------------------------


def test_build_trends_cache_key_is_stable_for_equivalent_args():
    key_a = build_trends_cache_key(
        make=" Toyota ",
        model="Vitz",
        condition=" Used ",
        district=" Colombo ",
        months=12,
    )
    key_b = build_trends_cache_key(
        make="toyota",
        model="vitz",
        condition="used",
        district="colombo",
        months=12,
    )
    assert key_a == key_b


def test_build_trends_cache_key_changes_when_significant_args_change():
    baseline = build_trends_cache_key(
        make="toyota",
        model="vitz",
        condition="used",
        district="colombo",
        months=12,
    )
    different_months = build_trends_cache_key(
        make="toyota",
        model="vitz",
        condition="used",
        district="colombo",
        months=18,
    )
    different_district = build_trends_cache_key(
        make="toyota",
        model="vitz",
        condition="used",
        district="kandy",
        months=12,
    )
    assert baseline != different_months
    assert baseline != different_district


def test_trends_cache_ttl_and_allow_stale():
    db = _session()
    cache_key = build_trends_cache_key(
        make="toyota",
        model="vitz",
        condition=None,
        district=None,
        months=12,
    )
    payload = {"points": [{"year": 2026, "month": 4}], "coverage_scope": "exact", "coverage_note": None}
    db.add(
        MarketStatsCache(
            cache_key=cache_key,
            payload=payload,
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=TRENDS_TTL_SECONDS + 5),
        )
    )
    db.commit()

    assert get_cached_trends(db, cache_key, allow_stale=False) is None
    stale = get_cached_trends(db, cache_key, allow_stale=True)
    assert stale is not None
    assert stale["coverage_scope"] == "exact"


def test_store_and_get_insights_and_price_index_cache_round_trip():
    db = _session()
    insights_payload = {
        "new_listings_24h": 1,
        "segment_performance": [],
        "trending_models": [],
        "hot_deals": [],
    }
    price_index_payload = {
        "series": [],
        "top_makes": [],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    store_insights_cache(db, insights_payload)
    store_price_index_cache(db, price_index_payload)

    insights = get_cached_insights(db)
    price_index = get_cached_price_index(db)
    assert insights is not None
    assert insights["new_listings_24h"] == 1
    assert price_index is not None
    assert "series" in price_index


def test_store_trends_cache_round_trip():
    db = _session()
    cache_key = build_trends_cache_key(
        make=None,
        model=None,
        condition=None,
        district=None,
        months=12,
    )
    payload = {"points": [], "coverage_scope": "none", "coverage_note": "no data"}
    store_trends_cache(db, cache_key, payload)
    cached = get_cached_trends(db, cache_key)
    assert cached is not None
    assert cached["coverage_scope"] == "none"


# ---------------------------------------------------------------------------
# refresh_stats_cache (end-to-end)
# ---------------------------------------------------------------------------


def test_refresh_stats_cache_creates_expected_keys():
    db = _session()
    db.add_all(
        [
            _listing("l1", 7_000_000, 5.0, district="Colombo"),
            _listing("l2", 8_000_000, 6.0, district="Gampaha"),
        ]
    )
    db.commit()

    refresh_stats_cache(db)

    summary_entry = db.query(MarketStatsCache).filter_by(cache_key="summary").first()
    dp_entry = db.query(MarketStatsCache).filter_by(cache_key="district_prices").first()
    velocity_entry = db.query(MarketStatsCache).filter_by(cache_key="district_velocity").first()
    trends_key = build_trends_cache_key(
        make=None,
        model=None,
        condition=None,
        district=None,
        months=12,
    )
    trends_entry = db.query(MarketStatsCache).filter_by(cache_key=trends_key).first()
    insights_entry = db.query(MarketStatsCache).filter_by(cache_key="insights").first()
    price_index_entry = db.query(MarketStatsCache).filter_by(cache_key="price_index").first()

    assert summary_entry is not None
    assert dp_entry is not None
    assert velocity_entry is not None
    assert trends_entry is not None
    assert insights_entry is not None
    assert price_index_entry is not None
    assert isinstance(velocity_entry.payload, dict)
    assert "points" in velocity_entry.payload


def test_refresh_stats_cache_summary_reflects_listing_count():
    db = _session()
    for i in range(7):
        db.add(_listing(f"car-{i}", 6_500_000, 5.0))
    db.commit()

    refresh_stats_cache(db)

    cached = get_cached_summary(db)
    assert cached is not None
    assert cached.total_listings == 7


def test_refresh_stats_cache_tolerates_empty_db():
    db = _session()
    # No listings — should not raise
    refresh_stats_cache(db)
    cached = get_cached_summary(db)
    assert cached is not None
    assert cached.total_listings == 0


def test_refresh_stats_cache_overwrites_stale_entry():
    db = _session()
    _stale_summary_entry(db)
    db.add(_listing("fresh-car", 5_000_000, 4.0))
    db.commit()

    assert get_cached_summary(db, allow_stale=False) is None  # stale → miss

    refresh_stats_cache(db)

    cached = get_cached_summary(db)
    assert cached is not None
    assert cached.total_listings == 1


# ---------------------------------------------------------------------------
# Endpoint integration: summary
# ---------------------------------------------------------------------------


def test_stats_summary_endpoint_returns_cached_value_on_hit(monkeypatch):
    db = _session()
    _fresh_summary_entry(db, total_listings=77)

    # Patch _compute functions to blow up if called — cache must not be bypassed
    monkeypatch.setattr(stats_module, "utc_now", lambda: (_ for _ in ()).throw(AssertionError("should not compute")))

    result = stats_module.get_stats_summary(db=db)

    assert result.total_listings == 77


def test_stats_summary_endpoint_stores_to_cache_on_miss():
    db = _session()
    db.add(_listing("car-a", 9_000_000, 5.0))
    db.commit()

    # No cache entry — endpoint should compute and store
    assert get_cached_summary(db) is None

    result = stats_module.get_stats_summary(db=db)
    assert result.total_listings == 1

    # Cache should now be warm
    cached = get_cached_summary(db)
    assert cached is not None
    assert cached.total_listings == 1


def test_stats_summary_endpoint_computes_fresh_when_stale():
    db = _session()
    _stale_summary_entry(db)
    db.add(_listing("car-b", 7_500_000, 5.0))
    db.commit()

    result = stats_module.get_stats_summary(db=db)
    assert result.total_listings == 1

    # Cache entry should now be refreshed
    cached = get_cached_summary(db)
    assert cached is not None
    assert cached.total_listings == 1


def test_stats_summary_endpoint_serves_stale_cache_on_compute_failure(monkeypatch):
    db = _session()
    _stale_summary_entry(db)

    monkeypatch.setattr(
        stats_module,
        "utc_now",
        lambda: (_ for _ in ()).throw(RuntimeError("db down")),
    )

    result = stats_module.get_stats_summary(db=db)
    assert result.total_listings == 99


# ---------------------------------------------------------------------------
# Endpoint integration: district-prices
# ---------------------------------------------------------------------------


def test_district_prices_endpoint_returns_cached_on_hit(monkeypatch):
    db = _session()
    expected = {"points": [{"district": "Colombo", "count": 99}]}
    db.add(
        MarketStatsCache(
            cache_key="district_prices",
            payload=expected,
            refreshed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    def _boom(*args, **kwargs):
        raise AssertionError("should not touch db for district prices")

    monkeypatch.setattr(stats_module, "build_district_median_map", _boom)

    result = stats_module.get_district_prices(db=db)
    assert result["points"][0]["count"] == 99


def test_district_prices_endpoint_stores_to_cache_on_miss():
    db = _session()
    db.add_all(
        [
            _listing("d1", 7_000_000, 5.0, district="Colombo"),
            _listing("d2", 8_000_000, 5.0, district="Colombo"),
        ]
    )
    db.commit()

    assert get_cached_district_prices(db) is None

    result = stats_module.get_district_prices(db=db)
    # Colombo is a recognised district with coordinates; points should be non-empty
    assert isinstance(result, dict)
    assert "points" in result

    cached = get_cached_district_prices(db)
    assert cached is not None
    assert "points" in cached


def test_district_prices_endpoint_serves_stale_cache_on_compute_failure(monkeypatch):
    db = _session()
    stale_payload = {"points": [{"district": "Colombo", "count": 42}]}
    db.add(
        MarketStatsCache(
            cache_key="district_prices",
            payload=stale_payload,
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 60),
        )
    )
    db.commit()

    monkeypatch.setattr(
        stats_module,
        "build_district_median_map",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")),
    )

    result = stats_module.get_district_prices(db=db)
    assert result["points"][0]["district"] == "Colombo"
    assert result["points"][0]["count"] == 42


# ---------------------------------------------------------------------------
# Endpoint integration: trends / insights / price-index
# ---------------------------------------------------------------------------


def test_trends_endpoint_returns_cached_on_hit(monkeypatch):
    db = _session()
    # Anonymous MagicMock() requests are free-teased (plan=None -> free
    # tier) since the CSRF/free-tease fix; force a non-free plan so this
    # test exercises cache read-through, not the free-tier month cap.
    monkeypatch.setattr(stats_module, "resolve_request_access", lambda *a, **k: ("pro", "user"))
    cache_key = build_trends_cache_key(
        make="toyota",
        model="vitz",
        condition=None,
        district=None,
        months=12,
    )
    expected = {"points": [{"year": 2026, "month": 4}], "coverage_scope": "exact", "coverage_note": None}
    db.add(
        MarketStatsCache(
            cache_key=cache_key,
            payload=expected,
            refreshed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    monkeypatch.setattr(
        stats_module,
        "_compute_price_trends_payload",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("should not compute trends")),
    )
    result = stats_module.get_price_trends(request=MagicMock(), make="Toyota", model="Vitz", months=12, db=db)
    assert result["coverage_scope"] == "exact"


def test_trends_endpoint_stores_on_miss(monkeypatch):
    db = _session()
    monkeypatch.setattr(stats_module, "resolve_request_access", lambda *a, **k: ("pro", "user"))
    cache_key = build_trends_cache_key(
        make="toyota",
        model="vitz",
        condition=None,
        district=None,
        months=12,
    )
    assert get_cached_trends(db, cache_key) is None

    result = stats_module.get_price_trends(request=MagicMock(), make="toyota", model="vitz", months=12, db=db)
    cached = get_cached_trends(db, cache_key)
    assert isinstance(result, dict)
    assert cached is not None
    assert cached["coverage_scope"] == result["coverage_scope"]


def test_trends_endpoint_serves_stale_on_compute_failure(monkeypatch):
    db = _session()
    monkeypatch.setattr(stats_module, "resolve_request_access", lambda *a, **k: ("pro", "user"))
    cache_key = build_trends_cache_key(
        make=None,
        model=None,
        condition=None,
        district=None,
        months=12,
    )
    stale_payload = {"points": [], "coverage_scope": "none", "coverage_note": "cached stale"}
    db.add(
        MarketStatsCache(
            cache_key=cache_key,
            payload=stale_payload,
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=TRENDS_TTL_SECONDS + 10),
        )
    )
    db.commit()

    monkeypatch.setattr(
        stats_module,
        "_compute_price_trends_payload",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")),
    )
    result = stats_module.get_price_trends(request=MagicMock(), months=12, db=db)
    assert result["coverage_note"] == "cached stale"
    assert result["degraded"] is True
    assert result["stale_age_seconds"] is not None


def test_insights_endpoint_returns_cached_on_hit(monkeypatch):
    db = _session()
    expected = {
        "new_listings_24h": 7,
        "segment_performance": [],
        "trending_models": [],
        "hot_deals": [],
    }
    db.add(
        MarketStatsCache(
            cache_key="insights",
            payload=expected,
            refreshed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    monkeypatch.setattr(
        stats_module,
        "_compute_dashboard_insights_payload",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not compute insights")),
    )
    result = stats_module.get_dashboard_insights(db=db)
    assert result["new_listings_24h"] == 7


def test_insights_endpoint_stores_on_miss(monkeypatch):
    db = _session()
    payload = {
        "new_listings_24h": 11,
        "segment_performance": [],
        "trending_models": [],
        "hot_deals": [],
    }
    monkeypatch.setattr(
        stats_module,
        "_compute_dashboard_insights_payload",
        lambda *_args, **_kwargs: payload,
    )

    result = stats_module.get_dashboard_insights(db=db)
    cached = get_cached_insights(db)
    assert result["new_listings_24h"] == 11
    assert cached is not None
    assert cached["new_listings_24h"] == 11


def test_insights_endpoint_serves_stale_on_compute_failure(monkeypatch):
    db = _session()
    stale_payload = {
        "new_listings_24h": 3,
        "segment_performance": [],
        "trending_models": [],
        "hot_deals": [],
    }
    db.add(
        MarketStatsCache(
            cache_key="insights",
            payload=stale_payload,
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 10),
        )
    )
    db.commit()
    monkeypatch.setattr(
        stats_module,
        "_compute_dashboard_insights_payload",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")),
    )
    result = stats_module.get_dashboard_insights(db=db)
    assert result["new_listings_24h"] == 3


def test_price_index_endpoint_returns_cached_on_hit(monkeypatch):
    db = _session()
    expected = {"series": [], "top_makes": [], "generated_at": datetime.now(timezone.utc).isoformat()}
    db.add(
        MarketStatsCache(
            cache_key="price_index",
            payload=expected,
            refreshed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    monkeypatch.setattr(
        stats_module,
        "_compute_price_index_payload",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not compute price index")),
    )
    result = stats_module.get_price_index(request=MagicMock(), db=db)
    assert "series" in result


def test_price_index_endpoint_stores_on_miss(monkeypatch):
    db = _session()
    payload = {"series": [], "top_makes": [], "generated_at": datetime.now(timezone.utc).isoformat()}
    monkeypatch.setattr(
        stats_module,
        "_compute_price_index_payload",
        lambda *_args, **_kwargs: payload,
    )
    result = stats_module.get_price_index(request=MagicMock(), db=db)
    cached = get_cached_price_index(db)
    assert "series" in result
    assert cached is not None
    assert "top_makes" in cached


def test_price_index_endpoint_serves_stale_on_compute_failure(monkeypatch):
    db = _session()
    stale_payload = {"series": [], "top_makes": [], "generated_at": datetime.now(timezone.utc).isoformat()}
    db.add(
        MarketStatsCache(
            cache_key="price_index",
            payload=stale_payload,
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=PRICE_INDEX_TTL_SECONDS + 10),
        )
    )
    db.commit()
    monkeypatch.setattr(
        stats_module,
        "_compute_price_index_payload",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")),
    )
    result = stats_module.get_price_index(request=MagicMock(), db=db)
    assert "top_makes" in result


# ---------------------------------------------------------------------------
# district-velocity cache
# ---------------------------------------------------------------------------


def _fresh_velocity_payload() -> dict:
    return {
        "points": [
            {
                "district": "Colombo",
                "lat": 6.9271,
                "lng": 79.8612,
                "listing_count": 10,
                "new_7d_count": 2,
                "velocity_score": 0.2,
            }
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def test_get_cached_district_velocity_returns_none_when_no_entry():
    db = _session()
    assert get_cached_district_velocity(db) is None


def test_get_cached_district_velocity_returns_none_when_stale():
    db = _session()
    db.add(
        MarketStatsCache(
            cache_key="district_velocity",
            payload=_fresh_velocity_payload(),
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 10),
        )
    )
    db.commit()
    assert get_cached_district_velocity(db, allow_stale=False) is None
    stale = get_cached_district_velocity(db, allow_stale=True)
    assert stale is not None
    assert stale.points[0].district == "Colombo"


def test_district_velocity_endpoint_returns_cached_on_hit(monkeypatch):
    db = _session()
    db.add(
        MarketStatsCache(
            cache_key="district_velocity",
            payload=_fresh_velocity_payload(),
            refreshed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    monkeypatch.setattr(
        stats_module,
        "compute_district_velocity",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not compute")),
    )

    result = stats_module.get_district_velocity(db=db)
    assert isinstance(result, DistrictVelocityResponse)
    assert result.points[0].listing_count == 10


def test_district_velocity_endpoint_stores_to_cache_on_miss(monkeypatch):
    monkeypatch.setattr(
        stats_module,
        "utc_now",
        lambda: datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(
        stats_cache,
        "utc_now",
        lambda: datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),
    )

    db = _session()
    db.add(_listing("vel-1", 7_000_000, 5.0, district="Colombo"))
    db.commit()

    assert get_cached_district_velocity(db) is None
    result = stats_module.get_district_velocity(db=db)
    assert result.points
    cached = get_cached_district_velocity(db)
    assert cached is not None
    assert cached.points[0].district == "Colombo"


def test_district_velocity_endpoint_serves_stale_cache_on_compute_failure(monkeypatch):
    db = _session()
    db.add(
        MarketStatsCache(
            cache_key="district_velocity",
            payload=_fresh_velocity_payload(),
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 60),
        )
    )
    db.commit()

    monkeypatch.setattr(
        stats_module,
        "compute_district_velocity",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")),
    )

    result = stats_module.get_district_velocity(db=db)
    assert result.points[0].district == "Colombo"


def test_store_district_velocity_cache_round_trip():
    db = _session()
    payload = DistrictVelocityResponse.model_validate(_fresh_velocity_payload())
    store_district_velocity_cache(db, payload)
    cached = get_cached_district_velocity(db)
    assert cached is not None
    assert cached.points[0].velocity_score == 0.2


# ---------------------------------------------------------------------------
# Track D: per-key TTLs, stale-age meta, degraded envelopes
# ---------------------------------------------------------------------------


def test_ttl_for_key_matches_policy_table():
    assert ttl_for_key("summary") == 15 * 60
    assert ttl_for_key("district_prices") == 3600
    assert ttl_for_key("district_velocity") == 3600
    assert ttl_for_key("price_index") == 24 * 3600
    trends_key = build_trends_cache_key(
        make=None, model=None, condition=None, district=None, months=12
    )
    assert ttl_for_key(trends_key) == 6 * 3600
    assert ttl_for_key("unknown_future_key") == CACHE_TTL_SECONDS


def test_summary_expires_after_15min_not_1h():
    db = _session()
    payload = StatsSummary(
        total_listings=3,
        avg_price_lkr=7_000_000.0,
        good_deals_count=0,
        listings_this_week=1,
        districts_covered=1,
        source_count=1,
    ).model_dump(mode="json")
    db.add(
        MarketStatsCache(
            cache_key="summary",
            payload=payload,
            refreshed_at=datetime.now(timezone.utc) - timedelta(minutes=20),
        )
    )
    db.commit()
    assert get_cached_summary(db, allow_stale=False) is None
    assert get_cached_summary(db) is not None  # SWR default serves stale


def test_price_index_stays_fresh_for_24h():
    db = _session()
    payload = {"series": [], "top_makes": [], "generated_at": datetime.now(timezone.utc).isoformat()}
    db.add(
        MarketStatsCache(
            cache_key="price_index",
            payload=payload,
            refreshed_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
    )
    db.commit()
    assert get_cached_price_index(db, allow_stale=False) is not None


def test_get_cache_meta_reports_stale_age():
    db = _session()
    assert get_cache_meta(db, "summary")["present"] is False
    _fresh_summary_entry(db, total_listings=5)
    meta = get_cache_meta(db, "summary")
    assert meta["present"] is True
    assert meta["ttl_seconds"] == 15 * 60
    assert meta["is_stale"] is False
    assert meta["stale_age_seconds"] is not None and meta["stale_age_seconds"] >= 0


def test_with_degraded_flag_marks_stale_payload():
    payload = {"points": []}
    marked = with_degraded_flag(payload, stale_age_seconds=3725.4)
    assert marked["degraded"] is True
    assert marked["stale_age_seconds"] == 3725.4
    assert marked["points"] == []
    assert "degraded" not in payload  # input untouched
    assert with_degraded_flag(marked, stale_age_seconds=1) is marked  # idempotent


def test_read_export_section_serves_stale_degraded_without_raising():
    db = _session()
    _stale_summary_entry(db)
    section = read_export_section(db, "summary")
    assert section["degraded"] is True
    assert section["stale_age_seconds"] is not None
    assert section["total_listings"] == 99


def test_read_export_section_miss_returns_degraded_envelope():
    db = _session()
    section = read_export_section(db, "price_index")
    assert section == {
        "degraded": True,
        "degraded_reason": "cache_miss",
        "stale_age_seconds": None,
    }


def test_district_prices_stale_fallback_is_marked_degraded(monkeypatch):
    db = _session()
    db.add(
        MarketStatsCache(
            cache_key="district_prices",
            payload={"points": [{"district": "Colombo", "count": 42}]},
            refreshed_at=datetime.now(timezone.utc) - timedelta(seconds=CACHE_TTL_SECONDS + 60),
        )
    )
    db.commit()
    monkeypatch.setattr(
        stats_module,
        "build_district_median_map",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")),
    )
    result = stats_module.get_district_prices(db=db)
    assert result["points"][0]["count"] == 42
    assert result["degraded"] is True
    assert result["stale_age_seconds"] is not None
