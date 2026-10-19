#!/usr/bin/env python3
"""Export the Neon database into a gzipped SQLite dump (post-reset recovery).

During Neon's free-tier egress outage the live site runs off a local SQLite DB
built from GitHub release dumps (see .github/workflows/manus-to-live.yml).
Neon refused all connections until the monthly quota reset (Sept 1). Once it
resets, run this script to pull the full car_listings table — the 180k+ rows
with their price history — out of Neon and publish it as a neon-export-*
release; the manus-to-live workflow then merges it into the shared merged DB,
restoring the pre-outage catalog.

Usage:
  DATABASE_URL=postgresql://... python scripts/ops/export_neon_to_sqlite.py
  python scripts/ops/export_neon_to_sqlite.py --dsn postgresql://... --output motormila.db.gz
  python scripts/ops/export_neon_to_sqlite.py --limit 5000     # quick connectivity test

The dump uses the full CarListing schema (companion tables empty) plus a
`vehicle_price_history_src` table keyed by (source, source_id, scraped_at) so
merge_sqlite_dump.py can re-attach price history to re-inserted rows.
"""
from __future__ import annotations

import argparse
import gzip
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Allow running as `python scripts/ops/...` from anywhere: make `backend/`
# importable (parents: [0]=ops, [1]=scripts, [2]=backend).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from db.models import Base, CarListing  # noqa: E402

CHUNK = 5000

# SQLAlchemy / psycopg class names that mean "cannot talk to Neon", not a
# bad query. Exceeding the free transfer quota blocks every connection until
# the monthly reset — treat that as skip, not a red workflow.
_UNAVAILABLE_EXC_NAMES = frozenset(
    {
        "OperationalError",
        "InterfaceError",
        "DisconnectionError",
        "TimeoutError",
        "OSError",
        "URLError",
        "ConnectionError",
    }
)
_UNAVAILABLE_NEEDLES = (
    "could not connect",
    "connection timed out",
    "connection refused",
    "timeout expired",
    "ssl connection has been closed",
    "remaining transfer",
    "quota exceeded",
    "compute time exceeded",
    "endpoint is disabled",
    "the database is not currently accepting",
    "server closed the connection",
    "connection reset",
    "name or service not known",
    "no route to host",
)


def neon_is_unavailable(exc: BaseException) -> bool:
    """True when Neon is unreachable (egress block, timeout, network), not a SQL bug."""
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    name = type(exc).__name__
    if name in _UNAVAILABLE_EXC_NAMES:
        return True
    message = str(exc).lower()
    return any(needle in message for needle in _UNAVAILABLE_NEEDLES)


def _emit_github_output(**values: str) -> None:
    github_output = os.getenv("GITHUB_OUTPUT", "").strip()
    if not github_output:
        return
    try:
        with open(github_output, "a", encoding="utf-8") as handle:
            for key, value in values.items():
                handle.write(f"{key}={value}\n")
    except OSError as exc:
        print(f"[warn] could not write GITHUB_OUTPUT: {exc}")


def normalize_dsn(dsn: str) -> str:
    value = (dsn or "").strip()
    if value.startswith("postgres://"):
        return "postgresql://" + value[len("postgres://") :]
    return value


def probe_neon(dsn: str) -> None:
    """SELECT 1 against Neon. Raises on failure."""
    engine = create_engine(
        dsn,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10},
    )
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    finally:
        engine.dispose()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dsn",
        default=(
            os.environ.get("DATABASE_URL")
            or os.environ.get("HOT_DATABASE_URL")
            or os.environ.get("COLD_DATABASE_URL")
            or ""
        ),
        help="PostgreSQL DSN (default: DATABASE_URL / HOT_DATABASE_URL / COLD_DATABASE_URL)",
    )
    ap.add_argument("--output", default="motormila.db.gz", help="output .db.gz path")
    ap.add_argument(
        "--limit",
        type=int,
        default=0,
        help="max listings to copy (0 = all; use a small number for connectivity tests)",
    )
    ap.add_argument(
        "--probe",
        action="store_true",
        help="SELECT 1 only; exit 0 with skip=true if Neon is unreachable",
    )
    args = ap.parse_args()

    dsn = normalize_dsn(args.dsn)
    if not dsn.startswith("postgresql://"):
        print("ERROR: no PostgreSQL DSN. Pass --dsn or set DATABASE_URL/HOT_DATABASE_URL.", file=sys.stderr)
        return 2

    if args.probe:
        try:
            probe_neon(dsn)
        except Exception as exc:  # noqa: BLE001 — classify, then skip or fail
            if neon_is_unavailable(exc):
                print(f"Neon unreachable ({type(exc).__name__}: {exc}). Skipping export.")
                _emit_github_output(skip="true", neon_ok="false")
                return 0
            print(f"ERROR: Neon probe failed: {exc}", file=sys.stderr)
            return 1
        print("Neon reachable.")
        _emit_github_output(skip="false", neon_ok="true")
        return 0

    limit = int(args.limit) if args.limit else 0
    limit_sql = f" LIMIT {limit}" if limit else ""
    # When testing with --limit, only pull history for the copied listings.
    hist_limit_sql = f" AND c.id IN (SELECT id FROM car_listings{limit_sql})" if limit else ""

    pg = create_engine(dsn, poolclass=NullPool, pool_pre_ping=True, connect_args={"connect_timeout": 10})

    tmpdir = Path(tempfile.mkdtemp(prefix="neon-export-"))
    db_path = tmpdir / "motormila.db"
    sq = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(sq)

    cols = [c.name for c in CarListing.__table__.columns]
    col_list = ", ".join(cols)
    placeholders = ", ".join(f":{c}" for c in cols)

    from decimal import Decimal

    def clean_row(row_map):
        d = dict(row_map)
        for k, v in d.items():
            if isinstance(v, Decimal):
                d[k] = float(v)
        return d

    try:
        with pg.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM car_listings")).fetchone()[0]
            print(f"Neon car_listings total: {total}")

        listings = 0
        with pg.connect().execution_options(stream_results=True) as conn, sq.begin() as dst:
            result = conn.execute(text(f"SELECT {col_list} FROM car_listings{limit_sql}"))
            while True:
                chunk = result.fetchmany(CHUNK)
                if not chunk:
                    break
                dst.execute(
                    text(f"INSERT INTO car_listings ({col_list}) VALUES ({placeholders})"),
                    [clean_row(r._mapping) for r in chunk],
                )
                listings += len(chunk)
                print(f"  listings copied: {listings}")

        # Price history, re-keyed by (source, source_id) so it survives the
        # merge into a DB with different integer ids.
        with sq.begin() as dst:
            dst.execute(
                text(
                    "CREATE TABLE vehicle_price_history_src ("
                    "source TEXT NOT NULL, source_id TEXT NOT NULL, "
                    "price_lkr NUMERIC, scraped_at DATETIME)"
                )
            )
        history = 0
        with pg.connect().execution_options(stream_results=True) as conn, sq.begin() as dst:
            result = conn.execute(
                text(
                    "SELECT c.source, c.source_id, v.price_lkr, v.scraped_at "
                    "FROM vehicle_price_history v "
                    "JOIN car_listings c ON c.id = v.vehicle_id"
                    f"{hist_limit_sql}"
                )
            )
            while True:
                chunk = result.fetchmany(CHUNK)
                if not chunk:
                    break
                dst.execute(
                    text(
                        "INSERT INTO vehicle_price_history_src "
                        "(source, source_id, price_lkr, scraped_at) "
                        "VALUES (:source, :source_id, :price_lkr, :scraped_at)"
                    ),
                    [clean_row(r._mapping) for r in chunk],
                )
                history += len(chunk)
                if history % 100_000 == 0:
                    print(f"  history copied: {history}")
    except Exception as exc:  # noqa: BLE001 — classify quota-block vs real failure
        if neon_is_unavailable(exc):
            print(f"Neon unreachable during export ({type(exc).__name__}: {exc}). Skipping.")
            _emit_github_output(skip="true", neon_ok="false")
            shutil.rmtree(tmpdir, ignore_errors=True)
            return 0
        raise
    finally:
        pg.dispose()

    print("=" * 60)
    print(f"listings copied: {listings}")
    print(f"price-history rows copied: {history}")
    print("=" * 60)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with db_path.open("rb") as fin, gzip.open(out, "wb") as fout:
        shutil.copyfileobj(fin, fout)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")
    shutil.rmtree(tmpdir, ignore_errors=True)
    _emit_github_output(skip="false", neon_ok="true", listings=str(listings), history=str(history))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
