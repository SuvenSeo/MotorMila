from datetime import datetime
from app.utils.time import utc_now
import re
from urllib.parse import urlencode

import httpx
import structlog
from sqlalchemy.orm import Session

from app.scrapers.cleaner import CarCleaner
from app.scrapers.page_budget import start_page_from_env
from app.utils.listing_upsert import buffered_upsert_listing, flush_upsert_buffer

log = structlog.get_logger()


class AutoDirectScraper:
    SOURCE = "autodirect"
    API_BASE_URL = "https://api.autodirect.lk/api"
    LIST_PATH = "/vehicle/find"
    CONDITIONS_PATH = "/vehicle/conditions"
    WEB_BASE_URL = "https://www.autodirect.lk"
    PAGE_SIZE = 24

    def __init__(self, db: Session):
        self.db = db
        self.cleaner = CarCleaner()

    def _upsert_listing(self, payload: dict):
        return buffered_upsert_listing(self, payload)

    @staticmethod
    def _slugify(text: str) -> str:
        value = (text or "").strip().lower()
        value = re.sub(r"[^\w\s-]", "", value)
        value = re.sub(r"\s+", "-", value)
        value = re.sub(r"-+", "-", value)
        return value.strip("-")

    @classmethod
    def _build_detail_url(cls, vehicle_id: int, make: str, model: str) -> str:
        make_slug = cls._slugify(make)
        model_slug = cls._slugify(model)
        return f"{cls.WEB_BASE_URL}/cardetails/{make_slug}-{model_slug}-id-{vehicle_id}"

    @staticmethod
    def _row_text(row: dict, *keys: str) -> str:
        for key in keys:
            value = row.get(key)
            if isinstance(value, dict):
                for nested_key in ("name", "title", "label", "value"):
                    nested_value = value.get(nested_key)
                    if nested_value not in (None, ""):
                        return str(nested_value).strip()
                continue
            if value not in (None, ""):
                return str(value).strip()
        return ""

    @staticmethod
    def _int_from_value(value) -> int | None:
        if value in (None, ""):
            return None
        try:
            return int(float(value))
        except (TypeError, ValueError):
            digits = re.sub(r"\D", "", str(value))
            return int(digits) if digits else None

    @staticmethod
    def _normalize_price_lkr(price_value) -> int | None:
        if price_value is None or price_value == "":
            return None

        if isinstance(price_value, str):
            price_text = price_value.replace(",", "").strip().lower()
            price_match = re.search(r"([0-9]+(?:\.[0-9]+)?)", price_text)
            if not price_match:
                return None
            try:
                numeric = float(price_match.group(1))
            except ValueError:
                return None
            if any(unit in price_text for unit in ("million", "mn", " m")):
                numeric *= 1_000_000
        else:
            try:
                numeric = float(price_value)
            except (TypeError, ValueError):
                return None

        try:
            value = int(numeric)
        except (TypeError, ValueError):
            return None

        if value <= 0:
            return None

        if value < 1_000:
            return int(numeric * 1_000_000)
        return value

    async def _fetch_conditions(self, client: httpx.AsyncClient) -> list[tuple[int | None, str]]:
        try:
            response = await client.get(
                f"{self.API_BASE_URL}{self.CONDITIONS_PATH}",
                params={"withCount": "true"},
                timeout=30,
            )
            response.raise_for_status()
            rows = response.json()
            if isinstance(rows, list):
                conditions = []
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    count = int(row.get("count") or 0)
                    if count <= 0:
                        continue
                    condition_id = row.get("id")
                    if condition_id is None:
                        continue
                    name = str(row.get("name") or "Used").strip().lower()
                    conditions.append((int(condition_id), name or "used"))
                if conditions:
                    return conditions
        except Exception as exc:
            log.warning("autodirect_conditions_unavailable", error=str(exc))

        # Fallback: pull the general feed without condition filters.
        return [(None, "used")]

    async def _fetch_page(
        self,
        client: httpx.AsyncClient,
        *,
        offset: int,
        limit: int,
        condition_id: int | None,
    ) -> tuple[int, list[dict]]:
        params = {
            "offset": offset,
            "limit": limit,
            "orderBy": "latest",
        }
        if condition_id is not None:
            params["conditionId"] = condition_id

        url = f"{self.API_BASE_URL}{self.LIST_PATH}?{urlencode(params)}"
        response = await client.get(url, timeout=30)
        response.raise_for_status()
        payload = response.json() if response.content else {}

        if isinstance(payload, list):
            return len(payload), payload

        total = 0
        rows = []
        if isinstance(payload, dict):
            for total_key in ("total", "count", "recordsTotal"):
                if payload.get(total_key) not in (None, ""):
                    total = int(payload.get(total_key) or 0)
                    break
            for rows_key in ("data", "vehicles", "results", "items"):
                candidate_rows = payload.get(rows_key)
                if isinstance(candidate_rows, list):
                    rows = candidate_rows
                    break
                if isinstance(candidate_rows, dict):
                    nested_rows = candidate_rows.get("data") or candidate_rows.get("items")
                    if isinstance(nested_rows, list):
                        rows = nested_rows
                        break

        if rows and total <= 0:
            total = len(rows)
        return total, rows if isinstance(rows, list) else []

    async def scrape(self, max_pages: int = 5):
        page_limit = max_pages if max_pages > 0 else None
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }

        seen_source_ids: set[str] = set()
        start_page = start_page_from_env(self.SOURCE)

        async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
            conditions = await self._fetch_conditions(client)

            for condition_id, condition_label in conditions:
                page_num = start_page
                stop_at_page = start_page + page_limit if page_limit is not None else None
                consecutive_empty_pages = 0
                consecutive_page_errors = 0

                while True:
                    if stop_at_page is not None and page_num >= stop_at_page:
                        break

                    offset = (page_num - 1) * self.PAGE_SIZE
                    log.info(
                        "scraping_page",
                        source=self.SOURCE,
                        page=page_num,
                        condition=condition_label,
                    )

                    try:
                        total, rows = await self._fetch_page(
                            client,
                            offset=offset,
                            limit=self.PAGE_SIZE,
                            condition_id=condition_id,
                        )
                        if not rows:
                            consecutive_empty_pages += 1
                            log.info(
                                "autodirect_no_cards",
                                source=self.SOURCE,
                                page=page_num,
                                condition=condition_label,
                                total=total,
                                consecutive_empty_pages=consecutive_empty_pages,
                            )
                            if consecutive_empty_pages >= 10:
                                break
                            page_num += 1
                            continue

                        new_on_page = 0

                        for row in rows:
                            try:
                                if not isinstance(row, dict):
                                    continue

                                vehicle_id = row.get("id") or row.get("vehicleId") or row.get("vehicle_id")
                                if vehicle_id is None:
                                    continue

                                vehicle_id_int = self._int_from_value(vehicle_id)
                                if vehicle_id_int is None:
                                    continue

                                make = self._row_text(row, "make", "brand", "manufacturer")
                                model = self._row_text(row, "model", "vehicleModel")
                                variant = self._row_text(row, "variant", "grade", "trim")
                                if not make or not model:
                                    continue

                                listing_url = self._build_detail_url(vehicle_id_int, make, model)
                                if listing_url in seen_source_ids:
                                    continue

                                seen_source_ids.add(listing_url)

                                title_parts = [make, model, variant]
                                title = " ".join([part for part in title_parts if part]).strip()

                                normalized_price = self._normalize_price_lkr(
                                    row.get("price")
                                    or row.get("sellingPrice")
                                    or row.get("displayPrice")
                                    or row.get("amount")
                                )
                                if normalized_price is None:
                                    continue

                                year = self._int_from_value(row.get("yom") or row.get("year")) or 0
                                transmission = self._row_text(row, "transmissionType", "transmission").lower()
                                fuel_type = self._row_text(row, "fuelType", "fuel").lower()
                                body_type = self._row_text(row, "bodyType", "body").lower()
                                mileage = self.cleaner.clean_mileage(
                                    self._row_text(row, "mileage", "odometer")
                                )
                                engine_capacity = self._int_from_value(
                                    row.get("engineCapacity") or row.get("engine_capacity")
                                )

                                payload = {
                                    "source_id": listing_url,
                                    "source": self.SOURCE,
                                    "title": title,
                                    "make": make,
                                    "model": model,
                                    "year": year,
                                    "price_lkr": normalized_price,
                                    "url": listing_url,
                                    "thumbnail_url": self._row_text(
                                        row,
                                        "photoUrl",
                                        "imageUrl",
                                        "image",
                                        "thumbnailUrl",
                                    )
                                    or None,
                                    "district": "Sri Lanka",
                                    "condition": condition_label,
                                    "transmission": transmission or None,
                                    "fuel_type": fuel_type or None,
                                    "body_type": body_type or None,
                                    "mileage": mileage,
                                    "engine_capacity": engine_capacity,
                                    "vehicle_category": "cars",
                                    "scraped_at": utc_now(),
                                }

                                normalized_payload = self.cleaner.normalize_listing_payload(payload)
                                if not normalized_payload:
                                    continue

                                self._upsert_listing(normalized_payload)
                                self.db.commit()
                                new_on_page += 1
                            except Exception as exc:
                                log.error(
                                    "autodirect_item_error",
                                    page=page_num,
                                    condition=condition_label,
                                    error=str(exc),
                                )
                                self.db.rollback()

                        if new_on_page == 0:
                            consecutive_empty_pages += 1
                            log.info(
                                "autodirect_empty_page",
                                page=page_num,
                                condition=condition_label,
                                consecutive_empty_pages=consecutive_empty_pages,
                            )
                            if consecutive_empty_pages >= 10:
                                break
                            page_num += 1
                            continue

                        consecutive_empty_pages = 0
                        if offset + self.PAGE_SIZE >= total:
                            break

                        page_num += 1
                        consecutive_page_errors = 0
                    except Exception as exc:
                        log.error(
                            "autodirect_page_error",
                            page=page_num,
                            condition=condition_label,
                            error=str(exc),
                        )
                        consecutive_page_errors += 1
                        if consecutive_page_errors >= 25:
                            break
                        page_num += 1

        flush_upsert_buffer(self)
