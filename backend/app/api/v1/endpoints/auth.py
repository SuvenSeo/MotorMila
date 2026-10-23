"""Authentication with signed bearer tokens.

Accounts resolve from (in order):
  1. ``platform_users`` DB table (invite-provisioned accounts)
  2. ``AUTH_USERS`` env JSON (bootstrap / legacy deployments)

Tokens are HMAC-SHA256 signed with AUTH_TOKEN_SECRET. Passwords are bcrypt
hashes only — legacy unsalted SHA-256 entries are no longer accepted.

AUTH_USERS example:
    [{"email": "owner@example.com", "password_hash": "$2b$12$...",
      "name": "Owner", "plan": "enterprise", "subscription_status": "active",
      "role": "admin"}]

Generate a password hash with:
    python -c "import bcrypt; print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"

/api/v1/pro/* endpoints require a valid pro/enterprise token by default;
set PRO_ACCESS_ENFORCED=false only for local development.

App-wide API gating uses APP_ACCESS_ENFORCED (default true, same opt-out).

Platform owners (OWNER_EMAILS, default "suvenseoras@gmail.com"; see
app/core/owners.py) are healed to role=admin, plan=enterprise,
subscription_status=active, is_active=true whenever their account resolves,
so they always pass admin and Pro gates. Owners are never auto-created.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db_guard import DatabaseUnavailable, find_db_unavailable
from app.core import origins as _origins
from app.core.owners import (
    OWNER_PLAN,
    OWNER_ROLE,
    OWNER_SUBSCRIPTION_STATUS,
    is_owner_email,
)
from app.services.rate_limit import LoginThrottle, RateLimiter, _client_key
from db.models import PlatformUser, UserInvite
from db.schema_patches import heal_platform_users_schema
from db.session import get_db

router = APIRouter()

TOKEN_TTL_SECONDS_DEFAULT = 24 * 3600  # 24h — shorter sessions; override with AUTH_TOKEN_TTL_SECONDS
INVITE_TTL_DAYS_DEFAULT = 14
SESSION_COOKIE_NAME = "mm_session"
ALLOWED_PLANS = {"free", "pro", "enterprise", "dealer"}
ALLOWED_SUBSCRIPTION_STATUSES = {"none", "trialing", "active", "past_due", "canceled"}
ALLOWED_ROLES = {"user", "admin"}
# Dealer includes Pro depth plus yard tools.
PRO_PLANS = {"pro", "enterprise", "dealer"}
ACTIVE_PRO_SUBSCRIPTION_STATUSES = {"active", "trialing"}
# Self-serve trial (TRACK E, additive): SELF_SIGNUP=true lets /auth/self-signup
# create plan=pro + subscription_status=trialing accounts without an invite.
SELF_SIGNUP_TRIAL_DAYS_DEFAULT = 7
SELF_SIGNUP_TRIAL_PLAN = "pro"


def self_signup_enabled() -> bool:
    """Self-serve signup is OFF unless explicitly enabled (no auth weakening by default)."""
    raw = os.getenv("SELF_SIGNUP", os.getenv("ALLOW_SELF_SIGNUP", "false")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def self_signup_trial_days() -> int:
    for env_var in ("SELF_SIGNUP_TRIAL_DAYS", "TRIAL_DAYS"):
        raw = os.getenv(env_var, "").strip()
        try:
            parsed = int(raw)
            if 1 <= parsed <= 90:
                return parsed
        except ValueError:
            continue
    return SELF_SIGNUP_TRIAL_DAYS_DEFAULT


def _trial_ends_at(*, days: int | None = None, now: datetime | None = None) -> datetime:
    base = now or datetime.now(timezone.utc)
    return base + timedelta(days=days if days is not None else self_signup_trial_days())


def _is_trial_expired(*, subscription_status: str, trial_ends_at: datetime | None,
                      now: datetime | None = None) -> bool:
    if str(subscription_status or "").lower() != "trialing":
        return False
    if trial_ends_at is None:
        return False  # legacy trialing rows without expiry stay valid
    ends = trial_ends_at
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    base = now or datetime.now(timezone.utc)
    return ends < base


def _trial_days_left(*, subscription_status: str, trial_ends_at: datetime | None,
                     now: datetime | None = None) -> int | None:
    if str(subscription_status or "").lower() != "trialing" or trial_ends_at is None:
        return None
    ends = trial_ends_at
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    base = now or datetime.now(timezone.utc)
    delta = ends - base
    days = int(delta.total_seconds() // 86400)
    if delta.total_seconds() > 0 and days < 1:
        return 1 if delta.total_seconds() > 0 else 0
    return max(0, days)


def _session_or_none(db: object) -> Optional[Session]:
    """FastAPI injects Session; direct unit calls may pass Depends(...) or omit db."""
    return db if isinstance(db, Session) else None

# Failed-login throttle (per account + per IP, exponential backoff), checked
# BEFORE bcrypt so a locked-out attacker gets no password oracle.
_login_rate_limiter = LoginThrottle(message="Too many sign-in attempts. Try again shortly.")
# Coarse per-IP cap on raw login volume (successes included) - bounds bcrypt
# CPU burn on the single cpu-basic worker.
_login_volume_limiter = RateLimiter(
    max_requests=30,
    window_seconds=60,
    message="Too many sign-in attempts. Try again shortly.",
    tier="auth-login-volume",
    key_func=_client_key,
)
_me_rate_limiter = RateLimiter(
    max_requests=60,
    window_seconds=60,
    message="Too many account lookups. Try again shortly.",
    tier="auth-me",
)
_signup_rate_limiter = RateLimiter(
    max_requests=10,
    window_seconds=60,
    message="Too many sign-up attempts. Try again shortly.",
    tier="auth-signup",
    key_func=_client_key,
)
_delete_account_limiter = RateLimiter(
    max_requests=5,
    window_seconds=300,
    message="Too many account deletion attempts. Try again shortly.",
    tier="auth-delete",
)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=200)


class SignupRequest(BaseModel):
    token: str = Field(..., min_length=16, max_length=128)
    name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=8, max_length=200)


class SelfSignupRequest(BaseModel):
    """Self-serve trial signup (no invite token). Gated by SELF_SIGNUP flag."""

    email: str = Field(..., min_length=3, max_length=255)
    name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=8, max_length=200)


def _token_secret() -> str:
    return os.getenv("AUTH_TOKEN_SECRET", "").strip()


def _token_ttl_seconds() -> int:
    raw = os.getenv("AUTH_TOKEN_TTL_SECONDS", "").strip()
    try:
        parsed = int(raw)
        if parsed > 0:
            return parsed
    except ValueError:
        pass
    return TOKEN_TTL_SECONDS_DEFAULT


def _invite_ttl_days() -> int:
    raw = os.getenv("AUTH_INVITE_TTL_DAYS", "").strip()
    try:
        parsed = int(raw)
        if parsed > 0:
            return parsed
    except ValueError:
        pass
    return INVITE_TTL_DAYS_DEFAULT


def _hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def _verify_password(plain_password: str, hashed_password: str) -> bool:
    if not (hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$")):
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _configured_users() -> dict[str, dict]:
    raw = os.getenv("AUTH_USERS", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, list):
        return {}

    users: dict[str, dict] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        email = str(item.get("email") or "").strip().lower()
        password_hash = str(item.get("password_hash") or "").strip()
        plain_password = str(item.get("password") or "")
        if not email or (not password_hash and not plain_password):
            continue

        plan = str(item.get("plan") or "pro").strip().lower()
        subscription_status = str(item.get("subscription_status") or "active").strip().lower()
        role = str(item.get("role") or "user").strip().lower()

        final_hash = password_hash or _hash_password(plain_password)

        users[email] = {
            "email": email,
            "password_hash": final_hash,
            "name": str(item.get("name") or email.split("@")[0]),
            "plan": plan if plan in ALLOWED_PLANS else "pro",
            "subscription_status": subscription_status
            if subscription_status in ALLOWED_SUBSCRIPTION_STATUSES
            else "active",
            "role": role if role in ALLOWED_ROLES else "user",
            "is_active": True,
            "token_version": 0,
            "source": "env",
        }
    return users


def auth_is_configured() -> bool:
    """Auth works when a signing secret is set and at least one account source exists.

    Account sources: AUTH_USERS env, or any row in platform_users (checked at
    request time). Secret alone is enough for invite validation / signup once
    an admin has been seeded via AUTH_USERS or a prior DB user.
    """
    return bool(_token_secret())


def auth_has_login_accounts(db: Optional[Session] = None) -> bool:
    if _configured_users():
        return True
    if db is None:
        return False
    try:
        return db.query(PlatformUser.id).filter(PlatformUser.is_active.is_(True)).first() is not None
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return False


def _b64url_encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def issue_token(
    email: str,
    plan: str,
    subscription_status: str = "active",
    *,
    role: str = "user",
    token_version: int = 0,
    now: Optional[float] = None,
) -> tuple[str, int]:
    secret = _token_secret()
    expires_at = int((time.time() if now is None else now) + _token_ttl_seconds())
    normalized_subscription_status = str(subscription_status or "active").strip().lower()
    normalized_role = str(role or "user").strip().lower()
    if normalized_role not in ALLOWED_ROLES:
        normalized_role = "user"
    payload = _b64url_encode(
        json.dumps(
            {
                "email": email,
                "plan": plan,
                "subscription_status": normalized_subscription_status,
                "role": normalized_role,
                "tv": int(token_version or 0),
                "exp": expires_at,
            },
            separators=(",", ":"),
        ).encode()
    )
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}", expires_at


def verify_token(token: str, *, now: Optional[float] = None) -> Optional[dict]:
    secret = _token_secret()
    if not secret or not token or "." not in token:
        return None

    payload_part, _, signature = token.partition(".")
    expected = hmac.new(secret.encode(), payload_part.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None

    try:
        payload = json.loads(_b64url_decode(payload_part))
    except (ValueError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None
    if float(payload.get("exp") or 0) < (time.time() if now is None else now):
        return None
    return payload


def _user_response(record: dict) -> dict:
    name = record["name"]
    initials = "".join(part[0] for part in name.split() if part)[:3].upper() or "AU"
    trial_ends_at = record.get("trial_ends_at") or record.get("trialEndsAt")
    trial_ends_iso: Optional[str] = None
    if isinstance(trial_ends_at, datetime):
        ends = trial_ends_at
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=timezone.utc)
        trial_ends_iso = ends.isoformat()
    elif isinstance(trial_ends_at, str) and trial_ends_at:
        trial_ends_iso = trial_ends_at
    ends_dt = trial_ends_at if isinstance(trial_ends_at, datetime) else None
    return {
        "email": record["email"],
        "name": name,
        "plan": record["plan"],
        "subscriptionStatus": record["subscription_status"],
        "role": record.get("role") or "user",
        "avatarInitials": initials,
        "trialEndsAt": trial_ends_iso,
        "trialDaysLeft": _trial_days_left(
            subscription_status=str(record.get("subscription_status") or ""),
            trial_ends_at=ends_dt,
        ),
    }


def _platform_user_to_record(user: PlatformUser) -> dict:
    return {
        "email": user.email,
        "password_hash": user.password_hash,
        "name": user.name,
        "plan": user.plan,
        "subscription_status": user.subscription_status,
        "role": user.role,
        "is_active": bool(user.is_active),
        "token_version": int(getattr(user, "token_version", 0) or 0),
        "source": "db",
        "id": user.id,
        "trial_ends_at": getattr(user, "trial_ends_at", None),
    }


def bump_token_version(db: Session, *, email: Optional[str] = None, user_id: Optional[int] = None) -> int:
    """Invalidate outstanding JWTs for a platform user by bumping token_version."""
    query = db.query(PlatformUser)
    if user_id is not None:
        query = query.filter(PlatformUser.id == user_id)
    elif email:
        query = query.filter(PlatformUser.email == email.strip().lower())
    else:
        return 0
    row = query.first()
    if row is None:
        return 0
    row.token_version = int(getattr(row, "token_version", 0) or 0) + 1
    db.commit()
    db.refresh(row)
    return int(row.token_version or 0)


def _owner_row_needs_heal(row: PlatformUser) -> bool:
    return (
        str(row.role or "").lower() != OWNER_ROLE
        or str(row.plan or "").lower() != OWNER_PLAN
        or str(row.subscription_status or "").lower() != OWNER_SUBSCRIPTION_STATUS
        or not bool(row.is_active)
    )


def _heal_owner_row(row: PlatformUser, db: Session) -> PlatformUser:
    """Force an OWNER_EMAILS account row to admin + enterprise + active.

    token_version is deliberately NOT bumped: live checks re-read the row, so
    existing sessions keep working and immediately gain owner access.
    """
    if not is_owner_email(row.email) or not _owner_row_needs_heal(row):
        return row
    row.role = OWNER_ROLE
    row.plan = OWNER_PLAN
    row.subscription_status = OWNER_SUBSCRIPTION_STATUS
    row.is_active = True
    try:
        db.commit()
        db.refresh(row)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return row


def _elevate_owner_record(record: Optional[dict]) -> Optional[dict]:
    """Return a copy of an account record with owner privileges applied."""
    if not record or not is_owner_email(record.get("email")):
        return record
    elevated = dict(record)
    elevated["role"] = OWNER_ROLE
    elevated["plan"] = OWNER_PLAN
    elevated["subscription_status"] = OWNER_SUBSCRIPTION_STATUS
    elevated["is_active"] = True
    return elevated


def resolve_live_session(payload: dict, db: Optional[Session] = None) -> dict:
    """Re-read plan/role/active from the account store; reject revoked/inactive sessions.

    Never trusts JWT plan/role alone once an account row exists (or AUTH_USERS entry).
    """
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Authentication required.")

    record = resolve_user_record(email, db)
    if record is None:
        raise HTTPException(status_code=401, detail="Session is no longer valid.")

    token_tv = int(payload.get("tv") or 0)
    record_tv = int(record.get("token_version") or 0)
    # Env-only accounts have no token_version until synced; treat missing as 0.
    if record.get("source") == "db" and token_tv != record_tv:
        raise HTTPException(status_code=401, detail="Session has been revoked.")

    return {
        "email": email,
        "plan": record["plan"],
        "subscription_status": record["subscription_status"],
        "role": record.get("role") or "user",
        "token_version": record_tv,
        "name": record.get("name") or email.split("@")[0],
        "id": record.get("id"),
        "source": record.get("source"),
        "trial_ends_at": record.get("trial_ends_at"),
    }


def resolve_user_record(email: str, db: Optional[Session] = None) -> Optional[dict]:
    """Resolve an account by email from DB first, then AUTH_USERS env."""
    normalized = email.strip().lower()
    if not normalized:
        return None

    db_unavailable = False
    if db is not None:
        try:
            row = db.query(PlatformUser).filter(PlatformUser.email == normalized).first()
            if row is not None:
                if is_owner_email(row.email):
                    # Owner allowlist: heal the row (role/plan/status/active)
                    # and always report owner privileges, even if the heal
                    # write fails.
                    row = _heal_owner_row(row, db)
                    return _elevate_owner_record(_platform_user_to_record(row))
                if not row.is_active:
                    return None
                return _platform_user_to_record(row)
        except Exception as exc:
            # Table/column may be missing during early migrate — fall through.
            # Postgres aborts the whole transaction on the failed statement; without
            # rollback, later queries in this same request (invites, listings) 500.
            db_unavailable = find_db_unavailable(exc) is not None
            try:
                db.rollback()
            except Exception:
                pass

    env_record = _elevate_owner_record(_configured_users().get(normalized))
    if env_record is None and (db_unavailable or _accounts_store_degraded()):
        # Outage: we cannot tell "no such account" from "DB down". Answer 503
        # instead of 401 so clients keep their session and retry, rather than
        # signing the user out.
        raise DatabaseUnavailable("account store unavailable")
    return env_record


def _accounts_store_degraded() -> bool:
    """True while the account tables are unreadable as a source of truth.

    That is the case while serving from the SQLite failover dump: the dump is
    a public file and deliberately carries no accounts, so "no row" there
    means "unknown", not "no such account". A dedicated account store
    (AUTH_DATABASE_URL) is unaffected by the catalog failover.
    """
    try:
        from db import session as db_session

        if db_session.has_dedicated_auth_store():
            return False
    except Exception:
        pass
    try:
        from db.sqlite_failover import failover_active

        return bool(failover_active())
    except Exception:
        return False


def _ensure_account_writes_allowed() -> None:
    """Refuse account-creating writes while the account store is degraded.

    In failover mode the API is bound to a throwaway SQLite copy: an invite
    lookup there answers "not found" for every real invite, and an account
    created there silently disappears when the API fails back to Neon (or the
    Space restarts). Answer 503 + Retry-After instead so clients retry later.
    """
    if _accounts_store_degraded():
        raise DatabaseUnavailable("account store unavailable (failover mode)")


def sync_env_user_to_db(record: dict, db: Session) -> Optional[PlatformUser]:
    """Upsert an AUTH_USERS bootstrap account into platform_users.

    AUTH_USERS remains the source of truth for bootstrap admins: if a DB row
    already exists (e.g. from an earlier secret), refresh credentials/plan/role
    from the env entry so rotating HF secrets actually unlocks login.
    """
    try:
        heal_platform_users_schema(db)
    except Exception:
        pass

    email = record["email"]
    existing = db.query(PlatformUser).filter(PlatformUser.email == email).first()
    if existing is not None:
        existing.password_hash = record["password_hash"]
        existing.name = record["name"]
        existing.plan = record["plan"]
        existing.subscription_status = record["subscription_status"]
        existing.role = record.get("role") or existing.role or "user"
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return _heal_owner_row(existing, db)
    user = PlatformUser(
        email=email,
        password_hash=record["password_hash"],
        name=record["name"],
        plan=record["plan"],
        subscription_status=record["subscription_status"],
        role=record.get("role") or "user",
        is_active=True,
        invited_by_email="system:AUTH_USERS",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _heal_owner_row(user, db)


def default_subscription_for_plan(plan: str) -> str:
    if plan in PRO_PLANS:
        return "active"
    return "none"


def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


def invite_expiry(*, now: Optional[datetime] = None) -> datetime:
    base = now or datetime.now(timezone.utc)
    return base + timedelta(days=_invite_ttl_days())


def _cookie_secure() -> bool:
    return os.getenv("AUTH_COOKIE_SECURE", "true").strip().lower() not in {"0", "false", "no", "off"}


def _cookie_samesite() -> str:
    """SameSite for mm_session. Default ``lax``.

    The web app talks to the API same-origin through the Vercel / Pages
    ``/api/v1`` rewrite, so the cookie is first-party and Lax is enough.
    ``none`` made the cookie ride every cross-site request (CSRF + credentialed
    CORS reads). Set AUTH_COOKIE_SAMESITE=none only for a deliberate
    cross-site deployment (it also requires Secure).
    """
    raw = os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
    if raw in {"lax", "strict", "none"}:
        return raw
    return "lax"


def _extract_token(
    authorization: Optional[str] = None,
    request: Optional[Request] = None,
) -> str:
    """Prefer Authorization Bearer, then fall back to the HttpOnly session cookie."""
    # Direct unit calls may pass FastAPI Header() defaults instead of None/str.
    auth_value = authorization if isinstance(authorization, str) else None
    bearer = (auth_value or "").removeprefix("Bearer ").strip()
    if bearer:
        return bearer
    if request is not None:
        cookie = str(request.cookies.get(SESSION_COOKIE_NAME) or "").strip()
        if cookie:
            return cookie
    return ""


def _set_session_cookie(response: Response, token: str, expires_at: int) -> None:
    max_age = max(60, int(expires_at - time.time()))
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        max_age=max_age,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=_cookie_secure(),
        httponly=True,
        samesite=_cookie_samesite(),
    )


def _issue_login_response(record: dict, response: Response, db: Optional[Session] = None) -> dict:
    session = _session_or_none(db)
    if session is not None and record.get("source") == "env":
        try:
            synced = sync_env_user_to_db(record, session)
            if synced is not None:
                record = _platform_user_to_record(synced)
        except Exception:
            session.rollback()

    if session is not None and record.get("id"):
        try:
            row = session.query(PlatformUser).filter(PlatformUser.id == record["id"]).first()
            if row is not None:
                row.last_login_at = datetime.now(timezone.utc)
                session.commit()
                row = _heal_owner_row(row, session)
                record = _platform_user_to_record(row)
        except Exception:
            session.rollback()

    record = _elevate_owner_record(record)
    token, expires_at = issue_token(
        record["email"],
        record["plan"],
        record["subscription_status"],
        role=record.get("role") or "user",
        token_version=int(record.get("token_version") or 0),
    )
    _set_session_cookie(response, token, expires_at)
    return {
        "user": _user_response(record),
        "token": token,
        "expires_at": expires_at,
    }


@router.post("/login", response_model=dict)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Optional[Session] = Depends(get_db),
):
    if not auth_is_configured():
        raise HTTPException(status_code=503, detail="Authentication is not configured on this deployment.")

    email = payload.email.strip().lower()
    client_ip = _client_key(request)
    # Throttle checks run BEFORE any password verification: a locked account
    # or IP gets 429 even with the right password, so lockout is not a
    # password oracle. Only failures count towards the lockout.
    _login_rate_limiter.check(client_ip, email)
    _login_volume_limiter(request)

    session = _session_or_none(db)
    record = resolve_user_record(email, session)
    env_record = _configured_users().get(email)

    db_ok = bool(record and _verify_password(payload.password, record["password_hash"]))
    env_ok = bool(env_record and _verify_password(payload.password, env_record["password_hash"]))

    if db_ok or env_ok:
        _login_rate_limiter.record_success(email)
        return _issue_login_response(env_record if (env_ok and not db_ok) else record, response, db)

    _login_rate_limiter.record_failure(client_ip, email)
    raise HTTPException(status_code=401, detail="Invalid email or password.")


@router.post("/signup", response_model=dict)
def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Complete an admin invite: create platform_users row and sign the user in."""
    _signup_rate_limiter(request)

    if not auth_is_configured():
        raise HTTPException(status_code=503, detail="Authentication is not configured on this deployment.")
    if db is None:
        raise HTTPException(status_code=503, detail="Database is required for invite signup.")
    _ensure_account_writes_allowed()

    token = payload.token.strip()
    invite = db.query(UserInvite).filter(UserInvite.token == token).first()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if invite.status != "pending":
        raise HTTPException(status_code=410, detail="Invite is no longer valid.")

    expires_at = invite.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invite has expired.")

    email = invite.email.strip().lower()
    existing = db.query(PlatformUser).filter(PlatformUser.email == email).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account already exists for this email.")

    plan = invite.plan if invite.plan in ALLOWED_PLANS else "free"
    role = invite.role if invite.role in ALLOWED_ROLES else "user"
    subscription_status = default_subscription_for_plan(plan)
    name = payload.name.strip() or email.split("@")[0]

    user = PlatformUser(
        email=email,
        password_hash=_hash_password(payload.password),
        name=name,
        plan=plan,
        subscription_status=subscription_status,
        role=role,
        is_active=True,
        invited_by_email=invite.invited_by_email,
        last_login_at=datetime.now(timezone.utc),
    )
    invite.status = "accepted"
    invite.accepted_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)

    record = _platform_user_to_record(user)
    return _issue_login_response(record, response, db)


@router.get("/invite/{token}", response_model=dict)
def invite_preview(token: str, db: Session = Depends(get_db)):
    """Public preview of a pending invite (no secrets)."""
    _ensure_account_writes_allowed()
    invite = db.query(UserInvite).filter(UserInvite.token == token.strip()).first()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if invite.status != "pending":
        raise HTTPException(status_code=410, detail="Invite is no longer valid.")

    expires_at = invite.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invite has expired.")

    return {
        "email": invite.email,
        "plan": invite.plan,
        "expiresAt": expires_at.isoformat(),
    }


@router.post("/logout", response_model=dict)
def logout(
    response: Response,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Optional[Session] = Depends(get_db),
):
    """Clear cookie and revoke the current token version when a DB user is known."""
    token = _extract_token(authorization, request)
    payload = verify_token(token)
    session = _session_or_none(db)
    if payload is not None and session is not None:
        email = str(payload.get("email") or "").strip().lower()
        if email:
            try:
                bump_token_version(session, email=email)
            except Exception:
                session.rollback()
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=dict)
def me(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Optional[Session] = Depends(get_db),
):
    _me_rate_limiter(request)
    token = _extract_token(authorization, request)
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    live = resolve_live_session(payload, _session_or_none(db))
    return _user_response(
        {
            "email": live["email"],
            "name": live["name"],
            "plan": live["plan"],
            "subscription_status": live["subscription_status"],
            "role": live["role"],
            "trial_ends_at": live.get("trial_ends_at"),
        }
    )


class DeleteAccountRequest(BaseModel):
    """Optional re-authentication for account deletion."""

    password: Optional[str] = Field(default=None, max_length=200)


def _delete_account_data(db: Session, email: str) -> dict:
    """Hard-delete a platform user and the personal data keyed to them.

    Returns per-table counts. Runs in the caller's transaction (no commit).
    """
    from db.models import (
        AnalyticsEvent,
        CarListing,
        DealerProfile,
        MarketAlert,
        MarketAlertMatch,
        PushSubscription,
        UserFeedback,
        UserNotification,
    )

    counts: dict[str, int] = {}
    owner_token = f"mm:{email}"

    # Alerts (+ their match rows), notifications, push subscriptions.
    alert_ids = [row.id for row in db.query(MarketAlert.id).filter(MarketAlert.user_token == owner_token).all()]
    if alert_ids:
        counts["alert_matches"] = (
            db.query(MarketAlertMatch)
            .filter(MarketAlertMatch.alert_id.in_(alert_ids))
            .delete(synchronize_session=False)
        )
    counts["alerts"] = (
        db.query(MarketAlert).filter(MarketAlert.user_token == owner_token).delete(synchronize_session=False)
    )
    counts["notifications"] = (
        db.query(UserNotification)
        .filter(UserNotification.user_token == owner_token)
        .delete(synchronize_session=False)
    )
    counts["push_subscriptions"] = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_token == owner_token)
        .delete(synchronize_session=False)
    )

    # Seller listings created by this user (contact details, photos, text).
    listing_ids = [
        row.id
        for row in db.query(CarListing.id)
        .filter(CarListing.owner_user_id == email, CarListing.source == "motormila_user")
        .all()
    ]
    if listing_ids:
        db.query(CarListing).filter(CarListing.duplicate_of.in_(listing_ids)).update(
            {CarListing.duplicate_of: None}, synchronize_session=False
        )
        counts["listings"] = (
            db.query(CarListing).filter(CarListing.id.in_(listing_ids)).delete(synchronize_session=False)
        )

    counts["feedback"] = (
        db.query(UserFeedback).filter(UserFeedback.email == email).delete(synchronize_session=False)
    )
    counts["invites"] = db.query(UserInvite).filter(UserInvite.email == email).delete(synchronize_session=False)
    counts["analytics_unlinked"] = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.user_email == email)
        .update({AnalyticsEvent.user_email: None}, synchronize_session=False)
    )
    for column in (DealerProfile.contact_email, DealerProfile.billing_email):
        db.query(DealerProfile).filter(column == email).update({column: None}, synchronize_session=False)

    counts["user"] = db.query(PlatformUser).filter(PlatformUser.email == email).delete(synchronize_session=False)
    return counts


@router.delete("/me", response_model=dict)
def delete_my_account(
    request: Request,
    response: Response,
    payload: Optional[DeleteAccountRequest] = None,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Permanently delete the signed-in account and its personal data.

    Auth: ``Authorization: Bearer <token>`` (Android / API) or the
    ``mm_session`` cookie from a trusted Origin (web; enforced by the CSRF
    middleware). Optional JSON body ``{"password": "..."}`` re-checks the
    password when supplied.

    Deletes the platform_users row, the user's alerts (+ matches),
    notifications, push subscriptions, seller listings, feedback and pending
    invites; unlinks analytics events and dealer-profile emails. Deleting the
    user row revokes every outstanding token (sessions resolve against the
    live account store). Bootstrap accounts defined in AUTH_USERS cannot be
    deleted through the API (409).
    """
    _delete_account_limiter(request)
    token = _extract_token(authorization, request)
    claims = verify_token(token)
    if claims is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    live = resolve_live_session(claims, _session_or_none(db))
    email = live["email"]

    if email in _configured_users():
        raise HTTPException(
            status_code=409,
            detail="This bootstrap account is managed by the operator and cannot be deleted here.",
        )
    if db is None or not isinstance(db, Session):
        raise HTTPException(status_code=503, detail="Account deletion is temporarily unavailable.")

    row = db.query(PlatformUser).filter(PlatformUser.email == email).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    if payload is not None and payload.password:
        if not _verify_password(payload.password, row.password_hash or ""):
            raise HTTPException(status_code=403, detail="Password is incorrect.")

    try:
        counts = _delete_account_data(db, email)
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        if find_db_unavailable(exc) is not None:
            raise
        raise HTTPException(status_code=500, detail="Account deletion failed; nothing was deleted.") from exc

    _clear_session_cookie(response)
    return {"ok": True, "deleted": True, "email": email, "counts": counts}


@router.get("/self-signup/status", response_model=dict)
def self_signup_status() -> dict:
    """Public flag so Pricing/ProPreview can switch CTAs to self-serve trial."""
    return {
        "enabled": self_signup_enabled(),
        "trialDays": self_signup_trial_days(),
        "plan": SELF_SIGNUP_TRIAL_PLAN,
    }


@router.post("/self-signup", response_model=dict)
def self_signup(
    payload: SelfSignupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Self-serve trial signup (no invite). Creates plan=pro + trialing for N days.

    Gated by SELF_SIGNUP=true (default off — invite path unchanged). Rate-limited
    like invite signup. Trial expiry is stored on platform_users.trial_ends_at;
    expired trials are rejected by the Pro gate.
    """
    _signup_rate_limiter(request)

    if not auth_is_configured():
        raise HTTPException(status_code=503, detail="Authentication is not configured on this deployment.")
    if not self_signup_enabled():
        raise HTTPException(status_code=403, detail="Self-serve signup is disabled. Ask your Motormila admin for an invite.")
    if db is None:
        raise HTTPException(status_code=503, detail="Database is required for self-serve signup.")
    _ensure_account_writes_allowed()

    try:
        heal_platform_users_schema(db)
    except Exception:
        pass

    email = payload.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    existing = db.query(PlatformUser).filter(PlatformUser.email == email).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account already exists for this email. Sign in instead.")

    trial_days = self_signup_trial_days()
    now = datetime.now(timezone.utc)
    name = payload.name.strip() or email.split("@")[0]

    user = PlatformUser(
        email=email,
        password_hash=_hash_password(payload.password),
        name=name,
        plan=SELF_SIGNUP_TRIAL_PLAN,
        subscription_status="trialing",
        role="user",
        is_active=True,
        invited_by_email="self-signup",
        last_login_at=now,
    )
    # trial_ends_at column may predate the running DB — set defensively.
    try:
        user.trial_ends_at = now + timedelta(days=trial_days)  # type: ignore[attr-defined]
    except Exception:
        pass
    db.add(user)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Self-serve signup is unavailable on this deployment.") from exc
    db.refresh(user)

    record = _platform_user_to_record(user)
    return _issue_login_response(record, response, db)


def pro_access_enforced() -> bool:
    """Server-side Pro gating is ON unless explicitly disabled.

    Secure by default: an unset or unrecognised PRO_ACCESS_ENFORCED value
    enforces the gate; set it to false/0/no/off only for local development.
    """
    return os.getenv("PRO_ACCESS_ENFORCED", "true").strip().lower() not in {"0", "false", "no", "off"}


def app_access_enforced() -> bool:
    """Require a signed-in session for protected product APIs.

    Secure by default (same pattern as Pro). Opt out with APP_ACCESS_ENFORCED=false
    for local development / open public demos.
    """
    return os.getenv("APP_ACCESS_ENFORCED", "true").strip().lower() not in {"0", "false", "no", "off"}


# First-party origins (this app's own deployments) are always trusted for writes.
# This list is deliberately separate from the CORS response-header allowlist in
# app/main.py: that one may be set to "*" (an operator escape hatch, which also
# forces allow_credentials off), whereas a wildcard here would turn the CSRF
# check into a no-op. Keep the two concepts apart.
# Single source of truth lives in app/core/origins.py (shared with CORS and
# the global CSRF middleware).
FIRST_PARTY_ORIGINS = frozenset(_origins.DEFAULT_ALLOWED_ORIGINS)


def _normalize_origin(value: Optional[str]) -> Optional[str]:
    """Canonicalize an origin for comparison: scheme://host[:port], no path/slash.

    Compares the request's Origin/Referer against the allowlist on both sides,
    so a stray trailing slash or uppercase host cannot fail an otherwise
    trusted same-origin write.
    """
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate:
        return None
    try:
        parsed = urlparse(candidate)
    except Exception:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _cors_allowed_origins() -> set[str]:
    """Origins permitted to perform unsafe (write) requests.

    CORS_ORIGINS may *extend* this set, never shrink it. Previously an explicit
    CORS_ORIGINS value replaced the built-in list wholesale, so a Space secret
    that merely listed the API host silently revoked the frontend's own origin
    and every write 403'd with "Writes require a trusted Origin." — the site
    blocking itself.
    """
    return _origins.write_allowlist()


def _request_origin(request: Request) -> Optional[str]:
    origin = _normalize_origin(request.headers.get("origin"))
    if origin:
        return origin
    return _normalize_origin(request.headers.get("referer"))


def _trusted_origin_suffixes() -> tuple[str, ...]:
    """Team-controlled domain suffixes trusted for writes, beyond exact matches.

    Vercel preview deployments get a unique hashed hostname per deployment
    (vehicle-platform-<hash>-suvenseoras-projects.vercel.app), so exact-match
    allowlisting cannot cover them — every write from a preview 403'd with
    "Writes require a trusted Origin." Scoping to the team's own Vercel account
    keeps this tight: only this team can mint hostnames under it (the team slug
    in the hostname is the deploying team's own slug), and writes still require
    a valid Bearer token that a third-party page cannot obtain.
    Extend (never shrink) via TRUSTED_ORIGIN_SUFFIXES, comma-separated host
    suffixes — e.g. "-myteam.vercel.app" for a Vercel team scope,
    ".example.com" for a domain and its subdomains.
    """
    return _origins.trusted_origin_suffixes()


def _is_trusted_origin(origin: Optional[str]) -> bool:
    """True when the request origin may perform writes.

    Exact matches come from `_cors_allowed_origins()` (first-party list plus
    CORS_ORIGINS extensions, wildcards excluded); anything else must fall under
    one of the trusted team-controlled domain suffixes.
    """
    return _origins.is_trusted_write_origin(origin)


def _is_unsafe_method(request: Request) -> bool:
    return str(getattr(request, "method", "GET") or "GET").upper() in {
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
    }


def get_current_auth_payload(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Optional[Session] = Depends(get_db),
) -> dict:
    token = _extract_token(authorization, request)
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return resolve_live_session(payload, _session_or_none(db))


def require_authenticated(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Optional[Session] = Depends(get_db),
) -> Optional[dict]:
    """Gate for product APIs when APP_ACCESS_ENFORCED is on.

    Unsafe methods additionally require a Bearer token and a trusted Origin
    so a cookie-only CSRF cannot write through ``mm_session`` (SameSite=None).
    """
    if not app_access_enforced():
        return None
    if _is_unsafe_method(request):
        auth_value = authorization if isinstance(authorization, str) else None
        bearer = (auth_value or "").removeprefix("Bearer ").strip()
        if not bearer:
            raise HTTPException(
                status_code=403,
                detail="Writes require an Authorization Bearer token (cookie alone is not accepted).",
            )
        # Native clients (Android) send a Bearer token and no Origin header.
        # A Bearer token cannot be attached by a foreign page, so a missing
        # Origin is fine; a present-but-untrusted Origin is still rejected.
        origin = _request_origin(request)
        if origin and not _is_trusted_origin(origin):
            raise HTTPException(status_code=403, detail="Writes require a trusted Origin.")
    return get_current_auth_payload(request, authorization, db)


def require_admin_access(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Require an authenticated admin from the live account store (not JWT role alone).

    Cookie-only admin writes additionally need a trusted Origin/Referer
    (defence in depth on top of the global CSRF middleware); Bearer-token
    admin calls are not CSRF-able and pass.
    """
    if _is_unsafe_method(request):
        auth_value = authorization if isinstance(authorization, str) else None
        bearer = (auth_value or "").removeprefix("Bearer ").strip()
        if not bearer and not _is_trusted_origin(_request_origin(request)):
            raise HTTPException(status_code=403, detail="Admin writes require a trusted Origin.")
    live = get_current_auth_payload(request, authorization, db)
    if is_owner_email(live.get("email")):
        live = _elevate_owner_record(live)
    if str(live.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return {
        "email": live["email"],
        "plan": live["plan"],
        "role": "admin",
        "subscription_status": live["subscription_status"],
    }


def require_pro_access(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Optional[Session] = Depends(get_db),
) -> None:
    """Gate for /pro/* — requires a valid pro/enterprise token unless
    PRO_ACCESS_ENFORCED=false explicitly opts out (local dev only).

    Accepts Authorization Bearer *or* the HttpOnly ``mm_session`` cookie for
    safe (GET) methods. Mutating methods require a Bearer token AND an Origin
    (or Referer) in the CORS allowlist so cookie-only CSRF cannot unlock Pro writes.

    Plan/status are re-read from the live account store so downgrades take effect
    immediately (JWT claims alone are not trusted).
    """
    if not pro_access_enforced():
        return

    unsafe = _is_unsafe_method(request)
    auth_value = authorization if isinstance(authorization, str) else None
    bearer = (auth_value or "").removeprefix("Bearer ").strip()
    if unsafe and not bearer:
        raise HTTPException(
            status_code=403,
            detail="Pro writes require an Authorization Bearer token (cookie alone is not accepted).",
        )

    if unsafe:
        origin = _request_origin(request)
        if not _is_trusted_origin(origin):
            raise HTTPException(status_code=403, detail="Pro writes require a trusted Origin.")

    token = _extract_token(authorization, request)
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Pro access requires a valid session token.")

    live = resolve_live_session(payload, _session_or_none(db))
    if is_owner_email(live.get("email")):
        # Platform owner: full paid access regardless of plan/trial state.
        return
    if str(live.get("plan") or "").lower() not in PRO_PLANS:
        raise HTTPException(status_code=403, detail="Pro subscription required.")
    subscription_status = str(live.get("subscription_status") or "active").lower()
    if subscription_status not in ACTIVE_PRO_SUBSCRIPTION_STATUSES:
        raise HTTPException(status_code=403, detail="Active Pro subscription required.")
    if _is_trial_expired(
        subscription_status=subscription_status,
        trial_ends_at=live.get("trial_ends_at") if isinstance(live.get("trial_ends_at"), datetime) else None,
    ):
        raise HTTPException(status_code=403, detail="Free trial has expired. Upgrade to Pro to keep access.")
