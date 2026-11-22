import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import pro
from app.utils.time import utc_now
from db.models import Base, CarListing, VehiclePriceHistory


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _session_with_query_counter():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    counter = {"count": 0}

    @event.listens_for(engine, "before_cursor_execute")
    def _count(conn, cursor, statement, parameters, context, executemany):
        counter["count"] += 1

    return Session(), counter


def _listing(
    source_id: str,
    *,
    make: str = "Toyota",
    model: str = "Vitz",
    price_lkr: int | None = 7_200_000,
    district: str = "Colombo",
    source: str = "ikman",
    condition: str = "used",
    deal_score: float = 8.4,
    is_outlier: bool = False,
) -> CarListing:
    now = datetime(2026, 5, 20, 9, 0, tzinfo=timezone.utc)
    return CarListing(
        source=source,
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
        condition=condition,
        title=f"{make} {model} {source_id}",
        url=f"https://example.com/{source_id}",
        is_outlier=is_outlier,
    )


def test_pro_vehicle_lanes_exclude_invalid_tiny_and_outlier_prices():
    db = _session()
    db.add_all(
        [
            _listing("valid-vitz", price_lkr=7_200_000),
            _listing("tiny-vitz", price_lkr=42_000, deal_score=21),
            _listing("missing-vitz", price_lkr=None, deal_score=19),
            _listing("outlier-fit", make="Honda", model="Fit", price_lkr=8_500_000, is_outlier=True),
        ]
    )
    db.commit()

    lanes = pro.get_pro_vehicle_lanes(db=db)

    assert len(lanes) == 1
    assert lanes[0].make == "Toyota"
    assert lanes[0].model == "Vitz"
    assert lanes[0].listing_count == 1
    assert lanes[0].min_price_lkr == 7_200_000


def test_pro_district_detail_returns_models_source_mix_and_samples():
    db = _session()
    db.add_all(
        [
            _listing("cmb-vitz-1", price_lkr=7_200_000, district="Colombo", source="ikman"),
            _listing("cmb-vitz-2", price_lkr=7_400_000, district="Colombo", source="riyasewana"),
            _listing("cmb-fit-1", make="Honda", model="Fit", price_lkr=8_800_000, district="Colombo", source="ikman"),
            _listing("gmp-aqua-1", make="Toyota", model="Aqua", price_lkr=8_100_000, district="Gampaha"),
        ]
    )
    db.commit()

    detail = pro.get_pro_district_detail("Colombo", db=db)

    assert detail.kind == "district"
    assert detail.title == "Colombo market profile"
    assert "Toyota Vitz" in detail.summary
    assert {point.label for point in detail.source_mix} == {"Ikman", "Riyasewana"}
    assert len(detail.sample_listings) == 3


def test_pro_arbitrage_gaps_returns_top_pairs_sorted_by_gap():
    db = _session()
    db.add_all(
        [
            _listing("cmb-1", price_lkr=7_200_000, district="Colombo"),
            _listing("cmb-2", price_lkr=7_400_000, district="Colombo"),
            _listing("knd-1", price_lkr=6_200_000, district="Kandy"),
            _listing("knd-2", price_lkr=6_000_000, district="Kandy"),
            _listing("gmp-1", price_lkr=7_800_000, district="Gampaha"),
            _listing("gmp-2", price_lkr=7_900_000, district="Gampaha"),
        ]
    )
    db.commit()

    gaps = pro.get_pro_arbitrage_gaps(make="Toyota", model="Vitz", db=db)

    assert len(gaps) >= 1
    assert gaps[0].gap_pct >= gaps[-1].gap_pct, "gaps must be sorted descending by gap_pct"
    gap_districts = [(g.buy_district, g.sell_district) for g in gaps]
    assert all(
        g.buy_median_lkr <= g.sell_median_lkr for g in gaps
    ), "buy_median must always be <= sell_median"
    assert all(
        g.buy_district != g.sell_district for g in gaps
    ), "buy and sell districts must differ"
    assert ("Kandy", "Gampaha") in gap_districts


def test_pro_arbitrage_gaps_requires_min_two_listings_per_district():
    db = _session()
    db.add_all(
        [
            _listing("cmb-1", price_lkr=7_200_000, district="Colombo"),
            _listing("cmb-2", price_lkr=7_400_000, district="Colombo"),
            _listing("knd-only", price_lkr=5_500_000, district="Kandy"),
        ]
    )
    db.commit()

    gaps = pro.get_pro_arbitrage_gaps(make="Toyota", model="Vitz", db=db)

    assert gaps == [], "single-listing district should be excluded from gap calculation"


def test_pro_arbitrage_gaps_limit_caps_results():
    db = _session()
    districts = ["Colombo", "Kandy", "Gampaha", "Galle", "Kurunegala"]
    for i, district in enumerate(districts):
        base_price = 5_000_000 + i * 500_000
        db.add_all(
            [
                _listing(f"{district}-a", price_lkr=base_price, district=district),
                _listing(f"{district}-b", price_lkr=base_price + 100_000, district=district),
            ]
        )
    db.commit()

    gaps = pro.get_pro_arbitrage_gaps(make="Toyota", model="Vitz", limit=3, db=db)

    assert len(gaps) <= 3


def test_pro_arbitrage_gaps_excludes_outliers_and_low_prices():
    db = _session()
    db.add_all(
        [
            _listing("cmb-valid", price_lkr=7_200_000, district="Colombo"),
            _listing("cmb-valid-2", price_lkr=7_400_000, district="Colombo"),
            _listing("knd-outlier", price_lkr=6_000_000, district="Kandy", is_outlier=True),
            _listing("knd-cheap", price_lkr=50_000, district="Kandy"),
        ]
    )
    db.commit()

    gaps = pro.get_pro_arbitrage_gaps(make="Toyota", model="Vitz", db=db)

    assert gaps == [], "Kandy district dropped — outlier and cheap listing both excluded"


def test_pro_vehicle_lane_detail_respects_vehicle_district_and_condition_filters():
    db = _session()
    db.add_all(
        [
            _listing("target", make="Toyota", model="Vitz", district="Colombo", condition="used"),
            _listing("wrong-district", make="Toyota", model="Vitz", district="Kandy", condition="used"),
            _listing("wrong-condition", make="Toyota", model="Vitz", district="Colombo", condition="reconditioned"),
            _listing("wrong-model", make="Toyota", model="Aqua", district="Colombo", condition="used"),
        ]
    )
    db.commit()

    detail = pro.get_pro_vehicle_lane_detail(
        make="Toyota",
        model="Vitz",
        district="Colombo",
        condition="used",
        db=db,
    )

    assert detail.kind == "vehicle_lane"
    assert detail.summary.startswith("1 priced listings")
    assert len(detail.sample_listings) == 1
    assert detail.sample_listings[0].title == "Toyota Vitz target"


# ---------------------------------------------------------------------------
# Bulk district / vehicle-lane query-count regression tests
#
# get_pro_districts and get_pro_vehicle_lanes previously issued 3-4 extra
# queries per row returned (per-district / per-lane loops calling
# _top_models / _breakdown / _samples / _top_group_label). They now resolve
# top-make, source mix, and sample listings with a handful of bulk
# row_number()-windowed queries, so the query count must stay flat as the
# number of districts/lanes grows.
# ---------------------------------------------------------------------------

_SEEDED_DISTRICTS = ["Colombo", "Gampaha", "Kandy", "Galle", "Kurunegala", "Jaffna"]


def _seed_multi_district_listings(db):
    now = datetime(2026, 5, 20, 9, 0, tzinfo=timezone.utc)
    listings = []
    i = 0
    for district in _SEEDED_DISTRICTS:
        for make, model, price, source, score in [
            ("Toyota", "Vitz", 7_200_000, "ikman", 8.5),
            ("Toyota", "Vitz", 7_400_000, "riyasewana", 7.0),
            ("Honda", "Fit", 8_800_000, "ikman", 6.0),
        ]:
            listings.append(
                _listing(
                    f"{district}-{i}",
                    make=make,
                    model=model,
                    price_lkr=price,
                    district=district,
                    source=source,
                    deal_score=score,
                )
            )
            i += 1
    db.add_all(listings)
    db.commit()


def test_pro_districts_matches_manually_computed_values_across_multiple_districts():
    db = _session()
    _seed_multi_district_listings(db)

    profiles = pro.get_pro_districts(db=db)

    assert {p.district for p in profiles} == set(_SEEDED_DISTRICTS)
    for profile in profiles:
        assert profile.listing_count == 3
        assert profile.top_make == "Toyota"
        assert profile.top_model == "Vitz"
        assert [m.model for m in profile.top_models] == ["Vitz", "Fit"]
        assert {s.label for s in profile.source_mix} == {"Ikman", "Riyasewana"}
        assert len(profile.sample_listings) == 3
        # Median of [7_200_000, 7_400_000, 8_800_000]
        assert profile.median_price_lkr == 7_400_000


def test_pro_districts_query_count_stays_flat_as_district_count_grows():
    db, counter = _session_with_query_counter()
    _seed_multi_district_listings(db)
    counter["count"] = 0

    pro.get_pro_districts(db=db)

    # Bounded regardless of district count: 1 aggregate query + 4 bulk
    # lookups (top-models, source-mix, samples, median fallback on SQLite).
    assert counter["count"] <= 6, f"expected a flat, small query count, got {counter['count']}"


def test_pro_vehicle_lanes_query_count_stays_flat_as_lane_count_grows():
    db, counter = _session_with_query_counter()
    _seed_multi_district_listings(db)
    counter["count"] = 0

    lanes = pro.get_pro_vehicle_lanes(db=db)

    assert len(lanes) == 2  # Toyota Vitz, Honda Fit
    # Bounded regardless of lane count: 1 aggregate query + 3 bulk lookups
    # (top-district, top-source, median fallback on SQLite).
    assert counter["count"] <= 5, f"expected a flat, small query count, got {counter['count']}"


# ---------------------------------------------------------------------------
# Lane analytics: monthly spark series, 90-day change, 7-day intake
# ---------------------------------------------------------------------------

def _listing_seen(
    source_id: str,
    *,
    first_seen_at: datetime,
    last_seen_at: datetime | None = None,
    is_active: bool = True,
    **kwargs,
) -> CarListing:
    listing = _listing(source_id, **kwargs)
    listing.first_seen_at = first_seen_at
    listing.last_seen_at = last_seen_at or first_seen_at
    listing.is_active = is_active
    return listing


def _month_anchor(now: datetime, months_back: int) -> datetime:
    index = now.year * 12 + now.month - 1 - months_back
    return datetime(index // 12, index % 12 + 1, 15, 9, 0, tzinfo=timezone.utc)


def _month_label(now: datetime, months_back: int) -> str:
    index = now.year * 12 + now.month - 1 - months_back
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def test_pro_vehicle_lanes_spark_series_is_oldest_first_and_capped_at_six_months():
    db = _session()
    now = utc_now()
    db.add_all(
        [
            _listing_seen(
                f"spark-{months_back}",
                first_seen_at=_month_anchor(now, months_back),
                price_lkr=6_000_000 + months_back * 100_000,
            )
            for months_back in range(7)  # oldest point falls outside the 6-month window
        ]
        + [
            _listing_seen(
                "spark-newest-friend",
                first_seen_at=_month_anchor(now, 0),
                price_lkr=6_800_000,
            )
        ]
    )
    db.commit()

    lane = pro.get_pro_vehicle_lanes(db=db)[0]
    spark = lane.spark_6m

    assert [point.month for point in spark] == [_month_label(now, months_back) for months_back in range(5, -1, -1)]
    assert [point.listing_count for point in spark] == [1, 1, 1, 1, 1, 2]
    assert [point.median_price_lkr for point in spark] == [
        6_500_000, 6_400_000, 6_300_000, 6_200_000, 6_100_000, 6_400_000,
    ]
    # (median of all 8 prices) vs (oldest monthly point kept in the series)
    assert lane.median_price_lkr == 6_350_000
    assert lane.change_90d_pct == round((6_350_000 - 6_500_000) / 6_500_000 * 100, 2) == -2.31


def test_pro_vehicle_lanes_change_90d_pct_is_null_without_two_monthly_points():
    db = _session()
    now = utc_now()
    db.add_all(
        [
            _listing_seen("same-month-a", first_seen_at=_month_anchor(now, 0), price_lkr=7_200_000),
            _listing_seen("same-month-b", first_seen_at=_month_anchor(now, 0), price_lkr=7_400_000),
        ]
    )
    db.commit()

    lane = pro.get_pro_vehicle_lanes(db=db)[0]

    assert [point.month for point in lane.spark_6m] == [_month_label(now, 0)]
    assert lane.change_90d_pct is None


def test_pro_vehicle_lanes_new_7d_count_uses_first_seen_window():
    db = _session()
    now = utc_now()
    db.add_all(
        [
            _listing_seen("fresh-1", first_seen_at=now - timedelta(days=2)),
            _listing_seen("fresh-2", first_seen_at=now - timedelta(hours=3)),
            _listing_seen("stale", first_seen_at=now - timedelta(days=30)),
        ]
    )
    db.commit()

    lane = pro.get_pro_vehicle_lanes(db=db)[0]

    assert lane.listing_count == 3
    assert lane.new_7d_count == 2


# ---------------------------------------------------------------------------
# Market pulse
# ---------------------------------------------------------------------------

def test_pro_market_pulse_daily_supply_zero_fills_thirty_days():
    db = _session()
    now = utc_now()
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    db.add_all(
        [
            _listing_seen("supply-today", first_seen_at=today_start + timedelta(hours=1)),
            _listing_seen("supply-yesterday", first_seen_at=today_start - timedelta(days=1) + timedelta(hours=1)),
            _listing_seen("supply-window-start", first_seen_at=today_start - timedelta(days=29) + timedelta(hours=1)),
        ]
    )
    db.commit()

    pulse = pro.get_pro_market_pulse(db=db)

    assert len(pulse.daily_supply) == 30
    assert pulse.daily_supply[0].date == (today_start.date() - timedelta(days=29)).isoformat()
    assert pulse.daily_supply[-1].date == today_start.date().isoformat()
    assert [point.date for point in pulse.daily_supply] == sorted(point.date for point in pulse.daily_supply)
    assert [point.count for point in pulse.daily_supply] == [1] + [0] * 27 + [1, 1]
    assert sum(point.count for point in pulse.daily_supply) == 3


def test_pro_market_pulse_new_listing_windows():
    db = _session()
    now = utc_now()
    db.add_all(
        [
            _listing_seen("hours-ago", first_seen_at=now - timedelta(hours=2)),
            _listing_seen("two-days-ago", first_seen_at=now - timedelta(days=2)),
            _listing_seen("ten-days-ago", first_seen_at=now - timedelta(days=10)),
        ]
    )
    db.commit()

    pulse = pro.get_pro_market_pulse(db=db)

    assert pulse.new_24h == 1
    assert pulse.new_7d == 2


def test_pro_market_pulse_price_deciles_band_crafted_prices():
    db = _session()
    now = utc_now()
    db.add_all(
        [
            _listing_seen(f"decile-{i}", first_seen_at=now - timedelta(days=1), price_lkr=500_000 + i * 100_000)
            for i in range(10)
        ]
    )
    db.commit()

    deciles = pro.get_pro_market_pulse(db=db).price_deciles

    assert [band.label for band in deciles] == [f"D{i}" for i in range(1, 11)]
    assert [band.count for band in deciles] == [1] * 10
    assert [band.low_lkr for band in deciles] == [float(500_000 + i * 100_000) for i in range(10)]
    assert [band.high_lkr for band in deciles] == [float(500_000 + i * 100_000) for i in range(10)]
    assert sum(band.count for band in deciles) == 10


def test_pro_market_pulse_deal_score_bands_cover_every_scored_listing():
    db = _session()
    now = utc_now()
    db.add_all(
        [
            _listing_seen("score-negative", first_seen_at=now, deal_score=-1),
            _listing_seen("score-low", first_seen_at=now, deal_score=1),
            _listing_seen("score-mid", first_seen_at=now, deal_score=7),
            _listing_seen("score-high", first_seen_at=now, deal_score=12),
            _listing_seen("score-top", first_seen_at=now, deal_score=20),
            _listing_seen("score-missing", first_seen_at=now, deal_score=None),
        ]
    )
    db.commit()

    bands = pro.get_pro_market_pulse(db=db).deal_score_bands

    assert [band.label for band in bands] == ["<0", "0-5", "5-10", "10-15", ">=15"]
    assert [band.count for band in bands] == [1, 1, 1, 1, 1]
    assert all(band.share_pct == 20.0 for band in bands)


def test_pro_market_pulse_days_to_clear_is_empty_without_inactive_listings():
    db = _session()
    db.add(_listing("still-live"))
    db.commit()

    days_to_clear = pro.get_pro_market_pulse(db=db).days_to_clear

    assert days_to_clear.sample_size == 0
    assert days_to_clear.median_days is None
    assert days_to_clear.p25_days is None
    assert days_to_clear.p75_days is None


def test_pro_market_pulse_days_to_clear_measures_inactive_listing_lifetimes():
    db = _session()
    now = utc_now()
    db.add_all(
        [
            _listing_seen(
                f"cleared-{days}",
                first_seen_at=now - timedelta(days=days),
                last_seen_at=now,
                is_active=False,
            )
            for days in (4, 6, 8, 10, 12)
        ]
    )
    db.commit()

    days_to_clear = pro.get_pro_market_pulse(db=db).days_to_clear

    assert days_to_clear.sample_size == 5
    assert days_to_clear.median_days == 8.0
    assert days_to_clear.p25_days == 6.0
    assert days_to_clear.p75_days == 10.0


def test_pro_market_pulse_price_cut_share_compares_current_to_first_tracked_price():
    db = _session()
    now = utc_now()
    cut = _listing_seen("cut", first_seen_at=now, price_lkr=7_000_000)
    flat = _listing_seen("flat", first_seen_at=now, price_lkr=7_000_000)
    db.add_all([cut, flat])
    db.commit()
    db.add_all(
        [
            VehiclePriceHistory(vehicle_id=cut.id, price_lkr=7_500_000, scraped_at=now - timedelta(days=10)),
            VehiclePriceHistory(vehicle_id=cut.id, price_lkr=7_000_000, scraped_at=now),
            VehiclePriceHistory(vehicle_id=flat.id, price_lkr=7_000_000, scraped_at=now - timedelta(days=10)),
        ]
    )
    db.commit()

    share = pro.get_pro_market_pulse(db=db).price_cut_share

    assert share.tracked_count == 2
    assert share.cut_count == 1
    assert share.share_pct == 50.0


# ---------------------------------------------------------------------------
# Arbitrage gaps: market-wide mode alongside the unchanged lane mode
# ---------------------------------------------------------------------------

def _seed_two_district_lanes(db):
    db.add_all(
        [
            _listing("vitz-cmb-1", price_lkr=7_200_000, district="Colombo"),
            _listing("vitz-cmb-2", price_lkr=7_400_000, district="Colombo"),
            _listing("vitz-knd-1", price_lkr=6_200_000, district="Kandy"),
            _listing("vitz-knd-2", price_lkr=6_000_000, district="Kandy"),
            _listing("aqua-cmb-1", make="Toyota", model="Aqua", price_lkr=9_000_000, district="Colombo"),
            _listing("aqua-cmb-2", make="Toyota", model="Aqua", price_lkr=9_100_000, district="Colombo"),
            _listing("aqua-knd-1", make="Toyota", model="Aqua", price_lkr=8_100_000, district="Kandy"),
            _listing("aqua-knd-2", make="Toyota", model="Aqua", price_lkr=8_000_000, district="Kandy"),
            _listing("fit-cmb-1", make="Honda", model="Fit", price_lkr=5_000_000, district="Colombo"),
            _listing("fit-cmb-2", make="Honda", model="Fit", price_lkr=5_100_000, district="Colombo"),
            _listing("fit-knd-1", make="Honda", model="Fit", price_lkr=4_950_000, district="Kandy"),
            _listing("fit-knd-2", make="Honda", model="Fit", price_lkr=4_900_000, district="Kandy"),
        ]
    )
    db.commit()


def test_pro_arbitrage_gaps_market_wide_orders_labels_and_respects_limit():
    db = _session()
    _seed_two_district_lanes(db)

    gaps = pro.get_pro_arbitrage_gaps(db=db, limit=5)

    assert [gap.gap_pct for gap in gaps] == sorted((gap.gap_pct for gap in gaps), reverse=True)
    assert [(gap.make, gap.model) for gap in gaps] == [
        ("Toyota", "Vitz"),
        ("Toyota", "Aqua"),
        ("Honda", "Fit"),
    ]
    assert gaps[0].buy_district == "Kandy" and gaps[0].sell_district == "Colombo"
    assert len(pro.get_pro_arbitrage_gaps(db=db, limit=2)) == 2


def test_pro_arbitrage_gaps_lane_mode_is_unchanged_and_leaves_lane_labels_null():
    db = _session()
    _seed_two_district_lanes(db)

    gaps = pro.get_pro_arbitrage_gaps(make="Toyota", model="Vitz", db=db)

    assert len(gaps) == 1
    assert (gaps[0].buy_district, gaps[0].sell_district) == ("Kandy", "Colombo")
    assert gaps[0].gap_pct == round((7_300_000 - 6_100_000) / 6_100_000 * 100, 2)
    assert gaps[0].make is None
    assert gaps[0].model is None

