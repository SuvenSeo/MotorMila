"""Shared test app for the money/legal routers (PayHere, leads, legal)."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import billing
from app.api.v1.endpoints.auth import get_current_auth_payload, require_admin_access
from app.routers import money_router
from app.routers import leads as leads_mod
from app.routers import legal_requests as legal_mod
from app.routers import payhere as payhere_mod
from db.models import Base
from db.session import get_db


def make_client(*, email="buyer@example.com", role="user"):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    app = FastAPI()
    app.include_router(money_router, prefix="/api/v1")
    app.include_router(billing.router, prefix="/api/v1/billing")

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    def _auth():
        return {"email": email, "name": "Kasun Perera", "role": role, "plan": "free"}

    def _admin():
        if role != "admin":
            from fastapi import HTTPException

            raise HTTPException(status_code=403, detail="Admin access required.")
        return {"email": email, "role": "admin"}

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_auth_payload] = _auth
    app.dependency_overrides[require_admin_access] = _admin

    for limiter in (payhere_mod._checkout_limiter, leads_mod._lead_limiter, legal_mod._legal_limiter):
        limiter.reset()
    return TestClient(app), Session
