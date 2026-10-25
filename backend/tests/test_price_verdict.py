"""Shared price-verdict rules (mirrored in src/lib/priceVerdict.ts and Android PriceVerdict.kt)."""

import json
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.models.schemas import CarListingRead
from app.utils.price_verdict import (
    MAX_PLAUSIBLE_GAP_PCT,
    asking_price_issue,
    is_placeholder_price,
    price_verdict,
    stored_signal_is_plausible,
)

FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "price-verdict-fixtures.json"


def test_bands_and_pct():
    v = price_verdict(9_000_000, 10_000_000, comps=20, confidence="high", model="Aqua")
    assert v["status"] == "ok" and v["band"] == "below" and v["pct"] == 10 and not v["verify_first"]
    assert price_verdict(10_700_000, 10_000_000, model="Aqua")["band"] == "fair"
    assert price_verdict(10_800_000, 10_000_000, model="Aqua")["band"] == "above"
    assert price_verdict(9_600_000, 10_000_000, model="Aqua")["band"] == "fair"
    assert price_verdict(6_000_000, 10_000_000, model="Aqua")["verify_first"] is True


@pytest.mark.parametrize("price", [123_456, 1_234_567, 12_345_678, 123_456_789, 1_111_111, 111_111])
def test_placeholder_prices(price):
    assert is_placeholder_price(price)
    assert price_verdict(price, price * 1.05, model="Aqua")["reason"] == "placeholder_price"


def test_lucky_number_prices_are_real():
    assert not is_placeholder_price(7_777_777)
    assert not is_placeholder_price(5_555_000)


@pytest.mark.parametrize(
    "title,reason",
    [
        ("Toyota Prius for rent", "lease_or_rent"),
        ("Nissan Presea R11 Down Payment 450k", "lease_or_rent"),
        ("Vezel lease takeover", "lease_or_rent"),
        ("Toyota Axio for parts", "parts_or_damaged"),
        ("Accidented Honda Fit", "parts_or_damaged"),
        ("Honda Fit GP5 accident free", None),
        ("Vitz leasing available", None),
    ],
)
def test_ad_text_guards(title, reason):
    assert asking_price_issue(5_000_000, category="cars", title=title) == reason


def test_category_floors():
    assert asking_price_issue(80_000, category="motorbikes") is None
    assert asking_price_issue(80_000, category="cars") == "below_price_floor"
    assert asking_price_issue(0, category="cars") == "no_price"
    assert asking_price_issue(None) == "no_price"
    assert asking_price_issue(900_000_000) == "above_price_ceiling"


def test_withheld_when_reference_is_weak():
    assert price_verdict(5e6, None, model="Aqua")["reason"] == "no_reference"
    assert price_verdict(5e6, 5.2e6, comps=3, model="Aqua")["reason"] == "thin_comps"
    assert price_verdict(5e6, 5.2e6, comps=30, confidence="low", model="Aqua")["reason"] == "low_confidence"
    assert price_verdict(5e6, 5.2e6, model="Other")["reason"] == "generic_model"


def test_withheld_when_gap_is_implausible():
    # listing 680073: Rs 735k bike vs a Rs 7.2M "Honda Other" car cohort
    v = price_verdict(735_000, 7_201_142.86, model="Hunk", category="motorbikes")
    assert v["status"] == "withheld" and v["reason"] in {"implausible_gap", "unit_mismatch"}
    assert price_verdict(650_000, 6_500_000, model="Aqua")["reason"] == "unit_mismatch"
    edge = 10_000_000 * (1 + MAX_PLAUSIBLE_GAP_PCT / 100)
    assert price_verdict(edge, 10_000_000, model="Aqua")["status"] == "ok"
    assert price_verdict(edge + 10_000, 10_000_000, model="Aqua")["reason"] == "implausible_gap"


def test_opposite_estimates_withhold():
    v = price_verdict(9_000_000, 10_000_000, model="Aqua", secondary_reference=8_000_000)
    assert v["status"] == "withheld" and v["reason"] == "estimates_disagree"
    # same direction is fine
    assert price_verdict(9_000_000, 10_000_000, model="Aqua", secondary_reference=9_800_000)["status"] == "ok"


def test_never_nan_zero_or_negative_pct():
    for asking, ref in [(5e6, 5e6), (5_000_001, 5e6), (4.99e6, 5e6), (5.395e6, 5e6), (4.755e6, 5e6)]:
        v = price_verdict(asking, ref, model="Aqua")
        assert v["status"] == "ok"
        assert v["pct"] >= 0
        if v["band"] == "fair":
            assert v["pct"] < 8
        if v["band"] == "below":
            assert v["pct"] >= 5


def test_stored_signal_guard():
    assert stored_signal_is_plausible(price_lkr=735_000, market_median_lkr=7_201_142, model="Other") is False
    assert stored_signal_is_plausible(price_lkr=5_000_000, market_median_lkr=5_200_000, model="Aqua") is True
    assert stored_signal_is_plausible(price_lkr=5_000_000, market_median_lkr=None, model="Aqua") is True


def test_listing_read_schema_drops_implausible_stored_signal():
    base = dict(source="riyasewana", source_id="x", url="u", make="Honda", model="Other", year=2026,
                vehicle_category="motorbikes", id=680073, scraped_at="2026-10-24T20:45:09",
                first_seen_at="2026-10-24T14:35:45", last_seen_at="2026-10-24T14:35:45", is_outlier=False)
    bad = CarListingRead(**base, price_lkr=735_000, deal_score=89.8, market_median_lkr=7_201_142.86)
    assert bad.deal_score is None and bad.market_median_lkr is None
    good = CarListingRead(**{**base, "model": "Aqua", "vehicle_category": "cars"}, price_lkr=5_000_000,
                          deal_score=3.8, market_median_lkr=5_200_000)
    assert float(good.deal_score) == 3.8 and float(good.market_median_lkr) == 5_200_000


def test_shared_fixtures_match():
    """docs/price-verdict-fixtures.json is asserted by the web and Android suites too."""
    cases = json.loads(FIXTURES.read_text())["cases"]
    assert len(cases) >= 20
    for case in cases:
        i = case["input"]
        v = price_verdict(
            i.get("asking"), i.get("reference"), comps=i.get("comps"), confidence=i.get("confidence"),
            category=i.get("category"), model=i.get("model"), title=i.get("title"),
            secondary_reference=i.get("secondary"),
        )
        exp = case["expect"]
        assert v["status"] == exp["status"], case["name"]
        if exp["status"] == "ok":
            assert v["band"] == exp["band"], case["name"]
            assert v["pct"] == exp["pct"], case["name"]
            assert v["verify_first"] == exp.get("verify_first", False), case["name"]
        else:
            assert v["reason"] == exp["reason"], case["name"]
