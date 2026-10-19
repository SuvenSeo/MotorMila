"""User-submitted listings — the sell-your-car flow.

Signed-in users create, edit, and manage their own vehicle listings.
Moderation queue: listings land with ``user_listing_status='pending'`` and
``is_active=False``; they are invisible to public browse/stats until an admin
approves them (``POST /api/v1/admin/listings/{id}/approve`` sets
``published`` + ``is_active=True``). Editing the content of a published
listing sends it back to ``pending``. Scraped rows (``owner_user_id IS NULL``)
are never touched by these endpoints.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_auth_payload
from app.services.rate_limit import RateLimiter
from db.models import CarListing
from db.session import get_db

router = APIRouter()

_write_limiter = RateLimiter(max_requests=30, window_seconds=60, tier="my-listings-write")
_read_limiter = RateLimiter(max_requests=120, window_seconds=60, tier="my-listings-read")
# Content fields whose change on a published listing requires re-review.
_REVIEWED_FIELDS = {
    "make", "model", "year", "price_lkr", "mileage", "fuel_type", "transmission",
    "engine_capacity", "condition", "body_type", "vehicle_category", "district",
    "city", "title", "description", "contact_name", "contact_phone", "image_urls",
}

# Status values for user listings.
STATUS_DRAFT = "draft"
STATUS_PENDING = "pending"
STATUS_PUBLISHED = "published"
STATUS_REMOVED = "removed"
_USER_STATUSES = {STATUS_DRAFT, STATUS_PENDING, STATUS_PUBLISHED, STATUS_REMOVED}

MAX_IMAGES = 12


# ── Schemas ────────────────────────────────────────────────────────────────

class MyListingCreate(BaseModel):
    make: str = Field(min_length=1, max_length=50)
    model: str = Field(min_length=1, max_length=100)
    year: Optional[int] = Field(default=None, ge=1950, le=2100)
    price_lkr: Optional[float] = Field(default=None, ge=0)
    mileage: Optional[int] = Field(default=None, ge=0)
    fuel_type: Optional[str] = Field(default=None, max_length=20)
    transmission: Optional[str] = Field(default=None, max_length=20)
    engine_capacity: Optional[int] = Field(default=None, ge=0)
    condition: Optional[str] = Field(default=None, max_length=20)
    body_type: Optional[str] = Field(default=None, max_length=30)
    vehicle_category: Optional[str] = Field(default=None, max_length=40)
    district: Optional[str] = Field(default=None, max_length=50)
    city: Optional[str] = Field(default=None, max_length=100)
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    contact_phone: Optional[str] = Field(default=None, max_length=32)
    image_urls: List[str] = Field(default_factory=list, max_length=MAX_IMAGES)


class MyListingUpdate(BaseModel):
    make: Optional[str] = Field(default=None, max_length=50)
    model: Optional[str] = Field(default=None, max_length=100)
    year: Optional[int] = Field(default=None, ge=1950, le=2100)
    price_lkr: Optional[float] = Field(default=None, ge=0)
    mileage: Optional[int] = Field(default=None, ge=0)
    fuel_type: Optional[str] = Field(default=None, max_length=20)
    transmission: Optional[str] = Field(default=None, max_length=20)
    engine_capacity: Optional[int] = Field(default=None, ge=0)
    condition: Optional[str] = Field(default=None, max_length=20)
    body_type: Optional[str] = Field(default=None, max_length=30)
    vehicle_category: Optional[str] = Field(default=None, max_length=40)
    district: Optional[str] = Field(default=None, max_length=50)
    city: Optional[str] = Field(default=None, max_length=100)
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    contact_phone: Optional[str] = Field(default=None, max_length=32)
    image_urls: Optional[List[str]] = Field(default=None, max_length=MAX_IMAGES)
    status: Optional[str] = None


class MyListingRead(BaseModel):
    id: int
    make: str
    model: str
    year: Optional[int] = None
    price_lkr: Optional[float] = None
    mileage: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    engine_capacity: Optional[int] = None
    condition: Optional[str] = None
    body_type: Optional[str] = None
    vehicle_category: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Helpers ────────────────────────────────────────────────────────────────

def _owner_email(auth: dict) -> str:
    return str(auth.get("email") or "").strip().lower()


def _serialize_images(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return [str(u) for u in parsed if isinstance(u, str)][:MAX_IMAGES]
    except (ValueError, TypeError):
        return []


def _to_read(row: CarListing) -> MyListingRead:
    return MyListingRead(
        id=int(row.id),
        make=str(row.make or ""),
        model=str(row.model or ""),
        year=int(row.year) if row.year is not None else None,
        price_lkr=float(row.price_lkr) if row.price_lkr is not None else None,
        mileage=int(row.mileage) if row.mileage is not None else None,
        fuel_type=row.fuel_type,
        transmission=row.transmission,
        engine_capacity=int(row.engine_capacity) if row.engine_capacity is not None else None,
        condition=row.condition,
        body_type=row.body_type,
        vehicle_category=row.vehicle_category,
        district=row.district,
        city=row.city,
        title=row.title,
        description=row.description,
        contact_name=row.contact_name,
        contact_phone=row.contact_phone,
        image_urls=_serialize_images(row.user_images),
        status=str(row.user_listing_status or STATUS_PENDING),
        created_at=row.first_seen_at,
        updated_at=row.content_updated_at or row.last_seen_at,
    )


def _own_listing(db: Session, listing_id: int, owner: str) -> CarListing:
    row = (
        db.query(CarListing)
        .filter(
            CarListing.id == listing_id,
            CarListing.owner_user_id == owner,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found.")
    return row


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/mine", response_model=List[MyListingRead])
def list_my_listings(
    request: Request,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_current_auth_payload),
):
    """All listings owned by the signed-in user, newest first."""
    _read_limiter(request)
    owner = _owner_email(auth)
    if not owner:
        raise HTTPException(status_code=401, detail="Authentication required.")
    rows = (
        db.query(CarListing)
        .filter(CarListing.owner_user_id == owner)
        .order_by(CarListing.first_seen_at.desc())
        .limit(100)
        .all()
    )
    return [_to_read(r) for r in rows]


@router.post("/mine", response_model=MyListingRead, status_code=201)
def create_my_listing(
    payload: MyListingCreate,
    request: Request,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_current_auth_payload),
):
    """Create a seller listing. Lands as 'pending' for admin review."""
    _write_limiter(request)
    owner = _owner_email(auth)
    if not owner:
        raise HTTPException(status_code=401, detail="Authentication required.")

    now = datetime.now(timezone.utc)
    # source_id is a unique constraint with source — use a user-scoped id so
    # two users can list the same make/model without colliding.
    source_id = f"user-{owner}-{int(now.timestamp() * 1000)}"
    images = [str(u)[:2048] for u in (payload.image_urls or [])[:MAX_IMAGES] if str(u).strip()]

    row = CarListing(
        source="motormila_user",
        source_id=source_id,
        scraped_at=now,
        first_seen_at=now,
        last_seen_at=now,
        content_updated_at=now,
        title=payload.title or f"{payload.make} {payload.model} {payload.year or ''}".strip(),
        make=payload.make.strip(),
        model=payload.model.strip(),
        year=payload.year,
        price_lkr=payload.price_lkr,
        mileage=payload.mileage,
        fuel_type=payload.fuel_type,
        transmission=payload.transmission,
        engine_capacity=payload.engine_capacity,
        condition=payload.condition,
        body_type=payload.body_type,
        vehicle_category=payload.vehicle_category or "cars",
        district=payload.district,
        city=payload.city,
        description=payload.description,
        contact_name=payload.contact_name,
        contact_phone=payload.contact_phone,
        user_images=json.dumps(images) if images else None,
        owner_user_id=owner,
        user_listing_status=STATUS_PENDING,
        # Not live until an admin approves it (moderation queue).
        is_active=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if not row.url:
        # CarListingRead requires a url; scraped rows carry the source page,
        # first-party listings point at their own MotorMila detail page
        # (previously None, which 500'd GET /listings/{id}).
        row.url = f"https://motormila.vercel.app/listing/{row.id}"
        db.commit()
        db.refresh(row)
    return _to_read(row)


@router.patch("/mine/{listing_id}", response_model=MyListingRead)
def update_my_listing(
    listing_id: int,
    payload: MyListingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_current_auth_payload),
):
    """Update an owned listing. Status can only be draft/pending/removed."""
    _write_limiter(request)
    owner = _owner_email(auth)
    if not owner:
        raise HTTPException(status_code=401, detail="Authentication required.")
    row = _own_listing(db, listing_id, owner)

    updates = payload.model_dump(exclude_unset=True)
    content_changed = bool(_REVIEWED_FIELDS.intersection(updates))
    if "status" in updates:
        new_status = str(updates.pop("status") or "").strip().lower()
        if new_status not in (STATUS_DRAFT, STATUS_PENDING, STATUS_REMOVED):
            raise HTTPException(
                status_code=400,
                detail="status must be draft, pending, or removed",
            )
        row.user_listing_status = new_status
        # Only an admin approval makes a listing live.
        row.is_active = False
    elif content_changed and row.user_listing_status == STATUS_PUBLISHED:
        # Edited after approval: back to the moderation queue.
        row.user_listing_status = STATUS_PENDING
        row.is_active = False
    if "image_urls" in updates:
        urls = updates.pop("image_urls") or []
        row.user_images = json.dumps(
            [str(u)[:2048] for u in urls[:MAX_IMAGES] if str(u).strip()]
        ) if urls else None

    for field, value in updates.items():
        if hasattr(row, field):
            setattr(row, field, value)
    row.last_seen_at = datetime.now(timezone.utc)
    row.content_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _to_read(row)


@router.delete("/mine/{listing_id}")
def delete_my_listing(
    listing_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_current_auth_payload),
):
    """Soft-delete an owned listing (marks removed; keeps history)."""
    _write_limiter(request)
    owner = _owner_email(auth)
    if not owner:
        raise HTTPException(status_code=401, detail="Authentication required.")
    row = _own_listing(db, listing_id, owner)
    row.user_listing_status = STATUS_REMOVED
    row.is_active = False
    db.commit()
    return {"ok": True, "id": listing_id}
