"""Multi-feature Fair Market Value predictor.

Uses a lightweight ordinary-least-squares model fitted on live comparable
listings (year, mileage, district match, condition). Falls back to a
mileage-adjusted cohort median when the sample is too thin — no sklearn /
XGBoost dependency required for HF image size.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from db.models import CarListing, live_listing_filter

_MIN_ML_COMPS = 8
_MAX_COMPS = 80
_YEAR_WINDOW = 2


def _condition_code(value: Optional[str]) -> float:
    raw = (value or "").strip().lower()
    if raw in {"brand_new", "new", "unregistered"}:
        return 2.0
    if raw in {"reconditioned", "import"}:
        return 1.0
    if raw in {"used", "registered"}:
        return 0.0
    return 0.5


def _median(values: list[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def _adjust_for_mileage(
    price_lkr: float,
    target_mileage_km: Optional[int],
    comparable_mileage_km: Optional[int],
) -> float:
    base = max(float(price_lkr), 0.0)
    if target_mileage_km is None or comparable_mileage_km is None:
        return round(base, 2)
    mileage_delta = float(target_mileage_km) - float(comparable_mileage_km)
    ratio = max(min((mileage_delta / 100_000.0) * 0.06, 0.20), -0.20)
    return round(max(base * (1.0 - ratio), 0.0), 2)


def _solve_ols(rows: list[list[float]], targets: list[float]) -> Optional[list[float]]:
    """Solve β for Xβ ≈ y via normal equations with tiny ridge for stability."""
    n = len(rows)
    if n == 0:
        return None
    p = len(rows[0])
    # XtX and Xty
    xtx = [[0.0] * p for _ in range(p)]
    xty = [0.0] * p
    for i in range(n):
        xi = rows[i]
        yi = targets[i]
        for a in range(p):
            xty[a] += xi[a] * yi
            for b in range(p):
                xtx[a][b] += xi[a] * xi[b]
    # Ridge on diagonal (skip intercept col 0)
    for a in range(1, p):
        xtx[a][a] += 1e-3

    # Gaussian elimination
    mat = [xtx[r][:] + [xty[r]] for r in range(p)]
    for col in range(p):
        pivot = max(range(col, p), key=lambda r: abs(mat[r][col]))
        if abs(mat[pivot][col]) < 1e-12:
            return None
        mat[col], mat[pivot] = mat[pivot], mat[col]
        div = mat[col][col]
        for j in range(col, p + 1):
            mat[col][j] /= div
        for r in range(p):
            if r == col:
                continue
            factor = mat[r][col]
            for j in range(col, p + 1):
                mat[r][j] -= factor * mat[col][j]
    return [mat[r][p] for r in range(p)]


def _fetch_comps(db: Session, listing: CarListing) -> list[CarListing]:
    make = (listing.make or "").strip()
    model = (listing.model or "").strip()
    if not make or not model:
        return []

    q = (
        db.query(CarListing)
        .filter(
            live_listing_filter(),
            CarListing.make.ilike(make),
            CarListing.model.ilike(model),
            CarListing.price_lkr.isnot(None),
            CarListing.id != listing.id,
        )
        .limit(_MAX_COMPS * 3)
    )
    year = listing.year
    rows = q.all()
    if year is not None:
        tight = [
            r
            for r in rows
            if r.year is not None and abs(int(r.year) - int(year)) <= _YEAR_WINDOW
        ]
        if len(tight) >= _MIN_ML_COMPS:
            rows = tight
    return rows[:_MAX_COMPS]


def _adjusted_median_fmv(listing: CarListing, comps: list[CarListing]) -> Optional[float]:
    target_mileage = getattr(listing, "mileage", None)
    prices = [
        _adjust_for_mileage(
            float(row.price_lkr),
            target_mileage_km=int(target_mileage) if target_mileage is not None else None,
            comparable_mileage_km=int(row.mileage) if row.mileage is not None else None,
        )
        for row in comps
        if row.price_lkr is not None
    ]
    return _median(prices)


def _ml_predict(listing: CarListing, comps: list[CarListing]) -> Optional[float]:
    if len(comps) < _MIN_ML_COMPS:
        return None

    district = (listing.district or "").strip().lower()
    features: list[list[float]] = []
    targets: list[float] = []
    for row in comps:
        if row.price_lkr is None:
            continue
        year = float(row.year) if row.year is not None else float(listing.year or 2015)
        mileage = float(row.mileage) / 1000.0 if row.mileage is not None else 50.0
        same_district = 1.0 if district and (row.district or "").strip().lower() == district else 0.0
        features.append([1.0, year, mileage, same_district, _condition_code(getattr(row, "condition", None))])
        targets.append(float(row.price_lkr))

    if len(features) < _MIN_ML_COMPS:
        return None

    beta = _solve_ols(features, targets)
    if beta is None:
        return None

    target_year = float(listing.year) if listing.year is not None else float(
        sum(r.year for r in comps if r.year is not None) / max(1, sum(1 for r in comps if r.year is not None))
    )
    target_mileage = float(listing.mileage) / 1000.0 if listing.mileage is not None else 50.0
    x = [
        1.0,
        target_year,
        target_mileage,
        1.0,  # prefer same-district valuation for the subject
        _condition_code(getattr(listing, "condition", None)),
    ]
    predicted = sum(b * v for b, v in zip(beta, x))
    if predicted <= 0:
        return None

    # Soft-clamp to the comps IQR so a wild OLS fit cannot escape the market.
    prices = sorted(float(r.price_lkr) for r in comps if r.price_lkr is not None)
    if len(prices) >= 4:
        q1 = prices[len(prices) // 4]
        q3 = prices[(3 * len(prices)) // 4]
        lo = q1 * 0.75
        hi = q3 * 1.25
        predicted = min(max(predicted, lo), hi)

    return round(predicted, 2)


def _estimate_adjustments(
    listing: CarListing,
    comps: list[CarListing],
    fmv: Optional[float],
    method: str,
    comps_median_lkr: Optional[float],
) -> tuple[Optional[float], Optional[float]]:
    """Split FMV into mileage vs district/model adjustments (additive, best-effort).

    - km_adjustment = mileage-adjusted median − raw comps median
    - district_adjustment = final FMV − mileage-adjusted median (OLS only)
    Returns (None, None) when there is no comp base to split.
    """
    if fmv is None or comps_median_lkr is None or not comps:
        return None, None
    if method not in {"ols_comps", "adjusted_median"}:
        return None, None
    adjusted = _adjusted_median_fmv(listing, comps)
    if adjusted is None:
        return None, None
    km_adj = round(float(adjusted) - float(comps_median_lkr), 2)
    if method == "ols_comps":
        district_adj = round(float(fmv) - float(adjusted), 2)
    else:
        district_adj = 0.0
    return km_adj, district_adj


def _confidence_from_sample(sample_count: int, method: str) -> str:
    """Derive a qualitative confidence level from comp count and method used."""
    if method == "insufficient_data":
        return "none"
    if method == "cohort_median":
        return "low"
    if sample_count >= 15:
        return "high"
    if sample_count >= _MIN_ML_COMPS:
        return "medium"
    return "low"


def predict_listing_fmv(db: Session, listing: CarListing) -> dict[str, Any]:
    """Return FMV payload for a listing (ML when possible, else adjusted median).

    Response fields:
    - listing_id, asking_lkr, fmv_lkr, deal_score, delta_pct, band, label
    - method: one of ``ols_comps``, ``adjusted_median``, ``cohort_median``, ``insufficient_data``
    - sample_size / sample_count: number of live comparable listings used
    - confidence: qualitative level — ``high`` / ``medium`` / ``low`` / ``none``
    - comps_median_lkr: raw (unadjusted) median price of the comp set, or None
    - km_adjustment_lkr: mileage-attributed split vs comps median (None when N/A)
    - district_adjustment_lkr: district/model residual split (None when N/A)
    - method_breakdown: additive walk {base_median_lkr, km/district splits, final_fmv_lkr}
    - updated_at: ISO-8601 UTC timestamp of when this estimate was computed
    """
    asking = float(listing.price_lkr) if listing.price_lkr is not None else None
    stored_median = float(listing.market_median_lkr) if listing.market_median_lkr is not None else None
    deal_score = float(listing.deal_score) if listing.deal_score is not None else None

    comps = _fetch_comps(db, listing)
    method = "insufficient_data"
    fmv: Optional[float] = None
    sample_count = len(comps)

    ml_value = _ml_predict(listing, comps)
    if ml_value is not None:
        fmv = ml_value
        method = "ols_comps"
    else:
        adjusted = _adjusted_median_fmv(listing, comps)
        if adjusted is not None:
            fmv = adjusted
            method = "adjusted_median"
        elif stored_median is not None:
            fmv = stored_median
            method = "cohort_median"

    # Raw (unadjusted) median of the comp set for transparency.
    comp_prices = sorted(float(r.price_lkr) for r in comps if r.price_lkr is not None)
    comps_median_lkr: Optional[float] = _median(comp_prices)

    band = None
    delta_pct = None
    label = None
    # Suppress verdicts on thin cohorts — a 1-comp "Overpriced 12%" is noise.
    _MIN_BAND_COMPS = 5
    if (
        asking is not None
        and fmv is not None
        and asking > 0
        and fmv > 0
        and sample_count >= _MIN_BAND_COMPS
    ):
        delta_pct = round(((asking - fmv) / fmv) * 100, 2)
        if delta_pct <= -5:
            band = "below"
            label = f"Priced {abs(delta_pct):.0f}% below FMV"
        elif delta_pct >= 8:
            band = "above"
            label = f"Overpriced {abs(delta_pct):.0f}% vs FMV"
        else:
            band = "fair"
            label = "Near fair market value"

    confidence = _confidence_from_sample(sample_count, method)
    updated_at = datetime.now(timezone.utc).isoformat()

    km_adjustment_lkr, district_adjustment_lkr = _estimate_adjustments(
        listing, comps, fmv, method, comps_median_lkr
    )

    return {
        "listing_id": int(listing.id) if listing.id is not None else None,
        "asking_lkr": asking,
        "fmv_lkr": fmv,
        "deal_score": deal_score,
        "delta_pct": delta_pct,
        "band": band,
        "label": label,
        "method": method,
        "sample_count": sample_count,
        "sample_size": sample_count,
        "confidence": confidence,
        "comps_median_lkr": comps_median_lkr,
        "km_adjustment_lkr": km_adjustment_lkr,
        "district_adjustment_lkr": district_adjustment_lkr,
        "method_breakdown": {
            "base_median_lkr": comps_median_lkr,
            "km_adjustment_lkr": km_adjustment_lkr,
            "district_adjustment_lkr": district_adjustment_lkr,
            "final_fmv_lkr": fmv,
        },
        "updated_at": updated_at,
    }
