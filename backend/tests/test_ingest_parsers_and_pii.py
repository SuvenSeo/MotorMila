"""Parser + PII tests for ingest: lakh prices, hyphenated models, contact stripping."""
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.scrapers.cleaner import CarCleaner
from app.utils.pii import clean_listing_title, contains_contact_info, strip_contact_info
from db.models import Base, CarListing

C = CarCleaner()


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("12,50,000", 1_250_000),
        ("Rs. 12,50,000", 1_250_000),
        ("Rs 1,25,00,000", 12_500_000),
        ("Rs. 85,00,000/=", 8_500_000),
        ("Rs. 45 lakhs", 4_500_000),
        ("45 Lakhs Negotiable", 4_500_000),
        ("45L", 4_500_000),
        ("Rs 45 L", 4_500_000),
        ("Rs 8.5 L", 850_000),
        ("Rs 7,950,000", 7_950_000),
        ("LKR 4.35 mn", 4_350_000),
        ("12500000", 12_500_000),
        ("1.2 crore", 12_000_000),
        ("Monthly installment Rs 45,000 price Rs 55 lakhs", 5_500_000),
    ],
)
def test_clean_price_handles_lakh_grouping_and_suffixes(raw, expected):
    assert C.clean_price(raw) == expected


@pytest.mark.parametrize("raw", ["1.5L engine", "2.5L", "USD 45,000", ""])
def test_clean_price_rejects_non_prices(raw):
    assert C.clean_price(raw) is None


@pytest.mark.parametrize(
    "title,make,model,year",
    [
        ("NISSAN X-TRAIL 2001 for sale", "Nissan", "X-Trail", 2001),
        ("Honda CR-V 2018", "Honda", "CR-V", 2018),
        ("Toyota C-HR 2019 Hybrid", "Toyota", "C-HR", 2019),
        ("Mazda CX-5 2017", "Mazda", "CX-5", 2017),
        ("Suzuki A-Star 2012", "Suzuki", "A-Star", 2012),
        ("Toyota Land Cruiser Prado 2015", "Toyota", "Land Cruiser Prado", 2015),
        ("Suzuki Wagon R 2017 for sale", "Suzuki", "Wagon R", 2017),
        ("Toyota Corolla Axio 2014", "Toyota", "Corolla Axio", 2014),
        ("Toyota RAV4 2007", "Toyota", "RAV4", 2007),
        ("BMW X5 2012", "Bmw", "X5", 2012),
        ("Toyota Vitz 2018", "Toyota", "Vitz", 2018),
        ("2015 Toyota Premio for sale", "Toyota", "Premio", 2015),
        ("Micro Panda 2010", "Micro", "Panda", 2010),
    ],
)
def test_clean_title_models(title, make, model, year):
    out = C.clean_title(title)
    assert (out["make"], out["model"], out["year"]) == (make, model, year)


@pytest.mark.parametrize(
    "raw",
    [
        "Toyota Aqua 2015 Tel: 0757707502 Colombo",
        "Call 077-123-4567 or 0112 345 678",
        "WhatsApp +94 77 123 4567",
        "94771234567 urgent",
        "Contact (011) 2345678",
        "Phone no - 0094 71 234 5678",
        "077 1234567/0718765432",
        "email: seller.name@gmail.com for details",
    ],
)
def test_strip_contact_info_removes_phones_and_emails(raw):
    cleaned = strip_contact_info(raw)
    assert not contains_contact_info(cleaned)
    assert not any(ch.isdigit() for ch in cleaned.replace("2015", ""))


@pytest.mark.parametrize(
    "raw",
    ["Vitz 2018 price Rs 7,950,000", "Mileage 94,000 km 2015", "KDH 2015 Rs 9450000", "Engine 1500cc"],
)
def test_strip_contact_info_keeps_prices_and_specs(raw):
    assert strip_contact_info(raw) == raw


def test_title_is_capped():
    long_title = "Toyota Premio 2017 " + "excellent condition " * 30
    out = clean_listing_title(long_title, max_chars=120)
    assert len(out) <= 121 and out.endswith("…")


def test_normalize_payload_strips_phone_from_scraped_title_only():
    base = {
        "source_id": "https://ikman.lk/en/ad/x1",
        "url": "https://ikman.lk/en/ad/x1",
        "make": "Toyota",
        "model": "Aqua",
        "year": 2015,
        "price_lkr": "Rs 5,500,000",
        "title": "Toyota Aqua 2015 Tel: 0757707502",
        "contact_phone": "0757707502",
    }
    scraped = C.normalize_listing_payload({**base, "source": "ikman"})
    assert scraped["title"] == "Toyota Aqua 2015"
    assert "contact_phone" not in scraped
    assert scraped["url"] == "https://ikman.lk/en/ad/x1"
    own = C.normalize_listing_payload({**base, "source": "motormila_user"})
    assert own["contact_phone"] == "0757707502"


def test_scrub_script_dry_run_and_apply(tmp_path):
    from scripts.ops.scrub_listing_pii import scrub

    url = f"sqlite:///{tmp_path / 'db.sqlite'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    from datetime import datetime, timezone

    now = datetime(2026, 10, 1, tzinfo=timezone.utc)
    common = dict(scraped_at=now, first_seen_at=now, last_seen_at=now, make="Toyota", model="Aqua")
    session.add_all(
        [
            CarListing(source="ikman", source_id="a", title="Aqua 2015 call 0771234567", url="https://ikman.lk/a", **common),
            CarListing(source="riyasewana", source_id="b", title="Vitz 2018", url="https://riyasewana.com/b", **common),
            CarListing(source="motormila_user", source_id="c", title="Mine 0771234567", contact_phone="0771234567", **common),
        ]
    )
    session.commit()

    dry = scrub(url, apply=False)
    assert dry["titles_changed"] == 1
    with engine.connect() as conn:
        assert "0771234567" in conn.execute(text("SELECT title FROM car_listings WHERE source_id='a'")).scalar()

    done = scrub(url, apply=True)
    assert done["titles_changed"] == 1
    with engine.connect() as conn:
        assert conn.execute(text("SELECT title FROM car_listings WHERE source_id='a'")).scalar() == "Aqua 2015"
        # first-party listing untouched
        row = conn.execute(text("SELECT title, contact_phone FROM car_listings WHERE source_id='c'")).one()
        assert row.contact_phone == "0771234567"
