"""Cards withhold exactly when the detail page does (fix/price-consistency).

The detail page's verdict needs live comparables (predict_listing_fmv); the
listing row alone can't know about thin comps or comps that disagree with the
stored cohort median. List/similar responses therefore carry the detail
verdict's withheld reason and drop the card's rating for those rows.
"""

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import listings
from app.utils.fmv import batch_price_verdicts, predict_listing_fmv
from db.models import Base, CarListing

NOW = datetime(2026, 10, 20, tzinfo=timezone.utc)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


_seq = iter(range(1, 10**6))


def _listing(**kwargs) -> CarListing:
    n = next(_seq)
    defaults = dict(
        source="ikman",
        source_id=f"s{n}",
        url=f"https://example.com/{n}",
        scraped_at=NOW,
        first_seen_at=NOW,
        last_seen_at=NOW - timedelta(minutes=n),
        make="Toyota",
        model="Aqua",
        vehicle_category="cars",
        year=2016,
        mileage=70_000,
        district="Colombo",
        condition="used",
        price_lkr=6_000_000,
        is_outlier=False,
        is_active=True,
        is_duplicate=False,
        user_listing_status="scraped",
    )
    defaults.update(kwargs)
    defaults.setdefault("title", f"{defaults['make']} {defaults['model']} {defaults['year']}")
    return CarListing(**defaults)


def _comps(n: int, center: float, **kwargs) -> list[CarListing]:
    return [
        _listing(price_lkr=round(center * (0.92 + 0.16 * i / max(1, n - 1))), mileage=50_000 + 4_000 * i, **kwargs)
        for i in range(n)
    ]


def test_thin_comps_card_is_served_unscored_with_the_reason():
    db = _session()
    subject = _listing(price_lkr=4_190_000, market_median_lkr=4_450_000, deal_score=5.8, make="Perodua", model="Viva", vehicle_category="wagons", year=2011)
    # No live comps for this cohort (614039-shape): the stored median alone is never rated.
    db.add_all([subject, _listing(make="Perodua", model="Bezza", vehicle_category="wagons", year=2011)])
    db.commit()

    assert predict_listing_fmv(db, subject)["verdict"]["reason"] == "thin_comps"
    [read] = listings._with_card_verdicts(db, [subject])
    assert read.price_withheld_reason == "thin_comps"
    assert read.deal_score is None
    assert read.market_median_lkr is None


def test_disagreeing_comps_card_is_served_unscored():
    db = _session()
    # Stored median says 1.11 Mn; twelve live comps say ~0.75 Mn (>25 % apart).
    subject = _listing(make="Bajaj", model="RE", vehicle_category="three-wheelers", year=2015, price_lkr=1_350_000, market_median_lkr=1_110_267, deal_score=-21.6)
    db.add_all([subject, *_comps(12, 750_000, make="Bajaj", model="RE", vehicle_category="three-wheelers", year=2015)])
    db.commit()

    assert predict_listing_fmv(db, subject)["verdict"]["reason"] == "estimates_disagree"
    [read] = listings._with_card_verdicts(db, [subject])
    assert read.price_withheld_reason == "estimates_disagree"
    assert read.deal_score is None and read.market_median_lkr is None


def test_corroborated_card_keeps_its_rating():
    db = _session()
    subject = _listing(price_lkr=5_700_000, market_median_lkr=6_000_000, deal_score=5.0)
    db.add_all([subject, *_comps(12, 6_000_000)])
    db.commit()

    verdict = predict_listing_fmv(db, subject)["verdict"]
    assert verdict["status"] == "ok"
    [read] = listings._with_card_verdicts(db, [subject])
    assert read.price_withheld_reason is None
    assert float(read.market_median_lkr) == 6_000_000
    assert float(read.deal_score) == 5.0


def test_rows_without_a_median_are_untouched_and_cost_no_query():
    db = _session()
    subject = _listing(market_median_lkr=None, deal_score=None)
    db.add(subject)
    db.commit()
    [read] = listings._with_card_verdicts(db, [subject])
    assert read.price_withheld_reason is None


def test_batch_matches_the_detail_verdict_for_every_listing():
    """The batched comps selection is the SQL path's twin: same verdict, every row."""
    rng = random.Random(7)
    db = _session()
    rows = []
    for make, model, cat, base in (
        ("Toyota", "Aqua", "cars", 6_000_000),
        ("toyota", "AQUA", "cars", 6_100_000),  # case differences are one cohort
        ("Bajaj", "Pulsar", "motorbikes", 450_000),
        ("Bajaj", "RE", "three-wheelers", 1_100_000),
        ("Suzuki", "Wagon", "cars", 6_500_000),
        ("Honda", "Other", "motorbikes", 500_000),
    ):
        for _ in range(rng.randint(1, 30)):
            year = rng.randint(2008, 2024) if rng.random() > 0.05 else None
            price = round(base * rng.uniform(0.55, 1.6))
            median = round(base * rng.uniform(0.7, 1.4)) if rng.random() > 0.3 else None
            rows.append(_listing(make=make, model=model, vehicle_category=cat, year=year, price_lkr=price, market_median_lkr=median, mileage=rng.randint(5_000, 200_000)))
    db.add_all(rows)
    db.commit()

    batch = batch_price_verdicts(db, rows)
    with_median = [r for r in rows if r.market_median_lkr is not None]
    assert set(batch) == {r.id for r in with_median}
    for r in with_median:
        assert batch[r.id] == predict_listing_fmv(db, r)["verdict"], r.id


def test_similar_endpoint_serves_the_detail_verdict(monkeypatch):
    db = _session()
    base = _listing(price_lkr=6_000_000)
    thin = _listing(make="Toyota", model="Vitz", year=2018, price_lkr=5_900_000, market_median_lkr=6_100_000, deal_score=3.3)
    db.add_all([base, thin])
    db.commit()
    monkeypatch.setattr(listings, "_request_live_access", lambda *a, **k: ("pro", "user"))
    monkeypatch.setattr(listings, "_is_free_browse_plan", lambda *a, **k: False)

    similar = listings.get_similar_listings(base.id, request=MagicMock(), db=db)
    [row] = [r for r in similar if r.id == thin.id]
    assert row.price_withheld_reason == "thin_comps"
    assert row.deal_score is None and row.market_median_lkr is None


def test_two_corroborating_comps_are_still_low_confidence_like_the_detail_page():
    db = _session()
    subject = _listing(price_lkr=4_190_000, market_median_lkr=4_450_000, deal_score=5.8, make="Perodua", model="Viva", vehicle_category="wagons", year=2011)
    db.add_all([subject, *_comps(2, 4_300_000, make="Perodua", model="Viva", vehicle_category="wagons", year=2011)])
    db.commit()
    detail = predict_listing_fmv(db, subject)["verdict"]
    assert detail["status"] == "withheld"
    [read] = listings._with_card_verdicts(db, [subject])
    assert read.price_withheld_reason == detail["reason"]
    assert read.deal_score is None
