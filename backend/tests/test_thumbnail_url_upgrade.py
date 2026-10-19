"""Card thumbnails must not be the 142x107 grid crop the sources expose.

The public cards are ~450 CSS px wide (16:10), so a 142x107 source is upscaled
~7x and looks blurred next to the source listing page. ikman's CDN serves any
crop size from the same path, so stored URLs are upgraded on write (scraper)
and on read (catalog export / API / proxy).
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.models.schemas import CarListingRead
from app.scrapers.ikman import IkmanCarScraper
from app.utils.listing_snapshot import listing_to_dict
from app.utils.thumbnail_urls import TARGET_HEIGHT, TARGET_WIDTH, upgrade_thumbnail_url

SMALL = "https://i.ikman-st.com/honda-vezel-2026-for-sale-colombo/ab785109-41ed/142/107/cropped.jpg"
BIG = (
    "https://i.ikman-st.com/honda-vezel-2026-for-sale-colombo/ab785109-41ed/"
    f"{TARGET_WIDTH}/{TARGET_HEIGHT}/cropped.jpg"
)


def test_upgrades_small_ikman_grid_crop():
    assert upgrade_thumbnail_url(SMALL) == BIG


def test_upgrade_is_idempotent():
    assert upgrade_thumbnail_url(BIG) == BIG


def test_upgrades_webp_variants_to_the_shared_jpeg_target():
    webp = SMALL.replace("/142/107/cropped.jpg", "/142/107/cropped.webp")
    assert upgrade_thumbnail_url(webp) == BIG


def test_leaves_large_and_unknown_urls_untouched():
    assert upgrade_thumbnail_url("https://i.ikman-st.com/a/b/1200/900/cropped.jpg") == (
        "https://i.ikman-st.com/a/b/1200/900/cropped.jpg"
    )
    # Other marketplaces keep their own URLs — no rewriting.
    assert upgrade_thumbnail_url("https://riyasewana.com/uploads/a-142-107.jpg") == (
        "https://riyasewana.com/uploads/a-142-107.jpg"
    )
    # A lookalike host must not be treated as the ikman CDN.
    assert upgrade_thumbnail_url(
        "https://i.ikman-st.com.evil.example/a/b/142/107/cropped.jpg"
    ) == "https://i.ikman-st.com.evil.example/a/b/142/107/cropped.jpg"


def test_empty_values_pass_through():
    for value in (None, "", "   "):
        assert upgrade_thumbnail_url(value) == value


def test_ikman_scraper_stores_a_card_sized_crop():
    row = {
        "slug": "honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63",
        "title": "Honda Vezel Z PLAY MOON ROOF 2026",
        "url": "https://ikman.lk/en/ad/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63",
        "money": {"amount": "Rs 19,278,000"},
        "details": ["20 km", "SUV / 4x4", "Import"],
        "area": {"name": "Colombo"},
        "location": {"name": "Kohuwala"},
        "images": {
            "ids": ["ff1ac77f-bd5a-4281-9791-ba3226d9605a"],
            "base_uri": "https://i.ikman-st.com",
        },
        "properties": [{"key": "model_year", "value": "2026"}],
    }

    payload = IkmanCarScraper(db=None)._build_payload_from_api_ad(row)

    assert payload is not None
    assert payload["thumbnail_url"].endswith(f"/{TARGET_WIDTH}/{TARGET_HEIGHT}/cropped.jpg")
    assert "/142/107/" not in payload["thumbnail_url"]


def test_catalog_snapshot_serializer_upgrades_stored_urls():
    """The live site reads this payload, so old rows must upgrade on export."""

    now = datetime.now(timezone.utc)
    row = _ikman_row(thumbnail_url=SMALL, now=now)

    assert listing_to_dict(row)["thumbnail_url"] == BIG


def test_listing_api_schema_upgrades_thumbnail_url():
    now = datetime.now(timezone.utc)

    listing = CarListingRead(
        id=1,
        source="ikman",
        source_id="ad-1",
        url="https://ikman.lk/en/ad/honda-vezel",
        make="Honda",
        model="Vezel",
        thumbnail_url=SMALL,
        scraped_at=now,
        first_seen_at=now,
        last_seen_at=now,
        is_outlier=False,
    )

    assert listing.thumbnail_url == BIG


def _ikman_row(*, thumbnail_url: str, now: datetime):
    from db.models import CarListing

    return CarListing(
        id=1,
        source="ikman",
        source_id="ad-1",
        url="https://ikman.lk/en/ad/honda-vezel",
        title="Honda Vezel 2026",
        make="Honda",
        model="Vezel",
        year=2026,
        thumbnail_url=thumbnail_url,
        scraped_at=now,
        first_seen_at=now,
        last_seen_at=now,
        is_outlier=False,
    )


def test_ikman_gallery_captures_every_image_id():
    row = {
        "slug": "honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63",
        "title": "Honda Vezel Z PLAY MOON ROOF 2026",
        "url": "https://ikman.lk/en/ad/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63",
        "money": {"amount": "Rs 19,278,000"},
        "details": ["20 km", "SUV / 4x4", "Import"],
        "area": {"name": "Colombo"},
        "location": {"name": "Kohuwala"},
        "images": {
            "ids": ["id-one", "id-two", "id-one", "id-three"],
            "base_uri": "https://i.ikman-st.com",
        },
        "properties": [{"key": "model_year", "value": "2026"}],
    }

    payload = IkmanCarScraper(db=None)._build_payload_from_api_ad(row)

    assert payload is not None
    import json

    images = json.loads(payload["images"])
    assert images == [
        f"https://i.ikman-st.com/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63/id-one/{TARGET_WIDTH}/{TARGET_HEIGHT}/cropped.jpg",
        f"https://i.ikman-st.com/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63/id-two/{TARGET_WIDTH}/{TARGET_HEIGHT}/cropped.jpg",
        f"https://i.ikman-st.com/honda-vezel-z-play-moon-roof-2026-for-sale-colombo-63/id-three/{TARGET_WIDTH}/{TARGET_HEIGHT}/cropped.jpg",
    ]


def test_normalize_image_list_dedupes_caps_and_serializes():
    import json

    from app.utils.thumbnail_urls import GALLERY_IMAGE_LIMIT, normalize_image_list, parse_image_list

    urls = [f"https://example.com/{i}.jpg" for i in range(10)]
    urls.insert(3, urls[0])  # duplicate
    urls.append("https://example.com/placeholder.jpg")  # junk
    result = normalize_image_list(urls)
    assert result is not None
    parsed = json.loads(result)
    assert len(parsed) == GALLERY_IMAGE_LIMIT
    assert len(set(parsed)) == len(parsed)
    assert not any("placeholder" in u for u in parsed)
    # Round-trips through the DB column format.
    assert parse_image_list(result) == parsed


def test_normalize_image_list_returns_none_when_empty():
    from app.utils.thumbnail_urls import normalize_image_list, parse_image_list

    assert normalize_image_list([]) is None
    assert normalize_image_list(["https://example.com/no-image.png"]) is None
    assert parse_image_list(None) == []
    assert parse_image_list("not-json{{{") == []


def test_gallery_survives_snapshot_export_and_api_schema():
    import json

    from app.utils.listing_snapshot import listing_to_dict

    class FakeRow:
        id = 1
        source = "ikman"
        source_id = "x"
        url = "https://ikman.lk/en/ad/x"
        title = "T"
        make = "Toyota"
        model = "Prius"
        year = 2020
        price_lkr = 1000000
        mileage = 50000
        fuel_type = None
        transmission = None
        engine_capacity = None
        condition = None
        body_type = None
        vehicle_category = "cars"
        district = "Colombo"
        city = None
        thumbnail_url = SMALL
        images = json.dumps(
            [
                "https://i.ikman-st.com/a/b/id1/1080/810/cropped.jpg",
                "https://i.ikman-st.com/a/b/id2/1080/810/cropped.jpg",
            ]
        )
        scraped_at = datetime.now(timezone.utc)
        first_seen_at = datetime.now(timezone.utc)
        last_seen_at = datetime.now(timezone.utc)
        deal_score = None
        market_median_lkr = None
        is_outlier = False

    exported = listing_to_dict(FakeRow())
    assert exported["images"] == [
        "https://i.ikman-st.com/a/b/id1/1080/810/cropped.jpg",
        "https://i.ikman-st.com/a/b/id2/1080/810/cropped.jpg",
    ]
    # The live API schema parses the stored JSON string into a list.
    read = CarListingRead.model_validate(FakeRow())
    assert read.images == exported["images"]


def test_upgrades_riyasewana_thumb_to_full_size_upload():
    small = "https://riyasewana.com/thumb/thumbhonda-vezel-sensing-42058444711.jpg"
    big = "https://riyasewana.com/uploads/honda-vezel-sensing-42058444711.jpg"
    assert upgrade_thumbnail_url(small) == big
    # Already-full-size uploads are untouched.
    assert upgrade_thumbnail_url(big) == big
    # www host and http scheme also rewrite.
    assert (
        upgrade_thumbnail_url("http://www.riyasewana.com/thumb/thumbfoo-bar-123.jpg")
        == "https://riyasewana.com/uploads/foo-bar-123.jpg"
    )
    # Non-thumb riyasewana paths are left alone.
    other = "https://riyasewana.com/some/other.jpg"
    assert upgrade_thumbnail_url(other) == other
