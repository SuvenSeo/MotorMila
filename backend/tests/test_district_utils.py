"""Tests for app.utils.districts — canonical district resolution used by the
stats/pro endpoints, the cleaner, and historical imports.

The alias/hyphen normalisation and the URL-slug inference are pure string
logic with easy-to-miss edge cases; count_canonical_districts drives the
district-coverage numbers shown to Pro users.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("ALLOW_SQLITE_FALLBACK", "true")

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.districts import (  # noqa: E402
    find_district_from_url,
    normalize_district_name,
    resolve_canonical_district,
    count_canonical_districts,
)
from db.models import Base, CarListing  # noqa: E402


def test_normalize_district_name_aliases_and_cleanup():
    assert normalize_district_name(None) is None
    assert normalize_district_name("") is None
    assert normalize_district_name("   ") is None

    assert normalize_district_name("Colombo") == "Colombo"
    assert normalize_district_name(" colombo ") == "Colombo"
    assert normalize_district_name("COLOMBO") == "Colombo"

    # Explicit aliases.
    assert normalize_district_name("nuwara eliya") == "Nuwara Eliya"
    assert normalize_district_name("nuwaraeliya") == "Nuwara Eliya"
    assert normalize_district_name("Gampaha District") == "Gampaha"
    assert normalize_district_name("colombo district") == "Colombo"

    # Hyphens are treated as word separators before alias lookup.
    assert normalize_district_name("nuwara-eliyA") == "Nuwara Eliya"
    assert normalize_district_name("gampaha-district") == "Gampaha"

    # Unknown names never leak through.
    assert normalize_district_name("Atlantis") is None
    assert normalize_district_name("Colombo City") is None


def test_find_district_from_url_slug_matching():
    assert find_district_from_url(None) is None
    assert find_district_from_url("") is None
    assert find_district_from_url("https://example.com/no-slug-here") is None

    assert (
        find_district_from_url("https://ikman.lk/en/ad/toyota-vitz-for-sale-colombo")
        == "Colombo"
    )
    # Longest slug wins, so multi-word districts match their full slug.
    assert (
        find_district_from_url("https://ikman.lk/en/ad/honda-for-sale-nuwara-eliya")
        == "Nuwara Eliya"
    )
    assert (
        find_district_from_url("HTTPS://EXAMPLE.COM/AD/BIKE-FOR-SALE-MATARA")
        == "Matara"
    )
    # District words outside the exact slug pattern do not match.
    assert find_district_from_url("https://example.com/toyota-colombo-listing") is None


def test_resolve_canonical_district_fallback_order():
    assert resolve_canonical_district("Colombo", "https://example.com/x") == "Colombo"

    # Explicit "Sri Lanka" and missing district fall back to the URL.
    assert (
        resolve_canonical_district("Sri Lanka", "https://x.com/toyota-for-sale-gampaha")
        == "Gampaha"
    )
    assert resolve_canonical_district(None, "https://x.com/toyota-for-sale-matara") == "Matara"

    # Unrecoverable input stays None.
    assert resolve_canonical_district("Sri Lanka", "https://x.com/no-slug") is None
    assert resolve_canonical_district(None, None) is None
    assert resolve_canonical_district("Atlantis", "https://x.com/no-slug") is None


def _dt() -> datetime:
    return datetime(2026, 4, 1, tzinfo=timezone.utc)


def _listing(source_id: str, district: str | None, url: str | None) -> CarListing:
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
        price_lkr=5_000_000,
        district=district,
        url=url,
        title=f"Toyota Vitz {source_id}",
    )


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_count_canonical_districts_dedupes_and_infers():
    db = _session()
    db.add_all(
        [
            _listing("a", "Colombo", "https://example.com/a"),
            _listing("b", "Colombo", "https://example.com/b"),  # duplicate district
            _listing("c", "nuwara eliya", "https://example.com/c"),
            _listing("d", "kandy", "https://example.com/d"),
            _listing("e", "Sri Lanka", "https://x.com/toyota-for-sale-gampaha"),
            _listing("f", None, "https://x.com/toyota-for-sale-matara"),
            _listing("g", "Atlantis", "https://example.com/g"),  # unrecoverable
        ]
    )
    db.commit()

    query = db.query(CarListing)
    assert count_canonical_districts(query) == 5

    # Confined to a single canonical district when scoped.
    assert count_canonical_districts(query.filter(CarListing.district == "Colombo")) == 1


def test_count_canonical_districts_empty_table():
    db = _session()
    assert count_canonical_districts(db.query(CarListing)) == 0
