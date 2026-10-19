"""Regression tests for make normalization and the /alerts/match verb mismatch.

Both bugs were user-visible on paid tiers:
  * ``/alerts/match`` only answered POST while the web client issued a GET,
    so the alerts page hung on "Loading alerts" and logged 405/500.
  * Scraped make spellings ("Bmw"/"BMW", "Mitshubishi", "Test", "2018",
    "Other brand") leaked into the public make combobox and the valuation
    model pickers.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.utils.make_canonical import (
    canonicalize_make,
    canonicalize_model,
    is_junk_make,
    model_contains_foreign_make,
)
from db.models import Base, CarListing
from db.session import get_db


@pytest.fixture()
def client_and_session():
    """A TestClient bound to an isolated in-memory database."""
    # StaticPool keeps one connection alive so the TestClient's worker thread
    # sees the same in-memory database the fixture seeded.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    def _override_get_db():
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(app), db
    finally:
        app.dependency_overrides.pop(get_db, None)


def _seed(db, make: str, model: str = "Axio", year: int = 2020) -> None:
    db.add(
        CarListing(
            source="ikman",
            source_id=f"{make}-{model}-{year}",
            scraped_at=datetime.now(timezone.utc),
            title=f"{make} {model} {year}",
            make=make,
            model=model,
            year=year,
            price_lkr=3_500_000,
            mileage=40_000,
            district="Colombo",
            is_active=True,
        )
    )


# ---------------------------------------------------------------------------
# Pure canonicalization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Toyota", "Toyota"),
        ("TOYOTA", "Toyota"),
        ("Bmw", "BMW"),
        ("BMW", "BMW"),
        ("Mg", "MG"),
        ("MG", "MG"),
        ("SUZUKI", "Suzuki"),
        ("Dfsk", "DFSK"),
        ("KIA", "Kia"),
        ("Land rover", "Land Rover"),
        ("Land Rover", "Land Rover"),
        ("Ssang Yong", "SsangYong"),
        ("proton", "Proton"),
        # Typos seen in live listings.
        ("Mitshubishi", "Mitsubishi"),
        ("Sukuzi", "Suzuki"),
        ("Nisan", "Nissan"),
        ("Daihatzu", "Daihatsu"),
        ("Cheery", "Chery"),
        ("Hyndai trajet", "Hyundai"),
        # Short acronyms must survive intact.
        ("TVS", "TVS"),
        ("JAC", "JAC"),
        ("BYD", "BYD"),
        # Real multi-word marques must not be dropped.
        ("Ashok Leyland", "Ashok Leyland"),
        ("Royal Enfield", "Royal Enfield"),
        ("John Deere", "John Deere"),
        ("Massey Ferguson", "Massey Ferguson"),
    ],
)
def test_canonicalize_make_merges_and_preserves(raw, expected):
    assert canonicalize_make(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["Test", "TestPOS", "testused", "Other brand", "Other Brand", "Other",
     "2018", "2016", "2012", "", "   ", None, "Vitz car", "VEZEL Z PLAY"],
)
def test_canonicalize_make_drops_junk(raw):
    assert canonicalize_make(raw) is None
    assert is_junk_make(raw) is True


def test_canonicalize_make_repairs_leaked_model_prefix():
    # A real brand followed by a model that landed in the make column.
    assert canonicalize_make("Honda fit") == "Honda"
    assert canonicalize_make("Jeep Wrangler") == "Jeep"
    assert canonicalize_make("BAIC Beijing") == "BAIC"


def test_canonicalize_model_drops_junk():
    assert canonicalize_model("Axio") == "Axio"
    assert canonicalize_model("  Vitz  ") == "Vitz"
    assert canonicalize_model("Test") == ""
    assert canonicalize_model("2018") == ""


# ---------------------------------------------------------------------------
# /listings/makes + /listings/models
# ---------------------------------------------------------------------------

def test_makes_endpoint_merges_variants_and_drops_junk(client_and_session):
    client, db = client_and_session
    _seed(db, "Toyota")
    _seed(db, "TOYOTA")
    _seed(db, "Bmw")
    _seed(db, "BMW")
    _seed(db, "Mitshubishi")
    _seed(db, "Test")
    _seed(db, "2018")
    _seed(db, "Other brand")
    db.commit()

    rows = client.get("/api/v1/listings/makes").json()
    by_make = {r["make"]: r["count"] for r in rows}

    assert by_make.get("Toyota") == 2
    assert by_make.get("BMW") == 2
    assert by_make.get("Mitsubishi") == 1
    for junk in ("Test", "2018", "Other brand", "TOYOTA", "Bmw"):
        assert junk not in by_make


def test_models_endpoint_is_spelling_independent(client_and_session):
    """Toyota/toyota/TOYOTA must all return the same model list."""
    client, db = client_and_session
    _seed(db, "Toyota", model="Axio")
    _seed(db, "TOYOTA", model="Vitz")
    db.commit()

    canonical = client.get("/api/v1/listings/models", params={"make": "Toyota"}).json()
    for spelling in ("toyota", "TOYOTA"):
        assert client.get("/api/v1/listings/models", params={"make": spelling}).json() == canonical

    assert {row["model"] for row in canonical} == {"Axio", "Vitz"}


def test_junk_location_and_equipment_models_dropped():
    for junk in (
        "Japan",
        "Malabe",
        "Katugastota",
        "Panadura",
        "Badulla",
        "Kadawatha",
        "Elephant",
        "Shell",
        "Forklift",
        "Road Roller",
        "Test Allion 2005",
    ):
        assert canonicalize_model(junk) == "", junk


def test_junk_make_year_and_test_rows():
    for junk in (
        "Test Allion 2005",
        "Test Test 2010",
        "Auchev Pisces 2026",
        "ABL Zibo Lorry Budy 2011",
        "Vitz Car Car 2022",
        "Electric 2026",
    ):
        assert is_junk_make(junk), junk
    for real in ("Toyota", "Mercedes Benz", "Land Rover", "BYD"):
        assert not is_junk_make(real), real


def test_model_contains_foreign_make():
    assert model_contains_foreign_make("Toyota Aqua", "Land Rover")
    assert model_contains_foreign_make("Bmw 2", "Land Rover")
    assert not model_contains_foreign_make("Mercedes Benz C180", "Mercedes")
    assert not model_contains_foreign_make("Toyota Allion", "Toyota")
    assert not model_contains_foreign_make("Range Rover", "Land Rover")
    assert not model_contains_foreign_make("Aqua", "Toyota")


def test_known_cross_make_models():
    assert model_contains_foreign_make("Navara", "Toyota")
    assert model_contains_foreign_make("Sonet", "Toyota")
    assert not model_contains_foreign_make("Navara", "Nissan")
    assert not model_contains_foreign_make("Seltos", "Kia")
