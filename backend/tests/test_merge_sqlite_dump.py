"""Tests for scripts/ops/merge_sqlite_dump.py.

Covers the two dump shapes the outage pipeline merges:
- Manus-style dumps: plain car_listings (no history table).
- Neon-export dumps (neon-export.yml): car_listings + a
  vehicle_price_history_src table keyed by (source, source_id) whose points
  must be re-attached to the upserted listings.
"""

import gzip
import shutil
import sqlite3
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

BACKEND = Path(__file__).resolve().parents[1]
OPS = BACKEND / "scripts" / "ops"
sys.path.insert(0, str(OPS))
sys.path.insert(0, str(BACKEND))

import merge_sqlite_dump as msd  # noqa: E402
import import_sqlite_to_neon as neon_imp  # noqa: E402
from db.models import Base  # noqa: E402

HISTORY_SRC_ROWS = [
    # (source, source_id, price_lkr, scraped_at)
    ("ikman", "ad-1", 9_200_000, "2026-07-15 09:00:00"),
    ("ikman", "ad-1", 8_900_000, "2026-08-01 10:00:00"),
    ("autolanka", "al-9", 7_500_000, "2026-07-20 11:30:00"),
    # Orphan: listing not present in the dump — must be skipped, not imported.
    ("riyasewana", "gone-1", 5_000_000, "2026-06-01 08:00:00"),
]

LISTING_SQL = (
    "INSERT INTO car_listings (source, source_id, title, make, model, year, price_lkr, "
    "scraped_at, first_seen_at, url, is_active, is_outlier, is_duplicate) VALUES "
    "('ikman', 'ad-1', 'Toyota Aqua 2018', 'Toyota', 'Aqua', 2018, 8900000, "
    "'2026-08-01 10:00:00', '2026-08-01 10:00:00', 'https://ikman.lk/ad-1', 1, 0, 0), "
    "('autolanka', 'al-9', 'Suzuki Swift 2020', 'Suzuki', 'Swift', 2020, 7200000, "
    "'2026-08-02 12:00:00', '2026-08-02 12:00:00', 'https://autolanka.com/al-9', 1, 0, 0)"
)


def _make_dump(
    path: Path,
    *,
    with_history_src: bool = True,
    scrape_run: tuple[str, str] | None = None,
) -> Path:
    """Build a gzipped dump mirroring what the scrapers/exporters publish."""
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text(LISTING_SQL))
        if with_history_src:
            conn.execute(
                text(
                    "CREATE TABLE vehicle_price_history_src ("
                    "source TEXT NOT NULL, source_id TEXT NOT NULL, "
                    "price_lkr NUMERIC, scraped_at DATETIME)"
                )
            )
            for source, source_id, price, scraped_at in HISTORY_SRC_ROWS:
                conn.execute(
                    text(
                        "INSERT INTO vehicle_price_history_src "
                        "(source, source_id, price_lkr, scraped_at) "
                        "VALUES (:s, :sid, :p, :t)"
                    ),
                    {"s": source, "sid": source_id, "p": price, "t": scraped_at},
                )
        if scrape_run is not None:
            source, started_at = scrape_run
            conn.execute(
                text(
                    "INSERT INTO scrape_runs "
                    "(source, started_at, finished_at, status, listings_found, listings_new) "
                    "VALUES (:source, :started_at, :started_at, 'SUCCESS', 2, 1)"
                ),
                {"source": source, "started_at": started_at},
            )
    engine.dispose()
    gz = path.with_suffix(".db.gz")
    with path.open("rb") as fin, gzip.open(gz, "wb") as fout:
        shutil.copyfileobj(fin, fout)
    return gz


def _fresh_target(path: Path) -> None:
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    engine.dispose()


def _run_merge(
    monkeypatch: pytest.MonkeyPatch, dump: Path, target: Path, *, dry_run: bool = False
) -> int:
    argv = ["merge_sqlite_dump.py", str(dump), "--target", str(target)]
    if dry_run:
        argv.append("--dry-run")
    monkeypatch.setattr(sys, "argv", argv)
    return msd.main()


def _count(path: Path, table: str) -> int:
    with sqlite3.connect(path) as con:
        return con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def _history_points(path: Path) -> list[tuple]:
    """(source, source_id, price_lkr, scraped_at) for every history row."""
    with sqlite3.connect(path) as con:
        return con.execute(
            "SELECT c.source, c.source_id, h.price_lkr, h.scraped_at "
            "FROM vehicle_price_history h "
            "JOIN car_listings c ON c.id = h.vehicle_id "
            "ORDER BY h.scraped_at"
        ).fetchall()


# ---------------------------------------------------------------------------
# Neon-export dump: listings + re-keyed price history
# ---------------------------------------------------------------------------


def test_neon_export_merge_imports_listings_and_history(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dump = _make_dump(tmp_path / "motormila.db")
    target = tmp_path / "merged.db"
    _fresh_target(target)

    assert _run_merge(monkeypatch, dump, target) == 0

    # Both listings upserted once.
    assert _count(target, "car_listings") == 2

    # First sightings record 2 points; the dump's 3 attachable points are
    # imported; the orphan is skipped.
    points = _history_points(target)
    assert len(points) == 5
    imported = {
        (s, sid, int(price), ts)
        for s, sid, price, ts in points
        if ts in {"2026-07-15 09:00:00", "2026-08-01 10:00:00", "2026-07-20 11:30:00"}
    }
    assert imported == {
        ("ikman", "ad-1", 9_200_000, "2026-07-15 09:00:00"),
        ("ikman", "ad-1", 8_900_000, "2026-08-01 10:00:00"),
        ("autolanka", "al-9", 7_500_000, "2026-07-20 11:30:00"),
    }
    # The orphan listing never made it in.
    assert not any(s == "riyasewana" for s, _, _, _ in points)


def test_neon_export_merge_is_idempotent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dump = _make_dump(tmp_path / "motormila.db")
    target = tmp_path / "merged.db"
    _fresh_target(target)

    assert _run_merge(monkeypatch, dump, target) == 0
    assert _run_merge(monkeypatch, dump, target) == 0

    # No duplicate listings and no duplicate history points on re-merge.
    assert _count(target, "car_listings") == 2
    assert _count(target, "vehicle_price_history") == 5


# ---------------------------------------------------------------------------
# Manus-style dump: no history table
# ---------------------------------------------------------------------------


def test_manus_dump_without_history_table_merges_listings_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dump = _make_dump(tmp_path / "motormila.db", with_history_src=False)
    target = tmp_path / "merged.db"
    _fresh_target(target)

    assert _run_merge(monkeypatch, dump, target) == 0
    assert _count(target, "car_listings") == 2
    # Only the 2 first-sighting points; no history table in the dump.
    assert _count(target, "vehicle_price_history") == 2


def test_merge_imports_latest_scrape_run_and_is_idempotent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dump = _make_dump(
        tmp_path / "motormila.db",
        with_history_src=False,
        scrape_run=("ikman", "2026-08-03 09:00:00"),
    )
    target = tmp_path / "merged.db"
    _fresh_target(target)

    assert _run_merge(monkeypatch, dump, target) == 0
    assert _run_merge(monkeypatch, dump, target) == 0

    assert _count(target, "scrape_runs") == 1
    with sqlite3.connect(target) as con:
        row = con.execute(
            "SELECT source, started_at, status FROM scrape_runs"
        ).fetchone()
    assert row[0] == "ikman"
    assert str(row[1]).startswith("2026-08-03 09:00:00")
    assert row[2] == "SUCCESS"


def test_merge_does_not_replace_newer_target_scrape_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dump = _make_dump(
        tmp_path / "motormila.db",
        with_history_src=False,
        scrape_run=("ikman", "2026-08-01 09:00:00"),
    )
    target = tmp_path / "merged.db"
    _fresh_target(target)
    with sqlite3.connect(target) as con:
        con.execute(
            "INSERT INTO scrape_runs "
            "(source, started_at, finished_at, status, listings_found, listings_new) "
            "VALUES ('ikman', '2026-08-04 09:00:00', '2026-08-04 09:01:00', "
            "'SUCCESS', 9, 3)"
        )
        con.commit()

    assert _run_merge(monkeypatch, dump, target) == 0

    with sqlite3.connect(target) as con:
        row = con.execute(
            "SELECT started_at, listings_found, listings_new FROM scrape_runs"
        ).fetchone()
    assert row == ("2026-08-04 09:00:00", 9, 3)


# ---------------------------------------------------------------------------
# Dry run
# ---------------------------------------------------------------------------


def test_import_sqlite_to_neon_wrapper_dry_run_uses_dsn(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The Neon import CLI must pass a DSN through to merge_sqlite_dump."""
    dump = _make_dump(tmp_path / "motormila.db")
    target = tmp_path / "neon.db"
    _fresh_target(target)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "import_sqlite_to_neon.py",
            str(dump),
            "--dsn",
            f"sqlite:///{target}",
            "--dry-run",
        ],
    )
    assert neon_imp.main() == 0
    assert _count(target, "car_listings") == 0


def test_engine_url_for_postgres_dsn_is_not_wrapped_as_sqlite() -> None:
    """Neon restore must open the real DSN, not sqlite:///postgresql://…."""
    assert msd.engine_url_for_target("postgresql://user:pass@host/db") == (
        "postgresql://user:pass@host/db"
    )
    assert msd.engine_url_for_target("postgres://user:pass@host/db") == (
        "postgresql://user:pass@host/db"
    )
    assert msd.engine_url_for_target("sqlite:///motormila.db") == "sqlite:///motormila.db"
    assert msd.engine_url_for_target("/tmp/merged.db") == "sqlite:////tmp/merged.db"


def test_dry_run_writes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    dump = _make_dump(tmp_path / "motormila.db")
    target = tmp_path / "merged.db"
    _fresh_target(target)

    assert _run_merge(monkeypatch, dump, target, dry_run=True) == 0
    assert _count(target, "car_listings") == 0
    assert _count(target, "vehicle_price_history") == 0


def test_merge_preserves_vehicle_category(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The dump merge must preserve vehicle_category on car_listings."""
    dump_db = tmp_path / "motormila.db"
    engine = create_engine(f"sqlite:///{dump_db}")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO car_listings (source, source_id, title, make, model, year, price_lkr, "
                "scraped_at, first_seen_at, url, is_active, is_outlier, is_duplicate, vehicle_category) "
                "VALUES ('ikman', 'ad-van-1', 'Toyota Hiace 2015', 'Toyota', 'Hiace', 2015, 6500000, "
                "'2026-08-01 10:00:00', '2026-08-01 10:00:00', 'https://ikman.lk/ad-van-1', 1, 0, 0, 'vans')"
            )
        )
    engine.dispose()

    gz = dump_db.with_suffix(".db.gz")
    with dump_db.open("rb") as fin, gzip.open(gz, "wb") as fout:
        shutil.copyfileobj(fin, fout)

    target = tmp_path / "merged.db"
    _fresh_target(target)

    assert _run_merge(monkeypatch, gz, target) == 0
    with sqlite3.connect(target) as con:
        cat = con.execute("SELECT vehicle_category FROM car_listings WHERE source_id = 'ad-van-1'").fetchone()[0]
        assert cat == "vans"


def test_merge_does_not_overwrite_existing_first_seen_at(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "merged.db"
    _fresh_target(target)
    engine = create_engine(f"sqlite:///{target}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO car_listings (source, source_id, title, make, model, year, price_lkr, "
                "scraped_at, first_seen_at, url, is_active, is_outlier, is_duplicate) VALUES "
                "('ikman', 'ad-1', 'Toyota Aqua 2018', 'Toyota', 'Aqua', 2018, 9200000, "
                "'2026-01-01 10:00:00', '2026-01-01 10:00:00', 'https://ikman.lk/ad-1', 1, 0, 0)"
            )
        )
    engine.dispose()

    dump = _make_dump(tmp_path / "motormila.db", with_history_src=False)
    assert _run_merge(monkeypatch, dump, target) == 0

    with sqlite3.connect(target) as con:
        first_seen = con.execute(
            "SELECT first_seen_at FROM car_listings WHERE source_id = 'ad-1'"
        ).fetchone()[0]
    assert str(first_seen).startswith("2026-01-01")

