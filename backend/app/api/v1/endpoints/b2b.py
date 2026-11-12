"""B2B collateral-value API for banks and leasing companies.

CBSL Act Directions No. 01 of 2026 make "true and fair value" a compliance
obligation on every used-vehicle facility, yet no lender publishes online
valuations. This endpoint sells the independent market benchmark they now
need: median, IQR range, live supply, days-to-sell (recovery-time input),
and 90-day price drift.

Auth: static API keys in the B2B_API_KEYS env var (comma-separated). Rate
limited per key. Keys are issued out-of-band, one per institution.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.schemas import CollateralValueResponse
from app.services.rate_limit import RateLimiter, _client_key
from app.utils.sql_median import median_price_expr, python_median
from app.utils.time import utc_now
from db.models import CarListing, live_listing_filter
from db.session import get_db

log = structlog.get_logger()

MIN_REASONABLE_PRICE_LKR = 100_000


def _configured_keys() -> set[str]:
    raw = os.getenv("B2B_API_KEYS", "").strip()
    return {k.strip() for k in raw.split(",") if k.strip()}


def _is_valid_key(api_key: str | None, keys: set[str] | None = None) -> bool:
    keys = _configured_keys() if keys is None else keys
    return bool(api_key) and any(secrets.compare_digest(api_key, configured_key) for configured_key in keys)


def _b2b_rate_limit_key(request: Request) -> str:
    """Per-institution bucket for a VALID key, per-IP for everything else.

    The key is validated before it is used as a bucket id: keying on any
    client-supplied value let callers rotate fake keys for fresh buckets.
    """
    api_key = str(request.headers.get("x-api-key") or "").strip()
    if api_key and _is_valid_key(api_key):
        return "key:" + hashlib.sha256(api_key.encode()).hexdigest()[:24]
    return "ip:" + _client_key(request)


_b2b_rate_limiter = RateLimiter(max_requests=120, window_seconds=60, key_func=_b2b_rate_limit_key)

router = APIRouter(dependencies=[Depends(_b2b_rate_limiter)])


def require_b2b_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> str:
    keys = _configured_keys()
    if not keys:
        raise HTTPException(status_code=503, detail="B2B API is not configured on this deployment.")
    if not _is_valid_key(x_api_key, keys):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")
    return x_api_key


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    k = (len(ordered) - 1) * pct
    lo = int(k)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


@router.get(
    "/collateral-value",
    response_model=CollateralValueResponse,
    dependencies=[Depends(require_b2b_key)],
)
def collateral_value(
    make: str = Query(..., min_length=1, max_length=50),
    model: str = Query(..., min_length=1, max_length=100),
    year: int | None = Query(None, ge=1980, le=2030),
    db: Session = Depends(get_db),
):
    """Independent market valuation for a make/model(/year) — the benchmark a
    lender needs to satisfy the CBSL true-and-fair-value duty."""
    q = db.query(CarListing).filter(
        live_listing_filter(),  # noqa: E712
        CarListing.price_lkr.isnot(None),
        CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
        CarListing.make.ilike(f"%{make.strip()}%"),
        CarListing.model.ilike(f"%{model.strip()}%"),
    )
    if year:
        q = q.filter(CarListing.year.between(year - 1, year + 1))

    prices = [float(row[0]) for row in q.with_entities(CarListing.price_lkr).all()]
    comparable_count = len(prices)

    if comparable_count == 0:
        return CollateralValueResponse(
            make=make, model=model, year=year,
            market_median_lkr=None, p25_lkr=None, p75_lkr=None,
            comparable_count=0, live_supply=0, median_days_on_market=None,
            trend_3m_pct=None, confidence="none", computed_at=utc_now(),
            methodology=(
                "No comparable live listings found for this make/model/year in the "
                "Motormila index. Widen the year band or verify the model name."
            ),
        )

    median = python_median(prices, min_value=MIN_REASONABLE_PRICE_LKR)
    p25 = _percentile(prices, 0.25)
    p75 = _percentile(prices, 0.75)

    # Liquidity: median days-on-market of the live comparables (recovery-time input).
    now = utc_now()
    dom_values: list[float] = []
    for (first_seen,) in q.with_entities(CarListing.first_seen_at).all():
        if first_seen is None:
            continue
        fs = first_seen.replace(tzinfo=None) if first_seen.tzinfo else first_seen
        dom_values.append(max(0, (now - fs).days))
    median_dom = python_median([float(d) for d in dom_values]) if dom_values else None

    # 90-day drift: compare current median to the median of comparables first
    # seen more than 90 days ago (price direction over the window).
    cutoff = now - timedelta(days=90)
    old_prices = [
        float(p)
        for (p, fs) in q.with_entities(CarListing.price_lkr, CarListing.first_seen_at).all()
        if fs is not None and (fs.replace(tzinfo=None) if fs.tzinfo else fs) <= cutoff and p is not None
    ]
    trend_3m_pct = None
    old_median = python_median(old_prices, min_value=MIN_REASONABLE_PRICE_LKR) if old_prices else None
    if old_median and median and old_median > 0:
        trend_3m_pct = round((median - old_median) / old_median * 100, 1)

    confidence = "high" if comparable_count >= 20 else "medium" if comparable_count >= 6 else "low"

    return CollateralValueResponse(
        make=make, model=model, year=year,
        market_median_lkr=round(median, 2) if median else None,
        p25_lkr=round(p25, 2) if p25 else None,
        p75_lkr=round(p75, 2) if p75 else None,
        comparable_count=comparable_count,
        live_supply=comparable_count,
        median_days_on_market=round(median_dom, 1) if median_dom is not None else None,
        trend_3m_pct=trend_3m_pct,
        confidence=confidence,
        computed_at=now,
        methodology=(
            "Market value derived from live asking prices of comparable vehicles in "
            "the Motormila multi-source index (11 Sri Lankan marketplaces). Median and "
            "IQR (p25-p75) define a fair range; days-on-market indicates collateral "
            "liquidity; the 3-month trend compares against comparables listed 90+ days "
            "ago. Asking prices, not confirmed transactions — a benchmark to augment, "
            "not replace, a licensed valuer."
        ),
    )
