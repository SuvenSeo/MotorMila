import asyncio
from contextlib import asynccontextmanager
import os
import uuid

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import text
from starlette.middleware.gzip import GZipMiddleware

from app.services.daily_sync_scheduler import start_daily_sync_scheduler, stop_daily_sync_scheduler
from app.services.digest_flush_scheduler import start_digest_flush_scheduler, stop_digest_flush_scheduler
from db import session as db_session
from db.session import init_db
from db.sqlite_failover import (
    failover_active,
    failover_enabled,
    start_sqlite_failover_background,
)

from .api.v1.api import api_router
from .routers import money_router  # PayHere, leads, legal requests (overhaul/money-legal)

# Setup logging
structlog.configure(
    processors=[
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger()

# Error tracking — no-op unless SENTRY_DSN is configured.
_sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
if _sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0") or 0),
        send_default_pii=False,
    )
    logger.info("sentry_initialized")

# Env-tunable: schema patches run bounded DDL (lock/statement timeouts), so
# worst-case init is patches + create_all across both engines. 20s proved too
# tight on HF Spaces cpu-basic against remote Postgres.
DB_INIT_TIMEOUT_SECONDS = int(os.getenv("DB_INIT_TIMEOUT_SECONDS", "60"))
SKIP_DB_INIT = os.getenv("SKIP_DB_INIT", "false").strip().lower() in {"1", "true", "yes", "on"}

_MAX_BODY_SIZE = 1_048_576  # 1 MB


class BodySizeLimitMiddleware:
    """Reject request bodies larger than _MAX_BODY_SIZE bytes.

    Content-Length is the cheap first gate, but a header-only check is bypassable:
    a client can omit Content-Length and stream a chunked body instead
    (``Transfer-Encoding: chunked``), which never trips the declared-length
    comparison. Every endpoint here accepts bounded JSON bodies, so
    length-less chunked requests are rejected with 411 rather than buffered —
    that keeps the cap enforceable without reimplementing stream accounting.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            declared: int | None = None
            chunked = False
            for name, value in scope.get("headers", []):
                if name == b"content-length":
                    try:
                        declared = int(value)
                    except (TypeError, ValueError):
                        declared = None
                elif name == b"transfer-encoding":
                    chunked = "chunked" in value.decode("latin-1").lower()

            if declared is not None and declared > _MAX_BODY_SIZE:
                await self._reject(scope, receive, send, 413, "Request body too large")
                return
            if chunked and declared is None:
                await self._reject(
                    scope,
                    receive,
                    send,
                    411,
                    "Content-Length required; chunked request bodies are not accepted",
                )
                return
        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(scope, receive, send, status_code: int, detail: str) -> None:
        response = JSONResponse(status_code=status_code, content={"detail": detail})
        await response(scope, receive, send)


def _failover_can_take_over() -> bool:
    """True when the SQLite failover monitor can rebind the API off Postgres.

    In that case a failed/timed-out Neon init must not abort startup: the
    monitor thread rebinds to the merged dump within a couple of minutes,
    whereas aborting puts the Space into a restart crash-loop for the rest of
    the outage.
    """
    return failover_enabled() and not str(
        getattr(db_session, "HOT_URL", "") or ""
    ).startswith("sqlite")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting_up")
    # In a real app, we'd use migrations (Alembic)
    # For now, we'll initialize the DB directly.
    # Runs in a thread with a hard timeout: init_db() is a blocking sync call,
    # and a stuck DB connection here would otherwise freeze the whole event
    # loop forever, so the app never starts accepting requests.
    # Neon Free blocks all connections after the transfer quota is exhausted.
    # Kick a background monitor that downloads the public merged SQLite dump
    # (and fails back to Neon on recovery) so listings recover without
    # blocking uvicorn listen (HF HEALTHCHECK start-period is 10s).
    start_sqlite_failover_background()

    if SKIP_DB_INIT:
        logger.info("db_init_skipped", reason="SKIP_DB_INIT=true")
    else:
        try:
            await asyncio.wait_for(asyncio.to_thread(init_db), timeout=DB_INIT_TIMEOUT_SECONDS)
            logger.info("db_initialized")
        except asyncio.TimeoutError as e:
            logger.critical("db_init_timeout", timeout_seconds=DB_INIT_TIMEOUT_SECONDS)
            if not _failover_can_take_over():
                raise RuntimeError("Database initialization timed out. Aborting startup.") from e
            logger.critical("db_init_deferred_to_sqlite_failover")
        except Exception as e:
            logger.critical("db_init_failed", error=str(e))
            if not _failover_can_take_over():
                raise RuntimeError(f"Database initialization failed: {e}. Aborting startup.") from e
            logger.critical("db_init_deferred_to_sqlite_failover")

    try:
        start_daily_sync_scheduler()
    except Exception as e:
        logger.error("daily_sync_scheduler_start_failed", error=str(e))

    try:
        start_digest_flush_scheduler()
    except Exception as e:
        logger.error("digest_flush_scheduler_start_failed", error=str(e))

    yield

    try:
        stop_digest_flush_scheduler()
    except Exception as e:
        logger.error("digest_flush_scheduler_stop_failed", error=str(e))
    try:
        stop_daily_sync_scheduler()
    except Exception as e:
        logger.error("daily_sync_scheduler_stop_failed", error=str(e))


app = FastAPI(
    title="Motormila API",
    description="Car Market Intelligence Platform for Sri Lanka",
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins = os.getenv("CORS_ORIGINS")
if cors_origins:
    allow_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
else:
    allow_origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://motormila.vercel.app",
        "https://vehicle-platform-one.vercel.app",
        "https://vehicle-platform-one-suvenseoras-projects.vercel.app",
    ]

allow_credentials = True
if any(origin == "*" for origin in allow_origins):
    allow_credentials = False
    logger.warning(
        "cors_wildcard_disables_credentials",
        allow_origins=allow_origins,
    )

# CORS configuration — restrict to methods/headers actually used by the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Alert-Token", "X-Requested-With"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining"],
)

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(BodySizeLimitMiddleware)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id

    response = await call_next(request)

    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )
    response.headers["Permissions-Policy"] = (
        "geolocation=(), camera=(), microphone=(), payment=()"
    )
    # Propagate per-request rate-limit info stored by RateLimiter dependencies.
    ratelimit_headers = getattr(request.state, "ratelimit_headers", None)
    if ratelimit_headers:
        for rl_name, rl_value in ratelimit_headers.items():
            response.headers[rl_name] = rl_value
    response.headers["X-Request-ID"] = request_id

    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Ensure HF proxy + frontend parseApiError always get JSON, not plain text.
    logger.error(
        "unhandled_exception",
        error=str(exc),
        path=request.url.path,
        method=request.method,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


HEALTH_DB_PROBE_TIMEOUT_SECONDS = 5


def _probe_db() -> None:
    with db_session.hot_engine.connect() as conn:
        conn.execute(text("SELECT 1"))


@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    # A cheap bounded read probe: a Space with a dead database must not
    # keep reporting itself healthy to uptime monitoring.
    db_status = "ok"
    try:
        await asyncio.wait_for(asyncio.to_thread(_probe_db), timeout=HEALTH_DB_PROBE_TIMEOUT_SECONDS)
    except Exception as exc:
        db_status = "down"
        logger.warning("health_db_probe_failed", error=str(exc))

    content = {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        # True while serving from the downloaded SQLite dump (Neon quota
        # block); the DB probe above then targets SQLite, so "ok" +
        # failover=true is the expected outage posture.
        "failover": failover_active(),
        "version": "1.0.0",
    }

    if db_status != "ok":
        return JSONResponse(status_code=503, content=content)
    return content


SECURITY_TXT = """\
Contact: mailto:suvenseoras@gmail.com
Contact: tel:0758504424
Preferred-Languages: en
Policy: https://motormila.vercel.app/security
Expires: 2027-01-01T00:00:00.000Z
"""


@app.get("/.well-known/security.txt")
async def security_txt():
    return PlainTextResponse(SECURITY_TXT, media_type="text/plain")


# Include API router
app.include_router(api_router, prefix="/api/v1")
app.include_router(money_router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
