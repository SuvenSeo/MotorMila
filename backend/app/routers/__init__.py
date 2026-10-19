"""Money + legal routers (PayHere payments, lead capture, legal requests).

Kept outside ``app/api/v1/endpoints`` so the overhaul branches merge cleanly.
``money_router`` is mounted under ``/api/v1`` from ``app.main``.
"""

from fastapi import APIRouter

from . import leads, legal_requests, payhere

money_router = APIRouter()
money_router.include_router(payhere.router, prefix="/payhere", tags=["payhere"])
money_router.include_router(leads.router, prefix="/leads", tags=["leads"])
money_router.include_router(legal_requests.router, prefix="/legal", tags=["legal"])

__all__ = ["money_router"]
