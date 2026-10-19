"""Lightweight schema patches for production DBs created before new columns/tables."""

from __future__ import annotations

import structlog
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

log = structlog.get_logger()

# (column, postgres type/default, sqlite type/default)
_CAR_LISTING_COLUMN_PATCHES = (
    ("thumbnail_url_cached", "TEXT", "TEXT"),
    ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE", "BOOLEAN NOT NULL DEFAULT 1"),
    ("image_phash", "VARCHAR(16)", "VARCHAR(16)"),
    ("vehicle_category", "VARCHAR(40)", "VARCHAR(40)"),
    ("content_updated_at", "TIMESTAMPTZ", "DATETIME"),
    # User-submitted listings (sell-your-car).
    ("owner_user_id", "VARCHAR(64)", "VARCHAR(64)"),
    ("user_listing_status", "VARCHAR(20) NOT NULL DEFAULT 'scraped'", "VARCHAR(20) NOT NULL DEFAULT 'scraped'"),
    ("contact_name", "VARCHAR(120)", "VARCHAR(120)"),
    ("contact_phone", "VARCHAR(32)", "VARCHAR(32)"),
    ("description", "TEXT", "TEXT"),
    ("user_images", "TEXT", "TEXT"),
)

# (table, column, postgres type, sqlite type) — non-car_listings additive columns
_TABLE_COLUMN_PATCHES = (
    ("market_alerts", "notify_phone", "VARCHAR(32)", "VARCHAR(32)"),
    ("market_alerts", "notify_email", "VARCHAR(255)", "VARCHAR(255)"),
    ("market_alerts", "notify_telegram_chat_id", "VARCHAR(64)", "VARCHAR(64)"),
    ("market_alerts", "notify_channels", "VARCHAR(64)", "VARCHAR(64)"),
    ("market_alerts", "delivery_mode", "VARCHAR(16)", "VARCHAR(16)"),
    ("market_alerts", "quiet_hours_enabled", "BOOLEAN", "BOOLEAN"),
    ("dealer_profiles", "verified_at", "TIMESTAMPTZ", "DATETIME"),
    ("dealer_profiles", "plan", "VARCHAR(20) NOT NULL DEFAULT 'dealer'", "VARCHAR(20) NOT NULL DEFAULT 'dealer'"),
    (
        "dealer_profiles",
        "subscription_status",
        "VARCHAR(20) NOT NULL DEFAULT 'none'",
        "VARCHAR(20) NOT NULL DEFAULT 'none'",
    ),
    ("dealer_profiles", "billing_email", "VARCHAR(255)", "VARCHAR(255)"),
    ("dealer_profiles", "current_period_end", "TIMESTAMPTZ", "DATETIME"),
    # platform_users — older prod tables predate invite-auth columns; missing any
    # of these makes ORM SELECTs 500 even when COUNT(id) still works.
    ("platform_users", "subscription_status", "VARCHAR(20) NOT NULL DEFAULT 'none'", "VARCHAR(20) NOT NULL DEFAULT 'none'"),
    ("platform_users", "role", "VARCHAR(20) NOT NULL DEFAULT 'user'", "VARCHAR(20) NOT NULL DEFAULT 'user'"),
    ("platform_users", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE", "BOOLEAN NOT NULL DEFAULT 1"),
    ("platform_users", "token_version", "INTEGER NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0"),
    ("platform_users", "invited_by_email", "VARCHAR(255)", "VARCHAR(255)"),
    ("platform_users", "last_login_at", "TIMESTAMPTZ", "DATETIME"),
    ("platform_users", "trial_ends_at", "TIMESTAMPTZ", "DATETIME"),
    ("platform_users", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ("platform_users", "updated_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ("user_invites", "role", "VARCHAR(20) NOT NULL DEFAULT 'user'", "VARCHAR(20) NOT NULL DEFAULT 'user'"),
    ("user_invites", "invited_by_email", "VARCHAR(255)", "VARCHAR(255)"),
    ("user_invites", "accepted_at", "TIMESTAMPTZ", "DATETIME"),
    ("user_invites", "created_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
)

# (index_name, table_name, columns SQL fragment)
# Best-effort only: bounded timeouts + fail-open. Never use CONCURRENTLY here —
# these run inside a transaction with SET LOCAL, and CONCURRENTLY is not used
# elsewhere in this codebase.
_INDEX_PATCHES = (
    ("idx_car_listings_last_seen_at", "car_listings", "last_seen_at"),
    ("idx_car_listings_content_updated_at", "car_listings", "content_updated_at"),
    ("idx_car_listings_image_phash", "car_listings", "image_phash"),
    ("idx_car_listings_vehicle_category", "car_listings", "vehicle_category"),
    # Live listing filters: is_active + is_outlier (+ optional district).
    # Leftmost prefix also covers (is_active, is_outlier) without a second index.
    (
        "idx_car_listings_active_outlier_district",
        "car_listings",
        "is_active, is_outlier, district",
    ),
    (
        "idx_car_listings_live_category_price",
        "car_listings",
        "is_active, is_outlier, vehicle_category, price_lkr",
    ),
    (
        "idx_car_listings_category_first_seen",
        "car_listings",
        "vehicle_category, first_seen_at",
    ),
    ("idx_scrape_runs_started_at", "scrape_runs", "started_at"),
    ("idx_scrape_runs_source_started_at", "scrape_runs", "source, started_at"),
    ("idx_provider_sync_runs_provider_started", "provider_sync_runs", "provider, started_at"),
    ("idx_provider_sync_runs_started_at", "provider_sync_runs", "started_at"),
    ("idx_vehicle_catalog_matches_key_provider", "vehicle_catalog_matches", "vehicle_key, provider"),
    ("idx_vehicle_safety_snapshots_refreshed", "vehicle_safety_snapshots", "refreshed_at"),
    ("idx_vehicle_reliability_snapshots_refreshed", "vehicle_reliability_snapshots", "refreshed_at"),
    ("idx_charge_points_lat_lng", "charge_points", "lat, lng"),
    ("idx_charge_points_town", "charge_points", "town"),
    ("idx_listing_geo_hash", "listing_geo_enrichment", "source_location_hash"),
    ("idx_listing_geo_fetched", "listing_geo_enrichment", "fetched_at"),
)

_POSTGRES_TRGM_INDEX_PATCHES = (
    (
        "idx_car_listings_make_trgm",
        "car_listings",
        "make",
    ),
    (
        "idx_car_listings_model_trgm",
        "car_listings",
        "model",
    ),
    (
        "idx_car_listings_title_trgm",
        "car_listings",
        "title",
    ),
)


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    inspector = inspect(engine)
    try:
        inspector.clear_cache()
    except Exception:
        pass
    try:
        columns = {col["name"] for col in inspector.get_columns(table)}
    except Exception:
        return False
    return column in columns


def _pg_column_exists(conn, table: str, column: str) -> bool:
    """information_schema check — bypasses SQLAlchemy inspector cache."""
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table
              AND column_name = :column
            LIMIT 1
            """
        ),
        {"table": table, "column": column},
    ).first()
    return row is not None


def _create_index_sql(index_name: str, table_name: str, columns: str) -> str:
    return f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns})"


def _ensure_historical_price_observations_table(
    engine: Engine,
    *,
    dialect: str,
    bounded_ddl,
) -> None:
    """Idempotent CREATE for the archive price table (Postgres + SQLite)."""
    inspector = inspect(engine)
    try:
        if "historical_price_observations" in inspector.get_table_names():
            return
    except Exception as exc:
        log.warning("schema_hist_table_inspect_failed", error=str(exc))

    if dialect == "postgresql":
        ddl = """
        CREATE TABLE IF NOT EXISTS historical_price_observations (
            id SERIAL PRIMARY KEY,
            archive_source VARCHAR(40) NOT NULL,
            source_id VARCHAR(120) NOT NULL,
            observed_at TIMESTAMPTZ NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            make VARCHAR(50),
            model VARCHAR(100),
            year INTEGER,
            price_lkr NUMERIC(15, 2) NOT NULL,
            mileage INTEGER,
            district VARCHAR(50),
            city VARCHAR(100),
            confidence VARCHAR(20) NOT NULL DEFAULT 'medium',
            raw_meta JSONB,
            ingested_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
        indexes = (
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_price_archive_source_id_observed
            ON historical_price_observations (archive_source, source_id, observed_at)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_hist_price_make_model_observed
            ON historical_price_observations (make, model, observed_at)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_hist_price_observed_at
            ON historical_price_observations (observed_at)
            """,
        )
    else:
        ddl = """
        CREATE TABLE IF NOT EXISTS historical_price_observations (
            id INTEGER PRIMARY KEY,
            archive_source VARCHAR(40) NOT NULL,
            source_id VARCHAR(120) NOT NULL,
            observed_at DATETIME NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            make VARCHAR(50),
            model VARCHAR(100),
            year INTEGER,
            price_lkr NUMERIC(15, 2) NOT NULL,
            mileage INTEGER,
            district VARCHAR(50),
            city VARCHAR(100),
            confidence VARCHAR(20) NOT NULL DEFAULT 'medium',
            raw_meta JSON,
            ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
        indexes = (
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_price_archive_source_id_observed
            ON historical_price_observations (archive_source, source_id, observed_at)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_hist_price_make_model_observed
            ON historical_price_observations (make, model, observed_at)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_hist_price_observed_at
            ON historical_price_observations (observed_at)
            """,
        )

    try:
        bounded_ddl(ddl)
        for index_sql in indexes:
            try:
                bounded_ddl(index_sql)
            except Exception as exc:
                log.warning("schema_hist_index_failed", error=str(exc))
        log.info("schema_hist_table_ensured")
    except Exception as exc:
        log.warning("schema_hist_table_failed", error=str(exc))


def _ensure_auth_tables(engine: Engine, *, dialect: str, bounded_ddl) -> None:
    """Create platform_users / user_invites, or rebuild an empty partial platform_users.

    Prod hit a state where COUNT(platform_users.id) worked but ORM SELECTs 500'd
    because invite-auth columns were missing. When the table is empty, drop and
    recreate from the current model instead of fighting half-applied DDL.
    """
    from db.models import Base, PlatformUser, UserInvite

    required_platform_cols = {
        "email": ("VARCHAR(255)", "VARCHAR(255)"),
        "password_hash": ("VARCHAR(255)", "VARCHAR(255)"),
        "name": ("VARCHAR(120)", "VARCHAR(120)"),
        "plan": ("VARCHAR(20) DEFAULT 'free'", "VARCHAR(20) DEFAULT 'free'"),
        "subscription_status": (
            "VARCHAR(20) NOT NULL DEFAULT 'none'",
            "VARCHAR(20) NOT NULL DEFAULT 'none'",
        ),
        "role": (
            "VARCHAR(20) NOT NULL DEFAULT 'user'",
            "VARCHAR(20) NOT NULL DEFAULT 'user'",
        ),
        "is_active": (
            "BOOLEAN NOT NULL DEFAULT TRUE",
            "BOOLEAN NOT NULL DEFAULT 1",
        ),
        "token_version": (
            "INTEGER NOT NULL DEFAULT 0",
            "INTEGER NOT NULL DEFAULT 0",
        ),
        "invited_by_email": ("VARCHAR(255)", "VARCHAR(255)"),
        "last_login_at": ("TIMESTAMPTZ", "DATETIME"),
        "trial_ends_at": ("TIMESTAMPTZ", "DATETIME"),
        "created_at": (
            "TIMESTAMPTZ DEFAULT NOW()",
            "DATETIME DEFAULT CURRENT_TIMESTAMP",
        ),
        "updated_at": (
            "TIMESTAMPTZ DEFAULT NOW()",
            "DATETIME DEFAULT CURRENT_TIMESTAMP",
        ),
    }

    # Always try additive IF NOT EXISTS patches first (works even when DROP is denied).
    for column_name, (pg_type, sqlite_type) in required_platform_cols.items():
        col_type = pg_type if dialect == "postgresql" else sqlite_type
        if dialect == "postgresql":
            sql = (
                f"ALTER TABLE platform_users "
                f"ADD COLUMN IF NOT EXISTS {column_name} {col_type}"
            )
        else:
            # SQLite: only add when missing.
            if _column_exists(engine, "platform_users", column_name):
                continue
            sql = f"ALTER TABLE platform_users ADD COLUMN {column_name} {col_type}"
        try:
            bounded_ddl(sql)
        except Exception as exc:
            msg = str(exc).lower()
            if "duplicate column" in msg or "no such table" in msg:
                continue
            log.warning(
                "schema_platform_users_column_failed",
                column=column_name,
                error=str(exc),
            )

    inspector = inspect(engine)
    try:
        inspector.clear_cache()
    except Exception:
        pass
    try:
        tables = set(inspector.get_table_names())
    except Exception as exc:
        log.warning("schema_auth_inspect_failed", error=str(exc))
        tables = set()

    if "platform_users" in tables:
        missing: set[str] = set()
        if dialect == "postgresql":
            try:
                with engine.connect() as conn:
                    for column_name in required_platform_cols:
                        if not _pg_column_exists(conn, "platform_users", column_name):
                            missing.add(column_name)
            except Exception as exc:
                log.warning("schema_platform_users_pg_check_failed", error=str(exc))
                missing = set(required_platform_cols)
        else:
            try:
                inspector.clear_cache()
                cols = {col["name"] for col in inspector.get_columns("platform_users")}
                missing = set(required_platform_cols) - cols
            except Exception:
                missing = set(required_platform_cols)

        if missing:
            row_count = None
            try:
                with engine.connect() as conn:
                    row_count = conn.execute(text("SELECT COUNT(*) FROM platform_users")).scalar()
            except Exception as exc:
                log.warning("schema_platform_users_count_failed", error=str(exc))
            if row_count == 0:
                try:
                    drop_sql = (
                        "DROP TABLE IF EXISTS platform_users CASCADE"
                        if dialect == "postgresql"
                        else "DROP TABLE IF EXISTS platform_users"
                    )
                    bounded_ddl(drop_sql)
                    log.info(
                        "schema_platform_users_rebuilt",
                        missing=sorted(missing),
                    )
                except Exception as exc:
                    log.warning("schema_platform_users_drop_failed", error=str(exc))

    try:
        Base.metadata.create_all(
            bind=engine,
            tables=[PlatformUser.__table__, UserInvite.__table__],
        )
    except Exception as exc:
        log.warning("schema_auth_tables_failed", error=str(exc))


def heal_platform_users_schema(db) -> list[str]:
    """Runtime best-effort ADD COLUMN for invite-auth fields (admin request path).

    Used when startup patches were skipped or silently failed (e.g. SKIP_DB_INIT,
    inspector cache, or DDL permissions flaking on the pooler).
    """
    bind = db.get_bind()
    if bind is None:
        return []
    dialect = bind.dialect.name
    applied: list[str] = []
    patches = (
        ("token_version", "INTEGER NOT NULL DEFAULT 0", "INTEGER NOT NULL DEFAULT 0"),
        ("subscription_status", "VARCHAR(20) NOT NULL DEFAULT 'none'", "VARCHAR(20) NOT NULL DEFAULT 'none'"),
        ("role", "VARCHAR(20) NOT NULL DEFAULT 'user'", "VARCHAR(20) NOT NULL DEFAULT 'user'"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE", "BOOLEAN NOT NULL DEFAULT 1"),
        ("invited_by_email", "VARCHAR(255)", "VARCHAR(255)"),
        ("last_login_at", "TIMESTAMPTZ", "DATETIME"),
        ("trial_ends_at", "TIMESTAMPTZ", "DATETIME"),
        ("created_at", "TIMESTAMPTZ DEFAULT NOW()", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("updated_at", "TIMESTAMPTZ DEFAULT NOW()", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    )
    for column_name, pg_type, sqlite_type in patches:
        col_type = pg_type if dialect == "postgresql" else sqlite_type
        try:
            if dialect == "postgresql":
                if _pg_column_exists(db, "platform_users", column_name):
                    continue
                db.execute(
                    text(
                        f"ALTER TABLE platform_users "
                        f"ADD COLUMN IF NOT EXISTS {column_name} {col_type}"
                    )
                )
            else:
                if _column_exists(bind, "platform_users", column_name):
                    continue
                db.execute(
                    text(f"ALTER TABLE platform_users ADD COLUMN {column_name} {col_type}")
                )
            applied.append(column_name)
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            log.warning(
                "runtime_platform_users_heal_failed",
                column=column_name,
                error=str(exc),
            )
            continue
    if applied:
        try:
            db.commit()
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            log.warning("runtime_platform_users_heal_commit_failed", error=str(exc))
            return []
        log.info("runtime_platform_users_healed", columns=applied)
    return applied


def _ensure_user_notifications_table(
    engine: Engine,
    *,
    dialect: str,
    bounded_ddl,
) -> None:
    """Idempotent CREATE for the user_notifications table (Postgres + SQLite)."""
    inspector = inspect(engine)
    try:
        if "user_notifications" in inspector.get_table_names():
            return
    except Exception as exc:
        log.warning("schema_user_notifications_inspect_failed", error=str(exc))

    if dialect == "postgresql":
        ddl = """
        CREATE TABLE IF NOT EXISTS user_notifications (
            id SERIAL PRIMARY KEY,
            user_token VARCHAR(64) NOT NULL,
            title VARCHAR(200) NOT NULL,
            body TEXT,
            link TEXT,
            read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
        indexes = (
            "CREATE INDEX IF NOT EXISTS idx_user_notifications_user_token ON user_notifications (user_token)",
            "CREATE INDEX IF NOT EXISTS idx_user_notifications_user_token_read ON user_notifications (user_token, read)",
        )
    else:
        ddl = """
        CREATE TABLE IF NOT EXISTS user_notifications (
            id INTEGER PRIMARY KEY,
            user_token VARCHAR(64) NOT NULL,
            title VARCHAR(200) NOT NULL,
            body TEXT,
            link TEXT,
            read BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
        indexes = (
            "CREATE INDEX IF NOT EXISTS idx_user_notifications_user_token ON user_notifications (user_token)",
            "CREATE INDEX IF NOT EXISTS idx_user_notifications_user_token_read ON user_notifications (user_token, read)",
        )

    try:
        bounded_ddl(ddl)
        for index_sql in indexes:
            try:
                bounded_ddl(index_sql)
            except Exception as exc:
                log.warning("schema_user_notifications_index_failed", error=str(exc))
        log.info("schema_user_notifications_table_ensured")
    except Exception as exc:
        log.warning("schema_user_notifications_table_failed", error=str(exc))


def _ensure_analytics_events_table(
    engine: Engine,
    *,
    dialect: str,
    bounded_ddl,
) -> None:
    """Idempotent CREATE for the analytics_events table (Postgres + SQLite)."""
    inspector = inspect(engine)
    try:
        if "analytics_events" in inspector.get_table_names():
            return
    except Exception as exc:
        log.warning("schema_analytics_table_inspect_failed", error=str(exc))

    if dialect == "postgresql":
        ddl = """
        CREATE TABLE IF NOT EXISTS analytics_events (
            id SERIAL PRIMARY KEY,
            event VARCHAR(120) NOT NULL,
            properties JSONB,
            session_id VARCHAR(64),
            user_email VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
        indexes = (
            "CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created ON analytics_events (event, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events (session_id)",
        )
    else:
        ddl = """
        CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY,
            event VARCHAR(120) NOT NULL,
            properties JSON,
            session_id VARCHAR(64),
            user_email VARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
        indexes = (
            "CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created ON analytics_events (event, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events (session_id)",
        )

    try:
        bounded_ddl(ddl)
        for index_sql in indexes:
            try:
                bounded_ddl(index_sql)
            except Exception as exc:
                log.warning("schema_analytics_index_failed", error=str(exc))
        log.info("schema_analytics_events_table_ensured")
    except Exception as exc:
        log.warning("schema_analytics_events_table_failed", error=str(exc))


def _ensure_provider_sync_runs_table(
    engine: Engine,
    *,
    dialect: str,
    bounded_ddl,
) -> None:
    """Idempotent CREATE for enrichment provider sync-run logging."""
    inspector = inspect(engine)
    try:
        if "provider_sync_runs" in inspector.get_table_names():
            return
    except Exception as exc:
        log.warning("schema_provider_sync_inspect_failed", error=str(exc))

    if dialect == "postgresql":
        ddl = """
        CREATE TABLE IF NOT EXISTS provider_sync_runs (
            id SERIAL PRIMARY KEY,
            provider VARCHAR(40) NOT NULL,
            status VARCHAR(20) NOT NULL,
            rows INTEGER,
            failures INTEGER,
            checksum VARCHAR(128),
            error_message TEXT,
            details JSONB,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ
        )
        """
        indexes = (
            "CREATE INDEX IF NOT EXISTS idx_provider_sync_runs_provider_started ON provider_sync_runs (provider, started_at)",
            "CREATE INDEX IF NOT EXISTS idx_provider_sync_runs_started_at ON provider_sync_runs (started_at)",
        )
    else:
        ddl = """
        CREATE TABLE IF NOT EXISTS provider_sync_runs (
            id INTEGER PRIMARY KEY,
            provider VARCHAR(40) NOT NULL,
            status VARCHAR(20) NOT NULL,
            rows INTEGER,
            failures INTEGER,
            checksum VARCHAR(128),
            error_message TEXT,
            details JSON,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME
        )
        """
        indexes = (
            "CREATE INDEX IF NOT EXISTS idx_provider_sync_runs_provider_started ON provider_sync_runs (provider, started_at)",
            "CREATE INDEX IF NOT EXISTS idx_provider_sync_runs_started_at ON provider_sync_runs (started_at)",
        )

    try:
        bounded_ddl(ddl)
        for index_sql in indexes:
            try:
                bounded_ddl(index_sql)
            except Exception as exc:
                log.warning("schema_provider_sync_index_failed", error=str(exc))
        log.info("schema_provider_sync_runs_table_ensured")
    except Exception as exc:
        log.warning("schema_provider_sync_runs_table_failed", error=str(exc))


def _ensure_enrichment_snapshot_tables(
    engine: Engine,
    *,
    dialect: str,
    bounded_ddl,
) -> None:
    """Idempotent CREATE for safety/reliability snapshot tables."""
    inspector = inspect(engine)
    try:
        existing = set(inspector.get_table_names())
    except Exception as exc:
        log.warning("schema_enrichment_inspect_failed", error=str(exc))
        existing = set()

    pg = dialect == "postgresql"
    json_type = "JSONB" if pg else "JSON"
    ts = "TIMESTAMPTZ NOT NULL DEFAULT NOW()" if pg else "DATETIME DEFAULT CURRENT_TIMESTAMP"
    pk_int = "SERIAL PRIMARY KEY" if pg else "INTEGER PRIMARY KEY"

    tables = {
        "vehicle_catalog_matches": f"""
            CREATE TABLE IF NOT EXISTS vehicle_catalog_matches (
                id {pk_int},
                vehicle_key VARCHAR(180) NOT NULL,
                provider VARCHAR(40) NOT NULL,
                provider_vehicle_id VARCHAR(80),
                match_confidence NUMERIC(5, 4),
                matched_attributes {json_type},
                fetched_at {ts}
            )
        """,
        "vehicle_safety_snapshots": f"""
            CREATE TABLE IF NOT EXISTS vehicle_safety_snapshots (
                vehicle_key VARCHAR(180) PRIMARY KEY,
                provider VARCHAR(40) NOT NULL DEFAULT 'nhtsa',
                payload {json_type} NOT NULL,
                source_version VARCHAR(80),
                refreshed_at {ts}
            )
        """,
        "vehicle_reliability_snapshots": f"""
            CREATE TABLE IF NOT EXISTS vehicle_reliability_snapshots (
                vehicle_key VARCHAR(180) PRIMARY KEY,
                provider VARCHAR(40) NOT NULL DEFAULT 'problemsbyvin',
                payload {json_type} NOT NULL,
                source_version VARCHAR(80),
                checksum VARCHAR(128),
                refreshed_at {ts}
            )
        """,
        "charge_points": f"""
            CREATE TABLE IF NOT EXISTS charge_points (
                ocm_id INTEGER PRIMARY KEY,
                name VARCHAR(200),
                operator VARCHAR(120),
                address TEXT,
                town VARCHAR(100),
                lat NUMERIC(9, 6) NOT NULL,
                lng NUMERIC(9, 6) NOT NULL,
                status VARCHAR(40),
                connectors {json_type},
                power_kw NUMERIC(8, 2),
                data_provider VARCHAR(200),
                license_note VARCHAR(200),
                attribution TEXT,
                source_updated_at VARCHAR(40),
                refreshed_at {ts}
            )
        """,
        "listing_geo_enrichment": f"""
            CREATE TABLE IF NOT EXISTS listing_geo_enrichment (
                listing_id INTEGER PRIMARY KEY,
                provider VARCHAR(40) NOT NULL DEFAULT 'geoapify',
                source_location_hash VARCHAR(64) NOT NULL,
                lat NUMERIC(9, 6),
                lng NUMERIC(9, 6),
                formatted_address TEXT,
                result_type VARCHAR(40),
                match_confidence NUMERIC(5, 4),
                payload {json_type},
                source_url TEXT,
                fetched_at {ts}
            )
        """,
    }
    for table_name, ddl in tables.items():
        if table_name in existing:
            continue
        try:
            bounded_ddl(ddl)
            log.info("schema_enrichment_table_ensured", table=table_name)
        except Exception as exc:
            log.warning("schema_enrichment_table_failed", table=table_name, error=str(exc))


def apply_schema_patches(engine: Engine) -> None:
    """Add missing columns and create new tables without a full Alembic migration."""
    from db.models import Base

    dialect = engine.dialect.name

    # Each statement gets its own transaction: on Postgres a failed statement
    # aborts the surrounding transaction, which would otherwise roll back
    # patches already logged as applied.
    #
    # DDL here runs inside API startup, which has a hard timeout — every
    # statement gets bounded lock/statement timeouts on Postgres so a busy
    # table degrades to a logged warning instead of hanging startup (a
    # blocking CREATE INDEX took the HF Space down on 2026-07-16).
    def _bounded_ddl(sql: str) -> None:
        with engine.begin() as conn:
            if dialect == "postgresql":
                conn.execute(text("SET LOCAL lock_timeout = '5s'"))
                conn.execute(text("SET LOCAL statement_timeout = '15s'"))
            conn.execute(text(sql))

    _ensure_auth_tables(engine, dialect=dialect, bounded_ddl=_bounded_ddl)

    for column_name, pg_type, sqlite_type in _CAR_LISTING_COLUMN_PATCHES:
        if _column_exists(engine, "car_listings", column_name):
            continue
        if dialect == "postgresql":
            sql = (
                f"ALTER TABLE car_listings "
                f"ADD COLUMN IF NOT EXISTS {column_name} {pg_type}"
            )
        else:
            sql = f"ALTER TABLE car_listings ADD COLUMN {column_name} {sqlite_type}"
        try:
            _bounded_ddl(sql)
            log.info("schema_patch_applied", table="car_listings", column=column_name)
        except Exception as exc:
            if "duplicate column" in str(exc).lower():
                continue
            log.warning(
                "schema_patch_failed",
                table="car_listings",
                column=column_name,
                error=str(exc),
            )

    for table_name, column_name, pg_type, sqlite_type in _TABLE_COLUMN_PATCHES:
        if _column_exists(engine, table_name, column_name):
            continue
        if dialect == "postgresql":
            sql = (
                f"ALTER TABLE {table_name} "
                f"ADD COLUMN IF NOT EXISTS {column_name} {pg_type}"
            )
        else:
            # SQLite cannot ADD COLUMN IF NOT EXISTS on older versions — fail open.
            sql = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sqlite_type}"
        try:
            _bounded_ddl(sql)
            log.info("schema_patch_applied", table=table_name, column=column_name)
        except Exception as exc:
            if "duplicate column" in str(exc).lower() or "no such table" in str(exc).lower():
                continue
            log.warning(
                "schema_patch_failed",
                table=table_name,
                column=column_name,
                error=str(exc),
            )

    # Ensure tables like scrape_runs / historical_price_observations exist
    # before index patches reference them. Also emit an explicit CREATE for the
    # archive table so a timed-out or partial create_all cannot leave the API
    # querying a missing relation (prod 500s on /market/summary + model-price-history).
    Base.metadata.create_all(bind=engine)
    _ensure_historical_price_observations_table(engine, dialect=dialect, bounded_ddl=_bounded_ddl)
    _ensure_analytics_events_table(engine, dialect=dialect, bounded_ddl=_bounded_ddl)
    _ensure_user_notifications_table(engine, dialect=dialect, bounded_ddl=_bounded_ddl)
    _ensure_provider_sync_runs_table(engine, dialect=dialect, bounded_ddl=_bounded_ddl)
    _ensure_enrichment_snapshot_tables(engine, dialect=dialect, bounded_ddl=_bounded_ddl)

    for index_name, table_name, columns in _INDEX_PATCHES:
        try:
            _bounded_ddl(_create_index_sql(index_name, table_name, columns))
        except Exception as exc:
            # Best-effort optimization: the nightly scrape run retries it in a
            # quieter window; never block API startup on an index build.
            log.warning(
                "schema_index_patch_failed",
                index=index_name,
                error=str(exc),
            )

    if dialect != "postgresql":
        return

    try:
        _bounded_ddl("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    except Exception as exc:
        log.warning(
            "schema_extension_patch_failed",
            extension="pg_trgm",
            error=str(exc),
        )

    for index_name, table_name, column in _POSTGRES_TRGM_INDEX_PATCHES:
        try:
            _bounded_ddl(
                f"CREATE INDEX IF NOT EXISTS {index_name} "
                f"ON {table_name} USING gin ({column} gin_trgm_ops)"
            )
        except Exception as exc:
            log.warning(
                "schema_index_patch_failed",
                index=index_name,
                error=str(exc),
            )
