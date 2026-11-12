"""permitsale.py — Scraper / seeder for VehiclePermit black-market price data.

Two strategies, tried in order:
1. Live scrape of permitsale.lk (best-effort, fail-open).
2. ``seed_default_permits`` — upserts a research-doc price table when the live
   scrape returns nothing or the site is unreachable.

Both paths upsert by ``permit_name`` (the unique natural key).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from sqlalchemy.orm import Session

from db.models import VehiclePermit

log = structlog.get_logger(__name__)

PERMITSALE_URL = "https://permitsale.lk"

# Research-document baseline ranges (mid-point used as seed price).
# Format: (permit_name, permit_type, market_price_lkr)
_DEFAULT_PERMITS: list[tuple[str, str, float]] = [
    # Assembled-vehicle permits
    ("Assembled Vehicle Permit (General)", "assembled", 812_500),
    # Full import permits
    ("Full Import Permit", "full_import", 3_600_000),
    # Retirement / duty-free category permits
    ("Category I Retirement Permit", "retirement_cat1", 1_800_000),
    ("Category II Retirement Permit", "retirement_cat2", 1_400_000),
    ("Category III Retirement Permit", "retirement_cat3", 1_000_000),
    # Government / professional duty-free
    ("Government Doctor Permit", "duty_free", 5_500_000),
    ("Government MP / State Officer Permit", "duty_free", 9_800_000),
    # EV / remittance permits
    ("Special EV Import Permit (Remittance)", "ev", 2_200_000),
    ("Foreign Employment EV Permit", "ev", 1_800_000),
]


def _upsert_permit(db: Session, permit_name: str, permit_type: str, price: float) -> VehiclePermit:
    row = db.query(VehiclePermit).filter(VehiclePermit.permit_name == permit_name).first()
    if row:
        row.permit_type = permit_type
        row.market_price_lkr = price  # type: ignore[assignment]
        row.updated_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    else:
        row = VehiclePermit(
            permit_name=permit_name,
            permit_type=permit_type,
            market_price_lkr=price,
        )
        db.add(row)
    return row


def seed_default_permits(db: Session) -> int:
    """Upsert research-document price baselines.  Returns the number of rows touched."""
    count = 0
    for permit_name, permit_type, price in _DEFAULT_PERMITS:
        try:
            _upsert_permit(db, permit_name, permit_type, price)
            count += 1
        except Exception as exc:
            log.warning("permitsale_seed_row_failed", permit_name=permit_name, error=str(exc))
            db.rollback()
    try:
        db.commit()
    except Exception as exc:
        log.error("permitsale_seed_commit_failed", error=str(exc))
        db.rollback()
        return 0
    log.info("permitsale_seeded", count=count)
    return count


def _parse_price(text: str) -> float | None:
    """Extract a numeric LKR price from free-form text."""
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _scrape_permitsale(timeout: float = 20.0) -> list[dict[str, Any]]:
    """Attempt to scrape live permit listings from permitsale.lk.

    Returns a (possibly empty) list of ``{permit_name, permit_type, price}``
    dicts.  Any network or parse error returns an empty list (fail-open).
    """
    results: list[dict[str, Any]] = []
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.get(PERMITSALE_URL)
            response.raise_for_status()
            html = response.text
    except Exception as exc:
        log.warning("permitsale_fetch_failed", url=PERMITSALE_URL, error=str(exc))
        return results

    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")

        for card in soup.select(".listing-card, .permit-card, article.post, .product"):
            title_el = card.select_one("h2, h3, .title, .permit-name")
            price_el = card.select_one(".price, .amount, [class*='price']")
            if not title_el:
                continue
            permit_name = title_el.get_text(strip=True)
            if not permit_name:
                continue
            price_text = price_el.get_text(strip=True) if price_el else ""
            price = _parse_price(price_text)
            permit_type = "general"
            name_lower = permit_name.lower()
            if "ev" in name_lower or "electric" in name_lower:
                permit_type = "ev"
            elif "retirement" in name_lower or "pension" in name_lower:
                permit_type = "retirement"
            elif "import" in name_lower and "full" in name_lower:
                permit_type = "full_import"
            elif "doctor" in name_lower or "mp" in name_lower or "officer" in name_lower:
                permit_type = "duty_free"
            elif "assembled" in name_lower:
                permit_type = "assembled"

            if price and price > 0:
                results.append({"permit_name": permit_name, "permit_type": permit_type, "price": price})

        log.info("permitsale_scraped", url=PERMITSALE_URL, found=len(results))
    except Exception as exc:
        log.warning("permitsale_parse_failed", error=str(exc))

    return results


def run_scraper(db: Session) -> int:
    """Main entry point.  Scrape live data; fall back to seed on empty/error.

    Returns number of permit rows upserted.
    """
    live = _scrape_permitsale()

    if live:
        count = 0
        for item in live:
            try:
                _upsert_permit(db, item["permit_name"], item["permit_type"], item["price"])
                count += 1
            except Exception as exc:
                log.warning("permitsale_upsert_failed", permit=item.get("permit_name"), error=str(exc))
                db.rollback()
        try:
            db.commit()
            log.info("permitsale_live_upserted", count=count)
            return count
        except Exception as exc:
            log.error("permitsale_commit_failed", error=str(exc))
            db.rollback()

    log.info("permitsale_falling_back_to_seed")
    return seed_default_permits(db)
