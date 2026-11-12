"""Postgres engines use a small warm QueuePool by default; NullPool is opt-in."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy.pool import NullPool, QueuePool

from db import session as db_session


def _clear(monkeypatch):
    for name in ("DB_NULLPOOL", "DB_POOL_SIZE", "DB_MAX_OVERFLOW", "DB_POOL_RECYCLE_SECONDS", "DB_POOL_TIMEOUT_SECONDS"):
        monkeypatch.delenv(name, raising=False)


def test_default_pool_is_small_queuepool(monkeypatch):
    _clear(monkeypatch)
    kw = db_session._postgres_pool_kwargs()
    assert kw["poolclass"] is QueuePool
    assert kw["pool_size"] == 5
    assert kw["max_overflow"] == 5
    assert kw["pool_recycle"] == 300
    assert kw["pool_pre_ping"] is True


def test_pool_sizes_from_env(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("DB_POOL_SIZE", "2")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "0")
    monkeypatch.setenv("DB_POOL_RECYCLE_SECONDS", "bogus")
    kw = db_session._postgres_pool_kwargs()
    assert (kw["pool_size"], kw["max_overflow"], kw["pool_recycle"]) == (2, 0, 300)


def test_nullpool_opt_in(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("DB_NULLPOOL", "true")
    kw = db_session._postgres_pool_kwargs()
    assert kw["poolclass"] is NullPool
    assert "pool_size" not in kw


def test_postgres_engine_uses_queuepool(monkeypatch):
    _clear(monkeypatch)
    engine = db_session._make_engine("postgresql://u:p@127.0.0.1:1/db")
    try:
        assert isinstance(engine.pool, QueuePool)
        assert engine.pool.size() == 5
        assert engine.pool._recycle == 300
        assert engine.pool._pre_ping is True
    finally:
        engine.dispose()


def test_sqlite_engine_unchanged(monkeypatch):
    _clear(monkeypatch)
    engine = db_session._make_engine("sqlite:///:memory:")
    try:
        assert engine.dialect.name == "sqlite"
        assert engine.pool.__class__.__name__ in {"SingletonThreadPool", "QueuePool", "StaticPool"}
    finally:
        engine.dispose()
