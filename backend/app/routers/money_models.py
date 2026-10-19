"""Tables for PayHere payments, consented leads and legal requests.

Declared on the shared ``db.models.Base`` so ``init_db()``'s ``create_all``
creates them (checkfirst) as soon as this module is imported, which happens
when ``app.main`` mounts ``app.routers.money_router``.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Index, Integer, String, Text, func

from db.models import Base


class PayherePayment(Base):
    """One checkout order. ``order_id`` is ours; ``payment_id`` is PayHere's."""

    __tablename__ = "payhere_payments"

    id = Column(Integer, primary_key=True)
    order_id = Column(String(64), nullable=False, unique=True)
    user_email = Column(String(255), nullable=False)
    plan_code = Column(String(40), nullable=False)  # pro | dealer_starter | dealer_pro | dealer_yard
    granted_plan = Column(String(20), nullable=False)  # value written to platform_users.plan
    period = Column(String(10), nullable=False)  # monthly | yearly
    recurring = Column(Integer, nullable=False, default=0)
    amount = Column(String(20), nullable=False)  # "2990.00" exactly as hashed
    currency = Column(String(3), nullable=False, default="LKR")
    status = Column(String(20), nullable=False, default="created")  # created|pending|paid|canceled|failed|chargedback
    sandbox = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("idx_payhere_payments_email", "user_email"),)


class PayhereNotification(Base):
    """Every verified notify_url call, keyed by PayHere payment_id for idempotency."""

    __tablename__ = "payhere_notifications"

    id = Column(Integer, primary_key=True)
    payment_id = Column(String(64), nullable=False, unique=True)
    order_id = Column(String(64), nullable=False)
    subscription_id = Column(String(64), nullable=True)
    status_code = Column(String(4), nullable=False)
    amount = Column(String(20), nullable=False)
    currency = Column(String(3), nullable=False)
    applied = Column(String(40), nullable=False, default="none")  # what we did: granted|revoked|ignored|none
    received_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("idx_payhere_notifications_order", "order_id"),)


class Lead(Base):
    """A buyer's consented request for leasing, inspection or an insurance quote."""

    __tablename__ = "leads"

    id = Column(Integer, primary_key=True)
    kind = Column(String(20), nullable=False)  # finance | inspection | insurance
    name = Column(String(120), nullable=False)
    phone = Column(String(20), nullable=False)
    email = Column(String(255), nullable=True)
    district = Column(String(60), nullable=True)
    vehicle = Column(String(200), nullable=True)
    listing_id = Column(Integer, nullable=True)
    budget_lkr = Column(Integer, nullable=True)
    down_payment_lkr = Column(Integer, nullable=True)
    preferred_date = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    source_page = Column(String(200), nullable=True)
    consent_version = Column(String(40), nullable=False)
    consent_text = Column(Text, nullable=False)
    consent_at = Column(DateTime(timezone=True), nullable=False)
    routed_to = Column(String(500), nullable=True)  # comma-separated partner ids
    delivery_status = Column(String(20), nullable=False, default="stored")  # stored|sent|failed
    status = Column(String(20), nullable=False, default="new")  # new|contacted|closed|withdrawn
    ip_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_leads_kind_created", "kind", "created_at"),
        Index("idx_leads_phone", "phone"),
    )


class LegalRequest(Base):
    """Takedown/removal and account-deletion requests, with an SLA due time."""

    __tablename__ = "legal_requests"

    id = Column(Integer, primary_key=True)
    kind = Column(String(20), nullable=False)  # removal | account_deletion
    reference = Column(String(20), nullable=False, unique=True)
    listing_url = Column(String(1000), nullable=True)
    reason = Column(String(40), nullable=True)
    requester_role = Column(String(40), nullable=True)
    details = Column(Text, nullable=True)
    name = Column(String(120), nullable=True)
    email = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    status = Column(String(20), nullable=False, default="open")  # open|actioned|rejected
    due_at = Column(DateTime(timezone=True), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("idx_legal_requests_kind_status", "kind", "status"),)
