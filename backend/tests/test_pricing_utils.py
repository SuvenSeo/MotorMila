"""Tests for app.utils.pricing — the district/price medians behind the
/stats/district-prices and /stats/summary aggregation path.

Covers the MIN_REASONABLE_PRICE_LKR filter, None handling, district
canonicalisation including the URL-inference fallback, the live-listing
filter, and per-query median computation.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("ALLOW_SQLITE_FALLBACK", "true")

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.pricing import (  # noqa: E402
    MIN_REASONABLE_PRICE_LKR,
    build_district_median_map,
    median_from_values,
    median_price_for_listings,
)
from db.models import Base, CarListing  # noqa: E402


def _dt() -> datetime:
    return datetime(2026, 4, 1, tzinfo=timezone.utc)


def _listing(
    source_id: str,
    price_lkr: int,
    *,
    district: str | None = "Colombo",
    url: str | None = "https://example.com/x",
    is_active: bool = True,
    is_outlier: bool = False,
) -> CarListing:
    now = _dt()
    return CarListing(
        source="ikman",
        source_id=source_id,
        scraped_at=now,
        first_seen_at=now,
        last_seen_at=now,
        make="Toyota",
        model="Vitz",
        year=2018,
        price_lkr=price_lkr,
        district=district,
        url=url,
        is_active=is_active,
        is_outlier=is_outlier,
        title=f"Toyota Vitz {source_id}",
    )


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


# ---------------------------------------------------------------------------
# median_from_values
# ---------------------------------------------------------------------------


def test_median_from_values_skips_none_and_unreasonable_prices():
    assert median_from_values([5_000_000, None, 7_000_000]) == 6_000_000.0
    assert median_from_values([50_000, 4_000_000, 5_000_000]) == 4_500_000.0
    # Deadline is inclusive.
    assert median_from_values([MIN_REASONABLE_PRICE_LKR, 4_000_000]) == 2_050_000.0


def test_median_from_values_empty_and_all_filtered():
    assert median_from_values([]) is None
    assert median_from_values([None, 1_000]) is None
    assert median_from_values([None, None]) is None


# ---------------------------------------------------------------------------
# build_district_median_map
# ---------------------------------------------------------------------------


def test_build_district_median_map_normalizes_and_filters():
    db = _session()
    db.add_all(
        [
            _listing("a", 4_000_000, district="Colombo"),
            _listing("b", 6_000_000, district="Colombo"),
            _listing("c", 5_000_000, district="nuwara eliya"),
            _listing("d", 7_000_000, district="NuwaraEliya"),
            # Not live / not canonical -> excluded regardless of price.
            _listing("e", 8_000_000, district="Colombo", is_outlier=True),
            _listing("f", 8_000_000, district="Colombo", is_active=False),
            _listing("g", 8_000_000, district="Atlantis"),
            # Too low to be a real car price.
            _listing("h", 50_000, district="Colombo"),
        ]
    )
    db.commit()

    result = build_district_median_map(db)

    assert result == {
        "Colombo": 5_000_000.0,
        "Nuwara Eliya": 6_000_000.0,
    }


def test_build_district_median_map_infers_district_from_url_when_missing():
    db = _session()
    db.add_all(
        [
            _listing(
                "a",
                5_000_000,
                district=None,
                url="https://ikman.lk/en/ad/toyota-vitz-for-sale-colombo",
            ),
            _listing(
                "b",
                7_000_000,
                district="Sri Lanka",
                url="https://ikman.lk/en/ad/toyota-corolla-for-sale-gampaha",
            ),
            _listing(
                "c",
                9_000_000,
                district="Sri Lanka",
                url="https://example.com/no-location-slug",
            ),
        ]
    )
    db.commit()

    result = build_district_median_map(db)

    assert result == {"Colombo": 5_000_000.0, "Gampaha": 7_000_000.0}


# ---------------------------------------------------------------------------
# median_price_for_listings
# ---------------------------------------------------------------------------


def test_median_price_for_listings_respects_clause_and_filters():
    db = _session()
    db.add_all(
        [
            _listing("a", 4_000_000, district="Colombo"),
            _listing("b", 6_000_000, district="Colombo"),
            _listing("c", 8_000_000, district="Gampaha"),
            _listing("d", None, district="Colombo"),
            _listing("e", 50_000, district="Colombo"),
        ]
    )
    db.commit()

    median = median_price_for_listings(db, CarListing.district == "Colombo")

    assert median == 5_000_000.0  # None and 50k excluded


def test_median_price_for_listings_empty_matches_returns_none():
    db = _session()
    db.add(_listing("a", 4_000_000))
    db.commit()

    assert median_price_for_listings(db, CarListing.make == "Suzuki") is None
