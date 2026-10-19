"""Consented buyer leads: leasing/finance, inspection booking, insurance quote.

Public ``POST /api/v1/leads`` stores a lead with the exact consent text the
buyer agreed to and a server timestamp. It is rate-limited per IP, has a
honeypot field (``website``) and de-duplicates the same phone + kind +
listing within 24 hours.

Partner routing is configured with ``LEADS_PARTNERS_JSON`` (see
docs/overhaul/money-legal.md). Nothing is sent to partners unless
``LEADS_DELIVERY_ENABLED=true``; until then leads are only stored and
exported by an admin.

Admin: ``GET /api/v1/leads/admin``, ``GET /api/v1/leads/admin/export.csv``,
``PATCH /api/v1/leads/admin/{id}`` (live admin session required).
"""

from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import require_admin_access
from db.session import SessionLocal, get_db

from ._common import ip_hash, normalise_phone, scoped_limiter
from .money_models import Lead

logger = structlog.get_logger()
router = APIRouter()

LeadKind = Literal["finance", "inspection", "insurance"]

# The consent text shown next to the checkbox. Versioned so every stored lead
# records exactly what the person agreed to. Keep in sync with
# src/lib/leadConsent.ts.
CONSENT_TEXTS: dict[str, dict[str, str]] = {
    "finance-v1": {
        "kind": "finance",
        "text": (
            "I agree that MotorMila may store my name, phone number and the details above and share them with "
            "the leasing or finance partner(s) listed on this form so they can contact me about a quote. "
            "Partners are independent companies; MotorMila does not lend money or approve credit. "
            "I can withdraw consent or ask for my data to be deleted at any time by emailing the privacy contact "
            "in the Privacy Policy."
        ),
    },
    "inspection-v1": {
        "kind": "inspection",
        "text": (
            "I agree that MotorMila may store my name, phone number and the details above and share them with "
            "the inspection partner listed on this form so they can arrange the inspection with me. "
            "The inspection is carried out by the partner, not by MotorMila. I can withdraw consent or ask for "
            "my data to be deleted at any time."
        ),
    },
    "insurance-v1": {
        "kind": "insurance",
        "text": (
            "I agree that MotorMila may store my name, phone number and the details above and pass them to the "
            "licensed insurance broker listed on this form so they can contact me with a quote. MotorMila is not "
            "an insurer or insurance broker and does not give insurance advice. I can withdraw consent or ask for "
            "my data to be deleted at any time."
        ),
    },
}

DEDUP_WINDOW = timedelta(hours=24)

_lead_limiter = scoped_limiter(
    "leads", max_requests=5, window_seconds=600, message="Too many requests from this connection. Try again later."
)


# ---------------------------------------------------------------------------
# Partner routing
# ---------------------------------------------------------------------------

def _partners() -> dict[str, list[dict]]:
    raw = os.getenv("LEADS_PARTNERS_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("leads_partners_json_invalid")
        return {}
    out: dict[str, list[dict]] = {}
    for kind, items in (data or {}).items():
        if isinstance(items, list):
            out[str(kind)] = [p for p in items if isinstance(p, dict) and p.get("id")]
    return out


def partners_for(kind: str) -> list[dict]:
    return [p for p in _partners().get(kind, []) if p.get("active", True)]


def _delivery_enabled() -> bool:
    return os.getenv("LEADS_DELIVERY_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


@router.get("/partners")
def public_partners(kind: LeadKind) -> dict:
    """Public list of who a lead of this kind is shared with (for the consent text)."""
    return {
        "kind": kind,
        "partners": [
            {
                "id": p["id"],
                "name": p.get("name") or p["id"],
                "licence": p.get("licence"),
                "privacyUrl": p.get("privacy_url"),
            }
            for p in partners_for(kind)
        ],
        "consent": {
            version: meta["text"] for version, meta in CONSENT_TEXTS.items() if meta["kind"] == kind
        },
    }


def _deliver(lead_id: int) -> None:
    """Best-effort hand-off to partners (email and/or webhook). Runs after the response."""
    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if lead is None:
            return
        payload = {
            "leadId": lead.id,
            "kind": lead.kind,
            "name": lead.name,
            "phone": lead.phone,
            "email": lead.email,
            "district": lead.district,
            "vehicle": lead.vehicle,
            "budgetLkr": lead.budget_lkr,
            "downPaymentLkr": lead.down_payment_lkr,
            "preferredDate": lead.preferred_date,
            "notes": lead.notes,
            "consentVersion": lead.consent_version,
            "consentAt": lead.consent_at.isoformat() if lead.consent_at else None,
            "source": "motormila",
        }
        ok_any = False
        for partner in partners_for(lead.kind):
            if partner.get("webhook"):
                try:
                    import httpx

                    headers = {"Content-Type": "application/json"}
                    token = os.getenv(str(partner.get("webhook_token_env") or ""), "").strip()
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                    resp = httpx.post(partner["webhook"], json=payload, headers=headers, timeout=10)
                    ok_any = ok_any or resp.status_code < 300
                except Exception as exc:  # pragma: no cover - network
                    logger.warning("lead_webhook_failed", partner=partner["id"], error=str(exc)[:120])
            if partner.get("email"):
                from app.utils.notify_email import send_alert_email

                text = "\n".join(f"{k}: {v}" for k, v in payload.items() if v not in (None, ""))
                ok_any = send_alert_email(
                    to_email=partner["email"], subject=f"MotorMila {lead.kind} lead #{lead.id}", text=text
                ) or ok_any
        lead.delivery_status = "sent" if ok_any else "failed"
        db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Public create
# ---------------------------------------------------------------------------

class LeadCreate(BaseModel):
    kind: LeadKind
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=9, max_length=20)
    email: Optional[str] = Field(default=None, max_length=255)
    district: Optional[str] = Field(default=None, max_length=60)
    vehicle: Optional[str] = Field(default=None, max_length=200)
    listing_id: Optional[int] = Field(default=None, ge=1)
    budget_lkr: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    down_payment_lkr: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    preferred_date: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=1000)
    source_page: Optional[str] = Field(default=None, max_length=200)
    consent: bool
    consent_version: str = Field(..., max_length=40)
    # Honeypot: real users never see or fill this.
    website: Optional[str] = Field(default=None, max_length=200)


class LeadReceipt(BaseModel):
    ok: bool = True
    reference: str
    routedTo: list[str] = []
    message: str


def _strip(value: Optional[str], limit: int) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split())[:limit]
    return text or None


@router.post("", response_model=LeadReceipt, status_code=201)
def create_lead(
    body: LeadCreate,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> LeadReceipt:
    _lead_limiter(request)
    if body.website:
        # Bot filled the hidden field: pretend success, store nothing.
        return LeadReceipt(reference="MM-L0", message="Thanks, we'll be in touch.")
    if not body.consent:
        raise HTTPException(status_code=422, detail="Please tick the consent box so we can pass your request on.")
    consent = CONSENT_TEXTS.get(body.consent_version)
    if consent is None or consent["kind"] != body.kind:
        raise HTTPException(status_code=422, detail="Unknown consent version.")
    phone = normalise_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=422, detail="Enter a valid Sri Lankan phone number.")
    email = _strip(body.email, 255)
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        raise HTTPException(status_code=422, detail="Enter a valid email address or leave it blank.")

    now = datetime.now(timezone.utc)
    recent = (
        db.query(Lead)
        .filter(Lead.kind == body.kind, Lead.phone == phone, Lead.listing_id == body.listing_id)
        .order_by(Lead.id.desc())
        .first()
    )
    if recent is not None and recent.created_at is not None:
        created = recent.created_at if recent.created_at.tzinfo else recent.created_at.replace(tzinfo=timezone.utc)
        if now - created < DEDUP_WINDOW:
            return LeadReceipt(
                reference=f"MM-L{recent.id}",
                routedTo=[p for p in (recent.routed_to or "").split(",") if p],
                message="We already have this request. A partner will contact you.",
            )

    routed = [p["id"] for p in partners_for(body.kind)]
    lead = Lead(
        kind=body.kind,
        name=_strip(body.name, 120) or "",
        phone=phone,
        email=email,
        district=_strip(body.district, 60),
        vehicle=_strip(body.vehicle, 200),
        listing_id=body.listing_id,
        budget_lkr=body.budget_lkr,
        down_payment_lkr=body.down_payment_lkr,
        preferred_date=_strip(body.preferred_date, 20),
        notes=_strip(body.notes, 1000),
        source_page=_strip(body.source_page, 200),
        consent_version=body.consent_version,
        consent_text=consent["text"],
        consent_at=now,
        routed_to=",".join(routed) or None,
        delivery_status="stored",
        status="new",
        ip_hash=ip_hash(request),
        created_at=now,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    if routed and _delivery_enabled():
        background.add_task(_deliver, lead.id)

    logger.info("lead_created", kind=lead.kind, lead_id=lead.id, routed=len(routed))
    return LeadReceipt(
        reference=f"MM-L{lead.id}",
        routedTo=routed,
        message="Thanks. Your request is saved and a partner will contact you, usually within one working day.",
    )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

_EXPORT_COLUMNS = [
    "id", "created_at", "kind", "status", "name", "phone", "email", "district", "vehicle", "listing_id",
    "budget_lkr", "down_payment_lkr", "preferred_date", "notes", "source_page", "routed_to",
    "delivery_status", "consent_version", "consent_at",
]


def _row(lead: Lead) -> dict:
    out = {}
    for col in _EXPORT_COLUMNS:
        value = getattr(lead, col)
        out[col] = value.isoformat() if isinstance(value, datetime) else value
    return out


def _query(db: Session, kind: Optional[str], status: Optional[str]):
    q = db.query(Lead)
    if kind:
        q = q.filter(Lead.kind == kind)
    if status:
        q = q.filter(Lead.status == status)
    return q.order_by(Lead.id.desc())


@router.get("/admin")
def admin_list_leads(
    kind: Optional[LeadKind] = None,
    status: Optional[str] = Query(default=None, max_length=20),
    limit: int = Query(default=100, ge=1, le=1000),
    _admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> dict:
    rows = _query(db, kind, status).limit(limit).all()
    return {"items": [_row(r) for r in rows], "count": len(rows)}


@router.get("/admin/export.csv")
def admin_export_leads(
    kind: Optional[LeadKind] = None,
    status: Optional[str] = Query(default=None, max_length=20),
    _admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_EXPORT_COLUMNS)
    writer.writeheader()
    for lead in _query(db, kind, status).all():
        row = _row(lead)
        # Neutralise spreadsheet formula injection.
        writer.writerow({k: (f"'{v}" if isinstance(v, str) and v[:1] in "=+-@" else v) for k, v in row.items()})
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="motormila-leads.csv"', "Cache-Control": "no-store"},
    )


class LeadStatusUpdate(BaseModel):
    status: Literal["new", "contacted", "closed", "withdrawn"]


@router.patch("/admin/{lead_id}")
def admin_update_lead(
    lead_id: int,
    body: LeadStatusUpdate,
    _admin: dict = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> dict:
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found.")
    lead.status = body.status
    db.commit()
    return _row(lead)
