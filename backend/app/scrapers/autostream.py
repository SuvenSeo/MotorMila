from datetime import datetime
from app.utils.time import utc_now

import httpx
import structlog
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.utils.listing_upsert import buffered_upsert_listing, flush_upsert_buffer

log = structlog.get_logger()


class AutoStreamScraper:
    SOURCE = "autostream"
    API_LISTINGS_URL = "https://backend.autostream.lk/listings"
    WEB_BASE_URL = "https://www.autostream.lk"
    PAGE_SIZE = 100

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()

    def _upsert_listing(self, payload: dict):
        return buffered_upsert_listing(self, payload)

    @staticmethod
    def _pick_thumbnail(row: dict) -> str:
        for key in ("mainImageUrl", "blueTImageUrl", "cdnUrl", "imageUrl"):
            value = str(row.get(key) or "").strip()
            if value:
                return value

        image_urls = row.get("imageUrls")
        if isinstance(image_urls, list):
            for candidate in image_urls:
                value = str(candidate or "").strip()
                if value:
                    return value
        return ""

    async def scrape(self, max_pages: int = 5):
        page_limit = max_pages if max_pages > 0 else 1
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }

        async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
            response = await client.get(self.API_LISTINGS_URL, timeout=60)
            response.raise_for_status()
            rows = response.json() if response.content else []

            if not isinstance(rows, list) or not rows:
                log.warning("autostream_no_rows")
                return

            ACTIVE_STATUSES = {"approved", "dealer-pending", "pos-only"}
            active_rows = [
                row
                for row in rows
                if isinstance(row, dict)
                and str(row.get("status") or "").strip().lower() in ACTIVE_STATUSES
                and not bool(row.get("isSold"))
            ]
            if not active_rows:
                log.warning("autostream_no_active_rows", total_rows=len(rows))
                return
            log.info("autostream_active_rows", active=len(active_rows), total=len(rows))

            # The listings endpoint returns the whole active set in one call, so
            # there is no pagination to walk. The old cap of
            # ``max_pages * PAGE_SIZE`` silently discarded everything past
            # 12,000 rows at the default 120-page budget — with no log line and
            # no error. Process what the API actually returned; the page budget
            # only becomes a limit once it is genuinely exceeded.
            max_items = page_limit * self.PAGE_SIZE
            rows_to_process = active_rows
            if len(rows_to_process) > max_items:
                log.warning(
                    "autostream_truncating_active_rows",
                    active=len(rows_to_process),
                    max_items=max_items,
                    page_size=self.PAGE_SIZE,
                    max_pages=page_limit,
                )
                rows_to_process = rows_to_process[:max_items]

            for page_num, start in enumerate(range(0, len(rows_to_process), self.PAGE_SIZE), start=1):
                batch = rows_to_process[start : start + self.PAGE_SIZE]
                log.info("scraping_page", source=self.SOURCE, page=page_num)

                for row in batch:
                    try:
                        listing_id = row.get("id")
                        if listing_id is None:
                            continue

                        make = str(row.get("make") or "").strip()
                        model = str(row.get("model") or "").strip()
                        if not make or not model:
                            continue

                        price = self.cleaner.normalize_price_lkr(row.get("price"))
                        if price is None:
                            continue

                        year = int(row.get("yearofmanufacture") or row.get("yearOfReg") or 0)
                        title = str(row.get("title") or "").strip() or f"{make} {model} {year}".strip()
                        listing_url = f"{self.WEB_BASE_URL}/listing/{listing_id}"
                        sellers_notes = str(row.get("sellersNotes") or "").strip()
                        listing_features = row.get("listingFeatures")

                        payload = {
                            "source_id": str(listing_id),
                            "source": self.SOURCE,
                            "title": title,
                            "make": make,
                            "model": model,
                            "year": year,
                            "price_lkr": price,
                            "url": listing_url,
                            "thumbnail_url": self._pick_thumbnail(row) or None,
                            "district": str(row.get("district") or "").strip() or "Sri Lanka",
                            "city": str(row.get("city") or "").strip() or None,
                            "condition": str(row.get("condition") or "").strip().lower() or None,
                            "transmission": str(row.get("transmission") or "").strip().lower() or None,
                            "fuel_type": str(row.get("fuelType") or row.get("fuel") or "").strip().lower() or None,
                            "body_type": str(row.get("bodyType") or "").strip().lower() or None,
                            "mileage": self.cleaner.clean_mileage(str(row.get("mileage") or "")),
                            "engine_capacity": row.get("engineCc"),
                            "_text_blobs": [sellers_notes, listing_features],
                            "scraped_at": utc_now(),
                        }

                        normalized_payload = self.cleaner.normalize_listing_payload(payload)
                        if not normalized_payload:
                            continue

                        self._upsert_listing(normalized_payload)
                        self.db.commit()
                    except Exception as exc:
                        log.error("autostream_item_error", error=str(exc))
                        self.db.rollback()

        flush_upsert_buffer(self)
