"""Takedown/removal and account-deletion requests.

``POST /api/v1/legal/removal``           listing/photo/personal-data removal (72h SLA)
``POST /api/v1/legal/account-deletion``  delete my MotorMila account and data
``GET  /api/v1/legal/admin/requests``    admin list (live admin session)
``PATCH /api/v1/legal/admin/requests/{id}`` mark actioned / rejected

Each request gets a reference (``MM-R…`` / ``MM-D…``) and a ``due_at``.
If ``LEGAL_NOTIFY_EMAIL`` is set, ops gets an email per request.
Requests are kept as the PDPA s.12 record of what was asked and done.
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from urllib.parse import urlparse

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import require_admin_access
from db.session import get_db

from ._common import normalise_phone, scoped_limiter
from .money_models import LegalRequest

logger = structlog.get_logger()
router = APIRouter()

REMOVAL_SLA = timedelta(hours=72)
DELETION_SLA = timedelta(days=14)  # PDPA allows 21 working days; we aim for 14 calendar days.

RemovalReason = Literal[
    "my_listing",  # I'm the seller and want my ad removed
    "personal_data",  # my name / phone / photo of me is shown
    "copyright",  # I own the photo or text
    "sold_or_outdated",
    "inaccurate",
    "other",
]

_legal_limiter = scoped_limiter(
    "legal", max_requests=5, window_seconds=600, message="Too many requests from this connection. Try again later."
)


def _notify_ops(subject: str, text: str) -> None:
    to = os.getenv("LEGAL_NOTIFY_EMAIL", "").strip()
    if not to:
        return
    try:
        from app.utils.notify_email import send_alert_email

        send_alert_email(to_email=to, subject=subject, text=text)
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("legal_notify_failed", error=str(exc)[:120])


def _valid_email(value: str) -> str:
    email = (value or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1] or len(email) > 255:
        raise HTTPException(status_code=422, detail="Enter a valid email address so we can reply.")
    return email


def _reference(prefix: str) -> str:
    return f"{prefix}{secrets.token_hex(4).upper()}"


class RemovalCreate(BaseModel):
    listing_url: str = Field(..., min_length=8, max_length=1000)
    reason: RemovalReason
    requester_role: Optional[Literal["seller", "rights_holder", "pictured_person", "other"]] = None
    details: Optional[str] = Field(default=None, max_length=2000)
    name: Optional[str] = Field(default=None, max_length=120)
    email: str = Field(..., max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    confirm_accurate: bool
    website: Optional[str] = Field(default=None, max_length=200)  # honeypot


class AccountDeletionCreate(BaseModel):
    email: str = Field(..., max_length=255)
    name: Optional[str] = Field(default=None, max_length=120)
    details: Optional[str] = Field(default=None, max_length=1000)
    confirm: bool
    website: Optional[str] = Field(default=None, max_length=200)  # honeypot


class LegalReceipt(BaseModel):
    ok: bool = True
    reference: str
    dueAt: str
    message: str


@router.post("/removal", response_model=LegalReceipt, status_code=201)
def create_removal_request(
    body: RemovalCreate,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> LegalReceipt:
    _legal_limiter(request)
    now = datetime.now(timezone.utc)
    if body.website:
        return LegalReceipt(reference="MM-R0", dueAt=(now + REMOVAL_SLA).isoformat(), message="Received.")
    if not body.confirm_accurate:
        raise HTTPException(status_code=422, detail="Please confirm the information is accurate.")
    parsed = urlparse(body.listing_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=422, detail="Paste the full link to the listing (starting with https://).")
    email = _valid_email(body.email)
    phone = normalise_phone(body.phone) if body.phone else None

    row = LegalRequest(
        kind="removal",
        reference=_reference("MM-R"),
        listing_url=body.listing_url.strip()[:1000],
        reason=body.reason,
        requester_role=body.requester_role,
        details=(body.details or "").strip()[:2000] or None,
        name=(body.name or "").strip()[:120] or None,
        email=email,
        phone=phone,
        status="open",
        due_at=now + REMOVAL_SLA,
        created_at=now,
    )
    db.add(row)
    db.commit()
    background.add_task(
        _notify_ops,
        f"[MotorMila] Removal request {row.reference} ({row.reason})",
        f"URL: {row.listing_url}\nReason: {row.reason}\nRole: {row.requester_role}\nEmail: {email}\n"
        f"Due: {row.due_at.isoformat()}\n\n{row.details or ''}",
    )
    logger.info("legal_removal_created", reference=row.reference, reason=row.reason)
    return LegalReceipt(
        reference=row.reference,
        dueAt=row.due_at.isoformat(),
        message="Thanks. We will review and act on your request within 72 hours and email you when it's done.",
    )


@router.post("/account-deletion", response_model=LegalReceipt, status_code=201)
def create_account_deletion_request(
    body: AccountDeletionCreate,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> LegalReceipt:
    _legal_limiter(request)
    now = datetime.now(timezone.utc)
    if body.website:
        return LegalReceipt(reference="MM-D0", dueAt=(now + DELETION_SLA).isoformat(), message="Received.")
    if not body.confirm:
        raise HTTPException(status_code=422, detail="Please confirm you want your account deleted.")
    email = _valid_email(body.email)
    row = LegalRequest(
        kind="account_deletion",
        reference=_reference("MM-D"),
        details=(body.details or "").strip()[:1000] or None,
        name=(body.name or "").strip()[:120] or None,
        email=email,
        status="open",
        due_at=now + DELETION_SLA,
        created_at=now,
    )
    db.add(row)
    db.commit()
    background.add_task(
        _notify_ops,
        f"[MotorMila] Account deletion request {row.reference}",
        f"Email: {email}\nDue: {row.due_at.isoformat()}\n\n{row.details or ''}",
    )
    logger.info("legal_account_deletion_created", reference=row.reference)
    return LegalReceipt(
        reference=row.reference,
        dueAt=row.due_at.isoformat(),
        message=(
            "Thanks. We'll email you from our privacy address to confirm the request comes from you, "
            "then delete your account and data within 14 days."
        ),
    )


def _row(r: LegalRequest) -> dict:
    return {
        "id": r.id,
        "kind": r.kind,
        "reference": r.reference,
        "listingUrl": r.listing_url,
        "reason": r.reason,
        "requesterRole": r.requester_role,
        "details": r.details,
        "name": r.name,
        "email": r.email,
        "phone": r.phone,
        "status": r.status,
        "dueAt": r.due_at.isoformat() if r.due_at else None,
        "resolvedAt": r.resolved_at.isoformat() if r.resolved_at else None,
        "resolutionNote": r.resolution_note,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/admin/requests")
def admin_list_requests(
    kind: Optional[Literal["removal", "account_deletion"]] = None,
    status: Optional[Literal["open", "actioned", "rejected"]] = None,
    limit: int = Query(default=200, ge=1, le=1000),
    _admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> dict:
    q = db.query(LegalRequest)
    if kind:
        q = q.filter(LegalRequest.kind == kind)
    if status:
        q = q.filter(LegalRequest.status == status)
    rows = q.order_by(LegalRequest.due_at.asc()).limit(limit).all()
    return {"items": [_row(r) for r in rows], "count": len(rows)}


class LegalResolve(BaseModel):
    status: Literal["actioned", "rejected", "open"]
    note: Optional[str] = Field(default=None, max_length=2000)


@router.patch("/admin/requests/{request_id}")
def admin_resolve_request(
    request_id: int,
    body: LegalResolve,
    _admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> dict:
    row = db.query(LegalRequest).filter(LegalRequest.id == request_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found.")
    row.status = body.status
    row.resolution_note = body.note
    row.resolved_at = datetime.now(timezone.utc) if body.status != "open" else None
    db.commit()
    return _row(row)
