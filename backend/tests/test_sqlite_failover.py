"""SQLite failover when Neon transfer quota blocks the live API."""

from __future__ import annotations

import gzip
import sqlite3
from pathlib import Path

import pytest

from sqlalchemy import text

from db import session as db_session
from db import sqlite_failover


def _tiny_sqlite(path: Path) -> Path:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS ping (id INTEGER)")
    conn.execute("INSERT INTO ping (id) VALUES (1)")
    conn.commit()
    conn.close()
    return path


def test_reattach_engines_points_sessions_at_sqlite(tmp_path):
    restore_url = db_session.HOT_URL
    db_path = _tiny_sqlite(tmp_path / "failover.db")
    try:
        db_session.reattach_engines(f"sqlite:///{db_path}")
        with db_session.SessionLocal() as db:
            assert db.execute(text("SELECT id FROM ping")).scalar() == 1
        with db_session.HotSessionLocal() as db:
            assert db.execute(text("SELECT 1")).scalar() == 1
    finally:
        db_session.reattach_engines(restore_url)


def test_maybe_activate_downloads_when_neon_is_down(tmp_path, monkeypatch):
    sqlite_failover._activated = False
    restore_url = db_session.HOT_URL
    dest = tmp_path / "merged.db"
    gz_source = tmp_path / "merged-motormila.db.gz"
    db_path = _tiny_sqlite(tmp_path / "source.db")
    with db_path.open("rb") as src, gzip.open(gz_source, "wb") as out:
        out.write(src.read())

    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    monkeypatch.setenv("SQLITE_FAILOVER_PATH", str(dest))
    monkeypatch.setenv("MERGED_SQLITE_URL", gz_source.as_uri())
    monkeypatch.setattr(db_session, "HOT_URL", "postgresql://example.neon.tech/neondb")
    monkeypatch.setattr(sqlite_failover, "neon_reachable", lambda: False)

    try:
        assert sqlite_failover.maybe_activate_sqlite_failover() is True
        assert dest.is_file()
        with db_session.SessionLocal() as db:
            assert db.execute(text("SELECT 1")).scalar() == 1
    finally:
        sqlite_failover._activated = False
        db_session.reattach_engines(restore_url)


def test_maybe_activate_skips_when_neon_is_up(monkeypatch):
    sqlite_failover._activated = False
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    monkeypatch.setattr(db_session, "HOT_URL", "postgresql://example.neon.tech/neondb")
    monkeypatch.setattr(sqlite_failover, "neon_reachable", lambda: True)
    monkeypatch.setattr(
        sqlite_failover,
        "download_merged_sqlite",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not download")),
    )
    assert sqlite_failover.maybe_activate_sqlite_failover() is False


@pytest.fixture(autouse=True)
def _reset_failover_state():
    sqlite_failover._activated = False
    sqlite_failover._primary_url = None
    sqlite_failover._active_source_url = None
    sqlite_failover._active_source_version = None
    sqlite_failover._next_refresh_allowed_at = 0.0
    yield
    sqlite_failover._activated = False
    sqlite_failover._primary_url = None
    sqlite_failover._active_source_url = None
    sqlite_failover._active_source_version = None
    sqlite_failover._next_refresh_allowed_at = 0.0


def test_tick_fails_back_to_neon_after_recovery(monkeypatch):
    """When the quota resets, the monitor rebinds to the saved primary DSN."""
    sqlite_failover._activated = True
    sqlite_failover._primary_url = "postgresql://example.neon.tech/neondb"
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    monkeypatch.setattr(sqlite_failover, "_probe_url", lambda url, **kwargs: True)
    reattached: list[str] = []
    monkeypatch.setattr(db_session, "reattach_engines", reattached.append)

    sqlite_failover._tick_once()

    assert reattached == ["postgresql://example.neon.tech/neondb"]
    assert sqlite_failover._activated is False


def test_tick_stays_failed_over_while_neon_is_still_down(monkeypatch):
    sqlite_failover._activated = True
    sqlite_failover._primary_url = "postgresql://example.neon.tech/neondb"
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    monkeypatch.setattr(sqlite_failover, "_probe_url", lambda url, **kwargs: False)
    monkeypatch.setattr(
        sqlite_failover,
        "_refresh_active_failover_locked",
        lambda: False,
    )
    monkeypatch.setattr(
        db_session,
        "reattach_engines",
        lambda url: (_ for _ in ()).throw(AssertionError("must not fail back")),
    )

    sqlite_failover._tick_once()

    assert sqlite_failover._activated is True


def test_tick_refreshes_failover_db_when_public_source_changes(tmp_path, monkeypatch):
    sqlite_failover._activated = True
    sqlite_failover._primary_url = "postgresql://example.neon.tech/neondb"
    sqlite_failover._active_source_url = "https://example.test/merged.db.gz"
    sqlite_failover._active_source_version = ("old", 100)
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    failover_path = tmp_path / "merged.db"
    failover_path.write_bytes(b"old-db" * 300)
    monkeypatch.setenv("SQLITE_FAILOVER_PATH", str(failover_path))
    monkeypatch.setenv("MERGED_SQLITE_URL", "https://example.test/merged.db.gz")
    monkeypatch.setattr(sqlite_failover, "_probe_url", lambda url, **kwargs: False)
    monkeypatch.setattr(
        sqlite_failover,
        "_source_version",
        lambda url: ("new", 200),
    )

    downloaded: list[str] = []

    def fake_download(dest, url):
        downloaded.append(url)
        dest.write_bytes(b"new-db" * 300)
        return dest

    monkeypatch.setattr(sqlite_failover, "download_merged_sqlite", fake_download)
    activated: list[str] = []
    monkeypatch.setattr(
        sqlite_failover,
        "activate_sqlite_file",
        lambda path: activated.append(str(path)),
    )
    monkeypatch.setattr(sqlite_failover, "_ensure_failover_schema", lambda: None)

    sqlite_failover._tick_once()

    assert downloaded == ["https://example.test/merged.db.gz"]
    assert activated
    assert sqlite_failover._active_source_version == ("new", 200)


def test_tick_does_not_redownload_unchanged_failover_db(tmp_path, monkeypatch):
    sqlite_failover._activated = True
    sqlite_failover._primary_url = "postgresql://example.neon.tech/neondb"
    sqlite_failover._active_source_url = "https://example.test/merged.db.gz"
    sqlite_failover._active_source_version = ("same", 100)
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    monkeypatch.setenv("SQLITE_FAILOVER_PATH", str(tmp_path / "merged.db"))
    (tmp_path / "merged.db").write_bytes(b"same-db" * 300)
    monkeypatch.setenv("MERGED_SQLITE_URL", "https://example.test/merged.db.gz")
    monkeypatch.setattr(sqlite_failover, "_probe_url", lambda url, **kwargs: False)
    monkeypatch.setattr(
        sqlite_failover,
        "_source_version",
        lambda url: ("same", 100),
    )
    monkeypatch.setattr(
        sqlite_failover,
        "download_merged_sqlite",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not download")),
    )

    sqlite_failover._tick_once()


def test_source_version_parses_http_metadata():
    class _Headers:
        def __init__(self):
            self._values = {
                "etag": '"abc123"',
                "last-modified": "Thu, 24 Sep 2026 15:00:00 GMT",
                "content-length": "42",
            }

        def get(self, key, default=None):
            return self._values.get(str(key).lower(), default)

    headers = _Headers()

    # Last-Modified is excluded: Vercel's edge flaps it for identical bytes.
    assert sqlite_failover._version_from_headers(headers) == ('"abc123"', 42)


def test_tick_retries_download_on_next_pass_after_failure(tmp_path, monkeypatch):
    """A failed download must not consume the only failover attempt."""
    restore_url = db_session.HOT_URL
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    monkeypatch.setenv("SQLITE_FAILOVER_PATH", str(tmp_path / "merged.db"))
    monkeypatch.setattr(db_session, "HOT_URL", "postgresql://example.neon.tech/neondb")
    monkeypatch.setattr(sqlite_failover, "neon_reachable", lambda: False)
    monkeypatch.setattr(
        sqlite_failover,
        "download_merged_sqlite",
        lambda *args, **kwargs: (_ for _ in ()).throw(OSError("mirror down")),
    )
    try:
        with pytest.raises(RuntimeError, match="all failover DB sources failed"):
            sqlite_failover._tick_once()
        # Not activated and no partial state — the next tick retries cleanly.
        assert sqlite_failover._activated is False
        assert not (tmp_path / "merged.db").exists()
    finally:
        db_session.HOT_URL = restore_url


def test_download_with_fallback_tries_mirrors_in_order(tmp_path, monkeypatch):
    monkeypatch.setenv("MERGED_SQLITE_URLS", "https://bad-one.example/x.gz,https://bad-two.example/y.gz")
    monkeypatch.setenv("MERGED_SQLITE_URL", "https://good.example/z.gz")
    attempts: list[str] = []

    def fake_download(dest, url):
        attempts.append(url)
        if "good" not in url:
            raise OSError("nope")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x" * 2000)
        return dest

    monkeypatch.setattr(sqlite_failover, "download_merged_sqlite", fake_download)

    out = sqlite_failover._download_with_fallback(tmp_path / "merged.db")

    assert attempts[:3] == [
        "https://bad-one.example/x.gz",
        "https://bad-two.example/y.gz",
        "https://good.example/z.gz",
    ]
    assert out.stat().st_size >= 1_000


def test_candidate_sources_default_is_public_site_copy(monkeypatch):
    monkeypatch.delenv("MERGED_SQLITE_URLS", raising=False)
    monkeypatch.delenv("MERGED_SQLITE_URL", raising=False)
    # No source-repo URL may ship in the default list — this file is synced
    # to a public HF Space and the repo is private.
    assert sqlite_failover._candidate_sources() == list(sqlite_failover.FAILOVER_DB_URLS)
    for source in sqlite_failover._candidate_sources():
        assert "github" not in source.lower()


def test_refresh_drops_stale_wal_sidecars(tmp_path, monkeypatch):
    """Atomic DB swaps must not leave the previous generation's -wal/-shm.

    Stale sidecars make new connections read old WAL frames (wrong data) or
    fail with "database disk image is malformed" -> sustained db:down.
    """
    sqlite_failover._activated = True
    sqlite_failover._active_source_url = "https://example.test/merged.db.gz"
    sqlite_failover._active_source_version = ("old", 100)
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    live = tmp_path / "merged.db"
    live.write_bytes(b"old-db" * 300)
    (tmp_path / "merged.db-wal").write_bytes(b"stale-wal")
    (tmp_path / "merged.db-shm").write_bytes(b"stale-shm")
    monkeypatch.setenv("SQLITE_FAILOVER_PATH", str(live))
    monkeypatch.setenv("MERGED_SQLITE_URL", "https://example.test/merged.db.gz")
    monkeypatch.setattr(sqlite_failover, "_probe_url", lambda url, **kwargs: False)
    monkeypatch.setattr(sqlite_failover, "_source_version", lambda url: ("new", 200))

    def fake_download(dest, url):
        dest.write_bytes(b"new-db" * 300)
        return dest

    monkeypatch.setattr(sqlite_failover, "download_merged_sqlite", fake_download)
    monkeypatch.setattr(sqlite_failover, "activate_sqlite_file", lambda path: None)
    monkeypatch.setattr(sqlite_failover, "_ensure_failover_schema", lambda: None)

    assert sqlite_failover._refresh_active_failover_locked() is True
    assert live.read_bytes() == b"new-db" * 300
    assert not (tmp_path / "merged.db-wal").exists()
    assert not (tmp_path / "merged.db-shm").exists()


def test_refresh_throttles_repeated_attempts(tmp_path, monkeypatch):
    """A version change refreshes at most once an hour; failures back off."""
    sqlite_failover._activated = True
    sqlite_failover._active_source_url = "https://example.test/merged.db.gz"
    sqlite_failover._active_source_version = ("old", 100)
    monkeypatch.setenv("SQLITE_FAILOVER_FORCE", "true")
    live = tmp_path / "merged.db"
    live.write_bytes(b"old-db" * 300)
    monkeypatch.setenv("SQLITE_FAILOVER_PATH", str(live))
    monkeypatch.setenv("MERGED_SQLITE_URL", "https://example.test/merged.db.gz")
    monkeypatch.setattr(sqlite_failover, "_probe_url", lambda url, **kwargs: False)
    monkeypatch.setattr(sqlite_failover, "_source_version", lambda url: ("new", 200))

    calls: list[str] = []

    def fake_download(dest, url):
        calls.append(url)
        dest.write_bytes(b"new-db" * 300)
        return dest

    monkeypatch.setattr(sqlite_failover, "download_merged_sqlite", fake_download)
    monkeypatch.setattr(sqlite_failover, "activate_sqlite_file", lambda path: None)
    monkeypatch.setattr(sqlite_failover, "_ensure_failover_schema", lambda: None)

    assert sqlite_failover._refresh_active_failover_locked() is True
    assert len(calls) == 1
    # Immediate second attempt is throttled even though the version differs.
    sqlite_failover._active_source_version = ("older", 50)
    assert sqlite_failover._refresh_active_failover_locked() is False
    assert len(calls) == 1
