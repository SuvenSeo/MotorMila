"""Upgrade marketplace thumbnail URLs to a card-sized crop.

Scrapers store whichever image variant the marketplace grid markup exposes,
and that is often a tiny crop (ikman's search API hands out a 142x107
``cropped.jpg``; riyasewana cards use a 220x165 ``/thumb/thumb<name>.jpg``).
The public catalog renders cards at roughly 450 CSS px wide inside a 16:10
frame — about 900 device px at 2x DPR — so a tiny source is upscaled several
times and reads as blurred next to the source listing page.

Both CDNs serve a large variant from a predictable path, so the stored URL
can be rewritten in place, no bytes proxied by us and no re-scrape needed.
Applying the rewrite on read also fixes the ~200k rows per source that
already hold the tiny variant.
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse

# A 4:3 crop at this size covers a card without upscaling. The source images
# are 4:3+, so the browser's ``object-cover`` does the 16:10 crop.
TARGET_WIDTH = 1080
TARGET_HEIGHT = 810

# i.ikman-st.com/<slug>/<image-id>/<width>/<height>/cropped.jpg
_CROP_PATH_RE = re.compile(
    r"/(?P<width>\d{1,5})/(?P<height>\d{1,5})/cropped\.(?P<ext>jpe?g|webp|png)$",
    re.IGNORECASE,
)


def _is_ikman_cdn_host(host: str) -> bool:
    normalized = str(host or "").strip().lower().rstrip(".")
    return normalized == "ikman-st.com" or normalized.endswith(".ikman-st.com")


# riyasewana serves 220x165 card thumbs from /thumb/thumb<name>.jpg while the
# same photo is available at 1024x768 from /uploads/<name>.jpg. Rewriting the
# path fixes ~200k stored rows on read, no re-scrape needed.
_RIYASEWANA_THUMB_RE = re.compile(
    r"^https?://(?:www\.)?riyasewana\.com/thumb/thumb([^/?#]+)$",
    re.IGNORECASE,
)


def _upgrade_riyasewana_thumb(raw: str) -> Optional[str]:
    match = _RIYASEWANA_THUMB_RE.match(raw.split("?")[0].strip())
    if not match:
        return None
    name = match.group(1).strip()
    if not name:
        return None
    return f"https://riyasewana.com/uploads/{name}"


def upgrade_thumbnail_url(value: Optional[str]) -> Optional[str]:
    """Return a larger crop for known thumbnail CDNs; otherwise *value* as-is.

    Idempotent: a URL already at (or above) the target size is returned
    unchanged, and an already-upgraded URL round-trips without growing.
    """

    raw = str(value or "").strip()
    if not raw:
        return value

    # Riyasewana: /thumb/thumb<name>.jpg -> /uploads/<name>.jpg (220x165 to 1024x768).
    riyasewana_full = _upgrade_riyasewana_thumb(raw)
    if riyasewana_full:
        return riyasewana_full

    match = _CROP_PATH_RE.search(raw)
    if not match:
        return value

    prefix = raw[: match.start()]
    if not _is_ikman_cdn_host(urlparse(prefix).hostname or ""):
        return value

    try:
        width = int(match.group("width"))
        height = int(match.group("height"))
    except (TypeError, ValueError):  # pragma: no cover - regex guarantees digits
        return value

    if width >= TARGET_WIDTH and height >= TARGET_HEIGHT:
        return value

    return f"{prefix}/{TARGET_WIDTH}/{TARGET_HEIGHT}/cropped.jpg"


#: Maximum gallery images stored per listing. Cards show a handful; the
#: detail gallery shows all of these. Kept small so the 300k-row public
#: catalog snapshot stays shippable.
GALLERY_IMAGE_LIMIT = 6


def normalize_image_list(values, limit: int = GALLERY_IMAGE_LIMIT) -> Optional[str]:
    """Clean a scraper-supplied image list into the JSON string stored on ``CarListing.images``.

    Dedupes (order-preserving), drops empties/non-strings and placeholder
    art, upgrades undersized source crops via :func:`upgrade_thumbnail_url`,
    and caps the list at *limit*. Returns ``None`` when nothing usable
    remains, so callers can leave the column NULL ("only the thumbnail is
    known") instead of writing an empty array.
    """
    import json

    cleaned: list[str] = []
    seen: set[str] = set()
    candidates = values if isinstance(values, (list, tuple)) else [values]
    for raw in candidates:
        if not isinstance(raw, str):
            continue
        url = raw.strip()
        if not url or url in seen:
            continue
        lowered = url.lower()
        if any(
            marker in lowered
            for marker in ("placeholder", "no-image", "noimage", "default-image", "blank.")
        ):
            continue
        upgraded = upgrade_thumbnail_url(url) or url
        if upgraded in seen:
            continue
        seen.add(upgraded)
        seen.add(url)
        cleaned.append(upgraded)
        if len(cleaned) >= limit:
            break
    if not cleaned:
        return None
    return json.dumps(cleaned)


def parse_image_list(value) -> list[str]:
    """Parse a stored ``CarListing.images`` JSON string back into URLs."""
    import json

    if not value:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if isinstance(v, str) and str(v).strip()]
    if not isinstance(value, str):
        return []
    try:
        parsed = json.loads(value)
    except (ValueError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(v).strip() for v in parsed if isinstance(v, str) and str(v).strip()]
