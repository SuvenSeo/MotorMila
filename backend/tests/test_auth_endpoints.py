import json
import hashlib
import hmac
import sys
import time
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import auth

# Hashed once at module load — bcrypt at rounds=12 is deliberately slow.
_BCRYPT_HASH = auth._hash_password("correct-horse")


class DummyRequest:
    method = "GET"
    headers = {"user-agent": "pytest"}
    client = type("Client", (), {"host": "127.0.0.1"})()
    cookies: dict = {}

def _configure(monkeypatch, *, plan: str = "enterprise", subscription_status: str = "active"):
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "owner@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Owner Person",
                    "plan": plan,
                    "subscription_status": subscription_status,
                }
            ]
        ),
    )


def setup_function():
    auth._login_rate_limiter.reset()
    auth._me_rate_limiter.reset()


def test_login_rejected_when_not_configured(monkeypatch):
    monkeypatch.delenv("AUTH_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("AUTH_USERS", raising=False)

    with pytest.raises(HTTPException) as excinfo:
        auth.login(auth.LoginRequest(email="a@b.com", password="x"), DummyRequest(), __import__("fastapi").Response())

    assert excinfo.value.status_code == 503


def test_login_success_returns_signed_token_and_user(monkeypatch):
    _configure(monkeypatch)

    from fastapi import Response

    response = Response()
    result = auth.login(
        auth.LoginRequest(email="OWNER@example.com", password="correct-horse"),
        DummyRequest(),
        response,
    )

    assert result["user"]["email"] == "owner@example.com"
    assert result["user"]["plan"] == "enterprise"
    assert result["user"]["avatarInitials"] == "OP"

    payload = auth.verify_token(result["token"])
    assert payload is not None
    assert payload["email"] == "owner@example.com"
    assert payload["subscription_status"] == "active"
    # HttpOnly session cookie mirrors the token for XSS-resistant auth.
    set_cookie = response.headers.get("set-cookie", "")
    assert auth.SESSION_COOKIE_NAME in set_cookie
    assert "HttpOnly" in set_cookie


def test_login_rejects_wrong_password(monkeypatch):
    _configure(monkeypatch)

    from fastapi import Response

    with pytest.raises(HTTPException) as excinfo:
        auth.login(
            auth.LoginRequest(email="owner@example.com", password="wrong"),
            DummyRequest(),
            Response(),
        )

    assert excinfo.value.status_code == 401


def test_pro_gate_accepts_session_cookie(monkeypatch):
    _configure(monkeypatch, plan="enterprise")
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")

    token, _ = auth.issue_token("owner@example.com", "enterprise")

    class CookieRequest:
        method = "GET"
        headers = {"user-agent": "pytest"}
        client = type("Client", (), {"host": "127.0.0.1"})()
        cookies = {auth.SESSION_COOKIE_NAME: token}

    assert auth.require_pro_access(request=CookieRequest(), authorization=None) is None


def test_logout_clears_session_cookie(monkeypatch):
    from fastapi import Response

    response = Response()
    auth.logout(response, DummyRequest())
    set_cookie = response.headers.get("set-cookie", "")
    assert auth.SESSION_COOKIE_NAME in set_cookie
    assert "Max-Age=0" in set_cookie or "max-age=0" in set_cookie.lower()

def test_verify_token_rejects_tampered_and_expired_tokens(monkeypatch):
    _configure(monkeypatch)

    token, _ = auth.issue_token("owner@example.com", "enterprise", now=1_000_000)
    assert auth.verify_token(token, now=1_000_100) is not None
    assert auth.verify_token(token + "0", now=1_000_100) is None
    assert auth.verify_token(token, now=1_000_000 + auth._token_ttl_seconds() + 1) is None


def test_pro_gate_enforced_by_default(monkeypatch):
    monkeypatch.delenv("PRO_ACCESS_ENFORCED", raising=False)
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret")

    # Secure by default: unset flag means the gate rejects missing tokens.
    with pytest.raises(HTTPException) as excinfo:
        auth.require_pro_access(request=DummyRequest(), authorization=None)
    assert excinfo.value.status_code == 401


def test_pro_gate_can_be_disabled_for_local_dev(monkeypatch):
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "false")

    # Explicit opt-out: no token required.
    assert auth.require_pro_access(request=DummyRequest(), authorization=None) is None


def test_sha256_credentials_are_rejected(monkeypatch):
    """Legacy unsalted SHA-256 entries must no longer authenticate."""
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "legacy@example.com",
                    "password_sha256": hashlib.sha256(b"correct-horse").hexdigest(),
                    "plan": "pro",
                }
            ]
        ),
    )

    with pytest.raises(HTTPException) as excinfo:
        auth.login(
            auth.LoginRequest(email="legacy@example.com", password="correct-horse"),
            DummyRequest(),
            __import__("fastapi").Response(),
        )
    # The legacy entry has no usable hash, so auth reports not-configured (503)
    # rather than accepting the weak credential.
    assert excinfo.value.status_code in (401, 503)


def test_pro_gate_enforced_requires_pro_plan(monkeypatch):
    _configure(monkeypatch, plan="enterprise")
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "owner@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Owner Person",
                    "plan": "enterprise",
                    "subscription_status": "active",
                },
                {
                    "email": "someone@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Free Person",
                    "plan": "free",
                    "subscription_status": "none",
                },
            ]
        ),
    )

    with pytest.raises(HTTPException) as no_token:
        auth.require_pro_access(request=DummyRequest(), authorization=None)
    assert no_token.value.status_code == 401

    good_token, _ = auth.issue_token("owner@example.com", "enterprise")
    assert auth.require_pro_access(request=DummyRequest(), authorization=f"Bearer {good_token}") is None

    free_token, _ = auth.issue_token("someone@example.com", "free")
    with pytest.raises(HTTPException) as wrong_plan:
        auth.require_pro_access(request=DummyRequest(), authorization=f"Bearer {free_token}")
    assert wrong_plan.value.status_code == 403


def test_pro_gate_rejects_inactive_subscription(monkeypatch):
    _configure(monkeypatch, plan="enterprise", subscription_status="past_due")
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")

    result = auth.login(
        auth.LoginRequest(email="owner@example.com", password="correct-horse"),
        DummyRequest(),
        __import__("fastapi").Response(),
    )

    with pytest.raises(HTTPException) as inactive_subscription:
        auth.require_pro_access(request=DummyRequest(), authorization=f"Bearer {result['token']}")
    assert inactive_subscription.value.status_code == 403


def test_pro_gate_allows_trialing_subscription(monkeypatch):
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "trial@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Trial User",
                    "plan": "pro",
                    "subscription_status": "trialing",
                }
            ]
        ),
    )

    token, _ = auth.issue_token("trial@example.com", "pro", "trialing")
    assert auth.require_pro_access(request=DummyRequest(), authorization=f"Bearer {token}") is None


def test_pro_gate_allows_legacy_token_without_subscription_status(monkeypatch):
    monkeypatch.setenv("PRO_ACCESS_ENFORCED", "true")
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "legacy@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Legacy User",
                    "plan": "enterprise",
                    "subscription_status": "active",
                }
            ]
        ),
    )

    expires_at = int(time.time() + auth._token_ttl_seconds())
    payload_part = auth._b64url_encode(
        json.dumps(
            {"email": "legacy@example.com", "plan": "enterprise", "exp": expires_at},
            separators=(",", ":"),
        ).encode()
    )
    signature = hmac.new(
        auth._token_secret().encode(),
        payload_part.encode(),
        hashlib.sha256,
    ).hexdigest()
    legacy_token = f"{payload_part}.{signature}"

    assert auth.require_pro_access(request=DummyRequest(), authorization=f"Bearer {legacy_token}") is None


def test_me_endpoint_rate_limited(monkeypatch):
    _configure(monkeypatch, plan="enterprise")
    token, _ = auth.issue_token("owner@example.com", "enterprise", "active")

    for _ in range(60):
        auth.me(DummyRequest(), authorization=f"Bearer {token}")

    with pytest.raises(HTTPException) as excinfo:
        auth.me(DummyRequest(), authorization=f"Bearer {token}")
    assert excinfo.value.status_code == 429


def test_login_lockout_is_checked_before_password_verification(monkeypatch):
    """S-2: the throttle runs BEFORE bcrypt. Once an account is locked, even
    the correct password gets 429 - otherwise the lockout is still a password
    oracle for brute force. The lock is temporary (exponential backoff) and a
    success clears the account's failure history."""
    from fastapi import Response

    _configure(monkeypatch)
    limiter = auth._login_rate_limiter
    limiter.reset()
    verified: list[str] = []
    real_verify = auth._verify_password

    def spy_verify(plain, hashed):
        verified.append(plain)
        return real_verify(plain, hashed)

    monkeypatch.setattr(auth, "_verify_password", spy_verify)
    try:
        statuses = []
        for _ in range(7):
            with pytest.raises(HTTPException) as excinfo:
                auth.login(
                    auth.LoginRequest(email="owner@example.com", password="wrong"),
                    DummyRequest(),
                    Response(),
                )
            statuses.append(excinfo.value.status_code)
        # 5 failures allowed, then locked.
        assert statuses[:5] == [401] * 5
        assert statuses[5:] == [429, 429]

        # Locked: the correct password is refused WITHOUT verifying it.
        verified.clear()
        with pytest.raises(HTTPException) as excinfo:
            auth.login(
                auth.LoginRequest(email="owner@example.com", password="correct-horse"),
                DummyRequest(),
                Response(),
            )
        assert excinfo.value.status_code == 429
        assert "Retry-After" in (excinfo.value.headers or {})
        assert verified == []

        # After the backoff elapses, the correct password works and clears state.
        real_time = time.time
        monkeypatch.setattr(
            "app.services.rate_limit.time.time", lambda: real_time() + 3600
        )
        result = auth.login(
            auth.LoginRequest(email="owner@example.com", password="correct-horse"),
            DummyRequest(),
            Response(),
        )
        assert result["user"]["email"] == "owner@example.com"
        assert limiter.retry_after("127.0.0.1", "owner@example.com") == 0
    finally:
        limiter.reset()


def test_login_lockout_backoff_grows_and_is_per_account():
    from app.services.rate_limit import LoginThrottle

    throttle = LoginThrottle()
    now = 1_000_000.0
    for i in range(5):
        throttle.record_failure("10.0.0.1", "a@example.com", now=now + i)
    first = throttle.retry_after("10.0.0.1", "a@example.com", now=now + 5)
    assert 0 < first <= 30
    throttle.record_failure("10.0.0.1", "a@example.com", now=now + 40)
    second = throttle.retry_after("10.0.0.1", "a@example.com", now=now + 40)
    assert second > first  # exponential backoff
    # A different account from another IP is unaffected.
    assert throttle.retry_after("10.0.0.2", "b@example.com", now=now + 40) == 0


def test_login_ip_lockout_after_many_accounts(monkeypatch):
    from app.services.rate_limit import LoginThrottle

    monkeypatch.setenv("LOGIN_IP_MAX_FAILURES", "10")
    throttle = LoginThrottle()
    now = 2_000_000.0
    for i in range(10):
        throttle.record_failure("10.9.9.9", f"user{i}@example.com", now=now + i)
    # Credential stuffing across accounts trips the per-IP lock.
    assert throttle.retry_after("10.9.9.9", "fresh@example.com", now=now + 11) > 0
    assert throttle.retry_after("10.1.1.1", "fresh@example.com", now=now + 11) == 0


def test_login_auth_users_overrides_stale_db_password(monkeypatch):
    """Rotating AUTH_USERS on HF must unlock login even if platform_users is stale."""
    from fastapi import Response
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from db.models import Base, PlatformUser

    stale_hash = auth._hash_password("old-password")
    fresh_hash = auth._hash_password("correct-horse")

    monkeypatch.setenv("AUTH_TOKEN_SECRET", "test-secret")
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "owner@example.com",
                    "password_hash": fresh_hash,
                    "name": "Owner Person",
                    "plan": "enterprise",
                    "subscription_status": "active",
                    "role": "admin",
                }
            ]
        ),
    )

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    db.add(
        PlatformUser(
            email="owner@example.com",
            password_hash=stale_hash,
            name="Stale Name",
            plan="free",
            subscription_status="none",
            role="user",
            is_active=True,
            token_version=0,
        )
    )
    db.commit()

    # Stale DB password alone would 401; AUTH_USERS password must win.
    with pytest.raises(HTTPException) as wrong_only_db:
        # Temporarily clear AUTH_USERS to prove DB hash is wrong.
        monkeypatch.setenv("AUTH_USERS", "[]")
        auth.login(
            auth.LoginRequest(email="owner@example.com", password="correct-horse"),
            DummyRequest(),
            Response(),
            db=db,
        )
    assert wrong_only_db.value.status_code == 401

    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "owner@example.com",
                    "password_hash": fresh_hash,
                    "name": "Owner Person",
                    "plan": "enterprise",
                    "subscription_status": "active",
                    "role": "admin",
                }
            ]
        ),
    )

    result = auth.login(
        auth.LoginRequest(email="owner@example.com", password="correct-horse"),
        DummyRequest(),
        Response(),
        db=db,
    )
    assert result["user"]["email"] == "owner@example.com"
    assert result["user"]["plan"] == "enterprise"
    assert result["user"]["role"] == "admin"

    row = db.query(PlatformUser).filter(PlatformUser.email == "owner@example.com").one()
    assert auth._verify_password("correct-horse", row.password_hash)
    assert row.plan == "enterprise"
    assert row.role == "admin"


def test_resolve_user_record_rolls_back_after_platform_users_failure(monkeypatch):
    """Postgres aborts the txn on a failed SELECT; we must rollback before AUTH_USERS fallback."""
    monkeypatch.setenv(
        "AUTH_USERS",
        json.dumps(
            [
                {
                    "email": "owner@example.com",
                    "password_hash": _BCRYPT_HASH,
                    "name": "Owner",
                    "plan": "enterprise",
                    "subscription_status": "active",
                    "role": "admin",
                }
            ]
        ),
    )

    class BoomSession:
        def __init__(self):
            self.rolled_back = False

        def query(self, *args, **kwargs):
            raise RuntimeError('relation "platform_users" does not exist')

        def rollback(self):
            self.rolled_back = True

    session = BoomSession()
    record = auth.resolve_user_record("owner@example.com", session)
    assert record is not None
    assert record["email"] == "owner@example.com"
    assert record["role"] == "admin"
    assert session.rolled_back is True
