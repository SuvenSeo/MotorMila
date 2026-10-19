"""In-app notification endpoints.

Notifications are created by the alert matcher when new matches are found.
Each notification belongs to a user token (same identity as market alerts).
"""

from datetime import datetime
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import (
    _extract_token,
    resolve_live_session,
    verify_token,
)
from app.services.rate_limit import RateLimiter
from app.utils.channel_center import (
    DIGEST_TIME_LABEL,
    QUIET_END_HOUR,
    QUIET_START_HOUR,
    SUPPORTED_CHANNELS,
    TIMEZONE_NAME,
)
from app.utils.notify_push import (
    PUSH_TOPIC_BACK_IN_STOCK,
    PUSH_TOPIC_PRICE_DROPS,
    push_notify_configured,
    vapid_public_key,
)
from app.utils.user_notifications import record_alert_match_notification
from db.models import UserNotification
from db.session import get_db

# Re-export for tests/callers that import from this module.
__all__ = [
    "list_notifications",
    "mark_notification_read",
    "mark_all_read",
    "get_preferences",
    "subscribe_push",
    "unsubscribe_push",
    "list_deliveries",
    "record_alert_match_notification",
    "router",
]

_notif_rate_limiter = RateLimiter(max_requests=120, window_seconds=60)

router = APIRouter(dependencies=[Depends(_notif_rate_limiter)])

NOTIFICATION_LIST_LIMIT = 50


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_token: str
    title: str
    body: Optional[str]
    link: Optional[str]
    read: bool
    created_at: datetime


def _optional_str(value: object) -> Optional[str]:
    return value if isinstance(value, str) else None


def _account_alert_token(email: str) -> str:
    return f"mm:{email.strip().lower()}"


def _validate_legacy_token(token: str) -> str:
    token = token.strip()
    if not token or len(token) > 64:
        raise HTTPException(status_code=400, detail="Invalid alert token")
    # Account tokens are derived server-side (`mm:{email}`). Accepting them
    # from a client header lets anyone impersonate any user's inbox.
    if token.lower().startswith("mm:"):
        raise HTTPException(status_code=403, detail="Account tokens cannot be supplied by the client.")
    return token


def _resolve_notification_identity(
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
    return _validate_legacy_token(alert_token), None


@router.get("", response_model=List[NotificationRead])
def list_notifications(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, _live = _resolve_notification_identity(request, authorization, x_alert_token, db)
    return (
        db.query(UserNotification)
        .filter(UserNotification.user_token == owner)
        .order_by(UserNotification.created_at.desc(), UserNotification.id.desc())
        .limit(NOTIFICATION_LIST_LIMIT)
        .all()
    )


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_notification_read(
    notification_id: int,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, _live = _resolve_notification_identity(request, authorization, x_alert_token, db)
    notif = (
        db.query(UserNotification)
        .filter(UserNotification.id == notification_id, UserNotification.user_token == owner)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    db.commit()
    db.refresh(notif)
    return notif


@router.get("/preferences", response_model=dict)
def get_preferences(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    """Channel center metadata: quiet hours, digest slot, push readiness."""
    _resolve_notification_identity(request, authorization, x_alert_token, db)
    return {
        "channels": list(SUPPORTED_CHANNELS),
        "quiet_hours": {
            "start": QUIET_START_HOUR,
            "end": QUIET_END_HOUR,
            "tz": TIMEZONE_NAME,
            "note": "External channels queue during 21:00-07:00 Asia/Colombo; in-app always delivers.",
        },
        "digest_time": DIGEST_TIME_LABEL,
        "delivery_modes": ["instant", "digest"],
        "push_configured": push_notify_configured(),
        "vapid_public_key": vapid_public_key(),
        "topics": [PUSH_TOPIC_PRICE_DROPS, PUSH_TOPIC_BACK_IN_STOCK, "alert-match"],
    }


class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: Optional[str] = None
    auth: Optional[str] = None


class PushUnsubscribeIn(BaseModel):
    endpoint: str


@router.post("/push/subscribe", response_model=dict)
def subscribe_push(
    payload: PushSubscribeIn,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    """Store a VAPID push subscription. Secrets-gated: works even when VAPID
    keys are missing (push simply stays dormant, in-app fail-open)."""
    owner, _live = _resolve_notification_identity(request, authorization, x_alert_token, db)
    endpoint = (payload.endpoint or "").strip()
    if not endpoint or len(endpoint) > 2000 or not endpoint.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid push endpoint")
    try:
        from db.models import PushSubscription

        existing = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
        if existing is None:
            db.add(
                PushSubscription(
                    user_token=owner,
                    endpoint=endpoint,
                    p256dh=(payload.p256dh or "").strip() or None,
                    auth=(payload.auth or "").strip() or None,
                )
            )
        else:
            existing.user_token = owner
            if payload.p256dh:
                existing.p256dh = payload.p256dh.strip()
            if payload.auth:
                existing.auth = payload.auth.strip()
        db.commit()
    except HTTPException:
        raise
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        # Fail open: subscription storage never blocks the UI.
    return {"subscribed": True, "push_configured": push_notify_configured()}


@router.post("/push/unsubscribe", response_model=dict)
def unsubscribe_push(
    payload: PushUnsubscribeIn,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, _live = _resolve_notification_identity(request, authorization, x_alert_token, db)
    try:
        from db.models import PushSubscription

        db.query(PushSubscription).filter(
            PushSubscription.endpoint == (payload.endpoint or "").strip(),
            PushSubscription.user_token == owner,
        ).delete()
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return {"subscribed": False}


@router.get("/deliveries", response_model=list)
def list_deliveries(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
    limit: int = 50,
):
    """Delivery receipts for this owner's alerts (dedupe_key alert:listing:channel)."""
    owner, _live = _resolve_notification_identity(request, authorization, x_alert_token, db)
    try:
        from db.models import MarketAlert, NotificationDeliveryLog

        owned_ids = [
            row.id
            for row in db.query(MarketAlert.id).filter(MarketAlert.user_token == owner).all()
        ]
        if not owned_ids:
            return []
        rows = (
            db.query(NotificationDeliveryLog)
            .filter(NotificationDeliveryLog.alert_id.in_(owned_ids))
            .order_by(NotificationDeliveryLog.id.desc())
            .limit(max(1, min(int(limit or 50), 200)))
            .all()
        )
        return [
            {
                "dedupe_key": row.dedupe_key,
                "alert_id": row.alert_id,
                "listing_id": row.listing_id,
                "channel": row.channel,
                "status": row.status,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    except Exception:
        return []


@router.post("/read-all", response_model=dict)
def mark_all_read(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    x_alert_token: Optional[str] = Header(default=None, alias="X-Alert-Token"),
):
    owner, _live = _resolve_notification_identity(request, authorization, x_alert_token, db)
    updated = (
        db.query(UserNotification)
        .filter(UserNotification.user_token == owner, UserNotification.read.is_(False))
        .update({"read": True})
    )
    db.commit()
    return {"marked_read": updated}
