"""Export and restore Motormila Postgres data for provider migration.

The main use case is rescuing the Neon dataset after the free transfer quota
resets, then importing the dump into Supabase. This script intentionally prints
only safe connection metadata and never echoes database URLs.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv
from sqlalchemy import create_engine

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DEFAULT_EXPORT_ROOT = BASE_DIR / "rescue_exports"

TABLES = [
    "locations",
    "car_listings",
    # After car_listings: vehicle_price_history has an FK on car_listings.id
    "vehicle_price_history",
    "price_aggregates",
    "market_signals",
    "import_price_snapshots",
    "scrape_runs",
    "user_feedback",
    # Auth / user management tables
    "platform_users",
    "user_invites",
    # Historical & analytics
    "historical_price_observations",
    "market_stats_cache",
    # Dealer & alert tables
    "dealer_profiles",
    "market_alerts",
    "market_alert_matches",
    "analytics_events",
]

SOURCE_ENV_NAMES = ("SOURCE_DATABASE_URL", "COLD_DATABASE_URL", "DATABASE_URL", "HOT_DATABASE_URL", "NEON_URL")
TARGET_ENV_NAMES = ("TARGET_DATABASE_URL", "SUPABASE_DATABASE_URL")


def load_env_files() -> None:
    load_dotenv(PROJECT_ROOT / ".env.local", override=False)
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    load_dotenv(BASE_DIR / ".env.local", override=False)
    load_dotenv(BASE_DIR / ".env", override=False)


def normalize_url(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def get_url(names: tuple[str, ...], label: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return normalize_url(value)
    raise SystemExit(f"Missing {label} database URL. Set one of: {', '.join(names)}")


def safe_host(url: str) -> str:
    try:
        host = urlparse(url).hostname or "unknown"
    except Exception:
        return "unknown"
    return host


def connect(url: str):
    try:
        return psycopg2.connect(url, connect_timeout=15)
    except psycopg2.OperationalError:
        # Fallback: parse URL components manually (handles dots in usernames
        # like postgres.<project-ref> which psycopg2 DSN parsing chokes on).
        parsed = urlparse(url)
        user = parsed.username or ""
        password = parsed.password or ""
        host = parsed.hostname or ""
        port = parsed.port or 5432
        dbname = parsed.path.lstrip("/") if parsed.path else "postgres"
        # Ensure postgres:// normalized already
        if parsed.scheme == "postgres":
            url = "postgresql://" + url[len("postgres://") :]
        import urllib.parse
        password = urllib.parse.unquote(password)
        return psycopg2.connect(
            host=host, port=port, dbname=dbname,
            user=user, password=password,
            connect_timeout=15,
        )


def quote_ident(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Unsafe identifier: {name}")
    return f'"{name}"'


def table_exists(conn, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("select to_regclass(%s)", (f"public.{table}",))
        return cur.fetchone()[0] is not None


def table_count(conn, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"select count(*) from public.{quote_ident(table)}")
        return int(cur.fetchone()[0] or 0)


def column_exists(conn, table: str, column: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "select 1 from information_schema.columns where table_schema='public' and table_name=%s and column_name=%s",
            (table, column),
        )
        return cur.fetchone() is not None


def export_table(conn, table: str, output_dir: Path) -> dict[str, object]:
    if not table_exists(conn, table):
        return {"table": table, "rows": 0, "file": None, "skipped": "missing_table"}

    rows = table_count(conn, table)
    output_path = output_dir / f"{table}.csv.gz"
    order_clause = "order by id" if column_exists(conn, table, "id") else ""
    query = f"copy (select * from public.{quote_ident(table)} {order_clause}) to stdout with csv header"

    try:
        with conn.cursor() as cur, gzip.open(output_path, "wt", encoding="utf-8", newline="") as handle:
            cur.copy_expert(query, handle)
    except Exception as exc:
        conn.rollback()
        return {"table": table, "rows": 0, "file": None, "skipped": f"export_error: {exc}"}

    return {
        "table": table,
        "rows": rows,
        "file": output_path.name,
        "bytes": output_path.stat().st_size,
    }


def export_data(args: argparse.Namespace) -> None:
    source_url = get_url(SOURCE_ENV_NAMES, "source")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = Path(args.output or (DEFAULT_EXPORT_ROOT / f"motormila-postgres-{timestamp}")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"source_host={safe_host(source_url)}")
    print(f"output_dir={output_dir}")

    conn = connect(source_url)
    try:
        conn.autocommit = True
        manifest = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_host": safe_host(source_url),
            "tables": [],
        }
        for table in TABLES:
            result = export_table(conn, table, output_dir)
            manifest["tables"].append(result)
            print(f"{table}: rows={result['rows']} file={result.get('file') or 'skipped'}")

        with (output_dir / "manifest.json").open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(manifest, handle, indent=2, sort_keys=True)
            handle.write("\n")
    finally:
        conn.close()


def create_schema(target_url: str) -> None:
    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))
    from db.models import Base

    engine = create_engine(target_url, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    engine.dispose()


def truncate_tables(conn) -> None:
    existing = [table for table in TABLES if table_exists(conn, table)]
    if not existing:
        return

    ordered = ", ".join(f"public.{quote_ident(table)}" for table in reversed(existing))
    with conn.cursor() as cur:
        cur.execute(f"truncate table {ordered} restart identity cascade")


def import_table(conn, table: str, export_dir: Path) -> dict[str, object]:
    input_path = export_dir / f"{table}.csv.gz"
    if not input_path.exists():
        return {"table": table, "rows": 0, "skipped": "missing_file"}
    if not table_exists(conn, table):
        return {"table": table, "rows": 0, "skipped": "missing_target_table"}

    with conn.cursor() as cur, gzip.open(input_path, "rt", encoding="utf-8", newline="") as handle:
        cur.copy_expert(f"copy public.{quote_ident(table)} from stdin with csv header", handle)

    rows = table_count(conn, table)
    with conn.cursor() as cur:
        cur.execute("select pg_get_serial_sequence(%s, 'id')", (f"public.{table}",))
        sequence = cur.fetchone()[0]
        if sequence:
            cur.execute(
                f"select setval(%s, coalesce((select max(id) from public.{quote_ident(table)}), 1), true)",
                (sequence,),
            )

    return {"table": table, "rows": rows, "file": input_path.name}


def import_data(args: argparse.Namespace) -> None:
    export_dir = Path(args.input).resolve()
    if not export_dir.exists():
        raise SystemExit(f"Export directory does not exist: {export_dir}")

    target_url = get_url(TARGET_ENV_NAMES, "target")
    print(f"target_host={safe_host(target_url)}")
    print(f"input_dir={export_dir}")

    create_schema(target_url)

    conn = connect(target_url)
    try:
        conn.autocommit = False
        if args.replace:
            truncate_tables(conn)

        results = []
        for table in TABLES:
            result = import_table(conn, table, export_dir)
            results.append(result)
            print(f"{table}: rows={result['rows']} file={result.get('file') or 'skipped'}")

        conn.commit()
        with (export_dir / "import-result.json").open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(
                {
                    "imported_at": datetime.now(timezone.utc).isoformat(),
                    "target_host": safe_host(target_url),
                    "tables": results,
                },
                handle,
                indent=2,
                sort_keys=True,
            )
            handle.write("\n")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export or import Motormila Postgres data.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Export source Postgres tables to gzip CSV files.")
    export_parser.add_argument("--output", type=Path, help="Output directory. Defaults to backend/rescue_exports/<timestamp>.")
    export_parser.set_defaults(func=export_data)

    import_parser = subparsers.add_parser("import", help="Import a rescue export into Supabase/Postgres.")
    import_parser.add_argument("--input", required=True, type=Path, help="Directory created by the export command.")
    import_parser.add_argument(
        "--replace",
        action="store_true",
        help="Truncate target tables before import. Use only on an empty or disposable target.",
    )
    import_parser.set_defaults(func=import_data)

    return parser.parse_args()


def main() -> None:
    load_env_files()
    args = parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
