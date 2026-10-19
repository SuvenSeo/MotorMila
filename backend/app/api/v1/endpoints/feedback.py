import os

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.models.schemas import FeedbackCreate, FeedbackRead
from app.services.invite_email import try_send_waitlist_confirmation
from app.services.rate_limit import RateLimiter
from db.models import UserFeedback
from db.session import get_db

router = APIRouter()

ALLOWED_CATEGORIES = {"bug", "idea", "data", "ux", "general"}
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 5

_feedback_rate_limiter = RateLimiter(
    max_requests=RATE_LIMIT_MAX_REQUESTS,
    window_seconds=RATE_LIMIT_WINDOW_SECONDS,
    message="Too many feedback submissions. Try again shortly.",
)


@router.post("", response_model=FeedbackRead, status_code=201)
def create_feedback(payload: FeedbackCreate, request: Request, db: Session = Depends(get_db)):
    _feedback_rate_limiter(request)
    category = payload.category.strip().lower()
    if category not in ALLOWED_CATEGORIES:
        category = "general"

    feedback_data = {
        "category": category,
        "route": (payload.route or "").strip()[:500] or None,
        "message": payload.message.strip(),
        "email": (payload.email or "").strip()[:255] or None,
        "user_agent": (request.headers.get("user-agent") or "").strip()[:500] or None,
    }

    # Try DB write; if DB is down, fall back to file log so the
    # waitlist/password-reset flows keep working (degraded mode).
    try:
        feedback = UserFeedback(**feedback_data)
        db.add(feedback)
        db.commit()
        db.refresh(feedback)
    except Exception as exc:
        # DB unavailable — log to file for manual recovery
        import datetime
        import json as _json
        fallback_path = os.getenv("FEEDBACK_FALLBACK_PATH", "/tmp/feedback_fallback.jsonl")
        try:
            with open(fallback_path, "a") as f:
                f.write(_json.dumps({
                    **feedback_data,
                    "created_at": datetime.datetime.utcnow().isoformat(),
                    "fallback_reason": str(exc)[:200],
                }) + "\n")
        except Exception:
            pass
        # Return a synthetic receipt so the client sees success
        from app.models.schemas import FeedbackRead as _FR
        import datetime as _dt
        return _FR(
            id=0,
            category=feedback_data["category"],
            route=feedback_data["route"],
            status="queued",
            created_at=_dt.datetime.utcnow(),
        )

    # Mobile-app launch-list signups get a best-effort confirmation email
    # (Resend when configured; silently skipped otherwise).
    if (
        category == "idea"
        and (payload.route or "").strip() == "/mobile-app"
        and feedback.email
        and os.getenv("MOBILE_WAITLIST_EMAIL_ENABLED", "true").strip().lower() == "true"
    ):
        try_send_waitlist_confirmation(to_email=feedback.email)

    return feedback

    return feedback
