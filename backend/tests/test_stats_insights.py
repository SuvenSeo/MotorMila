import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import stats
from app.models.schemas import DashboardInsightsResponse
from db.models import Base, CarListing, PriceAggregate, ScrapeRun
from unittest.mock import MagicMock


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
    scraped_at: datetime | None = None,
    first_seen_at: datetime | None = None,
) -> CarListing:
    now = datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc)
    seen = first_seen_at or now
    scraped = scraped_at or now
    return CarListing(
        source="ikman",
        source_id=source_id,
        scraped_at=scraped,
        first_seen_at=seen,
        last_seen_at=scraped,
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


def test_dashboard_insights_trending_models_use_30d_price_movement(monkeypatch):
    fixed_now = datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc).replace(tzinfo=None)
    monkeypatch.setattr(stats, "utc_now", lambda: fixed_now)

    current_30d = fixed_now - stats.timedelta(days=30)
    previous_30d = fixed_now - stats.timedelta(days=60)

    db = _session()
    db.add_all(
        [
            _listing("vitz-current-1", 8_000_000, 5.0, make="Toyota", model="Vitz"),
            _listing("vitz-current-2", 8_200_000, 6.0, make="Toyota", model="Vitz"),
            CarListing(
                source="ikman",
                source_id="vitz-previous-1",
                scraped_at=previous_30d + stats.timedelta(days=5),
                first_seen_at=previous_30d + stats.timedelta(days=5),
                last_seen_at=previous_30d + stats.timedelta(days=5),
                make="Toyota",
                model="Vitz",
                year=2018,
                price_lkr=7_000_000,
                deal_score=4.0,
                district="Colombo",
                city="Colombo",
                title="Toyota Vitz vitz-previous-1",
                url="https://example.com/vitz-previous-1",
                is_outlier=False,
            ),
            CarListing(
                source="ikman",
                source_id="vitz-previous-2",
                scraped_at=current_30d - stats.timedelta(days=1),
                first_seen_at=current_30d - stats.timedelta(days=1),
                last_seen_at=current_30d - stats.timedelta(days=1),
                make="Toyota",
                model="Vitz",
                year=2018,
                price_lkr=7_200_000,
                deal_score=4.5,
                district="Colombo",
                city="Colombo",
                title="Toyota Vitz vitz-previous-2",
                url="https://example.com/vitz-previous-2",
                is_outlier=False,
            ),
        ]
    )
    db.commit()

    payload = stats.get_dashboard_insights(db=db)
    vitz = next(
        item
        for item in payload["trending_models"]
        if item["make"] == "Toyota" and item["model"] == "Vitz"
    )

    assert vitz["listing_count"] == 2
    assert vitz["avg_price_lkr"] == 8_100_000
    assert vitz["movement_pct"] == 14.1


def test_dashboard_insights_hot_deals_exclude_non_positive_and_tiny_prices():
    db = _session()
    db.add_all(
        [
            _listing("zero-price", 0, 14.5),
            _listing("valid-price", 7_800_000, 10.2),
            _listing("tiny-price", 64_000, 18.3),
        ]
    )
    db.commit()

    payload = stats.get_dashboard_insights(db=db)

    assert [item["id"] for item in payload["hot_deals"]] == [2]
    assert all(item["price_lkr"] >= 100_000 for item in payload["hot_deals"])


def test_dashboard_insights_null_year_does_not_fail_validation():
    db = _session()
    listing = _listing("null-year-deal", 7_500_000, 12.0)
    listing.year = None
    db.add(listing)
    db.commit()

    payload = stats.get_dashboard_insights(db=db)
    validated = DashboardInsightsResponse.model_validate(payload)

    assert len(validated.hot_deals) == 1
    assert validated.hot_deals[0].year is None
    assert validated.hot_deals[0].price_lkr == 7_500_000


def test_stats_summary_counts_normalized_districts():
    db = _session()
    db.add_all(
        [
            _listing("colombo-1", 7_100_000, 5.0, district="Colombo"),
            _listing("colombo-2", 7_200_000, 5.0, district="colombo"),
            _listing("colombo-3", 7_300_000, 5.0, district="Colombo District"),
            _listing("gampaha-1", 8_100_000, 7.0, district="Gampaha"),
            _listing("gampaha-2", 8_200_000, 7.0, district="gampaha district"),
            CarListing(
                source="ikman",
                source_id="url-inferred-kandy",
                scraped_at=datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc),
                first_seen_at=datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc),
                last_seen_at=datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc),
                make="Toyota",
                model="Vitz",
                year=2018,
                price_lkr=7_500_000,
                deal_score=6.0,
                district="Sri Lanka",
                city="Sri Lanka",
                title="Toyota Vitz url-inferred-kandy",
                url="https://example.com/ad-for-sale-kandy/toyota-vitz",
                is_outlier=False,
            ),
        ]
    )
    db.commit()

    summary = stats.get_stats_summary(db=db)

    assert summary.districts_covered == 3
    assert summary.district_count == 3


def test_stats_summary_districts_exclude_inactive_and_outlier_listings():
    db = _session()
    inactive_only = _listing("inactive-matara", 6_000_000, 4.0, district="Matara")
    inactive_only.is_active = False
    outlier_only = _listing("outlier-galle", 6_500_000, 4.0, district="Galle")
    outlier_only.is_outlier = True
    db.add_all(
        [
            _listing("live-colombo", 7_100_000, 5.0, district="Colombo"),
            inactive_only,
            outlier_only,
        ]
    )
    db.commit()

    summary = stats.get_stats_summary(db=db)

    assert summary.districts_covered == 1
    assert summary.district_count == 1
    assert summary.total_listings == 1


def test_stats_summary_exposes_freshness_and_source_coverage():
    db = _session()
    db.add_all(
        [
            _listing("ikman-1", 7_100_000, 5.0),
            CarListing(
                source="riyasewana",
                source_id="riyasewana-1",
                scraped_at=datetime(2026, 4, 19, 12, 30, tzinfo=timezone.utc),
                first_seen_at=datetime(2026, 4, 19, 12, 30, tzinfo=timezone.utc),
                last_seen_at=datetime(2026, 4, 19, 12, 30, tzinfo=timezone.utc),
                make="Honda",
                model="Fit",
                year=2019,
                price_lkr=8_200_000,
                deal_score=6.1,
                district="Gampaha",
                city="Gampaha",
                title="Honda Fit riyasewana-1",
                url="https://example.com/riyasewana-1",
                is_outlier=False,
            ),
        ]
    )
    db.commit()

    summary = stats.get_stats_summary(db=db)

    assert summary.source_count == 2
    assert summary.last_updated is not None


def test_live_market_snapshot_excludes_unavailable_prices_from_average(monkeypatch):
    fixed_now = datetime(2026, 4, 19, 14, 0, tzinfo=timezone.utc)

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now if tz is not None else fixed_now.replace(tzinfo=None)

    monkeypatch.setattr(stats, "datetime", FixedDateTime)

    db = _session()
    db.add_all(
        [
            _listing("priced-1", 7_000_000, 5.0),
            _listing("priced-2", 9_000_000, 5.0),
            _listing("missing-price", None, 5.0),
            ScrapeRun(
                source="riyahub",
                started_at=datetime(2026, 4, 19, 13, 0, tzinfo=timezone.utc),
                finished_at=None,
                status="RUNNING",
                listings_found=10,
                listings_new=2,
            ),
        ]
    )
    db.commit()

    payload = stats.build_live_market_snapshot(db)

    assert payload["total_listings"] == 3
    assert payload["priced_listings"] == 2
    assert payload["unavailable_price_listings"] == 1
    assert payload["avg_price_lkr"] == 8_000_000
    assert payload["latest_run"]["source"] == "riyahub"
    assert payload["active_scrape_sources"] == ["riyahub"]


def test_live_market_snapshot_latest_listings_order_by_first_seen(monkeypatch):
    fixed_now = datetime(2026, 4, 19, 14, 0, tzinfo=timezone.utc)

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now if tz is not None else fixed_now.replace(tzinfo=None)

    monkeypatch.setattr(stats, "datetime", FixedDateTime)

    db = _session()
    old_dealer = _listing(
        "rescraped-dealer",
        7_000_000,
        5.0,
        first_seen_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        scraped_at=datetime(2026, 4, 19, 13, 50, tzinfo=timezone.utc),
    )
    new_ad = _listing(
        "fresh-ikman",
        8_000_000,
        5.0,
        first_seen_at=datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),
        scraped_at=datetime(2026, 4, 19, 12, 1, tzinfo=timezone.utc),
    )
    db.add_all([old_dealer, new_ad])
    db.commit()

    payload = stats.build_live_market_snapshot(db)
    ids = [row["id"] for row in payload["latest_listings"]]
    assert ids[0] == new_ad.id
    assert ids[1] == old_dealer.id
    assert payload["latest_listings"][0]["source_id"] == "fresh-ikman"


def test_live_market_snapshot_active_sources_include_recent_success_runs(monkeypatch):
    fixed_now = datetime(2026, 4, 19, 14, 0, tzinfo=timezone.utc)

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now if tz is not None else fixed_now.replace(tzinfo=None)

    monkeypatch.setattr(stats, "datetime", FixedDateTime)

    db = _session()
    db.add_all(
        [
            _listing("priced-1", 7_000_000, 5.0),
            ScrapeRun(
                source="ikman",
                started_at=datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),
                finished_at=datetime(2026, 4, 19, 12, 45, tzinfo=timezone.utc),
                status="SUCCESS",
                listings_found=120,
                listings_new=8,
            ),
            ScrapeRun(
                source="riyasewana",
                started_at=datetime(2026, 4, 19, 8, 0, tzinfo=timezone.utc),
                finished_at=datetime(2026, 4, 19, 9, 0, tzinfo=timezone.utc),
                status="SUCCESS",
                listings_found=90,
                listings_new=4,
            ),
            ScrapeRun(
                source="autolanka",
                started_at=datetime(2026, 4, 10, 8, 0, tzinfo=timezone.utc),
                finished_at=datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc),
                status="SUCCESS",
                listings_found=40,
                listings_new=1,
            ),
        ]
    )
    db.commit()

    payload = stats.build_live_market_snapshot(db)

    assert payload["active_scrape_sources"] == ["ikman", "riyasewana"]
    assert {row["source"] for row in payload["source_status"]} == {
        "ikman",
        "riyasewana",
        "autolanka",
    }


def test_live_market_stream_serializes_snapshot(monkeypatch):
    class DummyRequest:
        async def is_disconnected(self):
            return False

    class DummyDb:
        def close(self):
            pass

    monkeypatch.setattr(stats, "SessionLocal", lambda: DummyDb())
    monkeypatch.setattr(
        stats,
        "build_live_market_snapshot",
        lambda _db: {
            "generated_at": "2026-05-21T00:00:00+00:00",
            "total_listings": 3,
            "priced_listings": 2,
            "avg_price_lkr": 8_000_000,
        },
    )

    async def run_check():
        response = await stats.stream_live_market_snapshot(DummyRequest())
        frame = await anext(response.body_iterator)
        return response, frame

    response, frame = asyncio.run(run_check())

    assert response.media_type == "text/event-stream"
    assert "event: snapshot" in frame
    assert '"total_listings": 3' in frame


def test_district_prices_include_top_model_metadata():
    db = _session()
    db.add_all(
        [
            _listing("cmb-vitz-1", 6_900_000, 5.0, make="Toyota", model="Vitz", district="Colombo"),
            _listing("cmb-vitz-2", 7_100_000, 4.0, make="Toyota", model="Vitz", district="Colombo"),
            _listing("cmb-fit-1", 7_600_000, 6.0, make="Honda", model="Fit", district="Colombo"),
            _listing("gampaha-aqua-1", 8_100_000, 7.0, make="Toyota", model="Aqua", district="Gampaha"),
        ]
    )
    db.commit()

    payload = stats.get_district_prices(db=db)
    by_district = {item["district"]: item for item in payload["points"]}

    assert by_district["Colombo"]["top_make"] == "Toyota"
    assert by_district["Colombo"]["top_model"] == "Vitz"
    assert by_district["Colombo"]["top_model_count"] == 2


def test_district_prices_use_true_median_not_average():
    db = _session()
    db.add_all(
        [
            _listing("cmb-low", 6_000_000, 5.0, make="Toyota", model="Vitz", district="Colombo"),
            _listing("cmb-mid", 7_000_000, 5.0, make="Toyota", model="Vitz", district="Colombo"),
            _listing("cmb-high", 10_000_000, 5.0, make="Toyota", model="Vitz", district="Colombo"),
        ]
    )
    db.commit()

    payload = stats.get_district_prices(db=db)
    colombo = next(item for item in payload["points"] if item["district"] == "Colombo")

    assert colombo["median_price_lkr"] == 7_000_000
    assert colombo["avg_price_lkr"] == round((6_000_000 + 7_000_000 + 10_000_000) / 3, 2)


def test_district_insight_uses_true_median():
    db = _session()
    db.add_all(
        [
            _listing("kandy-low", 5_000_000, 5.0, district="Kandy"),
            _listing("kandy-mid", 6_000_000, 5.0, district="Kandy"),
            _listing("kandy-high", 9_000_000, 5.0, district="Kandy"),
        ]
    )
    db.commit()

    payload = stats.get_district_quick_insight(district="Kandy", db=db)

    assert payload["median_price_lkr"] == 6_000_000
    assert payload["avg_price_lkr"] == round((5_000_000 + 6_000_000 + 9_000_000) / 3, 2)


def test_price_trends_fall_back_to_national_lane_when_district_samples_are_thin(monkeypatch):
    # District depth is a Pro capability: `get_price_trends` strips `district` for
    # free/anonymous callers by design, so the district_fallback branch is only
    # reachable for a paying caller. Authenticate as Pro, otherwise the gate
    # nulls the district and the request resolves as a plain national "exact" read.
    monkeypatch.setattr(stats, "resolve_request_access", lambda *a, **k: ("pro", "user"))
    db = _session()
    db.add_all(
        [
            PriceAggregate(
                make="Toyota",
                model="Vitz",
                period_year=2026,
                period_month=3,
                avg_price_lkr=7_000_000,
                median_price_lkr=6_900_000,
                listing_count=12,
            ),
            PriceAggregate(
                make="Toyota",
                model="Vitz",
                period_year=2026,
                period_month=4,
                avg_price_lkr=7_200_000,
                median_price_lkr=7_100_000,
                listing_count=14,
            ),
        ]
    )
    db.commit()

    payload = stats.get_price_trends(request=MagicMock(), make="Toyota", model="Vitz", district="Kandy", db=db)

    assert payload["coverage_scope"] == "district_fallback"
    assert "Sri Lanka-wide" in payload["coverage_note"]
    assert [point["month"] for point in payload["points"]] == [3, 4]


def test_price_trends_free_caller_is_not_given_district_depth():
    """Guard rail for the test above: anonymous/free callers must NOT reach the
    district lane. The free-tier gate drops `district`, so the response is the
    national series - that is the policy, not a district_fallback."""
    db = _session()
    db.add_all(
        [
            PriceAggregate(
                make="Toyota", model="Vitz", period_year=2026, period_month=3,
                avg_price_lkr=7_000_000, median_price_lkr=6_900_000, listing_count=12,
            ),
            PriceAggregate(
                make="Toyota", model="Vitz", period_year=2026, period_month=4,
                avg_price_lkr=7_200_000, median_price_lkr=7_100_000, listing_count=14,
            ),
        ]
    )
    db.commit()

    payload = stats.get_price_trends(
        request=MagicMock(), make="Toyota", model="Vitz", district="Kandy", db=db
    )

    assert payload["coverage_scope"] != "district_fallback"
