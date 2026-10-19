import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.scrapers.cleaner import CarCleaner


def _base_payload(source: str = "autodirect", source_id: str = "listing-1") -> dict:
    return {
        "source": source,
        "source_id": source_id,
        "make": "Toyota",
        "model": "Yaris",
        "year": 2019,
        "price_lkr": "Rs. 8,800,000",
        "url": f"https://example.com/{source_id}",
    }


def test_clean_price_parses_million_notation():
    cleaner = CarCleaner()

    assert cleaner.clean_price("Rs 8.7 Million") == 8_700_000
    assert cleaner.clean_price("LKR 4.35 mn") == 4_350_000


def test_clean_price_parses_lakh_and_crore_notation():
    cleaner = CarCleaner()

    assert cleaner.clean_price("Rs 55 Lakhs") == 5_500_000
    assert cleaner.clean_price("55 lakh") == 5_500_000
    assert cleaner.clean_price("Rs 12.5 lacs") == 1_250_000
    assert cleaner.clean_price("Rs 1.2 Crore") == 12_000_000
    assert cleaner.clean_price("2 crores") == 20_000_000
    # Unreasonably small/large lakh values still rejected by the sanity band.
    assert cleaner.clean_price("Rs 0.5 lakh") is None


def test_clean_price_ignores_installment_when_indicative_price_exists():
    cleaner = CarCleaner()
    raw = (
        "Indicative price: Rs 8.7 Million "
        "Installment Rs 58,000 / Monthly "
        "Down payment: Rs 4.35 Million"
    )

    assert cleaner.clean_price(raw) == 8_700_000


def test_clean_price_rejects_installment_only_or_noise_values():
    cleaner = CarCleaner()

    assert cleaner.clean_price("Installment Rs 150,000 per month") is None
    assert cleaner.clean_price("Down payment: Rs 2.5 Million") is None
    assert cleaner.clean_price("Contact for price / negotiable") is None


def test_clean_price_rejects_foreign_currency():
    """USD/other-currency amounts must never land as LKR."""
    cleaner = CarCleaner()
    assert cleaner.clean_price("USD 4.5 million") is None
    assert cleaner.clean_price("US$ 12,000") is None
    assert cleaner.clean_price("$15000") is None
    assert cleaner.clean_price("Price: 45000 dollars") is None
    assert cleaner.clean_price("EUR 8.2 million") is None
    assert cleaner.clean_price("AED 55,000") is None
    # Explicit LKR/RS still parse.
    assert cleaner.clean_price("Rs 8.7 Million") == 8_700_000


def test_normalize_listing_payload_parses_string_price():
    cleaner = CarCleaner()
    payload = _base_payload(source="autodirect", source_id="listing-1")

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized["price_lkr"] == 8_800_000


def test_normalize_listing_payload_rejects_unreasonable_price():
    cleaner = CarCleaner()
    payload = _base_payload(source="autodirect", source_id="listing-2")
    payload["price_lkr"] = "Rs. 20,000"

    assert cleaner.normalize_listing_payload(payload) is None


def test_normalize_listing_payload_can_preserve_explicit_unavailable_price_rows():
    cleaner = CarCleaner()
    payload = _base_payload(source="riyahub", source_id="negotiable")
    payload["price_lkr"] = "Price : Negotiable"
    payload["_allow_missing_price"] = True

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized["price_lkr"] is None
    assert "_allow_missing_price" not in normalized


@pytest.mark.parametrize(
    ("source", "blob_payload", "expected"),
    [
        (
            "ikman",
            {
                "details": "Fuel Type: Petrol | Transmission: Manual | Body Type: Hatchback | Condition: Used"
            },
            {"fuel_type": "petrol", "transmission": "manual", "body_type": "hatchback", "condition": "used"},
        ),
        (
            "riyasewana",
            {"specs": "Hybrid • CVT • SUV • Reconditioned"},
            {"fuel_type": "hybrid", "transmission": "cvt", "body_type": "suv", "condition": "reconditioned"},
        ),
        (
            "auto-lanka",
            {"_text_blobs": ["Diesel", "Tiptronic", "Double Cab", "Second Owner"]},
            {"fuel_type": "diesel", "transmission": "automatic", "body_type": "pickup", "condition": "used"},
        ),
        (
            "patpat",
            {"raw_meta": {"fuel": "Electric", "gearbox": "Automatic", "body": "Hatchback", "status": "Brand New"}},
            {"fuel_type": "electric", "transmission": "automatic", "body_type": "hatchback", "condition": "brand_new"},
        ),
        (
            "autodirect",
            {"meta": "Fuel: LPG | Manual | Sedan | Pre-owned"},
            {"fuel_type": "lpg", "transmission": "manual", "body_type": "sedan", "condition": "used"},
        ),
        (
            "cartivate",
            {"_text_blobs": "Fuel type Petrol | Transmission Auto | Mileage 0"},
            {"fuel_type": "petrol", "transmission": "automatic", "body_type": None, "condition": None},
        ),
        (
            "hitad",
            {"title": "Suzuki Swift Hatch 2019", "_text_blobs": "Petrol Manual Hatch Second hand"},
            {"fuel_type": "petrol", "transmission": "manual", "body_type": "hatchback", "condition": "used"},
        ),
        (
            "ikman",
            {"details": "Fuel Type: PHEV | Transmission: CVT | Body Type: Hatch | Condition: Brand New"},
            {
                "fuel_type": "pluginhybrid",
                "transmission": "cvt",
                "body_type": "hatchback",
                "condition": "brand_new",
            },
        ),
    ],
)
def test_normalize_listing_payload_extracts_technical_fields_from_mixed_text_blobs(
    source: str, blob_payload: dict, expected: dict
):
    cleaner = CarCleaner()
    payload = _base_payload(source=source, source_id=f"{source}-listing")
    payload.update(blob_payload)

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized.get("fuel_type") == expected["fuel_type"]
    assert normalized.get("transmission") == expected["transmission"]
    assert normalized.get("body_type") == expected["body_type"]
    assert normalized.get("condition") == expected["condition"]


def test_normalize_listing_payload_does_not_override_existing_structured_technical_fields():
    cleaner = CarCleaner()
    payload = _base_payload(source="autodirect", source_id="listing-structured")
    payload.update(
        {
            "fuel_type": "diesel",
            "transmission": "manual",
            "body_type": "sedan",
            "condition": "used",
            "specs": "Hybrid | Automatic | SUV | Brand New",
        }
    )

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized["fuel_type"] == "diesel"
    assert normalized["transmission"] == "manual"
    assert normalized["body_type"] == "sedan"
    assert normalized["condition"] == "used"


def test_normalize_listing_payload_canonicalizes_messy_structured_values():
    cleaner = CarCleaner()
    payload = _base_payload(source="ikman", source_id="listing-messy-structured")
    payload.update(
        {
            "fuel_type": "Petrol",
            "transmission": "Auto",
            "body_type": "Hatch",
            "condition": "Used",
        }
    )

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized["fuel_type"] == "petrol"
    assert normalized["transmission"] == "automatic"
    assert normalized["body_type"] == "hatchback"
    assert normalized["condition"] == "used"


def test_normalize_listing_payload_reinfers_when_structured_value_is_junk():
    cleaner = CarCleaner()
    payload = _base_payload(source="patpat", source_id="listing-junk")
    payload.update(
        {
            "fuel_type": "N/A",
            "transmission": "-",
            "body_type": "unknown",
            "condition": "other",
            "details": "Diesel Automatic Sedan Used",
        }
    )

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized["fuel_type"] == "diesel"
    assert normalized["transmission"] == "automatic"
    assert normalized["body_type"] == "sedan"
    assert normalized["condition"] == "used"


def test_normalize_listing_payload_does_not_treat_wagon_r_as_wagon_body():
    cleaner = CarCleaner()
    payload = _base_payload(source="riyasewana", source_id="wagon-r")
    payload["make"] = "Suzuki"
    payload["model"] = "Wagon R"
    payload["title"] = "Suzuki Wagon R 2018 for sale"
    payload["_text_blobs"] = "Suzuki Wagon R Petrol Automatic Used"

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized.get("fuel_type") == "petrol"
    assert normalized.get("transmission") == "automatic"
    assert normalized.get("body_type") is None
    assert normalized.get("condition") == "used"


@pytest.mark.parametrize(
    "updates",
    [
        {"source": ""},
        {"source_id": "", "url": ""},
        {"make": ""},
        {"price_lkr": "Installment Rs 150,000 monthly"},
    ],
)
def test_normalize_listing_payload_rejects_invalid_critical_fields(updates: dict):
    cleaner = CarCleaner()
    payload = _base_payload(source="ikman", source_id="listing-critical")
    payload.update(updates)

    assert cleaner.normalize_listing_payload(payload) is None


def test_normalize_listing_payload_normalizes_district_aliases():
    cleaner = CarCleaner()
    payload = _base_payload(source="ikman", source_id="listing-district")
    payload["district"] = "colombo district"

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized["district"] == "Colombo"


def test_normalize_listing_payload_infers_district_from_url_when_generic():
    cleaner = CarCleaner()
    payload = _base_payload(
        source="ikman",
        source_id="https://ikman.lk/en/ad/toyota-prius-for-sale-kandy-123",
    )
    payload["url"] = payload["source_id"]
    payload["district"] = "Sri Lanka"

    normalized = cleaner.normalize_listing_payload(payload)

    assert normalized is not None
    assert normalized["district"] == "Kandy"

