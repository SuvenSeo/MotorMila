"""Multi-feature Fair Market Value predictor.

Uses a lightweight ordinary-least-squares model fitted on live comparable
listings (year, mileage, district match, condition). Falls back to a
mileage-adjusted cohort median when the sample is too thin — no sklearn /
XGBoost dependency required for HF image size.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.utils.price_verdict import (
    MIN_COMPS,
    asking_price_issue,
    is_generic_model,
    price_verdict,
    stored_signal_is_plausible,
    verdict_label,
    withheld_verdict,
)
from db.models import CarListing, live_listing_filter

_MIN_ML_COMPS = 8
_MAX_COMPS = 80
_FETCH_LIMIT = 160
_YEAR_WINDOW = 2
_WIDE_YEAR_WINDOW = 4
# An OLS fit is only trusted when it stays this close to the robust
# (mileage-adjusted) comps median; otherwise the median is the estimate.
_OLS_MAX_DRIFT = 0.15
# Live comps "corroborate" the stored cohort median when the two are within
# this ratio of each other (±25 %); beyond it the estimates disagree.
_AGREE_RATIO = 1.25


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


def _comp_is_usable(row: CarListing) -> bool:
    """A comparable must itself be a real full asking price (same guards as
    the verdict): no placeholder/deposit/part/lease prices in the cohort."""
    return (
        asking_price_issue(
            row.price_lkr,
            category=getattr(row, "vehicle_category", None),
            title=getattr(row, "title", None),
        )
        is None
    )


def _trim_outliers(rows: list[CarListing]) -> list[CarListing]:
    """Drop comps far from the cohort centre (Tukey fences on log price).

    Log space because asking prices are right-skewed; 1.5×IQR is the usual
    fence. A hard 0.4×–2.5× band around the median runs first so one
    wrong-category row cannot widen the IQR it is judged by.
    """
    priced = [r for r in rows if r.price_lkr is not None and float(r.price_lkr) > 0]
    if len(priced) < 4:
        return priced
    med = _median([float(r.price_lkr) for r in priced]) or 0.0
    banded = [r for r in priced if med * 0.4 <= float(r.price_lkr) <= med * 2.5]
    if len(banded) < 4:
        return banded
    logs = sorted(math.log(float(r.price_lkr)) for r in banded)
    q1 = logs[len(logs) // 4]
    q3 = logs[(3 * len(logs)) // 4]
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return [r for r in banded if lo <= math.log(float(r.price_lkr)) <= hi]


def _fetch_comps(db: Session, listing: CarListing) -> list[CarListing]:
    """Comparable live listings for ``listing``.

    Same make + model, same vehicle category (a Honda "Other" bucket holds
    motorbikes *and* cars), nearest model years first, newest first. The old
    version took an unordered ``LIMIT 240`` and, when that arbitrary slice had
    < 8 rows in the ±2-year window, fell back to *all years* — so a 2024 Axio
    was valued off 2005–2012 Axios ("Overpriced 72 %").
    """
    make = (listing.make or "").strip()
    model = (listing.model or "").strip()
    if not make or not model:
        return []

    filters = [
        live_listing_filter(),
        CarListing.make.ilike(make),
        CarListing.model.ilike(model),
        CarListing.price_lkr.isnot(None),
        CarListing.id != listing.id,
    ]
    category = (getattr(listing, "vehicle_category", None) or "").strip()
    if category:
        filters.append(CarListing.vehicle_category == category)

    year = listing.year
    rows: list[CarListing] = []
    if year is not None:
        for window in (_YEAR_WINDOW, _WIDE_YEAR_WINDOW):
            rows = (
                db.query(CarListing)
                .filter(
                    *filters,
                    CarListing.year.isnot(None),
                    CarListing.year.between(int(year) - window, int(year) + window),
                )
                .order_by(
                    func.abs(CarListing.year - int(year)),
                    CarListing.last_seen_at.desc(),
                    CarListing.id.desc(),
                )
                .limit(_FETCH_LIMIT)
                .all()
            )
            rows = _trim_outliers([r for r in rows if _comp_is_usable(r)])
            if len(rows) >= _MIN_ML_COMPS:
                break
    else:
        rows = (
            db.query(CarListing)
            .filter(*filters)
            .order_by(CarListing.last_seen_at.desc(), CarListing.id.desc())
            .limit(_FETCH_LIMIT)
            .all()
        )
        rows = _trim_outliers([r for r in rows if _comp_is_usable(r)])
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
    """OLS on (year, mileage, same district, condition), features centred.

    Uncentred years (~2018) and kilometres made the normal equations badly
    conditioned; the fit then landed anywhere inside the IQR clamp. Features
    are centred on the comp means now, and the caller only accepts the fit
    when it stays within ``_OLS_MAX_DRIFT`` of the robust median.
    """
    if len(comps) < _MIN_ML_COMPS:
        return None

    district = (listing.district or "").strip().lower()
    years = [float(r.year) for r in comps if r.year is not None]
    kms = [float(r.mileage) / 1000.0 for r in comps if r.mileage is not None]
    mean_year = sum(years) / len(years) if years else float(listing.year or 2015)
    mean_km = sum(kms) / len(kms) if kms else 50.0

    def feats(year: Optional[float], km: Optional[float], same: float, cond: float) -> list[float]:
        y = (year if year is not None else mean_year) - mean_year
        k = ((km / 1000.0) if km is not None else mean_km) - mean_km
        return [1.0, y, k / 10.0, same, cond]

    features: list[list[float]] = []
    targets: list[float] = []
    for row in comps:
        if row.price_lkr is None:
            continue
        same_district = 1.0 if district and (row.district or "").strip().lower() == district else 0.0
        features.append(
            feats(
                float(row.year) if row.year is not None else None,
                float(row.mileage) if row.mileage is not None else None,
                same_district,
                _condition_code(getattr(row, "condition", None)),
            )
        )
        targets.append(float(row.price_lkr))

    if len(features) < _MIN_ML_COMPS:
        return None

    beta = _solve_ols(features, targets)
    if beta is None:
        return None

    x = feats(
        float(listing.year) if listing.year is not None else None,
        float(listing.mileage) if listing.mileage is not None else None,
        1.0,  # prefer same-district valuation for the subject
        _condition_code(getattr(listing, "condition", None)),
    )
    predicted = sum(b * v for b, v in zip(beta, x))
    if not math.isfinite(predicted) or predicted <= 0:
        return None
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


_CONF_ORDER = ["none", "low", "medium", "high"]


def _cap(level: str, ceiling: str) -> str:
    return level if _CONF_ORDER.index(level) <= _CONF_ORDER.index(ceiling) else ceiling


def _dispersion(prices: list[float]) -> Optional[float]:
    """(Q3 − Q1) / median of the comp prices — how mixed the cohort is."""
    if len(prices) < 4:
        return None
    ordered = sorted(prices)
    med = _median(ordered)
    if not med:
        return None
    return (ordered[(3 * len(ordered)) // 4] - ordered[len(ordered) // 4]) / med


def predict_listing_fmv(db: Session, listing: CarListing) -> dict[str, Any]:
    """Return the listing's FMV estimate **and the one price verdict** derived from it.

    Response fields:
    - listing_id, asking_lkr
    - fmv_lkr: the estimate every surface compares against, or ``None`` when the
      verdict is withheld (so no client can print a typical price we don't trust)
    - estimate_lkr: the raw estimate even when withheld (diagnostics / explainer)
    - verdict: {status ok|withheld, reason, reason_group, band, gap_pct, pct,
      verify_first, reference_lkr} — see app/utils/price_verdict.py
    - deal_score: −gap_pct (positive = below typical) when the verdict is ok, else None
    - delta_pct, band, label: legacy mirrors of the verdict (None when withheld)
    - method: ``ols_comps`` / ``adjusted_median`` / ``cohort_median`` / ``insufficient_data``
    - sample_size / sample_count, confidence (high/medium/low/none), comps_median_lkr,
      km_adjustment_lkr, district_adjustment_lkr, method_breakdown, updated_at
    """
    asking = float(listing.price_lkr) if listing.price_lkr is not None else None
    category = getattr(listing, "vehicle_category", None)
    title = getattr(listing, "title", None)
    stored_median = float(listing.market_median_lkr) if listing.market_median_lkr is not None else None
    if stored_median is not None and not stored_signal_is_plausible(
        price_lkr=asking, market_median_lkr=stored_median, category=category, model=listing.model, title=title
    ):
        stored_median = None

    comps = _fetch_comps(db, listing)
    method = "insufficient_data"
    fmv: Optional[float] = None
    sample_count = len(comps)
    comp_prices = sorted(float(r.price_lkr) for r in comps if r.price_lkr is not None)
    comps_median_lkr: Optional[float] = _median(comp_prices)

    adjusted = _adjusted_median_fmv(listing, comps)
    ml_value = _ml_predict(listing, comps)
    comps_estimate: Optional[float] = None
    comps_method = "insufficient_data"
    if ml_value is not None and adjusted and abs(ml_value / adjusted - 1) <= _OLS_MAX_DRIFT:
        comps_estimate, comps_method = ml_value, "ols_comps"
    elif adjusted is not None:
        comps_estimate, comps_method = adjusted, "adjusted_median"

    confidence = _confidence_from_sample(sample_count, comps_method)
    spread = _dispersion(comp_prices)
    if spread is not None and spread > 0.8:
        confidence = _cap(confidence, "low")
    elif spread is not None and spread > 0.5:
        confidence = _cap(confidence, "medium")

    # ONE number per listing. The stored cohort median is what every listing
    # card / list / snapshot already compares against, so when live comps
    # corroborate it (within ±25 %) it IS the FMV — card and detail page then
    # cannot disagree. When the two estimates diverge, neither is trusted.
    corroborated = False
    disagree = False
    if stored_median is not None and comps_estimate is not None:
        ratio = max(stored_median, comps_estimate) / min(stored_median, comps_estimate)
        if ratio <= _AGREE_RATIO:
            fmv, method, corroborated = stored_median, "cohort_median", True
            if sample_count >= 3:
                confidence = confidence if _CONF_ORDER.index(confidence) >= 2 else "medium"
        else:
            fmv, method, disagree = comps_estimate, comps_method, True
            confidence = _cap(confidence, "low")
    elif comps_estimate is not None:
        fmv, method = comps_estimate, comps_method
    elif stored_median is not None:
        # No live comparables back the stored median: show it, never a verdict.
        fmv, method, confidence = stored_median, "cohort_median", "low"
    if is_generic_model(listing.model):
        confidence = _cap(confidence, "low")

    verdict = price_verdict(
        asking,
        fmv,
        comps=max(sample_count, MIN_COMPS) if corroborated else sample_count,
        confidence=confidence,
        category=category,
        model=listing.model,
        title=title,
    )
    if disagree and verdict["status"] == "ok":
        verdict = withheld_verdict("estimates_disagree", fmv)
    elif disagree and verdict["reason"] == "low_confidence":
        verdict = withheld_verdict("estimates_disagree", fmv)
    ok = verdict["status"] == "ok"
    delta_pct = verdict["gap_pct"] if ok else None
    band = verdict["band"] if ok else None
    label = verdict_label(verdict) if ok else None
    deal_score = round(-float(verdict["gap_pct"]), 1) if ok else None

    updated_at = datetime.now(timezone.utc).isoformat()
    km_adjustment_lkr, district_adjustment_lkr = _estimate_adjustments(
        listing, comps, fmv, method, comps_median_lkr
    )

    return {
        "listing_id": int(listing.id) if listing.id is not None else None,
        "asking_lkr": asking,
        "fmv_lkr": fmv if ok else None,
        "estimate_lkr": fmv,
        "verdict": verdict,
        "deal_score": deal_score,
        "delta_pct": delta_pct,
        "band": band,
        "label": label,
        "method": method,
        "corroborated_by_comps": corroborated,
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
            "final_fmv_lkr": fmv if ok else None,
        },
        "updated_at": updated_at,
    }
