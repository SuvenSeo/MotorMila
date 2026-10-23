import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(".env.local", usecwd=True), override=False)
load_dotenv()

# ============================================================================
# Database mode — Neon-first, single DB by default (Supabase retired).
# HOT_DATABASE_URL  = Neon pooled DSN (production reads + writes)
# COLD_DATABASE_URL = optional override for a separate write target
#
# If only HOT_DATABASE_URL is set, both engines point to it (single-DB mode).
# ALLOW_SQLITE_FALLBACK=true lets local dev work without any Postgres URL.
# See docs/neon-egress-budget.md for pooled-DSN and egress guidance.
# ============================================================================

def _normalise(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url

def _validate(url: str, label: str) -> str:
    if url.startswith("http://") or url.startswith("https://"):
        raise ValueError(
            f"[CONFIG ERROR] {label} looks like a web URL, not a PostgreSQL DSN.\n"
            f"  Got: {url[:60]}"
        )
    return url

_hot_raw  = os.getenv("HOT_DATABASE_URL", "").strip()
_cold_raw = os.getenv("COLD_DATABASE_URL") or os.getenv("DATABASE_URL") or ""
_cold_raw = _cold_raw.strip()

HOT_URL  = _normalise(_hot_raw)  if _hot_raw  else ""
COLD_URL = _normalise(_cold_raw) if _cold_raw else ""

allow_sqlite_fallback = os.getenv("ALLOW_SQLITE_FALLBACK", "false").lower() == "true"

if not HOT_URL and not COLD_URL:
    if not allow_sqlite_fallback:
        raise ValueError(
            "No database URL configured. Set HOT_DATABASE_URL and/or COLD_DATABASE_URL."
        )
    HOT_URL = COLD_URL = "sqlite:///./motormila.db"
elif not HOT_URL:
    HOT_URL = COLD_URL   # single-DB: reads also go to Neon
elif not COLD_URL:
    COLD_URL = HOT_URL   # single-DB: writes also go to Supabase

for url, label in [(HOT_URL, "HOT_DATABASE_URL"), (COLD_URL, "COLD_DATABASE_URL")]:
    _validate(url, label)

def _make_engine(url: str):
    if url.startswith("sqlite"):
        # Local fallback used by the laptop-runner outage pipeline (Neon quota
        # blocked). WAL + a generous busy timeout let the parallel scraper jobs
        # write to the same file without "database is locked" aborts.
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False, "timeout": 30},
        )
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()

        return engine
    # Bounded connect for remote Postgres (HF Spaces / poolers).
    # Do NOT pass libpq `options=-c statement_timeout=...` here: Supabase
    # transaction poolers (pgbouncer) reject/break startup options and can
    # crash the API process on every connection. Statement timeout is set
    # per-session in get_db() after connect instead.
    # NullPool kept: Space workers should not hold idle pooled conns.
    # connect_timeout is short (DB_CONNECT_TIMEOUT_SECONDS, default 3s) and a
    # circuit breaker fails subsequent connects instantly while the database
    # is known to be down (see app/core/db_guard.py), so a dead Neon no longer
    # costs every request a full socket timeout.
    from app.core.db_guard import connect_timeout_seconds, install_breaker

    engine = create_engine(
        url,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={
            "connect_timeout": connect_timeout_seconds(),
        },
    )
    install_breaker(engine)
    return engine

hot_engine  = _make_engine(HOT_URL)
cold_engine = _make_engine(COLD_URL)

# Use the same engine object when both URLs are identical (avoids double pool)
if HOT_URL == COLD_URL:
    cold_engine = hot_engine

HotSessionLocal  = sessionmaker(autocommit=False, autoflush=False, bind=hot_engine)
ColdSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cold_engine)

# ============================================================================
# Optional dedicated account store (AUTH_DATABASE_URL).
#
# Why: account rows (platform_users, user_invites) are tiny, but they live in
# the same Neon project as the listings catalog, so when the catalog burns the
# Neon Free transfer quota every sign-in fails too, and the public SQLite
# failover dump deliberately carries no accounts. Pointing AUTH_DATABASE_URL at
# a separate free database (e.g. a second Neon Free project, which has its own
# 5 GB/month transfer allowance) keeps sign-in working through a catalog
# outage. Unset (the default) = accounts stay on the primary DSN, unchanged.
# ============================================================================
AUTH_URL = ""
auth_engine = None


def _auth_mappers():
    from .models import PlatformUser, UserInvite

    return (PlatformUser, UserInvite)


def configure_auth_store(url: str | None) -> None:
    """Route account tables to a dedicated engine (or back to the primary)."""
    global AUTH_URL, auth_engine
    old = auth_engine
    raw = (url or "").strip()
    if not raw:
        AUTH_URL = ""
        auth_engine = None
        for maker in (HotSessionLocal, ColdSessionLocal):
            maker.configure(binds={})
    else:
        AUTH_URL = _validate(_normalise(raw), "AUTH_DATABASE_URL")
        auth_engine = _make_engine(AUTH_URL)
        binds = {mapper: auth_engine for mapper in _auth_mappers()}
        for maker in (HotSessionLocal, ColdSessionLocal):
            maker.configure(binds=binds)
    if old is not None and old is not auth_engine:
        try:
            old.dispose()
        except Exception:  # noqa: BLE001 - best effort
            pass


def has_dedicated_auth_store() -> bool:
    return auth_engine is not None


if os.getenv("AUTH_DATABASE_URL", "").strip():
    configure_auth_store(os.getenv("AUTH_DATABASE_URL"))

# Default session — HOT (Supabase) for the API layer
engine       = hot_engine
SessionLocal = HotSessionLocal


def reattach_engines(url: str) -> None:
    """Point every sessionmaker at a new DSN without breaking imported aliases.

    `SessionLocal` / `HotSessionLocal` are imported by name in API modules.
    Reconfiguring the existing sessionmaker objects updates those aliases;
    replacing the names here would not.

    The previous engines are disposed: without this every failover refresh
    leaked a pool of open SQLite file handles against superseded inodes.
    """
    global hot_engine, cold_engine, engine, HOT_URL, COLD_URL
    url = _validate(_normalise(url), "SQLITE_FAILOVER")
    old_engines = {hot_engine, cold_engine}
    new_engine = _make_engine(url)
    HotSessionLocal.configure(bind=new_engine)
    ColdSessionLocal.configure(bind=new_engine)
    hot_engine = new_engine
    cold_engine = new_engine
    engine = new_engine
    HOT_URL = url
    COLD_URL = url
    for old in old_engines:
        if old is not new_engine:
            try:
                old.dispose()
            except Exception:  # noqa: BLE001 - best effort
                pass


def _apply_statement_timeout(db) -> None:
    """Best-effort per-session statement timeout (pooler-safe)."""
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return
    try:
        db.execute(text("SET statement_timeout = 15000"))
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def get_db():
    db = HotSessionLocal()
    try:
        _apply_statement_timeout(db)
        yield db
    finally:
        db.close()


def get_hot_db():
    db = HotSessionLocal()
    try:
        _apply_statement_timeout(db)
        yield db
    finally:
        db.close()


def get_cold_db():
    db = ColdSessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create missing tables/columns on cold and hot databases."""
    from .schema_patches import apply_schema_patches
    from .models import Base

    # create_all is a checkfirst no-op wherever tables already exist, and makes
    # init_db work against a truly empty database (e.g. the laptop-runner
    # outage pipeline's fresh local SQLite file).
    Base.metadata.create_all(cold_engine)
    apply_schema_patches(cold_engine)
    if hot_engine is not cold_engine:
        Base.metadata.create_all(hot_engine)
        apply_schema_patches(hot_engine)
    if auth_engine is not None:
        # Only the account tables live in the dedicated store.
        Base.metadata.create_all(
            auth_engine,
            tables=[mapper.__table__ for mapper in _auth_mappers()],
        )


def is_dual_db_mode() -> bool:
    return HOT_URL != COLD_URL
