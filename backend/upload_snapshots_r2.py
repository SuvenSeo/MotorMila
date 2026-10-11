"""Upload generated Motormila snapshots to Cloudflare R2.

Two credential modes — the first complete one wins:
  1. S3-compatible (boto3): R2_ACCOUNT_ID + R2_ACCESS_KEY_ID +
     R2_SECRET_ACCESS_KEY + R2_BUCKET
  2. Cloudflare API token (no boto3 needed): CLOUDFLARE_API_TOKEN +
     CLOUDFLARE_ACCOUNT_ID + R2_BUCKET. Uses the R2 HTTP object API.

R2_BUCKET is required in both modes. R2_PREFIX defaults to "latest".
SNAPSHOT_SOURCE_DIR defaults to "snapshots/latest".

Exits non-zero when no complete credential set is available. A silent
skip here once froze the homepage listing counter for a week (the CI step
reported success while uploading nothing), so missing credentials must
fail loudly.
"""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path


def required_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def content_type_for(path: Path) -> str:
    if path.suffix == ".json":
        return "application/json; charset=utf-8"
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def iter_files(source: Path):
    for path in source.rglob("*"):
        if path.is_file():
            yield path


def upload_via_boto3(source: Path, prefix: str, bucket: str,
                     account_id: str, access_key: str, secret_key: str) -> None:
    try:
        import boto3
    except ImportError as exc:
        raise SystemExit(
            "boto3 is required for S3-style R2 uploads. Install with: pip install boto3"
        ) from exc

    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    uploaded = 0
    for path in iter_files(source):
        rel = path.relative_to(source).as_posix()
        key = f"{prefix}/{rel}" if prefix else rel
        extra_args = {
            "ContentType": content_type_for(path),
            "CacheControl": "public, max-age=300, stale-while-revalidate=86400",
        }
        client.upload_file(str(path), bucket, key, ExtraArgs=extra_args)
        uploaded += 1
        print(f"uploaded s3://{bucket}/{key}")

    print(f"Uploaded {uploaded} snapshot files to R2 bucket {bucket} (S3 API).")


def upload_via_cf_api(source: Path, prefix: str, bucket: str,
                      account_id: str, api_token: str) -> None:
    """Upload via the Cloudflare R2 HTTP object API (no boto3 required)."""
    import urllib.error
    import urllib.request
    from urllib.parse import quote

    uploaded = 0
    for path in iter_files(source):
        rel = path.relative_to(source).as_posix()
        key = f"{prefix}/{rel}" if prefix else rel
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
            f"/r2/buckets/{bucket}/objects/{quote(key, safe='')}"
        )
        req = urllib.request.Request(
            url,
            data=path.read_bytes(),
            method="PUT",
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": content_type_for(path),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                status = resp.status
        except urllib.error.HTTPError as exc:
            raise SystemExit(
                f"R2 upload failed for {key}: HTTP {exc.code} {exc.reason}. "
                "If this is a 403, the Cloudflare API token needs "
                "R2 Storage write permission for this bucket."
            ) from exc
        if status not in (200, 201):
            raise SystemExit(f"R2 upload failed for {key}: HTTP {status}")
        uploaded += 1
        print(f"uploaded {bucket}/{key} via Cloudflare API")

    print(
        f"Uploaded {uploaded} snapshot files to R2 bucket {bucket} "
        "(Cloudflare API)."
    )


def main() -> None:
    source = Path(os.getenv("SNAPSHOT_SOURCE_DIR", "snapshots/latest")).resolve()
    prefix = (os.getenv("R2_PREFIX") or "latest").strip().strip("/")
    bucket = required_env("R2_BUCKET")

    if not source.exists():
        raise SystemExit(f"Snapshot source directory does not exist: {source}")
    if not bucket:
        raise SystemExit(
            "R2_BUCKET is not set — refusing to upload to an unknown bucket."
        )

    # Mode 1: S3-compatible credentials.
    s3_account = required_env("R2_ACCOUNT_ID")
    s3_key = required_env("R2_ACCESS_KEY_ID")
    s3_secret = required_env("R2_SECRET_ACCESS_KEY")
    if s3_account and s3_key and s3_secret:
        upload_via_boto3(source, prefix, bucket, s3_account, s3_key, s3_secret)
        return

    # Mode 2: Cloudflare API token.
    cf_token = required_env("CLOUDFLARE_API_TOKEN")
    cf_account = required_env("CLOUDFLARE_ACCOUNT_ID") or s3_account
    if cf_token and cf_account:
        upload_via_cf_api(source, prefix, bucket, cf_account, cf_token)
        return

    # No complete credential set — fail loudly. A silent skip here once
    # left the homepage counter frozen for a week.
    missing = [
        name
        for name in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID",
                     "R2_SECRET_ACCESS_KEY", "CLOUDFLARE_API_TOKEN",
                     "CLOUDFLARE_ACCOUNT_ID")
        if not required_env(name)
    ]
    raise SystemExit(
        "R2 upload credentials missing (also missing: "
        + ", ".join(missing)
        + "). Set either the S3-style R2_* secrets or CLOUDFLARE_API_TOKEN + "
        "CLOUDFLARE_ACCOUNT_ID (token needs R2 Storage write permission)."
    )


if __name__ == "__main__":
    main()
