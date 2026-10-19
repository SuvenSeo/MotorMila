"""Alembic environment — URL resolution matches db.session (HOT/COLD/sqlite fallback)."""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from dotenv import find_dotenv, load_dotenv
from sqlalchemy import engine_from_config, pool

load_dotenv(find_dotenv(".env.local", usecwd=True), override=False)
load_dotenv()

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _normalise(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def _resolve_alembic_url() -> str:
    """Same env vars as the app: HOT, COLD/DATABASE_URL, then sqlite fallback."""
    hot_raw = os.getenv("HOT_DATABASE_URL", "").strip()
    cold_raw = (os.getenv("COLD_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()
    allow_sqlite = os.getenv("ALLOW_SQLITE_FALLBACK", "false").lower() == "true"

    hot = _normalise(hot_raw) if hot_raw else ""
    cold = _normalise(cold_raw) if cold_raw else ""

    if hot and cold:
        url = cold
    elif cold:
        url = cold
    elif hot:
        url = hot
    elif allow_sqlite:
        url = "sqlite:///./motormila.db"
    else:
        raise ValueError(
            "No database URL configured for Alembic. Set HOT_DATABASE_URL and/or "
            "COLD_DATABASE_URL/DATABASE_URL, or ALLOW_SQLITE_FALLBACK=true for local SQLite."
        )
    return url


# No ORM metadata — baseline only; do not autogenerate full schema yet.
target_metadata = None


def run_migrations_offline() -> None:
    url = _resolve_alembic_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _resolve_alembic_url()
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = url
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
