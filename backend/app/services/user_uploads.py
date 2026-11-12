"""Seller photo uploads: short-lived presigned PUT URLs for Cloudflare R2.

The browser resizes each photo (max 1600px, WebP/JPEG, metadata stripped),
asks ``POST /api/v1/listings/mine/uploads`` for a presigned URL, and PUTs the
bytes straight to R2 — the image never passes through the HF Space. The
listing then stores the photo's public URL like any other ``image_urls`` entry.

Off by default. Enabled only when ``SELL_PHOTO_UPLOADS`` is truthy AND a full
credential set is present:

  R2_ACCOUNT_ID                     Cloudflare account id (S3 endpoint host)
  R2_UPLOADS_ACCESS_KEY_ID          R2 API token (Object Read & Write, scoped to
  R2_UPLOADS_SECRET_ACCESS_KEY        the uploads bucket). Fall back to
                                    R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.
  R2_UPLOADS_BUCKET                 bucket name (falls back to R2_BUCKET)
  R2_PUBLIC_BASE_URL                public base for that bucket, e.g.
                                    https://pub-….r2.dev (no trailing slash)

Guarantees enforced server-side (not just by the UI):
  * keys are ``user-uploads/{owner}/{uuid}.{webp|jpg}`` where ``owner`` is a
    stable hash of the account email (no PII in object keys);
  * the content type (image/webp | image/jpeg) and the exact byte length are
    part of the signature, so R2 rejects a PUT of a different type or size;
  * size ≤ MAX_UPLOAD_BYTES, URLs expire after PRESIGN_TTL_SECONDS;
  * listings may only reference upload keys under the caller's own prefix.
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from typing import Iterable, List, Optional

MAX_UPLOAD_BYTES = 1_572_864  # 1.5 MiB — a 1600px WebP at q0.8 is ~150–500 KB
MIN_UPLOAD_BYTES = 1
PRESIGN_TTL_SECONDS = 300
KEY_PREFIX = "user-uploads"
CONTENT_TYPES = {"image/webp": "webp", "image/jpeg": "jpg"}

_TRUTHY = {"1", "true", "yes", "on"}
_KEY_RE = re.compile(r"^user-uploads/([0-9a-f]{24})/([0-9a-f]{32})\.(webp|jpg)$")


@dataclass(frozen=True)
class UploadsConfig:
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket: str
    public_base_url: str

    @property
    def endpoint_url(self) -> str:
        return f"https://{self.account_id}.r2.cloudflarestorage.com"


def _env(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def load_config() -> Optional[UploadsConfig]:
    """The uploads config, or None when uploads are off / not fully configured."""
    if _env("SELL_PHOTO_UPLOADS").lower() not in _TRUTHY:
        return None
    account_id = _env("R2_ACCOUNT_ID")
    access_key = _env("R2_UPLOADS_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID")
    secret_key = _env("R2_UPLOADS_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY")
    bucket = _env("R2_UPLOADS_BUCKET", "R2_BUCKET")
    public_base = _env("R2_PUBLIC_BASE_URL").rstrip("/")
    if not (account_id and access_key and secret_key and bucket and public_base):
        return None
    if not public_base.startswith("https://"):
        return None
    return UploadsConfig(account_id, access_key, secret_key, bucket, public_base)


def owner_segment(email: str) -> str:
    """Stable, non-reversible per-account folder name (24 hex chars)."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:24]


def build_key(email: str, content_type: str) -> str:
    ext = CONTENT_TYPES[content_type]
    return f"{KEY_PREFIX}/{owner_segment(email)}/{uuid.uuid4().hex}.{ext}"


def public_url(cfg: UploadsConfig, key: str) -> str:
    return f"{cfg.public_base_url}/{key}"


def _client(cfg: UploadsConfig):
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=cfg.endpoint_url,
        aws_access_key_id=cfg.access_key_id,
        aws_secret_access_key=cfg.secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def presign_put(cfg: UploadsConfig, key: str, content_type: str, size: int) -> str:
    """Presigned PUT URL. Content-Type and Content-Length are signed headers."""
    return _client(cfg).generate_presigned_url(
        "put_object",
        Params={
            "Bucket": cfg.bucket,
            "Key": key,
            "ContentType": content_type,
            "ContentLength": int(size),
        },
        ExpiresIn=PRESIGN_TTL_SECONDS,
    )


def upload_key_from_url(cfg: Optional[UploadsConfig], url: str) -> Optional[str]:
    """The object key when ``url`` points into our uploads prefix, else None."""
    if cfg is None:
        return None
    base = cfg.public_base_url + "/"
    if not url.startswith(base):
        return None
    key = url[len(base):].split("?", 1)[0].split("#", 1)[0]
    if not key.startswith(KEY_PREFIX + "/"):
        return None
    return key


def foreign_upload_urls(urls: Iterable[str], email: str, cfg: Optional[UploadsConfig] = None) -> List[str]:
    """URLs that claim to be uploads but don't belong to this account.

    Plain third-party image URLs (the "Add from link" path) are allowed and
    never returned. Anything under ``{public_base}/user-uploads/`` must match
    the exact key shape AND the caller's owner segment.
    """
    cfg = cfg if cfg is not None else load_config()
    if cfg is None:
        return []
    mine = owner_segment(email)
    bad: List[str] = []
    for url in urls:
        key = upload_key_from_url(cfg, str(url))
        if key is None:
            continue
        match = _KEY_RE.match(key)
        if not match or match.group(1) != mine:
            bad.append(str(url))
    return bad
