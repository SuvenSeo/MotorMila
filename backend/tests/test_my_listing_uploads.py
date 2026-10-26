"""Seller photo uploads: presigned R2 PUT URLs (POST /listings/mine/uploads)."""
import itertools
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import my_listings
from app.api.v1.endpoints.my_listings import (
    MAX_IMAGES,
    MyListingCreate,
    MyListingUpdate,
    UploadRequest,
)
from app.services import user_uploads
from db.models import Base, CarListing

PUBLIC = "https://pub-test.r2.dev"
AUTH = {"email": "Seller@Example.com", "plan": "free", "role": "user"}
OTHER = {"email": "other@example.com", "plan": "free", "role": "user"}
_ips = itertools.count(1)


class _Req:
    """Minimal request double; a fresh IP per instance isolates rate-limit buckets."""

    method = "POST"

    def __init__(self, ip=None):
        self.headers = {"user-agent": "pytest"}
        self.client = type("Client", (), {"host": ip or f"10.9.{next(_ips) // 250}.{next(_ips) % 250}"})()


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setenv("SELL_PHOTO_UPLOADS", "true")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct123")
    monkeypatch.setenv("R2_UPLOADS_ACCESS_KEY_ID", "AKIDTEST")
    monkeypatch.setenv("R2_UPLOADS_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_UPLOADS_BUCKET", "motormila-uploads")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", PUBLIC + "/")
    yield


@pytest.fixture
def disabled(monkeypatch):
    for name in (
        "SELL_PHOTO_UPLOADS", "R2_ACCOUNT_ID", "R2_UPLOADS_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID",
        "R2_UPLOADS_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "R2_UPLOADS_BUCKET", "R2_BUCKET",
        "R2_PUBLIC_BASE_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    yield


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def _ticket(auth=AUTH, **kw):
    body = {"content_type": "image/webp", "size": 250_000, **kw}
    return my_listings.create_upload_ticket(UploadRequest(**body), request=_Req(), auth=auth)


# ── config / off-by-default ───────────────────────────────────────────────

def test_uploads_off_by_default(disabled):
    assert user_uploads.load_config() is None
    cfg = my_listings.uploads_config(request=_Req(), auth=AUTH)
    assert cfg.enabled is False
    with pytest.raises(HTTPException) as exc:
        _ticket()
    assert exc.value.status_code == 503


def test_flag_without_credentials_stays_off(disabled, monkeypatch):
    monkeypatch.setenv("SELL_PHOTO_UPLOADS", "true")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct123")
    assert user_uploads.load_config() is None


def test_credentials_without_flag_stay_off(enabled, monkeypatch):
    monkeypatch.setenv("SELL_PHOTO_UPLOADS", "false")
    assert user_uploads.load_config() is None


def test_config_reports_limits_when_enabled(enabled):
    cfg = my_listings.uploads_config(request=_Req(), auth=AUTH)
    assert cfg.enabled is True
    assert cfg.max_files == MAX_IMAGES == 12
    assert cfg.max_bytes == user_uploads.MAX_UPLOAD_BYTES
    assert cfg.content_types == ["image/jpeg", "image/webp"]


def test_shared_r2_credentials_are_a_fallback(disabled, monkeypatch):
    monkeypatch.setenv("SELL_PHOTO_UPLOADS", "1")
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct123")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "shared")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "shared-secret")
    monkeypatch.setenv("R2_BUCKET", "motormila-snapshots")
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", PUBLIC)
    cfg = user_uploads.load_config()
    assert cfg is not None and cfg.bucket == "motormila-snapshots"


# ── auth ──────────────────────────────────────────────────────────────────

def _app():
    app = FastAPI()
    app.include_router(my_listings.router, prefix="/api/v1/listings")
    return app


def test_presign_requires_auth(enabled):
    client = TestClient(_app())
    res = client.post("/api/v1/listings/mine/uploads", json={"content_type": "image/webp", "size": 1000})
    assert res.status_code == 401
    res = client.get("/api/v1/listings/mine/uploads/config")
    assert res.status_code == 401


def test_presign_over_http_with_auth(enabled):
    app = _app()
    app.dependency_overrides[my_listings.get_current_auth_payload] = lambda: AUTH
    client = TestClient(app)
    res = client.post("/api/v1/listings/mine/uploads", json={"content_type": "image/jpeg", "size": 1000})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["method"] == "PUT"
    assert body["headers"] == {"Content-Type": "image/jpeg"}
    assert body["key"].endswith(".jpg")
    cfg = client.get("/api/v1/listings/mine/uploads/config").json()
    assert cfg["enabled"] is True


def test_empty_email_is_unauthenticated(enabled):
    with pytest.raises(HTTPException) as exc:
        _ticket(auth={"email": ""})
    assert exc.value.status_code == 401


# ── the ticket itself ─────────────────────────────────────────────────────

def test_ticket_key_shape_and_signed_headers(enabled):
    t = _ticket(size=123_456)
    owner = user_uploads.owner_segment("seller@example.com")
    assert t.key.startswith(f"user-uploads/{owner}/") and t.key.endswith(".webp")
    assert "seller" not in t.key and "@" not in t.key  # no PII in keys
    assert t.public_url == f"{PUBLIC}/{t.key}"
    assert t.expires_in == 300
    url = urlparse(t.upload_url)
    assert url.netloc == "acct123.r2.cloudflarestorage.com"
    assert url.path == f"/motormila-uploads/{t.key}"
    q = parse_qs(url.query)
    signed = q["X-Amz-SignedHeaders"][0].split(";")
    # Type and exact length are signed: R2 rejects any other type or size.
    assert "content-type" in signed and "content-length" in signed
    assert q["X-Amz-Expires"] == ["300"]


def test_ticket_keys_are_unique(enabled):
    assert _ticket().key != _ticket().key


def test_owner_segment_is_case_insensitive():
    assert user_uploads.owner_segment(" Seller@Example.com ") == user_uploads.owner_segment("seller@example.com")


@pytest.mark.parametrize("ctype", ["image/png", "image/gif", "image/svg+xml", "text/html", "application/octet-stream"])
def test_rejects_other_content_types(enabled, ctype):
    with pytest.raises(HTTPException) as exc:
        _ticket(content_type=ctype)
    assert exc.value.status_code == 415


def test_accepts_jpeg_case_insensitively(enabled):
    assert _ticket(content_type="IMAGE/JPEG").key.endswith(".jpg")


def test_rejects_oversize(enabled):
    with pytest.raises(HTTPException) as exc:
        _ticket(size=user_uploads.MAX_UPLOAD_BYTES + 1)
    assert exc.value.status_code == 413
    assert _ticket(size=user_uploads.MAX_UPLOAD_BYTES).key


def test_rejects_zero_size():
    with pytest.raises(Exception):
        UploadRequest(content_type="image/webp", size=0)


def test_twelve_photo_cap(enabled):
    assert _ticket(existing_count=11).key
    with pytest.raises(HTTPException) as exc:
        _ticket(existing_count=12)
    assert exc.value.status_code == 400


def test_per_user_rate_limit(enabled):
    req = _Req(ip="10.250.250.1")
    body = UploadRequest(content_type="image/webp", size=1000)
    for _ in range(40):
        my_listings.create_upload_ticket(body, request=req, auth=AUTH)
    with pytest.raises(HTTPException) as exc:
        my_listings.create_upload_ticket(body, request=req, auth=AUTH)
    assert exc.value.status_code == 429


# ── key ownership on create / patch ───────────────────────────────────────

def test_create_accepts_own_uploads_and_plain_links(enabled):
    db = _session()
    mine = _ticket().public_url
    created = my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio", image_urls=[mine, "https://example.com/car.jpg"]),
        request=_Req(), db=db, auth=AUTH,
    )
    assert created.image_urls == [mine, "https://example.com/car.jpg"]


def test_create_rejects_someone_elses_upload(enabled):
    db = _session()
    theirs = _ticket(auth=OTHER).public_url
    with pytest.raises(HTTPException) as exc:
        my_listings.create_my_listing(
            MyListingCreate(make="Toyota", model="Axio", image_urls=[theirs]),
            request=_Req(), db=db, auth=AUTH,
        )
    assert exc.value.status_code == 400
    assert db.query(CarListing).count() == 0


@pytest.mark.parametrize("suffix", [
    "user-uploads/../secret.webp",
    "user-uploads/abc/def.webp",
    "user-uploads/{owner}/notahexuuid.webp",
    "user-uploads/{owner}/0123456789abcdef0123456789abcdef.png",
])
def test_create_rejects_malformed_upload_keys(enabled, suffix):
    owner = user_uploads.owner_segment(AUTH["email"])
    url = f"{PUBLIC}/{suffix.format(owner=owner)}"
    with pytest.raises(HTTPException):
        my_listings.create_my_listing(
            MyListingCreate(make="Toyota", model="Axio", image_urls=[url]),
            request=_Req(), db=_session(), auth=AUTH,
        )


def test_patch_rejects_someone_elses_upload(enabled):
    db = _session()
    created = my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio"), request=_Req(), db=db, auth=AUTH,
    )
    theirs = _ticket(auth=OTHER).public_url
    with pytest.raises(HTTPException) as exc:
        my_listings.update_my_listing(
            created.id, MyListingUpdate(image_urls=[theirs]), request=_Req(), db=db, auth=AUTH,
        )
    assert exc.value.status_code == 400
    mine = _ticket().public_url
    updated = my_listings.update_my_listing(
        created.id, MyListingUpdate(image_urls=[mine]), request=_Req(), db=db, auth=AUTH,
    )
    assert updated.image_urls == [mine]


def test_ownership_not_enforced_when_uploads_off(disabled):
    # With uploads off there is no uploads prefix to protect; links pass through.
    url = f"{PUBLIC}/user-uploads/{'0' * 24}/{'a' * 32}.webp"
    created = my_listings.create_my_listing(
        MyListingCreate(make="Toyota", model="Axio", image_urls=[url]),
        request=_Req(), db=_session(), auth=AUTH,
    )
    assert created.image_urls == [url]
