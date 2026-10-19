"""Admin console API — invites, user plans, and platform analytics.

All routes require an authenticated admin (platform_users.role=admin or
AUTH_USERS entry with role=admin).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import (
    ALLOWED_PLANS,
    ALLOWED_ROLES,
    default_subscription_for_plan,
    generate_invite_token,
    invite_expiry,
    require_admin_access,
    resolve_user_record,
)
from app.services.invite_email import try_send_invite_email
from app.services.geo_service import sample_geocode
from app.services.revcardata_pilot import run_pilot
from app.services.providers.health import provider_health
from db.models import (
    CarListing,
    DealerProfile,
    MarketAlert,
    MarketSignal,
    MarketStatsCache,
    PlatformUser,
    ScrapeRun,
    UserFeedback,
    UserInvite,
    VehiclePermit,
    live_listing_filter,
)
from db.schema_patches import heal_platform_users_schema
from db.session import get_db
from app.api.v1.endpoints.pipeline import (
    _launch_background_job,
    reconcile_orphan_running_runs,
)

router = APIRouter()


class InviteCreateRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    plan: str = Field(default="free", max_length=20)
    role: str = Field(default="user", max_length=20)


class UserUpdateRequest(BaseModel):
    plan: Optional[str] = Field(default=None, max_length=20)
    subscription_status: Optional[str] = Field(default=None, max_length=20)
    role: Optional[str] = Field(default=None, max_length=20)
    is_active: Optional[bool] = None
    name: Optional[str] = Field(default=None, max_length=120)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _invite_response(invite: UserInvite, *, email_sent: bool | None = None) -> dict:
    payload = {
        "id": invite.id,
        "email": invite.email,
        "plan": invite.plan,
        "role": invite.role,
        "status": invite.status,
        "token": invite.token,
        "signupPath": f"/sign-up?token={invite.token}",
        "invitedByEmail": invite.invited_by_email,
        "expiresAt": invite.expires_at.isoformat() if invite.expires_at else None,
        "acceptedAt": invite.accepted_at.isoformat() if invite.accepted_at else None,
        "createdAt": invite.created_at.isoformat() if invite.created_at else None,
    }
    if email_sent is not None:
        payload["emailSent"] = email_sent
    return payload


def _dispatch_invite_email(invite: UserInvite, *, invited_by: str) -> bool:
    return try_send_invite_email(
        to_email=invite.email,
        plan=invite.plan,
        token=invite.token,
        invited_by=invited_by,
    )


def _user_row_response(user: PlatformUser) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "plan": user.plan,
        "subscriptionStatus": user.subscription_status,
        "role": user.role,
        "isActive": bool(user.is_active),
        "invitedByEmail": user.invited_by_email,
        "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("/overview", response_model=dict)
def admin_overview(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    del admin  # auth side-effect only
    total_listings = db.query(func.count(CarListing.id)).scalar() or 0
    live_listings = (
        db.query(func.count(CarListing.id)).filter(live_listing_filter()).scalar() or 0
    )
    users_total = db.query(func.count(PlatformUser.id)).scalar() or 0
    users_free = (
        db.query(func.count(PlatformUser.id)).filter(PlatformUser.plan == "free").scalar() or 0
    )
    users_pro = (
        db.query(func.count(PlatformUser.id))
        .filter(PlatformUser.plan.in_(("pro", "enterprise")))
        .scalar()
        or 0
    )
    users_admin = (
        db.query(func.count(PlatformUser.id)).filter(PlatformUser.role == "admin").scalar() or 0
    )
    invites_pending = (
        db.query(func.count(UserInvite.id)).filter(UserInvite.status == "pending").scalar() or 0
    )
    feedback_open = (
        db.query(func.count(UserFeedback.id))
        .filter(UserFeedback.status.in_(("new", "open")))
        .scalar()
        or 0
    )
    dealers_verified = (
        db.query(func.count(DealerProfile.id))
        .filter(DealerProfile.status == "verified")
        .scalar()
        or 0
    )

    recent_scrapes = (
        db.query(ScrapeRun)
        .order_by(ScrapeRun.started_at.desc())
        .limit(8)
        .all()
    )
    scrape_payload = [
        {
            "id": run.id,
            "source": run.source,
            "status": run.status,
            "listingsFound": run.listings_found or 0,
            "listingsNew": run.listings_new or 0,
            "startedAt": run.started_at.isoformat() if run.started_at else None,
            "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
            "errorMessage": run.error_message,
        }
        for run in recent_scrapes
    ]

    top_makes = (
        db.query(CarListing.make, func.count(CarListing.id).label("count"))
        .filter(live_listing_filter())
        .group_by(CarListing.make)
        .order_by(func.count(CarListing.id).desc())
        .limit(8)
        .all()
    )

    return {
        "listings": {
            "total": int(total_listings),
            "live": int(live_listings),
        },
        "users": {
            "total": int(users_total),
            "free": int(users_free),
            "pro": int(users_pro),
            "admins": int(users_admin),
        },
        "invites": {"pending": int(invites_pending)},
        "feedback": {"open": int(feedback_open)},
        "dealers": {"verified": int(dealers_verified)},
        "recentScrapes": scrape_payload,
        "topMakes": [{"make": make, "count": int(count)} for make, count in top_makes],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/users", response_model=dict)
def list_users(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None, max_length=120),
    plan: Optional[str] = Query(default=None, max_length=20),
):
    del admin
    try:
        heal_platform_users_schema(db)
        query = db.query(PlatformUser)
        if q:
            needle = f"%{q.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(PlatformUser.email).like(needle),
                    func.lower(PlatformUser.name).like(needle),
                )
            )
        if plan:
            query = query.filter(PlatformUser.plan == plan.strip().lower())
        total = query.count()
        rows = (
            query.order_by(PlatformUser.created_at.desc()).offset(offset).limit(limit).all()
        )
        return {"total": int(total), "users": [_user_row_response(row) for row in rows]}
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        # One more heal+retry for the common UndefinedColumn race.
        try:
            heal_platform_users_schema(db)
            total = db.query(func.count(PlatformUser.id)).scalar() or 0
            rows = (
                db.query(PlatformUser)
                .order_by(PlatformUser.id.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return {"total": int(total), "users": [_user_row_response(row) for row in rows]}
        except Exception as retry_exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=500,
                detail=f"admin_users_failed: {type(retry_exc).__name__}: {retry_exc}",
            ) from retry_exc


@router.patch("/users/{user_id}", response_model=dict)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    user = db.query(PlatformUser).filter(PlatformUser.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if payload.plan is not None:
        plan = payload.plan.strip().lower()
        if plan not in ALLOWED_PLANS:
            raise HTTPException(status_code=400, detail="Invalid plan.")
        user.plan = plan
        if payload.subscription_status is None:
            user.subscription_status = default_subscription_for_plan(plan)

    if payload.subscription_status is not None:
        status = payload.subscription_status.strip().lower()
        user.subscription_status = status

    if payload.role is not None:
        role = payload.role.strip().lower()
        if role not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role.")
        # Prevent accidental self-demotion lockout when you're the only admin.
        if user.email == admin["email"] and role != "admin":
            other_admins = (
                db.query(func.count(PlatformUser.id))
                .filter(PlatformUser.role == "admin", PlatformUser.id != user.id)
                .scalar()
                or 0
            )
            if other_admins < 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove the last admin role from your own account.",
                )
        user.role = role

    if payload.is_active is not None:
        if user.email == admin["email"] and payload.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own admin account.")
        user.is_active = payload.is_active

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        user.name = name

    # Any privilege / identity change invalidates outstanding sessions.
    user.token_version = int(getattr(user, "token_version", 0) or 0) + 1

    db.commit()
    db.refresh(user)
    return _user_row_response(user)


@router.get("/invites", response_model=dict)
def list_invites(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    del admin
    query = db.query(UserInvite)
    if status:
        query = query.filter(UserInvite.status == status.strip().lower())
    rows = query.order_by(UserInvite.created_at.desc()).limit(limit).all()
    return {"invites": [_invite_response(row) for row in rows]}


@router.post("/invites", response_model=dict)
def create_invite(
    payload: InviteCreateRequest,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    email = _normalize_email(payload.email)
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email address.")

    plan = payload.plan.strip().lower()
    if plan not in ALLOWED_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan.")

    role = payload.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role.")

    existing_user = resolve_user_record(email, db)
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    pending = (
        db.query(UserInvite)
        .filter(UserInvite.email == email, UserInvite.status == "pending")
        .first()
    )
    if pending is not None:
        # Refresh token + plan on re-invite instead of duplicating.
        pending.plan = plan
        pending.role = role
        pending.token = generate_invite_token()
        pending.expires_at = invite_expiry()
        pending.invited_by_email = admin["email"]
        db.commit()
        db.refresh(pending)
        sent = _dispatch_invite_email(pending, invited_by=admin["email"])
        return _invite_response(pending, email_sent=sent)

    invite = UserInvite(
        email=email,
        plan=plan,
        role=role,
        token=generate_invite_token(),
        status="pending",
        invited_by_email=admin["email"],
        expires_at=invite_expiry(),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    sent = _dispatch_invite_email(invite, invited_by=admin["email"])
    return _invite_response(invite, email_sent=sent)


@router.delete("/invites/{invite_id}", response_model=dict)
def revoke_invite(
    invite_id: int,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    del admin
    invite = db.query(UserInvite).filter(UserInvite.id == invite_id).first()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if invite.status == "accepted":
        raise HTTPException(status_code=400, detail="Accepted invites cannot be revoked.")
    invite.status = "revoked"
    db.commit()
    return {"ok": True, "id": invite_id, "status": "revoked"}


# ─── Owner console expansions ───────────────────────────────────────────────


class FeedbackUpdateRequest(BaseModel):
    status: str = Field(..., min_length=2, max_length=20)


class PermitUpsertRequest(BaseModel):
    permit_name: str = Field(..., min_length=2, max_length=100)
    permit_type: str = Field(..., min_length=2, max_length=50)
    market_price_lkr: float = Field(..., ge=0)


class PipelineTriggerBody(BaseModel):
    job: str = Field(default="sync", max_length=40)


def _feedback_row(row: UserFeedback) -> dict:
    return {
        "id": row.id,
        "category": row.category,
        "route": row.route,
        "message": row.message,
        "email": row.email,
        "status": row.status,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def _dealer_row(row: DealerProfile) -> dict:
    return {
        "id": row.id,
        "displayName": row.display_name,
        "contactPhone": row.contact_phone,
        "contactEmail": row.contact_email,
        "sellerNamePattern": row.seller_name_pattern,
        "claimedUrl": row.claimed_url,
        "status": row.status,
        "plan": row.plan,
        "subscriptionStatus": row.subscription_status,
        "verifiedAt": row.verified_at.isoformat() if row.verified_at else None,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/analytics", response_model=dict)
def admin_analytics(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """Detailed owner analytics across listings, users, alerts, signals, scrapes."""
    del admin
    now = datetime.now(timezone.utc)

    listings_by_source = (
        db.query(CarListing.source, func.count(CarListing.id))
        .filter(live_listing_filter())
        .group_by(CarListing.source)
        .order_by(func.count(CarListing.id).desc())
        .limit(20)
        .all()
    )
    listings_by_district = (
        db.query(CarListing.district, func.count(CarListing.id))
        .filter(live_listing_filter(), CarListing.district.isnot(None))
        .group_by(CarListing.district)
        .order_by(func.count(CarListing.id).desc())
        .limit(15)
        .all()
    )
    price_stats = (
        db.query(
            func.avg(CarListing.price_lkr),
            func.min(CarListing.price_lkr),
            func.max(CarListing.price_lkr),
        )
        .filter(live_listing_filter(), CarListing.price_lkr.isnot(None))
        .one()
    )
    users_by_plan = (
        db.query(PlatformUser.plan, func.count(PlatformUser.id))
        .group_by(PlatformUser.plan)
        .all()
    )
    users_by_status = (
        db.query(PlatformUser.subscription_status, func.count(PlatformUser.id))
        .group_by(PlatformUser.subscription_status)
        .all()
    )
    recent_signups = (
        db.query(func.count(PlatformUser.id))
        .filter(PlatformUser.created_at >= now.replace(hour=0, minute=0, second=0, microsecond=0))
        .scalar()
        or 0
    )
    active_alerts = (
        db.query(func.count(MarketAlert.id)).filter(MarketAlert.active.is_(True)).scalar() or 0
    )
    alerts_with_whatsapp = (
        db.query(func.count(MarketAlert.id))
        .filter(MarketAlert.active.is_(True), MarketAlert.notify_phone.isnot(None))
        .scalar()
        or 0
    )
    signals_total = db.query(func.count(MarketSignal.id)).scalar() or 0
    signals_by_source = (
        db.query(MarketSignal.source, func.count(MarketSignal.id))
        .group_by(MarketSignal.source)
        .order_by(func.count(MarketSignal.id).desc())
        .limit(12)
        .all()
    )
    scrape_success = (
        db.query(func.count(ScrapeRun.id))
        .filter(ScrapeRun.status == "SUCCESS")
        .scalar()
        or 0
    )
    scrape_failed = (
        db.query(func.count(ScrapeRun.id))
        .filter(ScrapeRun.status == "FAILED")
        .scalar()
        or 0
    )
    invite_stats = (
        db.query(UserInvite.status, func.count(UserInvite.id)).group_by(UserInvite.status).all()
    )
    feedback_by_status = (
        db.query(UserFeedback.status, func.count(UserFeedback.id))
        .group_by(UserFeedback.status)
        .all()
    )
    dealers_by_status = (
        db.query(DealerProfile.status, func.count(DealerProfile.id))
        .group_by(DealerProfile.status)
        .all()
    )
    inactive_users = (
        db.query(func.count(PlatformUser.id)).filter(PlatformUser.is_active.is_(False)).scalar() or 0
    )
    never_logged_in = (
        db.query(func.count(PlatformUser.id)).filter(PlatformUser.last_login_at.is_(None)).scalar()
        or 0
    )

    return {
        "listings": {
            "bySource": [{"source": s or "unknown", "count": int(c)} for s, c in listings_by_source],
            "byDistrict": [
                {"district": d or "unknown", "count": int(c)} for d, c in listings_by_district
            ],
            "avgPriceLkr": float(price_stats[0] or 0),
            "minPriceLkr": float(price_stats[1] or 0),
            "maxPriceLkr": float(price_stats[2] or 0),
        },
        "users": {
            "byPlan": [{"plan": p or "unknown", "count": int(c)} for p, c in users_by_plan],
            "bySubscription": [
                {"status": s or "unknown", "count": int(c)} for s, c in users_by_status
            ],
            "signupsToday": int(recent_signups),
            "inactive": int(inactive_users),
            "neverLoggedIn": int(never_logged_in),
        },
        "alerts": {
            "active": int(active_alerts),
            "withWhatsapp": int(alerts_with_whatsapp),
        },
        "signals": {
            "total": int(signals_total),
            "bySource": [{"source": s or "unknown", "count": int(c)} for s, c in signals_by_source],
        },
        "scrapes": {
            "success": int(scrape_success),
            "failed": int(scrape_failed),
        },
        "invites": [{"status": s or "unknown", "count": int(c)} for s, c in invite_stats],
        "feedback": [{"status": s or "unknown", "count": int(c)} for s, c in feedback_by_status],
        "dealers": [{"status": s or "unknown", "count": int(c)} for s, c in dealers_by_status],
        "generatedAt": now.isoformat(),
    }


@router.get("/feedback", response_model=dict)
def list_feedback(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    del admin
    query = db.query(UserFeedback)
    if status:
        query = query.filter(UserFeedback.status == status.strip().lower())
    rows = query.order_by(UserFeedback.created_at.desc()).limit(limit).all()
    return {"feedback": [_feedback_row(row) for row in rows]}


@router.patch("/feedback/{feedback_id}", response_model=dict)
def update_feedback(
    feedback_id: int,
    payload: FeedbackUpdateRequest,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    del admin
    row = db.query(UserFeedback).filter(UserFeedback.id == feedback_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Feedback not found.")
    status = payload.status.strip().lower()
    if status not in {"new", "open", "triaged", "resolved", "closed", "spam"}:
        raise HTTPException(status_code=400, detail="Invalid feedback status.")
    row.status = status
    db.commit()
    db.refresh(row)
    return _feedback_row(row)


@router.get("/dealers", response_model=dict)
def list_dealers(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    del admin
    query = db.query(DealerProfile)
    if status:
        query = query.filter(DealerProfile.status == status.strip().lower())
    rows = query.order_by(DealerProfile.created_at.desc()).limit(limit).all()
    return {"dealers": [_dealer_row(row) for row in rows]}


@router.post("/dealers/{dealer_id}/verify", response_model=dict)
def verify_dealer(
    dealer_id: int,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    del admin
    row = db.query(DealerProfile).filter(DealerProfile.id == dealer_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Dealer not found.")
    row.status = "verified"
    row.verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _dealer_row(row)


# ── User-listing moderation queue ─────────────────────────────────────────


class ListingModerationRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


def _moderation_row(row: CarListing) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "make": row.make,
        "model": row.model,
        "year": row.year,
        "priceLkr": float(row.price_lkr) if row.price_lkr is not None else None,
        "district": row.district,
        "status": row.user_listing_status,
        "isActive": bool(row.is_active),
        "owner": row.owner_user_id,
        "contactName": row.contact_name,
        "contactPhone": row.contact_phone,
        "description": row.description,
        "images": row.user_images,
        "createdAt": row.first_seen_at.isoformat() if row.first_seen_at else None,
        "updatedAt": row.content_updated_at.isoformat() if row.content_updated_at else None,
    }


def _user_listing_or_404(db: Session, listing_id: int) -> CarListing:
    row = (
        db.query(CarListing)
        .filter(CarListing.id == listing_id, CarListing.source == "motormila_user")
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="User listing not found.")
    return row


@router.get("/listings/moderation", response_model=dict)
def list_moderation_queue(
    status: str = Query(default="pending", max_length=20),
    limit: int = Query(default=50, ge=1, le=200),
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """User-submitted listings awaiting review (or any given status)."""
    del admin
    query = db.query(CarListing).filter(CarListing.source == "motormila_user")
    if status != "all":
        query = query.filter(CarListing.user_listing_status == status)
    rows = query.order_by(CarListing.first_seen_at.asc()).limit(limit).all()
    return {"items": [_moderation_row(r) for r in rows], "count": len(rows)}


@router.post("/listings/{listing_id}/approve", response_model=dict)
def approve_user_listing(
    listing_id: int,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """Publish a pending user listing into the live market."""
    del admin
    row = _user_listing_or_404(db, listing_id)
    if row.user_listing_status == "removed":
        raise HTTPException(status_code=409, detail="Listing was removed by its owner.")
    row.user_listing_status = "published"
    row.is_active = True
    row.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _moderation_row(row)


@router.post("/listings/{listing_id}/reject", response_model=dict)
def reject_user_listing(
    listing_id: int,
    payload: Optional[ListingModerationRequest] = None,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """Reject (or unpublish) a user listing; it goes back to the owner as draft."""
    del admin
    row = _user_listing_or_404(db, listing_id)
    row.user_listing_status = "draft"
    row.is_active = False
    db.commit()
    db.refresh(row)
    result = _moderation_row(row)
    result["reason"] = payload.reason if payload else None
    return result


@router.get("/pipeline", response_model=dict)
def admin_pipeline(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
    limit: int = Query(default=40, ge=1, le=200),
):
    """Scrape runs with full error text (session admin — no X-Admin-Key needed)."""
    del admin
    orphans = reconcile_orphan_running_runs(db)
    runs = db.query(ScrapeRun).order_by(ScrapeRun.started_at.desc()).limit(limit).all()
    return {
        "orphansReconciled": orphans,
        "runs": [
            {
                "id": run.id,
                "source": run.source,
                "status": run.status,
                "listingsFound": run.listings_found or 0,
                "listingsNew": run.listings_new or 0,
                "startedAt": run.started_at.isoformat() if run.started_at else None,
                "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
                "errorMessage": run.error_message,
            }
            for run in runs
        ],
    }


@router.post("/pipeline/trigger", response_model=dict)
def admin_trigger_pipeline(
    payload: PipelineTriggerBody,
    admin: dict = Depends(require_admin_access),
):
    """Session-admin scrape trigger (owner console)."""
    job = payload.job.strip().lower()
    if job not in {"sync", "alt_sync"}:
        raise HTTPException(status_code=400, detail="job must be sync or alt_sync.")
    try:
        result = _launch_background_job(job)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to launch job: {exc}") from exc
    return {"ok": True, "triggeredBy": admin["email"], **result}


@router.post("/enrichment/problemsbyvin", response_model=dict)
def admin_ingest_problemsbyvin(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """Download weekly ProblemsByVin datasets into local snapshots."""
    from app.services.problemsbyvin import ingest_datasets

    result = ingest_datasets(db)
    return {"ok": result.get("status") == "success", "triggeredBy": admin["email"], **result}


@router.post("/enrichment/openchargemap", response_model=dict)
def admin_ingest_openchargemap(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """Refresh the Sri Lanka Open Charge Map cache."""
    from app.services.openchargemap import ingest_lk_stations

    result = ingest_lk_stations(db)
    return {"ok": result.get("status") == "success", "triggeredBy": admin["email"], **result}


@router.post("/enrichment/geoapify", response_model=dict)
def admin_sample_geoapify(
    limit: int = Query(default=100, ge=1, le=100),
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """Geocode a live sample of listings. Does not overwrite raw_location."""
    result = sample_geocode(db, limit=limit)
    ok = result.get("status") in {"success", "partial", "skipped"}
    return {"ok": ok, "triggeredBy": admin["email"], **result}


@router.post("/enrichment/revcardata", response_model=dict)
def admin_revcardata_pilot(
    popular_n: int = Query(default=50, ge=0, le=50),
    hard_n: int = Query(default=50, ge=0, le=50),
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """100-record match-rate pilot. Does not write MSRP into LKR FMV."""
    result = run_pilot(db, popular_n=popular_n, hard_n=hard_n)
    ok = result.get("status") in {"success", "skipped"}
    return {"ok": ok, "triggeredBy": admin["email"], **result}


@router.get("/permits", response_model=dict)
def list_permits_admin(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    del admin
    rows = db.query(VehiclePermit).order_by(VehiclePermit.market_price_lkr.desc()).all()
    return {
        "permits": [
            {
                "id": row.id,
                "permitName": row.permit_name,
                "permitType": row.permit_type,
                "marketPriceLkr": float(row.market_price_lkr or 0),
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    }


@router.post("/permits", response_model=dict)
def upsert_permit_admin(
    payload: PermitUpsertRequest,
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    del admin
    permit = (
        db.query(VehiclePermit).filter(VehiclePermit.permit_name == payload.permit_name).first()
    )
    if permit:
        permit.permit_type = payload.permit_type
        permit.market_price_lkr = payload.market_price_lkr
    else:
        permit = VehiclePermit(
            permit_name=payload.permit_name,
            permit_type=payload.permit_type,
            market_price_lkr=payload.market_price_lkr,
        )
        db.add(permit)
    db.commit()
    db.refresh(permit)
    return {
        "id": permit.id,
        "permitName": permit.permit_name,
        "permitType": permit.permit_type,
        "marketPriceLkr": float(permit.market_price_lkr or 0),
        "updatedAt": permit.updated_at.isoformat() if permit.updated_at else None,
    }


@router.delete("/cache", response_model=dict)
def clear_stats_cache(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
    key: Optional[str] = Query(default=None, description="Optional single cache_key to delete"),
):
    """Force-refresh market stats by clearing the TTL cache."""
    cleared_by = admin.get("email")
    query = db.query(MarketStatsCache)
    if key:
        query = query.filter(MarketStatsCache.cache_key == key.strip())
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": int(deleted), "clearedBy": cleared_by}


@router.get("/system", response_model=dict)
def admin_system(
    admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    """Owner security / config snapshot (no secret values)."""

    def _flag(name: str, default: str = "true") -> bool:
        return os.getenv(name, default).strip().lower() not in {"0", "false", "no", "off"}

    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    cache_keys = [row.cache_key for row in db.query(MarketStatsCache).all()]

    return {
        "adminEmail": admin.get("email"),
        "databaseOk": db_ok,
        "flags": {
            "appAccessEnforced": _flag("APP_ACCESS_ENFORCED", "true"),
            "proAccessEnforced": _flag("PRO_ACCESS_ENFORCED", "true"),
            "adminApiKeyConfigured": bool(os.getenv("ADMIN_API_KEY", "").strip()),
            "billingWebhookConfigured": bool(os.getenv("BILLING_WEBHOOK_SECRET", "").strip()),
            "b2bKeysConfigured": bool(os.getenv("B2B_API_KEYS", "").strip()),
            "resendConfigured": bool(os.getenv("RESEND_API_KEY", "").strip()),
            "twilioConfigured": bool(os.getenv("TWILIO_ACCOUNT_SID", "").strip()),
            "telegramConfigured": bool(os.getenv("TELEGRAM_BOT_TOKEN", "").strip()),
            "emailAlertConfigured": bool(
                os.getenv("RESEND_API_KEY", "").strip() or os.getenv("SMTP_HOST", "").strip()
            ),
            "dealerAdminTokenConfigured": bool(os.getenv("DEALER_ADMIN_TOKEN", "").strip()),
            "publicAppOrigin": os.getenv("PUBLIC_APP_ORIGIN", "").strip() or None,
        },
        "statsCacheKeys": cache_keys,
        "providers": provider_health(db),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
