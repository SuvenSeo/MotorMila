from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.utils.price_verdict import plausible_deal_score
from app.api.v1.endpoints.auth import (
    _extract_token,
    resolve_live_session,
    verify_token,
)
from app.models.schemas import (
    AlertActiveUpdate,
    AlertChannelsUpdate,
    AlertMatchListing,
    AlertMatchResponse,
    AlertMatchResult,
    MarketAlertCreate,
    MarketAlertRead,
)
from app.utils.channel_center import normalize_channels
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


def _require_alert_capacity(db: Session, token: str, live: Optional[dict]) -> None:
    # Serialize creates and resumes against the same PostgreSQL owner cap,
    # including first creation where there is no alert row to lock yet.
    if db.get_bind(MarketAlert).dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                   {"key": f"market_alerts:{token}"})
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


def _owner_rules(db: Session, owner: str):
    return db.query(MarketAlert).filter(
        MarketAlert.user_token == owner,
        or_(MarketAlert.active.is_(True), MarketAlert.paused_at.is_not(None)),
    )


def _delivery_settings(live, *, channels, phone, email, chat_id):
    """Resolve the channel selection and email destination before any mutation.

    NULL is the legacy infer-from-destinations contract. An explicit selection
    must be nonempty; clearing it to NULL would silently enable other channels.
    """
    try:
        selected = normalize_channels(channels, strict=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    free = live is None or is_free_browse_plan(live.get("plan"), role=live.get("role"))
    if free and (phone or chat_id or selected - {"inapp", "email", "push"}):
        raise HTTPException(status_code=403, detail="WhatsApp and Telegram require a signed-in Pro plan.")

    if email or "email" in selected:
        # resolve_live_session has already checked mailbox verification and revocation.
        if not live or (free and email and email.lower() != live["email"].lower()):
            raise HTTPException(status_code=403, detail="Free email alerts require the verified account address.")
        email = live["email"] if free or not email else email
    return (",".join(sorted(selected)) if selected else None), email


@router.post("", response_model=MarketAlertRead, status_code=201)
def create_alert(
    payload: MarketAlertCreate,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    token, live = _resolve_alert_identity(request, authorization, x_alert_token, db)
    _require_alert_capacity(db, token, live)

    notify_phone = payload.notify_phone
    notify_telegram_chat_id = payload.notify_telegram_chat_id
    notify_channels, notify_email = _delivery_settings(
        live, channels=payload.notify_channels, phone=notify_phone,
        email=payload.notify_email, chat_id=notify_telegram_chat_id,
    )
    delivery_mode = payload.delivery_mode
    quiet_hours_enabled = payload.quiet_hours_enabled

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
    include_paused: bool = False,
):
    owner, _live = _resolve_alert_identity(
        request, authorization, _optional_str(x_alert_token) or _optional_str(token), db
    )
    rules = _owner_rules(db, owner)
    if not include_paused:
        rules = rules.filter(MarketAlert.active.is_(True))
    return rules.order_by(MarketAlert.created_at.desc()).all()


@router.patch("/{alert_id}", response_model=MarketAlertRead, include_in_schema=False)
@router.patch("/{alert_id}/active", response_model=MarketAlertRead)
def set_alert_active(
    alert_id: int,
    payload: AlertActiveUpdate,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, live = _resolve_alert_identity(request, authorization, x_alert_token, db)
    alert = _owner_rules(db, owner).filter(MarketAlert.id == alert_id).with_for_update().first()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.active != payload.active:
        if payload.active:
            _require_alert_capacity(db, owner, live)
            # A rule paused on a paid plan cannot resume paid routing after a downgrade.
            alert.notify_channels, alert.notify_email = _delivery_settings(
                live, channels=alert.notify_channels, phone=alert.notify_phone,
                email=alert.notify_email, chat_id=alert.notify_telegram_chat_id,
            )
        alert.active = payload.active
        alert.paused_at = None if payload.active else datetime.now(timezone.utc)
    db.commit()
    db.refresh(alert)
    return alert


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
        .with_for_update()
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.active = False
    alert.paused_at = None
    db.commit()


@router.put("/{alert_id}", response_model=MarketAlertRead)
def update_alert(
    alert_id: int,
    payload: MarketAlertCreate,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    """Edit an alert in place (same id, same created_at, match history kept).

    Full replacement of the criteria (make/model/max_price/district) and the
    notify targets, same validation and Pro gates as create. delivery_mode /
    quiet_hours_enabled change only when sent. Replaces the old client-side
    delete-then-create edit, which lost the alert when the create failed.
    """
    owner, live = _resolve_alert_identity(request, authorization, x_alert_token, db)
    alert = _owner_rules(db, owner).filter(MarketAlert.id == alert_id).with_for_update().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    notify_phone = payload.notify_phone
    notify_telegram_chat_id = payload.notify_telegram_chat_id
    notify_channels, notify_email = _delivery_settings(
        live, channels=payload.notify_channels, phone=notify_phone,
        email=payload.notify_email, chat_id=notify_telegram_chat_id,
    )

    alert.make = (payload.make or "").strip() or None
    alert.model = (payload.model or "").strip() or None
    alert.max_price = payload.max_price if payload.max_price and payload.max_price > 0 else None
    alert.district = (payload.district or "").strip() or None
    alert.notify_phone = notify_phone
    alert.notify_email = notify_email
    alert.notify_telegram_chat_id = notify_telegram_chat_id
    alert.notify_channels = notify_channels
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
    owner, live = _resolve_alert_identity(request, authorization, x_alert_token, db)
    alert = _owner_rules(db, owner).filter(MarketAlert.id == alert_id).with_for_update().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if payload.channels is not None:
        alert.notify_channels, alert.notify_email = _delivery_settings(
            live, channels=payload.channels, phone=alert.notify_phone,
            email=alert.notify_email, chat_id=alert.notify_telegram_chat_id,
        )
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
                            else plausible_deal_score(row)
                        ),
                        thumbnail_url=row.thumbnail_url,
                    )
                    for row in top_listings
                ],
            )
        )

    return AlertMatchResponse(results=results, checked_at=datetime.now(timezone.utc))
