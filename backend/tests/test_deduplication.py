"""Tests for app.utils.deduplication."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils.deduplication import (
    _norm,
    _price_band,
    _mileage_band,
    find_duplicate_candidates,
    mark_duplicates_batch,
)
from db.models import Base, CarListing


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime(2026, 1, 15, 10, 0, tzinfo=timezone.utc)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _listing(
    source: str,
    source_id: str,
    *,
    make: str = "Toyota",
    model: str = "Prius",
    year: int | None = 2020,
    price_lkr: int | None = 10_000_000,
    mileage: int | None = 50_000,
    scraped_at: datetime = _NOW,
) -> CarListing:
    return CarListing(
        source=source,
        source_id=source_id,
        scraped_at=scraped_at,
        first_seen_at=_NOW,
        last_seen_at=_NOW,
        make=make,
        model=model,
        year=year,
        price_lkr=price_lkr,
        mileage=mileage,
        title=f"{make} {model} {year}",
        url=f"https://example.com/{source}/{source_id}",
        is_outlier=False,
        is_duplicate=False,
    )


# ---------------------------------------------------------------------------
# Unit tests — normalisation helpers
# ---------------------------------------------------------------------------


def test_norm_strips_punctuation_and_lowercases():
    assert _norm("Toyota") == "toyota"
    assert _norm("Land-Rover") == "landrover"
    assert _norm("Kia (EV6)") == "kiaev6"
    assert _norm("") == ""
    assert _norm(None) == ""


def test_price_band_correct_bounds():
    low, high = _price_band(10_000_000)
    assert abs(low - 9_700_000) < 1
    assert abs(high - 10_300_000) < 1


def test_price_band_returns_none_for_null_or_zero():
    assert _price_band(None) is None
    assert _price_band(0) is None


def test_mileage_band_correct_bounds():
    low, high = _mileage_band(50_000)
    assert low == 47_500
    assert high == 52_500


def test_mileage_band_returns_none_for_null():
    assert _mileage_band(None) is None


# ---------------------------------------------------------------------------
# find_duplicate_candidates — positive cases
# ---------------------------------------------------------------------------


def test_find_duplicate_candidates_returns_match_from_different_source():
    db = _session()
    base = _listing("ikman", "ik-1")
    twin = _listing("riyasewana", "rs-1")  # same make/model/year/price/mileage
    db.add_all([base, twin])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert len(results) == 1
    assert results[0].source_id == "rs-1"


def test_find_duplicate_candidates_accepts_price_within_3_percent():
    db = _session()
    base = _listing("ikman", "ik-2", price_lkr=10_000_000)
    near = _listing("autolanka", "al-2", price_lkr=10_250_000)  # +2.5 %
    far = _listing("autolanka", "al-far", price_lkr=10_400_000)  # +4 %
    db.add_all([base, near, far])
    db.commit()

    results = find_duplicate_candidates(db, base)

    source_ids = {r.source_id for r in results}
    assert "al-2" in source_ids
    assert "al-far" not in source_ids


def test_find_duplicate_candidates_accepts_mileage_within_5_percent():
    db = _session()
    base = _listing("ikman", "ik-3", mileage=50_000)
    near_m = _listing("riyasewana", "rs-3", mileage=52_000)  # +4 %
    far_m = _listing("riyasewana", "rs-3b", mileage=54_000)  # +8 %
    db.add_all([base, near_m, far_m])
    db.commit()

    results = find_duplicate_candidates(db, base)

    source_ids = {r.source_id for r in results}
    assert "rs-3" in source_ids
    assert "rs-3b" not in source_ids


def test_find_duplicate_candidates_null_mileage_on_candidate_is_accepted():
    db = _session()
    base = _listing("ikman", "ik-4", mileage=50_000)
    no_mileage = _listing("riyasewana", "rs-4", mileage=None)
    db.add_all([base, no_mileage])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert any(r.source_id == "rs-4" for r in results)


def test_find_duplicate_candidates_both_null_price_does_not_match():
    """Distinct unpriced cars must not collapse into one row."""
    db = _session()
    base = _listing("ikman", "ik-5", price_lkr=None)
    twin = _listing("riyasewana", "rs-5", price_lkr=None)
    db.add_all([base, twin])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert not any(r.source_id == "rs-5" for r in results)


def test_find_duplicate_candidates_normalises_make_model_punctuation():
    db = _session()
    base = _listing("ikman", "ik-6", make="Land-Rover", model="Discovery")
    twin = _listing("riyasewana", "rs-6", make="Land Rover", model="Discovery")
    db.add_all([base, twin])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert any(r.source_id == "rs-6" for r in results)


# ---------------------------------------------------------------------------
# find_duplicate_candidates — negative cases
# ---------------------------------------------------------------------------


def test_find_duplicate_candidates_excludes_same_source():
    db = _session()
    base = _listing("ikman", "ik-7")
    same_src = _listing("ikman", "ik-8")  # same source
    db.add_all([base, same_src])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert results == []


def test_find_duplicate_candidates_excludes_different_year():
    db = _session()
    base = _listing("ikman", "ik-9", year=2020)
    diff_year = _listing("riyasewana", "rs-9", year=2019)
    db.add_all([base, diff_year])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert results == []


def test_find_duplicate_candidates_excludes_already_flagged_duplicates():
    db = _session()
    base = _listing("ikman", "ik-10")
    flagged = _listing("riyasewana", "rs-10")
    flagged.is_duplicate = True
    db.add_all([base, flagged])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert results == []


def test_find_duplicate_candidates_excludes_different_make():
    db = _session()
    base = _listing("ikman", "ik-11", make="Toyota")
    diff_make = _listing("riyasewana", "rs-11", make="Honda")
    db.add_all([base, diff_make])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert results == []


def test_find_duplicate_candidates_respects_limit():
    db = _session()
    base = _listing("ikman", "ik-12")
    twins = [_listing(f"src{i}", f"twin-{i}") for i in range(10)]
    db.add_all([base] + twins)
    db.commit()

    results = find_duplicate_candidates(db, base, limit=3)

    assert len(results) <= 3


# ---------------------------------------------------------------------------
# mark_duplicates_batch
# ---------------------------------------------------------------------------


def test_mark_duplicates_batch_flags_lower_id_record():
    db = _session()
    early = _listing("ikman", "ik-batch-1")   # inserted first → lower id
    late = _listing("riyasewana", "rs-batch-1")  # inserted second → higher id
    db.add(early)
    db.commit()
    db.add(late)
    db.commit()

    marked = mark_duplicates_batch(db)

    db.expire_all()
    early_row = db.query(CarListing).filter_by(source_id="ik-batch-1").one()
    late_row = db.query(CarListing).filter_by(source_id="rs-batch-1").one()

    assert marked == 1
    assert early_row.is_duplicate is True
    assert early_row.duplicate_of == late_row.id
    assert late_row.is_duplicate is False


def test_mark_duplicates_batch_returns_zero_when_no_duplicates():
    db = _session()
    a = _listing("ikman", "unique-a", make="Toyota", model="Vitz", year=2019, price_lkr=5_000_000)
    b = _listing("riyasewana", "unique-b", make="Honda", model="Fit", year=2021, price_lkr=8_000_000)
    db.add_all([a, b])
    db.commit()

    marked = mark_duplicates_batch(db)

    assert marked == 0


def test_mark_duplicates_batch_does_not_double_flag():
    db = _session()
    early = _listing("ikman", "ik-double-1")
    late = _listing("riyasewana", "rs-double-1")
    db.add(early)
    db.commit()
    db.add(late)
    db.commit()

    first_run = mark_duplicates_batch(db)
    second_run = mark_duplicates_batch(db)

    assert first_run == 1
    assert second_run == 0


def test_mark_duplicates_batch_handles_multiple_pairs():
    db = _session()
    # Use distinct prices per pair so pairs don't cross-match.
    base_prices = [5_000_000, 8_000_000, 12_000_000]
    pairs = [
        (
            _listing("ikman", f"ik-m-{i}", price_lkr=p),
            _listing("riyasewana", f"rs-m-{i}", price_lkr=p),
        )
        for i, p in enumerate(base_prices)
    ]
    for a, b in pairs:
        db.add(a)
        db.commit()
        db.add(b)
        db.commit()

    marked = mark_duplicates_batch(db)

    assert marked == 3
    flagged = db.query(CarListing).filter_by(is_duplicate=True).count()
    assert flagged == 3


def test_mark_duplicates_batch_skips_same_source_duplicates():
    db = _session()
    a = _listing("ikman", "ik-ss-1")
    b = _listing("ikman", "ik-ss-2")  # same source
    db.add_all([a, b])
    db.commit()

    marked = mark_duplicates_batch(db)

    assert marked == 0


def test_mark_duplicates_batch_since_skips_old_pairs():
    """With a `since` cutoff, untouched (old) listings are not re-scanned."""
    db = _session()
    old = _listing("ikman", "ik-since-old", scraped_at=_NOW - timedelta(days=10))
    old_twin = _listing("riyasewana", "rs-since-old", scraped_at=_NOW - timedelta(days=10))
    db.add(old)
    db.commit()
    db.add(old_twin)
    db.commit()

    marked = mark_duplicates_batch(db, since=_NOW - timedelta(days=1))

    assert marked == 0


def test_mark_duplicates_batch_since_resolves_pair_when_new_member_scanned():
    """A new/changed listing still resolves a pair against older candidates."""
    db = _session()
    old = _listing("ikman", "ik-since-new", scraped_at=_NOW - timedelta(days=10))
    db.add(old)
    db.commit()
    fresh = _listing("riyasewana", "rs-since-new", scraped_at=_NOW)
    db.add(fresh)
    db.commit()

    marked = mark_duplicates_batch(db, since=_NOW - timedelta(days=1))

    db.expire_all()
    old_row = db.query(CarListing).filter_by(source_id="ik-since-new").one()
    fresh_row = db.query(CarListing).filter_by(source_id="rs-since-new").one()

    assert marked == 1
    assert old_row.is_duplicate is True
    assert old_row.duplicate_of == fresh_row.id
    assert fresh_row.is_duplicate is False


def test_mark_duplicates_batch_since_none_matches_full_pass():
    """Explicit since=None scans the whole table (existing behaviour)."""
    db = _session()
    early = _listing("ikman", "ik-none-1", scraped_at=_NOW - timedelta(days=10))
    late = _listing("riyasewana", "rs-none-1", scraped_at=_NOW)
    db.add(early)
    db.commit()
    db.add(late)
    db.commit()

    marked = mark_duplicates_batch(db, since=None)

    assert marked == 1


def test_mark_duplicates_batch_custom_batch_size():
    """Verify pagination works correctly with a tiny batch_size."""
    db = _session()
    # Distinct prices so no cross-pair matches occur.
    base_prices = [4_000_000, 6_000_000, 8_000_000, 10_000_000, 13_000_000]
    pairs = [
        (
            _listing("ikman", f"ik-p-{i}", price_lkr=p),
            _listing("riyasewana", f"rs-p-{i}", price_lkr=p),
        )
        for i, p in enumerate(base_prices)
    ]
    for a, b in pairs:
        db.add(a)
        db.commit()
        db.add(b)
        db.commit()

    marked = mark_duplicates_batch(db, batch_size=3)

    assert marked == 5


# ---------------------------------------------------------------------------
# Price recovery — integration with deduplication flag
# ---------------------------------------------------------------------------


def test_find_duplicate_candidates_null_year_both_sides_matches():
    db = _session()
    base = _listing("ikman", "ik-ny-1", year=None)
    twin = _listing("riyasewana", "rs-ny-1", year=None)
    db.add_all([base, twin])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert any(r.source_id == "rs-ny-1" for r in results)


def test_find_duplicate_candidates_null_year_vs_set_year_no_match():
    db = _session()
    base = _listing("ikman", "ik-ny-2", year=None)
    has_year = _listing("riyasewana", "rs-ny-2", year=2020)
    db.add_all([base, has_year])
    db.commit()

    results = find_duplicate_candidates(db, base)

    assert results == []
