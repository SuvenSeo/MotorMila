from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import (
    _extract_token,
    resolve_live_session,
    verify_token,
)
from app.models.schemas import (
    AlertChannelsUpdate,
    AlertMatchListing,
    AlertMatchResponse,
    AlertMatchResult,
    MarketAlertCreate,
    MarketAlertRead,
)
from app.utils.channel_center import SUPPORTED_CHANNELS, normalize_channels
from app.services.rate_limit import RateLimiter
from app.utils.plan_limits import FREE_ALERTS_LIMIT, PRO_ALERTS_LIMIT, is_free_browse_plan
from db.models import CarListing, MarketAlert, live_listing_filter
from db.session import get_db

MATCH_LIMIT_PER_ALERT = 5
# Back-compat alias for older tests/docs.
MAX_ALERTS_PER_TOKEN = PRO_ALERTS_LIMIT

_alerts_rate_limiter = RateLimiter(max_requests=60, window_seconds=60)

router = APIRouter(dependencies=[Depends(_alerts_rate_limiter)])


def _validate_token(token: object) -> str:
    if not isinstance(token, str):
        raise HTTPException(status_code=400, detail="Invalid alert token")
    token = token.strip()
    if not token or len(token) > 64:
        raise HTTPException(status_code=400, detail="Invalid alert token")
    # Account tokens are derived server-side from a live session (`mm:{email}`).
    # Accepting them from a client header lets anyone impersonate any user.
    if token.lower().startswith("mm:"):
        raise HTTPException(status_code=403, detail="Account tokens cannot be supplied by the client.")
    return token


def _account_alert_token(email: str) -> str:
    # Stable, account-scoped token so alerts follow the Motormila user, not a random browser UUID.
    return f"mm:{email.strip().lower()}"


def _optional_str(value: object) -> Optional[str]:
    return value if isinstance(value, str) else None


def _resolve_alert_identity(
    request: Optional[Request],
    authorization: Optional[str],
    x_alert_token: Optional[str],
    db: Session,
) -> Tuple[str, Optional[dict]]:
    """Prefer authenticated Motormila session; fall back to legacy X-Alert-Token."""
    token = _extract_token(_optional_str(authorization), request)
    payload = verify_token(token) if token else None
    if payload is not None:
        live = resolve_live_session(payload, db)
        return _account_alert_token(live["email"]), live

    alert_token = _optional_str(x_alert_token)
    if not alert_token:
        raise HTTPException(status_code=400, detail="Alert token or signed-in session required.")
    return _validate_token(alert_token), None


def _max_alerts_for(live: Optional[dict]) -> int:
    # Anonymous / legacy-token clients get free-tier caps, never Pro.
    if live is None or is_free_browse_plan(live.get("plan"), role=live.get("role")):
        return FREE_ALERTS_LIMIT
    return PRO_ALERTS_LIMIT


@router.post("", response_model=MarketAlertRead, status_code=201)
def create_alert(
    payload: MarketAlertCreate,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    token, live = _resolve_alert_identity(request, authorization, x_alert_token, db)
    max_alerts = _max_alerts_for(live)
    active_count = (
        db.query(MarketAlert)
        .filter(MarketAlert.user_token == token, MarketAlert.active.is_(True))
        .count()
    )
    if active_count >= max_alerts:
        raise HTTPException(
            status_code=429,
            detail=f"Maximum {max_alerts} active alerts reached for this account.",
        )

    notify_phone = (payload.notify_phone or "").strip() or None
    notify_email = (payload.notify_email or "").strip() or None
    notify_telegram_chat_id = (payload.notify_telegram_chat_id or "").strip() or None
    notify_channels = (payload.notify_channels or "").strip() or None
    delivery_mode = (payload.delivery_mode or "").strip().lower() or None
    if delivery_mode not in (None, "instant", "digest"):
        raise HTTPException(status_code=400, detail="delivery_mode must be 'instant' or 'digest'")
    quiet_hours_enabled = payload.quiet_hours_enabled

    # WhatsApp, email, and Telegram notifications are Pro surfaces — reject
    # free-plan and anonymous/legacy-token attempts even if the client bypasses the UI.
    if live is None or is_free_browse_plan(live.get("plan"), role=live.get("role")):
        if notify_phone:
            raise HTTPException(
                status_code=403,
                detail="WhatsApp alert notifications require a signed-in Pro plan.",
            )
        if notify_email:
            raise HTTPException(
                status_code=403,
                detail="Email alert notifications require a signed-in Pro plan.",
            )
        if notify_telegram_chat_id:
            raise HTTPException(
                status_code=403,
                detail="Telegram alert notifications require a signed-in Pro plan.",
            )
        if notify_channels:
            raise HTTPException(
                status_code=403,
                detail="Multi-channel alert notifications require a signed-in Pro plan.",
            )

    alert = MarketAlert(
        user_token=token,
        make=(payload.make or "").strip() or None,
        model=(payload.model or "").strip() or None,
        max_price=payload.max_price if payload.max_price and payload.max_price > 0 else None,
        district=(payload.district or "").strip() or None,
        notify_phone=notify_phone,
        notify_email=notify_email,
        notify_telegram_chat_id=notify_telegram_chat_id,
        notify_channels=notify_channels,
    )
    # Additive channel-center fields — setattr so legacy DBs without the
    # columns (pre-patch) never break alert creation.
    try:
        alert.delivery_mode = delivery_mode
    except Exception:
        pass
    try:
        alert.quiet_hours_enabled = quiet_hours_enabled
    except Exception:
        pass
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.get("", response_model=List[MarketAlertRead])
def list_alerts(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, _live = _resolve_alert_identity(
        request, authorization, _optional_str(x_alert_token) or _optional_str(token), db
    )
    return (
        db.query(MarketAlert)
        .filter(MarketAlert.user_token == owner, MarketAlert.active.is_(True))
        .order_by(MarketAlert.created_at.desc())
        .all()
    )


@router.delete("/{alert_id}", status_code=204)
def delete_alert(
    alert_id: int,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, _live = _resolve_alert_identity(request, authorization, x_alert_token, db)
    alert = (
        db.query(MarketAlert)
        .filter(MarketAlert.id == alert_id, MarketAlert.user_token == owner)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.active = False
    db.commit()


@router.patch("/{alert_id}/channels", response_model=MarketAlertRead)
def update_alert_channels(
    alert_id: int,
    payload: AlertChannelsUpdate,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    """Channel center: per-alert toggles in-app/email/WhatsApp/push + digest vs instant."""
    owner, _live = _resolve_alert_identity(request, authorization, x_alert_token, db)
    alert = (
        db.query(MarketAlert)
        .filter(MarketAlert.id == alert_id, MarketAlert.user_token == owner)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if payload.channels is not None:
        channels = normalize_channels(payload.channels)
        unknown = {str(c).strip().lower() for c in payload.channels if str(c).strip()} - channels - {""}
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown channels: {', '.join(sorted(unknown))}. "
                f"Supported: {', '.join(SUPPORTED_CHANNELS)}.",
            )
        alert.notify_channels = ",".join(sorted(channels)) if channels else None
    if payload.delivery_mode is not None:
        try:
            alert.delivery_mode = payload.delivery_mode
        except Exception:
            pass
    if payload.quiet_hours_enabled is not None:
        try:
            alert.quiet_hours_enabled = bool(payload.quiet_hours_enabled)
        except Exception:
            pass
    db.commit()
    db.refresh(alert)
    return alert


@router.get("/match", response_model=AlertMatchResponse, operation_id="matchAlertsGet")
def match_alerts_get(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    """GET alias for the alert match read.

    The web client calls /alerts/match with GET while the native app uses POST.
    Serving only POST answered the browser with 405, so the alerts page hung on
    "Loading alerts" and every active alert errored.
    """
    return match_alerts(
        request=request,
        db=db,
        token=token,
        authorization=authorization,
        x_alert_token=x_alert_token,
    )


@router.post("/match", response_model=AlertMatchResponse)
def match_alerts(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, live = _resolve_alert_identity(
        request, authorization, _optional_str(x_alert_token) or _optional_str(token), db
    )
    free_browse = bool(
        live is not None and is_free_browse_plan(live.get("plan"), role=live.get("role"))
    )
    alerts = (
        db.query(MarketAlert)
        .filter(MarketAlert.user_token == owner, MarketAlert.active.is_(True))
        .all()
    )

    results: List[AlertMatchResult] = []
    for alert in alerts:
        q = db.query(CarListing).filter(live_listing_filter())

        if alert.make:
            q = q.filter(CarListing.make.ilike(alert.make))
        if alert.model:
            q = q.filter(CarListing.model.ilike(alert.model))
        if alert.district:
            q = q.filter(CarListing.district.ilike(alert.district))
        if alert.max_price:
            q = q.filter(CarListing.price_lkr <= alert.max_price)

        matching_count = q.count()
        top_listings = (
            q.order_by(CarListing.deal_score.desc())
            .limit(MATCH_LIMIT_PER_ALERT)
            .all()
        )
        results.append(
            AlertMatchResult(
                alert_id=alert.id,
                make=alert.make,
                model=alert.model,
                district=alert.district,
                max_price=float(alert.max_price) if alert.max_price is not None else None,
                matching_count=matching_count,
                listings=[
                    AlertMatchListing(
                        id=row.id,
                        title=row.title,
                        make=row.make,
                        model=row.model,
                        year=row.year,
                        price_lkr=float(row.price_lkr) if row.price_lkr is not None else None,
                        district=row.district,
                        deal_score=(
                            None
                            if free_browse
                            else (float(row.deal_score) if row.deal_score is not None else None)
                        ),
                        thumbnail_url=row.thumbnail_url,
                    )
                    for row in top_listings
                ],
            )
        )

    return AlertMatchResponse(results=results, checked_at=datetime.now(timezone.utc))
