"""DB outage handling (503 + Retry-After, circuit breaker), strict CORS, cookie CSRF."""

import sys
import time
from pathlib import Path

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app import main  # noqa: E402
from app.core import db_guard  # noqa: E402
from app.core.db_guard import CircuitBreaker, DatabaseUnavailable, is_db_unavailable_error  # noqa: E402


_probe_router = APIRouter()


@_probe_router.get("/__test/db-down")
def _db_down():
    raise OperationalError("SELECT 1", {}, Exception('could not connect to server: Connection refused'))


@_probe_router.get("/__test/db-bug")
def _db_bug():
    raise OperationalError("SELECT x", {}, Exception("no such table: nope"))


@_probe_router.get("/__test/circuit")
def _circuit():
    raise DatabaseUnavailable("circuit open")


@_probe_router.post("/__test/write")
def _write():
    return {"ok": True}


if not any(getattr(r, "path", "") == "/__test/db-down" for r in main.app.routes):
    main.app.include_router(_probe_router)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(main, "_probe_db", lambda: None)
    db_guard.breaker.reset()
    yield TestClient(main.app, raise_server_exceptions=False)
    db_guard.breaker.reset()


# ── 503 mapping ─────────────────────────────────────────────────────────────

def test_connection_failure_maps_to_503_with_retry_after(client):
    response = client.get("/__test/db-down")
    assert response.status_code == 503
    assert response.json()["code"] == "db_unavailable"
    assert int(response.headers["retry-after"]) > 0


def test_query_bug_stays_500(client):
    response = client.get("/__test/db-bug")
    assert response.status_code == 500


def test_circuit_open_maps_to_503(client):
    response = client.get("/__test/circuit")
    assert response.status_code == 503
    assert "retry-after" in response.headers


def test_classifier():
    assert is_db_unavailable_error(DatabaseUnavailable("x"))
    assert is_db_unavailable_error(
        OperationalError("s", {}, Exception("connection to server at \"ep.neon.tech\" failed: timeout expired"))
    )
    assert not is_db_unavailable_error(OperationalError("s", {}, Exception("syntax error")))
    assert not is_db_unavailable_error(ValueError("could not connect"))


# ── circuit breaker ─────────────────────────────────────────────────────────

def test_breaker_fails_fast_then_allows_single_trial(monkeypatch):
    monkeypatch.setenv("DB_BREAKER_OPEN_SECONDS", "10")
    br = CircuitBreaker()
    assert br.before_connect(now=0) is False  # closed
    br.record_failure(RuntimeError("could not connect"))
    with pytest.raises(DatabaseUnavailable):
        br.before_connect()
    # After the open window exactly one trial may proceed.
    later = time.time() + 11
    assert br.before_connect(now=later) is True
    with pytest.raises(DatabaseUnavailable):
        br.before_connect(now=later)
    br.record_success()
    assert br.before_connect() is False
    assert br.snapshot()["state"] == "closed"


def test_breaker_bypass_for_probes():
    br = CircuitBreaker()
    br.record_failure(RuntimeError("down"))
    with db_guard.bypass_breaker():
        # Monkeypatch-free: the module-level bypass applies to any breaker.
        assert br.before_connect() is False


def test_breaker_short_circuits_engine_connect(monkeypatch):
    """A Postgres engine with the breaker installed fails instantly while open."""
    from sqlalchemy import create_engine

    engine = create_engine("sqlite://")
    db_guard.install_breaker(engine)
    db_guard.breaker.reset()
    try:
        db_guard.breaker.record_failure(RuntimeError("could not connect"))
        started = time.perf_counter()
        with pytest.raises(DatabaseUnavailable):
            engine.connect()
        assert time.perf_counter() - started < 0.5
        db_guard.breaker.reset()
        with engine.connect():
            pass
    finally:
        db_guard.breaker.reset()


def test_auth_lookup_answers_503_not_401_when_db_down(monkeypatch):
    """An outage must not sign users out (401) - it is a 503."""
    from app.api.v1.endpoints import auth

    monkeypatch.delenv("AUTH_USERS", raising=False)

    class _BrokenSession:
        def query(self, *a, **k):
            raise DatabaseUnavailable("circuit open")

        def rollback(self):
            pass

    with pytest.raises(DatabaseUnavailable):
        auth.resolve_user_record("someone@example.com", _BrokenSession())


def test_health_reports_failover_diagnostics(client, monkeypatch):
    def broken():
        raise RuntimeError("down")

    monkeypatch.setattr(main, "_probe_db", broken)
    response = client.get("/health")
    assert response.status_code == 503
    body = response.json()
    assert body["mode"] == "down"
    for key in ("failover", "failover_enabled", "failover_attempts", "failover_error", "circuit"):
        assert key in body
    assert "retry-after" in response.headers


# ── CORS ────────────────────────────────────────────────────────────────────

def test_cors_allowlisted_origin_gets_credentials(client):
    response = client.get("/health", headers={"Origin": "https://motormila.vercel.app"})
    assert response.headers.get("access-control-allow-origin") == "https://motormila.vercel.app"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_pages_mirror_allowed(client):
    response = client.get("/health", headers={"Origin": "https://motormila.pages.dev"})
    assert response.headers.get("access-control-allow-origin") == "https://motormila.pages.dev"


def test_cors_foreign_origin_gets_no_cors_headers(client):
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-credentials" not in response.headers


def test_cors_foreign_preflight_has_no_credentials(client):
    response = client.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-credentials" not in response.headers
    assert "access-control-allow-origin" not in response.headers


def test_no_origin_no_credentials_header(client):
    response = client.get("/health")
    assert "access-control-allow-credentials" not in response.headers


# ── CSRF ────────────────────────────────────────────────────────────────────

def test_cookie_write_from_foreign_origin_blocked(client):
    client.cookies.set("mm_session", "abc.def")
    response = client.post("/__test/write", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403


def test_cookie_write_without_origin_or_referer_blocked(client):
    client.cookies.set("mm_session", "abc.def")
    response = client.post("/__test/write")
    assert response.status_code == 403


def test_cookie_write_from_trusted_origin_allowed(client):
    client.cookies.set("mm_session", "abc.def")
    response = client.post("/__test/write", headers={"Origin": "https://motormila.vercel.app"})
    assert response.status_code == 200


def test_cookie_write_trusted_referer_allowed(client):
    client.cookies.set("mm_session", "abc.def")
    response = client.post("/__test/write", headers={"Referer": "https://motormila.vercel.app/admin"})
    assert response.status_code == 200


def test_bearer_write_without_origin_allowed(client):
    """Android / API clients send Bearer and no Origin."""
    client.cookies.set("mm_session", "abc.def")
    response = client.post("/__test/write", headers={"Authorization": "Bearer token"})
    assert response.status_code == 200


def test_no_cookie_write_allowed(client):
    client.cookies.clear()
    response = client.post("/__test/write", headers={"Origin": "https://evil.example"})
    assert response.status_code == 200


def test_session_cookie_defaults_to_lax(monkeypatch):
    from app.api.v1.endpoints import auth

    monkeypatch.delenv("AUTH_COOKIE_SAMESITE", raising=False)
    assert auth._cookie_samesite() == "lax"
    monkeypatch.setenv("AUTH_COOKIE_SAMESITE", "bogus")
    assert auth._cookie_samesite() == "lax"


# ── docs flag ───────────────────────────────────────────────────────────────

def test_api_docs_disabled_on_hf_space(monkeypatch):
    monkeypatch.delenv("API_DOCS_ENABLED", raising=False)
    monkeypatch.setenv("SPACE_ID", "Seo292/vehicle-platform-backend")
    assert main.api_docs_enabled() is False
    monkeypatch.setenv("API_DOCS_ENABLED", "true")
    assert main.api_docs_enabled() is True
    monkeypatch.delenv("SPACE_ID", raising=False)
    monkeypatch.setenv("API_DOCS_ENABLED", "false")
    assert main.api_docs_enabled() is False


def test_security_txt_has_no_phone(client):
    response = client.get("/.well-known/security.txt")
    assert response.status_code == 200
    assert "tel:" not in response.text
    assert "0758504424" not in response.text
