import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import stats
from db.models import Base, CarListing


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


_NOW = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)


def _listing(source_id: str, fuel_type: str | None, price_lkr: int | None = 7_000_000, engine_capacity: int | None = None) -> CarListing:
    return CarListing(
        source="ikman",
        source_id=source_id,
        scraped_at=_NOW,
        first_seen_at=_NOW,
        last_seen_at=_NOW,
        make="Toyota",
        model="Aqua",
        year=2020,
        price_lkr=price_lkr,
        deal_score=5.0,
        district="Colombo",
        city="Colombo",
        title=f"Toyota Aqua {source_id}",
        url=f"https://example.com/{source_id}",
        fuel_type=fuel_type,
        engine_capacity=engine_capacity,
        is_outlier=False,
    )


# ── /stats/fuel-mix ──────────────────────────────────────────────────────────

class TestGetFuelMix:
    def test_counts_and_percentages_for_known_fuel_types(self):
        db = _session()
        db.add_all([
            _listing("p1", "petrol"),
            _listing("p2", "petrol"),
            _listing("h1", "hybrid"),
            _listing("e1", "electric"),
            _listing("d1", "diesel"),
        ])
        db.commit()

        result = stats.get_fuel_mix(db=db)

        assert result["total"] == 5
        by_type = {b["fuel_type"]: b for b in result["buckets"]}
        assert by_type["petrol"]["count"] == 2
        assert by_type["petrol"]["pct"] == 40.0
        assert by_type["hybrid"]["count"] == 1
        assert by_type["hybrid"]["pct"] == 20.0
        assert by_type["electric"]["count"] == 1
        assert by_type["electric"]["pct"] == 20.0
        assert by_type["diesel"]["count"] == 1
        assert by_type["diesel"]["pct"] == 20.0
        assert by_type["other"]["count"] == 0
        assert by_type["other"]["pct"] == 0.0

    def test_plugin_hybrid_grouped_into_hybrid(self):
        db = _session()
        db.add_all([
            _listing("h1", "hybrid"),
            _listing("ph1", "plugin_hybrid"),
        ])
        db.commit()

        result = stats.get_fuel_mix(db=db)

        by_type = {b["fuel_type"]: b for b in result["buckets"]}
        assert by_type["hybrid"]["count"] == 2
        assert by_type["hybrid"]["pct"] == 100.0

    def test_pluginhybrid_without_underscore_grouped_into_hybrid(self):
        db = _session()
        db.add_all([
            _listing("h1", "hybrid", engine_capacity=1500),
            _listing("ph1", "pluginhybrid", engine_capacity=1800),
        ])
        db.commit()

        mix = stats.get_fuel_mix(db=db)
        by_type = {b["fuel_type"]: b for b in mix["buckets"]}
        assert by_type["hybrid"]["count"] == 2
        assert by_type["other"]["count"] == 0

        bands = stats.get_hybrid_bands(db=db)
        assert bands["total_hybrids"] == 2

    def test_unknown_fuel_type_classified_as_other(self):
        db = _session()
        db.add_all([
            _listing("x1", "lpg"),
            _listing("x2", None),
        ])
        db.commit()

        result = stats.get_fuel_mix(db=db)

        by_type = {b["fuel_type"]: b for b in result["buckets"]}
        assert by_type["other"]["count"] == 2

    def test_excludes_outlier_listings(self):
        db = _session()
        outlier = _listing("out1", "electric")
        outlier.is_outlier = True
        db.add_all([
            _listing("p1", "petrol"),
            outlier,
        ])
        db.commit()

        result = stats.get_fuel_mix(db=db)

        assert result["total"] == 1
        by_type = {b["fuel_type"]: b for b in result["buckets"]}
        assert by_type["electric"]["count"] == 0

    def test_empty_database_returns_zeros(self):
        db = _session()

        result = stats.get_fuel_mix(db=db)

        assert result["total"] == 0
        for b in result["buckets"]:
            assert b["count"] == 0
            assert b["pct"] == 0.0

    def test_response_contains_all_five_categories(self):
        db = _session()
        db.add(_listing("p1", "petrol"))
        db.commit()

        result = stats.get_fuel_mix(db=db)

        fuel_types = {b["fuel_type"] for b in result["buckets"]}
        assert fuel_types == {"petrol", "hybrid", "electric", "diesel", "other"}

    def test_percentages_sum_to_100(self):
        db = _session()
        db.add_all([
            _listing("p1", "petrol"),
            _listing("p2", "petrol"),
            _listing("p3", "petrol"),
            _listing("h1", "hybrid"),
            _listing("e1", "electric"),
        ])
        db.commit()

        result = stats.get_fuel_mix(db=db)

        total_pct = sum(b["pct"] for b in result["buckets"])
        assert abs(total_pct - 100.0) < 0.2


# ── /stats/hybrid-bands ──────────────────────────────────────────────────────

class TestGetHybridBands:
    def test_buckets_listings_into_three_engine_bands(self):
        db = _session()
        db.add_all([
            _listing("h_1200", "hybrid", engine_capacity=1200),
            _listing("h_1500", "hybrid", engine_capacity=1500),
            _listing("h_1800", "hybrid", engine_capacity=1800),
            _listing("h_2500", "hybrid", engine_capacity=2500),
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        assert result["total_hybrids"] == 4
        by_label = {b["label"]: b for b in result["bands"]}
        assert by_label["≤1500cc"]["count"] == 2
        assert by_label["1501–2000cc"]["count"] == 1
        assert by_label[">2000cc"]["count"] == 1

    def test_median_price_computed_correctly_for_odd_sample(self):
        db = _session()
        db.add_all([
            _listing("h1", "hybrid", price_lkr=5_000_000, engine_capacity=1200),
            _listing("h2", "hybrid", price_lkr=7_000_000, engine_capacity=1300),
            _listing("h3", "hybrid", price_lkr=9_000_000, engine_capacity=1400),
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        by_label = {b["label"]: b for b in result["bands"]}
        assert by_label["≤1500cc"]["median_price_lkr"] == 7_000_000

    def test_median_price_computed_correctly_for_even_sample(self):
        db = _session()
        db.add_all([
            _listing("h1", "hybrid", price_lkr=6_000_000, engine_capacity=1500),
            _listing("h2", "hybrid", price_lkr=8_000_000, engine_capacity=1499),
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        by_label = {b["label"]: b for b in result["bands"]}
        assert by_label["≤1500cc"]["median_price_lkr"] == 7_000_000

    def test_plugin_hybrid_included_in_bands(self):
        db = _session()
        db.add_all([
            _listing("ph1", "plugin_hybrid", engine_capacity=1800),
            _listing("ph2", "plugin_hybrid", engine_capacity=2200),
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        assert result["total_hybrids"] == 2
        by_label = {b["label"]: b for b in result["bands"]}
        assert by_label["1501–2000cc"]["count"] == 1
        assert by_label[">2000cc"]["count"] == 1

    def test_listings_without_engine_capacity_are_excluded(self):
        db = _session()
        db.add_all([
            _listing("h_with_cc", "hybrid", engine_capacity=1500),
            _listing("h_no_cc", "hybrid", engine_capacity=None),
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        assert result["total_hybrids"] == 1

    def test_non_hybrid_fuel_types_excluded(self):
        db = _session()
        db.add_all([
            _listing("p1", "petrol", engine_capacity=1500),
            _listing("d1", "diesel", engine_capacity=1800),
            _listing("h1", "hybrid", engine_capacity=1200),
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        assert result["total_hybrids"] == 1

    def test_outliers_excluded_from_bands(self):
        db = _session()
        outlier = _listing("out1", "hybrid", engine_capacity=1200)
        outlier.is_outlier = True
        db.add_all([
            _listing("h1", "hybrid", engine_capacity=1500),
            outlier,
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        assert result["total_hybrids"] == 1

    def test_bands_with_no_data_return_zero_count_and_null_median(self):
        db = _session()
        db.add(_listing("h1", "hybrid", engine_capacity=1200))
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        by_label = {b["label"]: b for b in result["bands"]}
        assert by_label["1501–2000cc"]["count"] == 0
        assert by_label["1501–2000cc"]["median_price_lkr"] is None
        assert by_label[">2000cc"]["count"] == 0
        assert by_label[">2000cc"]["median_price_lkr"] is None

    def test_response_has_three_bands_in_order(self):
        db = _session()

        result = stats.get_hybrid_bands(db=db)

        labels = [b["label"] for b in result["bands"]]
        assert labels == ["≤1500cc", "1501–2000cc", ">2000cc"]

    def test_price_below_minimum_excluded_from_median(self):
        db = _session()
        db.add_all([
            _listing("h_tiny", "hybrid", price_lkr=50_000, engine_capacity=1200),
            _listing("h_valid", "hybrid", price_lkr=8_000_000, engine_capacity=1300),
        ])
        db.commit()

        result = stats.get_hybrid_bands(db=db)

        by_label = {b["label"]: b for b in result["bands"]}
        assert by_label["≤1500cc"]["count"] == 2
        assert by_label["≤1500cc"]["median_price_lkr"] == 8_000_000
