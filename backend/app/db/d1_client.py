"""Cloudflare D1 client for Motormila's account/user tables.

Why this exists: D1 has no Postgres wire protocol, so the Python backend
cannot point a SQLAlchemy DSN at it. The backend therefore talks to D1
over Cloudflare's D1 HTTP API (POST /d1/database/{id}/query), with a
scoped API token that has D1 edit rights on the motormila-accounts
database only. That token lives in the HF Space secrets as
CLOUDFLARE_D1_API_TOKEN — it is never committed, and it is NOT the
Cloudflare account token used by ops tooling.

What it covers: the 12 account/user tables in workers/motormila-db/
migrations/0001_account_tables.sql. Password hashing (bcrypt) and
HMAC token signing stay in backend/app/api/v1/endpoints/auth.py —
this client only stores and returns rows, exactly like the Worker in
workers/motormila-db/src/index.ts, which offers the same operations
for callers that cannot use this client.

Env vars (all required to enable; otherwise this client is inert):
  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID,
  CLOUDFLARE_D1_API_TOKEN
Set MOTORMILA_D1_ENABLED=true to actually use it. Until the Nov 1
Neon export runs, there is no real account data in D1 — only test rows
— so do NOT enable it in production before that export is verified.
"""

from __future__ import annotations

import json
import os
import urllib.request
import urllib.error

ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
DATABASE_ID = os.getenv("CLOUDFLARE_D1_DATABASE_ID", "").strip()
API_TOKEN = os.getenv("CLOUDFLARE_D1_API_TOKEN", "").strip()
ENABLED = os.getenv("MOTORMILA_D1_ENABLED", "false").lower() == "true"


class D1Error(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(ACCOUNT_ID and DATABASE_ID and API_TOKEN)


def _query(sql: str, params: list | None = None) -> list[dict]:
    if not is_configured():
        raise D1Error("D1 is not configured (missing account/database/token env)")
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}"
        f"/d1/database/{DATABASE_ID}/query"
    )
    payload = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as exc:
        raise D1Error(f"D1 query failed: HTTP {exc.code}") from exc
    if not data.get("success"):
        raise D1Error(f"D1 query failed: {data.get('errors')}")
    result = (data.get("result") or [{}])[0]
    if not result.get("success", True):
        raise D1Error(f"D1 query failed: {result}")
    return result.get("results") or []


# --- users (mirror of workers/motormila-db/src/index.ts) ---

USER_FIELDS = (
    "id, email, password_hash, name, plan, subscription_status, role, "
    "is_active, token_version, invited_by_email, last_login_at, "
    "trial_ends_at, email_verified, email_verification_token_hash, "
    "email_verification_expires_at, password_reset_token_hash, "
    "password_reset_expires_at, created_at, updated_at"
)


def get_user_by_email(email: str) -> dict | None:
    rows = _query(
        f"SELECT {USER_FIELDS} FROM platform_users WHERE email = ?",
        [email.lower()],
    )
    return rows[0] if rows else None


def upsert_user(user: dict) -> dict | None:
    email = str(user.get("email", "")).lower()
    existing = get_user_by_email(email)
    if existing:
        sets = []
        vals: list = []
        for field in (
            "password_hash", "name", "plan", "subscription_status", "role",
            "is_active", "token_version", "invited_by_email", "last_login_at",
            "trial_ends_at", "email_verified", "email_verification_token_hash",
            "email_verification_expires_at", "password_reset_token_hash",
            "password_reset_expires_at",
        ):
            if field in user:
                sets.append(f"{field} = ?")
                vals.append(user[field])
        sets.append("updated_at = CURRENT_TIMESTAMP")
        _query(f"UPDATE platform_users SET {', '.join(sets)} WHERE email = ?", vals + [email])
    else:
        _query(
            "INSERT INTO platform_users (email, password_hash, name, plan, "
            "subscription_status, role, is_active, token_version, "
            "invited_by_email, last_login_at, trial_ends_at, email_verified, "
            "email_verification_token_hash, email_verification_expires_at, "
            "password_reset_token_hash, password_reset_expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                email, user.get("password_hash", ""), user.get("name", ""),
                user.get("plan", "free"), user.get("subscription_status", "none"),
                user.get("role", "user"), user.get("is_active", 1),
                user.get("token_version", 0), user.get("invited_by_email"),
                user.get("last_login_at"), user.get("trial_ends_at"),
                user.get("email_verified", 1),
                user.get("email_verification_token_hash"),
                user.get("email_verification_expires_at"),
                user.get("password_reset_token_hash"),
                user.get("password_reset_expires_at"),
            ],
        )
    return get_user_by_email(email)


def bump_token_version(email: str) -> None:
    _query(
        "UPDATE platform_users SET token_version = token_version + 1, "
        "updated_at = CURRENT_TIMESTAMP WHERE email = ?",
        [email.lower()],
    )


def get_invite_by_token(token: str) -> dict | None:
    rows = _query("SELECT * FROM user_invites WHERE token = ?", [token])
    return rows[0] if rows else None


def list_alerts_by_user(user_token: str) -> list[dict]:
    return _query(
        "SELECT * FROM market_alerts WHERE user_token = ? ORDER BY id DESC",
        [user_token],
    )


def create_alert(alert: dict) -> int:
    cols = [
        "user_token", "make", "model", "max_price", "district",
        "notify_phone", "notify_email", "notify_telegram_chat_id",
        "notify_channels", "delivery_mode", "quiet_hours_enabled", "active",
    ]
    _query(
        f"INSERT INTO market_alerts ({', '.join(cols)}) "
        f"VALUES ({', '.join('?' * len(cols))})",
        [alert.get(c) for c in cols],
    )
    rows = _query("SELECT last_insert_rowid() AS id")
    return int(rows[0]["id"]) if rows else 0
