from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from pydantic import BaseModel, Field
import httpx
import logging
from typing import Literal, Optional, List
from sqlalchemy.orm import Session
from app.services.rate_limit import RateLimiter
from app.services.macro_feeds import fetch_macro_snapshot
from app.services.ownership_costs import (
    calculate_revenue_licence,
    calculate_third_party_insurance,
    calculate_transfer_fees,
    check_import_eligibility,
    ownership_first_year_bundle,
)
from app.services.vehicle_news import fetch_vehicle_policy_news
from app.utils.plan_limits import FREE_VEHICLE_NEWS_LIMIT, is_free_browse_plan
from app.utils.request_access import resolve_request_access
from db.session import get_db
from db.models import VehiclePermit
import secrets
import os
import threading
import time

# 120/min: the calculator UI recalculates as users adjust inputs (debounced
# client-side), so an active session legitimately produces bursts.
_calculators_rate_limiter = RateLimiter(max_requests=120, window_seconds=60)

router = APIRouter(dependencies=[Depends(_calculators_rate_limiter)])
logger = logging.getLogger("motormila.calculators")

# Fallback fuel prices in LKR
FALLBACK_PETROL_92 = 370.0
FALLBACK_PETROL_95 = 410.0
FALLBACK_DIESEL = 320.0
FALLBACK_ELECTRIC_KWH = 35.0

class LandedCostRequest(BaseModel):
    cif_usd: float = Field(..., gt=0, description="CIF value of the vehicle in USD")
    exchange_rate: float = Field(300.0, gt=0, description="USD to LKR exchange rate")
    fuel_type: Literal["petrol", "diesel", "hybrid", "electric"] = Field(..., description="Vehicle fuel type")
    engine_cc: Optional[int] = Field(None, ge=0, description="Engine capacity in CC (for ICE and hybrids)")
    motor_kw: Optional[int] = Field(None, ge=0, description="Motor power in kW (for electric vehicles)")
    apply_surcharge: bool = Field(True, description="Apply the 50% CID surcharge")
    apply_sscl: bool = Field(True, description="Apply 2.5% SSCL")

class LandedCostResponse(BaseModel):
    cif_lkr: float
    cid: float
    surcharge: float
    excise: float
    sscl: float
    vat: float
    luxury_tax: float
    total_tax: float
    landed_cost: float
    surcharge_applied: bool
    notes: str

class TCORequest(BaseModel):
    daily_km: float = Field(40.0, ge=0, description="Average daily commute distance in km")
    fuel_type: Literal["petrol", "diesel", "hybrid", "electric"] = Field(..., description="Fuel type")
    mileage_kmpl: float = Field(..., gt=0, description="Fuel/energy efficiency (km/L or km/kWh for EV)")
    lease_installment: float = Field(0.0, ge=0, description="Monthly lease installment in LKR")
    insurance_annual: float = Field(120000.0, ge=0, description="Annual insurance premium in LKR")
    service_annual: float = Field(60000.0, ge=0, description="Annual maintenance and service cost in LKR")
    tyres_annual: float = Field(30000.0, ge=0, description="Annual tyre replacement allocation in LKR")
    resale_loss_annual: float = Field(100000.0, ge=0, description="Estimated annual depreciation loss in LKR")

class TCOResponse(BaseModel):
    fuel_price_lkr: float
    fuel_cost_monthly: float
    lease_cost_monthly: float
    overhead_cost_monthly: float
    total_tco_monthly: float
    notes: str

class PermitCreate(BaseModel):
    permit_name: str = Field(..., min_length=2, max_length=100)
    permit_type: str = Field(..., min_length=2, max_length=50)
    market_price_lkr: float = Field(..., ge=0)

class PermitRead(PermitCreate):
    id: int
    # True when the permit table is still empty and the row is the research
    # baseline (mid-point of published ranges), not a live market price.
    baseline: bool = False

# Excise band configurations
EXCISE_PETROL = [
    (1000, 2450.0),
    (1300, 3850.0),
    (1500, 4450.0),
    (1800, 5150.0),
    (2000, 6400.0),
    (2500, 7700.0),
    (float('inf'), 8900.0)
]

EXCISE_HYBRID = [
    (1000, 2100.0),
    (1300, 3300.0),
    (1500, 3850.0),
    (1800, 4700.0),
    (2000, 5600.0),
    (2500, 7100.0),
    (float('inf'), 8400.0)
]

EXCISE_DIESEL = [
    (1500, 5150.0),
    (1800, 6150.0),
    (2000, 7100.0),
    (2500, 8400.0),
    (float('inf'), 9650.0)
]

EXCISE_ELECTRIC = [
    (50, 12500.0),
    (100, 25000.0),
    (200, 43000.0),
    (float('inf'), 55000.0)
]

LUXURY_TAX_THRESHOLDS = {
    "petrol": (5000000.0, 1.00),
    "diesel": (5000000.0, 1.20),
    "hybrid": (5500000.0, 0.80),
    "electric": (6000000.0, 0.60)
}

def get_rate(bands, value):
    for limit, rate in bands:
        if value <= limit:
            return rate
    return bands[-1][1]

def require_admin_key(x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")):
    configured_key = os.getenv("ADMIN_API_KEY", "").strip()
    if not configured_key:
        raise HTTPException(status_code=503, detail="Admin feature is not configured.")
    if not x_admin_key or not secrets.compare_digest(x_admin_key, configured_key):
        raise HTTPException(status_code=401, detail="Invalid admin key.")

@router.post("/landed-cost", response_model=LandedCostResponse)
def calculate_landed_cost(payload: LandedCostRequest):
    cif_lkr = payload.cif_usd * payload.exchange_rate

    # 1. CID (20% default)
    cid_rate = 0.20
    cid = cif_lkr * cid_rate

    # 2. CID Surcharge (50% of CID, compounds)
    surcharge = cid * 0.50 if payload.apply_surcharge else 0.0

    # 3. Excise Duty
    excise = 0.0
    if payload.fuel_type == "electric":
        if payload.motor_kw is None:
            raise HTTPException(status_code=422, detail="motor_kw is required for electric vehicles")
        rate = get_rate(EXCISE_ELECTRIC, payload.motor_kw)
        excise = payload.motor_kw * rate
    else:
        if payload.engine_cc is None:
            raise HTTPException(status_code=422, detail="engine_cc is required for petrol, diesel, and hybrid vehicles")
        
        if payload.fuel_type == "petrol":
            rate = get_rate(EXCISE_PETROL, payload.engine_cc)
        elif payload.fuel_type == "hybrid":
            rate = get_rate(EXCISE_HYBRID, payload.engine_cc)
        else: # diesel
            rate = get_rate(EXCISE_DIESEL, payload.engine_cc)
        
        excise = payload.engine_cc * rate

    # 4. SSCL (2.5%)
    sscl = 0.0
    if payload.apply_sscl:
        sscl = (cif_lkr + cid + surcharge + excise) * 0.025

    # 5. VAT (18%)
    vat = (cif_lkr + cid + surcharge + excise + sscl) * 0.18

    # 6. Luxury Tax (applied on CIF excess above threshold)
    threshold, rate_excess = LUXURY_TAX_THRESHOLDS[payload.fuel_type]
    luxury_tax = max(0.0, cif_lkr - threshold) * rate_excess

    total_tax = cid + surcharge + excise + sscl + vat + luxury_tax
    landed_cost = cif_lkr + total_tax

    note_text = f"Calculated with {payload.exchange_rate} USD/LKR rate. "
    if payload.apply_surcharge:
        note_text += "Includes 50% CID surcharge per gazette. "
    if payload.fuel_type == "hybrid" and payload.engine_cc and payload.engine_cc <= 1500:
        note_text += "Sits under the 1500cc hybrid tax cliff band. "

    return LandedCostResponse(
        cif_lkr=round(cif_lkr, 2),
        cid=round(cid, 2),
        surcharge=round(surcharge, 2),
        excise=round(excise, 2),
        sscl=round(sscl, 2),
        vat=round(vat, 2),
        luxury_tax=round(luxury_tax, 2),
        total_tax=round(total_tax, 2),
        landed_cost=round(landed_cost, 2),
        surcharge_applied=payload.apply_surcharge,
        notes=note_text
    )

@router.post("/tco", response_model=TCOResponse)
async def calculate_tco(payload: TCORequest):
    fuel_price = FALLBACK_PETROL_95
    source_notes = "Using fallback fuel prices. "

    # Attempt to fetch live fuel prices from Octane API
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get("https://octane-smoky.vercel.app/api/fuel-price")
            if res.status_code == 200:
                data = res.json()
                prices = data.get("prices", {})
                if payload.fuel_type == "petrol" or payload.fuel_type == "hybrid":
                    fuel_price = float(prices.get("petrol_95", FALLBACK_PETROL_95))
                elif payload.fuel_type == "diesel":
                    fuel_price = float(prices.get("auto_diesel", FALLBACK_DIESEL))
                else: # electric
                    fuel_price = FALLBACK_ELECTRIC_KWH
                source_notes = "Using live fuel prices from Octane API. "
    except Exception as exc:
        logger.warning(f"Failed to fetch live fuel prices, fallback applied: {exc}")
        if payload.fuel_type == "petrol" or payload.fuel_type == "hybrid":
            fuel_price = FALLBACK_PETROL_95
        elif payload.fuel_type == "diesel":
            fuel_price = FALLBACK_DIESEL
        else: # electric
            fuel_price = FALLBACK_ELECTRIC_KWH

    # Calculate monthly fuel costs
    # Monthly distance = daily distance * 30 days
    monthly_km = payload.daily_km * 30.0
    fuel_cost_monthly = (monthly_km / payload.mileage_kmpl) * fuel_price

    # Lease installment is already monthly
    lease_cost_monthly = payload.lease_installment

    # Calculate other monthly amortized overheads
    overhead_cost_monthly = (
        payload.insurance_annual + 
        payload.service_annual + 
        payload.tyres_annual + 
        payload.resale_loss_annual
    ) / 12.0

    total_tco_monthly = fuel_cost_monthly + lease_cost_monthly + overhead_cost_monthly

    return TCOResponse(
        fuel_price_lkr=round(fuel_price, 2),
        fuel_cost_monthly=round(fuel_cost_monthly, 2),
        lease_cost_monthly=round(lease_cost_monthly, 2),
        overhead_cost_monthly=round(overhead_cost_monthly, 2),
        total_tco_monthly=round(total_tco_monthly, 2),
        notes=source_notes
    )

def _baseline_permits() -> list[dict]:
    """Research baseline permit prices, highest first (read-only, never written)."""
    try:
        from app.scrapers.permitsale import _DEFAULT_PERMITS as defaults
    except Exception:  # noqa: BLE001 - optional baseline
        return []
    ordered = sorted(defaults, key=lambda row: row[2], reverse=True)
    return [
        {
            "id": index,
            "permit_name": name,
            "permit_type": permit_type,
            "market_price_lkr": float(price),
            "baseline": True,
        }
        for index, (name, permit_type, price) in enumerate(ordered, start=1)
    ]


@router.get("/permits", response_model=List[PermitRead])
def get_permits(db: Session = Depends(get_db)):
    """Permit market prices.

    The vehicle_permits table is admin/seeder populated and is empty in the
    public SQLite failover dump (and on a fresh database), which left the
    Permit market page blank. Fall back to the research baseline, flagged
    ``baseline: true``, instead of an empty list.
    """
    rows = db.query(VehiclePermit).order_by(VehiclePermit.market_price_lkr.desc()).all()
    if rows:
        return rows
    return _baseline_permits()

@router.post("/permits", response_model=PermitRead, dependencies=[Depends(require_admin_key)])
def create_or_update_permit(payload: PermitCreate, db: Session = Depends(get_db)):
    permit = db.query(VehiclePermit).filter(VehiclePermit.permit_name == payload.permit_name).first()
    if permit:
        permit.permit_type = payload.permit_type
        permit.market_price_lkr = payload.market_price_lkr
    else:
        permit = VehiclePermit(
            permit_name=payload.permit_name,
            permit_type=payload.permit_type,
            market_price_lkr=payload.market_price_lkr
        )
        db.add(permit)
    
    try:
        db.commit()
        db.refresh(permit)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database update failed: {e}")
        
    return permit


class MacroFxResponse(BaseModel):
    usd_lkr: float
    reference_date: Optional[str] = None
    source: str
    source_url: str
    fetched_at: str
    inflation_index: Optional[float] = None
    inflation_yoy_percent: Optional[float] = None
    inflation_reference_date: Optional[str] = None
    notes: str


class RevenueLicenceRequest(BaseModel):
    vehicle_class: Literal["motor_car", "dual_purpose", "motorcycle", "three_wheeler"] = "motor_car"
    fuel_type: Literal["petrol", "diesel", "hybrid", "electric"] = "petrol"
    unladen_kg: Optional[float] = Field(None, gt=0)
    engine_cc: Optional[int] = Field(None, ge=0)
    delay: Literal["none", "within_3_months", "within_1_year", "over_1_year"] = "none"
    include_emission_test: bool = True


class ThirdPartyInsuranceRequest(BaseModel):
    vehicle_class: Literal["motor_car", "dual_purpose", "motorcycle", "three_wheeler"] = "motor_car"
    engine_cc: Optional[int] = Field(1500, ge=0)


class TransferFeeRequest(BaseModel):
    vehicle_class: Literal["motor_car", "dual_purpose", "motorcycle", "three_wheeler"] = "motor_car"
    consideration_lkr: float = Field(0.0, ge=0)
    include_stamp_duty: bool = True


class ImportEligibilityRequest(BaseModel):
    fuel_type: Literal["petrol", "diesel", "hybrid", "electric"] = "hybrid"
    model_year: Optional[int] = Field(None, ge=1980, le=2100)
    as_of_year: int = Field(2026, ge=2020, le=2100)


class OwnershipBundleRequest(BaseModel):
    vehicle_class: Literal["motor_car", "dual_purpose", "motorcycle", "three_wheeler"] = "motor_car"
    fuel_type: Literal["petrol", "diesel", "hybrid", "electric"] = "petrol"
    engine_cc: Optional[int] = Field(1500, ge=0)
    unladen_kg: Optional[float] = Field(None, gt=0)
    consideration_lkr: float = Field(0.0, ge=0)
    include_transfer: bool = False


# /macro does up to three outbound HTTP calls (8 s timeouts each). Cache the
# snapshot in-process so a calculator page view is not an outbound fetch, and
# keep serving the last good snapshot when upstream fails (stale-on-error).
_MACRO_FALLBACK_SOURCE = "fallback_constant"
_MACRO_RETRY_AFTER_ERROR_SECONDS = 300
_macro_cache_lock = threading.Lock()
_macro_refresh_lock = threading.Lock()
_macro_cache: dict = {"snapshot": None, "expires_at": 0.0}


def _macro_cache_ttl_seconds() -> int:
    try:
        return max(60, int(os.getenv("MACRO_CACHE_TTL_SECONDS", "1800")))
    except ValueError:
        return 1800


def _reset_macro_cache() -> None:
    with _macro_cache_lock:
        _macro_cache["snapshot"] = None
        _macro_cache["expires_at"] = 0.0


def _store_macro(snapshot, expires_at: float) -> None:
    with _macro_cache_lock:
        _macro_cache["snapshot"] = snapshot
        _macro_cache["expires_at"] = expires_at


def get_cached_macro_snapshot(*, now: float | None = None):
    """Return a macro snapshot, refreshing at most once per TTL.

    Only one thread refreshes at a time; concurrent callers with a stale
    snapshot get the stale copy instead of queueing behind the fetch. On a
    failed refresh (exception or the hard-coded fallback FX) the last good
    snapshot is served and the next retry is deferred for a few minutes.
    """
    now = time.time() if now is None else now
    with _macro_cache_lock:
        cached = _macro_cache["snapshot"]
        expires_at = _macro_cache["expires_at"]
    if cached is not None and now < expires_at:
        return cached

    if not _macro_refresh_lock.acquire(blocking=cached is None):
        return cached
    try:
        with _macro_cache_lock:
            if _macro_cache["snapshot"] is not None and now < _macro_cache["expires_at"]:
                return _macro_cache["snapshot"]
        retry_at = now + _MACRO_RETRY_AFTER_ERROR_SECONDS
        try:
            snapshot = fetch_macro_snapshot()
        except Exception:
            if cached is not None:
                logger.warning("macro_refresh_failed_serving_stale", exc_info=True)
                _store_macro(cached, retry_at)
                return cached
            raise
        if snapshot.fx.source == _MACRO_FALLBACK_SOURCE:
            if cached is not None and cached.fx.source != _MACRO_FALLBACK_SOURCE:
                _store_macro(cached, retry_at)
                return cached
            _store_macro(snapshot, retry_at)
            return snapshot
        _store_macro(snapshot, now + _macro_cache_ttl_seconds())
        return snapshot
    finally:
        _macro_refresh_lock.release()


@router.get("/macro", response_model=MacroFxResponse)
def get_macro_context():
    """Live USD/LKR (+ optional CCPI) for the landed-cost calculator.

    Plain ``def`` so FastAPI runs it in the threadpool: a cache miss does
    blocking outbound HTTP and must not stall the event loop.
    """
    try:
        snapshot = get_cached_macro_snapshot()
    except Exception as exc:
        logger.warning("macro_endpoint_failed: %s", exc)
        raise HTTPException(status_code=503, detail="Macro feeds temporarily unavailable.") from exc

    fx = snapshot.fx
    infl = snapshot.inflation
    notes = (
        f"FX from {fx.source}"
        + (f" (ref {fx.reference_date})" if fx.reference_date else "")
        + ". "
    )
    if infl is not None:
        notes += (
            f"CCPI index {infl.index_value}"
            + (f", YoY {infl.yoy_percent}%" if infl.yoy_percent is not None else "")
            + ". "
        )
    notes += "Rates are planning inputs — confirm CBSL / Customs figures before committing."

    return MacroFxResponse(
        usd_lkr=fx.usd_lkr,
        reference_date=fx.reference_date,
        source=fx.source,
        source_url=fx.source_url,
        fetched_at=fx.fetched_at,
        inflation_index=infl.index_value if infl else None,
        inflation_yoy_percent=infl.yoy_percent if infl else None,
        inflation_reference_date=infl.reference_date if infl else None,
        notes=notes,
    )


@router.post("/revenue-licence")
def post_revenue_licence(payload: RevenueLicenceRequest):
    result = calculate_revenue_licence(
        vehicle_class=payload.vehicle_class,
        fuel_type=payload.fuel_type,
        unladen_kg=payload.unladen_kg,
        engine_cc=payload.engine_cc,
        delay=payload.delay,
        include_emission_test=payload.include_emission_test,
    )
    return result.__dict__


@router.post("/third-party-insurance")
def post_third_party_insurance(payload: ThirdPartyInsuranceRequest):
    result = calculate_third_party_insurance(
        vehicle_class=payload.vehicle_class,
        engine_cc=payload.engine_cc,
    )
    return result.__dict__


@router.post("/transfer-fees")
def post_transfer_fees(payload: TransferFeeRequest):
    result = calculate_transfer_fees(
        vehicle_class=payload.vehicle_class,
        consideration_lkr=payload.consideration_lkr,
        include_stamp_duty=payload.include_stamp_duty,
    )
    return result.__dict__


@router.post("/import-eligibility")
def post_import_eligibility(payload: ImportEligibilityRequest):
    result = check_import_eligibility(
        fuel_type=payload.fuel_type,
        model_year=payload.model_year,
        as_of_year=payload.as_of_year,
    )
    return {
        "eligible": result.eligible,
        "status": result.status,
        "reasons": result.reasons,
        "notes": result.notes,
    }


@router.post("/ownership-bundle")
def post_ownership_bundle(payload: OwnershipBundleRequest):
    return ownership_first_year_bundle(
        vehicle_class=payload.vehicle_class,
        fuel_type=payload.fuel_type,
        engine_cc=payload.engine_cc,
        unladen_kg=payload.unladen_kg,
        consideration_lkr=payload.consideration_lkr,
        include_transfer=payload.include_transfer,
    )


@router.get("/vehicle-news")
def get_vehicle_news(
    request: Request,
    limit: int = Query(8, ge=1, le=20),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Filtered Helakuru Esana headlines (vehicle / policy keywords). Fail-open."""
    plan, role = resolve_request_access(request, authorization, db)
    effective = limit
    if is_free_browse_plan(plan, role=role):
        effective = min(limit, FREE_VEHICLE_NEWS_LIMIT)
    return {"items": fetch_vehicle_policy_news(limit=effective)}
