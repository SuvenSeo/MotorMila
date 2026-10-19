from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import _extract_token, resolve_live_session, verify_token
from app.models.schemas import AnalyticsEventCreate, AnalyticsEventRead
from app.services.rate_limit import RateLimiter
from db.models import AnalyticsEvent
from db.session import get_db

router = APIRouter()

# Tight rate limit: 60 events/min per client. Public endpoint used for funnel
# tracking (page views from anonymous users), so no auth required for the
# analytics write itself. Nudges require a signed-in session (see below).
_events_rate_limiter = RateLimiter(
    max_requests=60,
    window_seconds=60,
    message="Too many analytics events. Try again shortly.",
)

# Credential-like keys must never be persisted: they are session/alert bearer
# tokens and would turn analytics_events into an impersonation oracle.
_CREDENTIAL_KEYS = frozenset({
    "user_token", "alert_token", "token", "owner_token",
    "authorization", "auth_token", "session_token", "access_token", "api_key",
})


def _sanitize_properties(properties: object) -> Optional[dict]:
    """Drop credential keys and cap free-form depth before persisting."""
    if not isinstance(properties, dict):
        return None
    clean: dict = {}
    for key, value in properties.items():
        key_str = str(key)
        if key_str.lower() in _CREDENTIAL_KEYS:
            continue
        if key_str.lower().endswith("_token") or key_str.lower().endswith("_key"):
            continue
        if isinstance(value, str):
            clean[key_str] = value[:300]
        elif isinstance(value, (int, float, bool)) or value is None:
            clean[key_str] = value
        elif isinstance(value, list):
            clean[key_str] = [str(v)[:80] for v in value[:20]]
        elif isinstance(value, dict):
            # Nested objects are flattened to strings to avoid PII sinks.
            clean[key_str] = str(value)[:300]
        else:
            clean[key_str] = str(value)[:300]
    return clean or None


@router.post("", response_model=AnalyticsEventRead, status_code=201)
def record_event(
    payload: AnalyticsEventCreate,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    _events_rate_limiter(request)
    clean_props = _sanitize_properties(payload.properties)
    event = AnalyticsEvent(
        event=payload.event.strip(),
        properties=clean_props,
        session_id=(payload.session_id or "").strip()[:64] or None,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    # Minimal product-signal nudges. Identity is taken ONLY from a verified
    # session — never from client-supplied properties (injection vector).
    try:
        nudge_owner = _resolve_nudge_owner(request, authorization, db)
        if nudge_owner:
            _maybe_emit_nudge(
                db,
                event_name=event.event,
                properties=clean_props,
                owner=nudge_owner,
            )
    except Exception:
        pass
    return event


def _resolve_nudge_owner(request: Optional[Request], authorization: Optional[str], db: Session) -> Optional[str]:
    token = _extract_token(authorization, request)
    payload = verify_token(token) if token else None
    if payload is None:
        return None
    live = resolve_live_session(payload, db)
    return f"mm:{live['email'].strip().lower()}"


_NUDGE_EVENTS = frozenset({"saved_search", "listing_view", "alert_created"})


def _maybe_emit_nudge(db: Session, *, event_name: str, properties: object, owner: str):
    """Create a lightweight in-app nudge for key product signals.

    - alert_created / saved_search -> "watch armed" confirmation nudge.
    - listing_view with price_drop/back_in_stock flags -> price-drop nudge.
    Copy is entirely server-generated; client nudge_body is ignored.
    Deduped via notification_delivery_log (alert:listing:inapp); always
    fail-open to a plain in-app row when the log table is unavailable.
    """
    name = str(event_name or "").strip()
    if name not in _NUDGE_EVENTS:
        return None
    props = properties if isinstance(properties, dict) else {}
    token = owner

    listing_id = props.get("listing_id") if isinstance(props, dict) else None
    try:
        listing_id_int = int(listing_id) if listing_id is not None else 0
    except (TypeError, ValueError):
        listing_id_int = 0

    if name == "listing_view":
        is_drop = bool(props.get("price_drop") or props.get("price_drop_pct"))
        is_back = bool(props.get("back_in_stock") or props.get("is_back"))
        if not (is_drop or is_back):
            return None
        title = "Price drop on a car you viewed" if is_drop else "Back in stock: a car you viewed"
        # Server-fixed copy only — client nudge_body is never trusted.
        body = "Tap to see the latest price."
        link = f"/listing/{listing_id_int}" if listing_id_int else "/alerts"
    else:
        label = str(props.get("label") or props.get("make") or "your search").strip()[:80]
        title = f"Watch armed for {label}" if label else "Watch armed"
        body = "We'll ping your channels when new matches land. In-app always delivers."
        link = "/alerts"

    try:
        from app.utils.channel_center import check_and_record_delivery, dedupe_key
        from db.models import UserNotification

        key = dedupe_key(f"nudge-{name}", listing_id_int, "inapp")
        if not check_and_record_delivery(
            db, key=key, alert_id=None, listing_id=listing_id_int or None,
            channel="inapp", status="sent",
        ):
            return None
        notif = UserNotification(
            user_token=token,
            title=title[:200],
            body=body,
            link=link,
            read=False,
            created_at=datetime.now(timezone.utc),
        )
        db.add(notif)
        db.commit()
        return notif
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None
