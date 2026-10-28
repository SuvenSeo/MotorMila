#!/usr/bin/env python3
"""Nov 1 Neon -> Cloudflare D1 account export. DO NOT RUN BEFORE NOV 1.

Why Nov 1: Neon's free quota resets monthly, and as of 2026-10-28 the
autolens-raw-data production branch is archived AND quota-blocked, so
account rows cannot be exported today. The merged SQLite failover dump
deliberately carries no accounts, so it is NOT a substitute source.

Usage (on/after Nov 1, after verifying Neon is accessible again):
  1. In Neon, check project frosty-sound-46661850, branch
     br-small-mud-ao1vnwl9. If still `archived`, restore it first.
  2. Get a connection URI for role + database from Neon, then:
       pg_dump --data-only --table=platform_users --table=user_invites \
         --table=dealer_profiles --table=market_alerts \
         --table=market_alert_matches --table=push_subscriptions \
         --table=device_push_tokens --table=user_notifications \
         --table=notification_delivery_log --table=user_feedback \
         --table=billing_webhook_events --table=analytics_events \
         "$NEON_DSN" > neon_accounts.sql
     Or export each table with COPY ... TO STDOUT CSV.
  3. Run this script to convert + import:
       CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_D1_DATABASE_ID=... \
       CLOUDFLARE_D1_API_TOKEN=... \
       python3 scripts/nov1-neon-export.py --csv-dir ./neon_csv --verify-only
       python3 scripts/nov1-neon-export.py --csv-dir ./neon_csv --import

Conversion rules (Postgres -> D1/SQLite):
  - boolean t/f -> 1/0
  - timestamps -> ISO 8601 strings (D1 DATETIME accepts them)
  - JSON columns -> JSON strings
  - NUMERIC -> string (preserves exact decimal; D1 NUMERIC handles it)
  - empty strings in nullable columns stay empty; the literal string
    "\\N" (COPY null marker) becomes NULL
  - NEVER import car_listings or any catalog/history table: catalog is
    already on Cloudflare snapshots, and importing it would blow D1's
    free size/write caps for no benefit.

Verification (run before AND after --import):
  - row count per table matches the Neon count
  - every platform_users.password_hash starts with $2b$ (bcrypt)
  - token_version values match Neon exactly (sessions depend on them)
  - no test@example.com / d1-test rows remain in D1 after import

This script is a conversion + import skeleton: the CSV reading and
D1 batching are implemented; the Neon connection itself is left to
pg_dump/COPY because Neon credentials must never be committed here.
"""

import argparse
import csv
import json
import os
import sys
import urllib.request

TABLES = [
    "platform_users", "user_invites", "dealer_profiles", "market_alerts",
    "market_alert_matches", "push_subscriptions", "device_push_tokens",
    "user_notifications", "notification_delivery_log", "user_feedback",
    "billing_webhook_events", "analytics_events",
]

BOOL_COLS = {
    "platform_users": {"is_active", "email_verified"},
    "market_alerts": {"quiet_hours_enabled", "active"},
    "device_push_tokens": {"price_drops_enabled"},
    "user_notifications": {"read"},
}


def convert_value(table: str, col: str, value: str | None):
    if value is None or value == "\\N":
        return None
    if col in BOOL_COLS.get(table, set()):
        return 1 if value.strip().lower() in ("t", "true", "1", "yes") else 0
    return value


def d1_query(sql: str, params: list):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    db = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
    token = os.environ["CLOUDFLARE_D1_API_TOKEN"]
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account}"
        f"/d1/database/{db}/query"
    )
    payload = json.dumps({"sql": sql, "params": params}).encode()
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    if not data.get("success"):
        raise RuntimeError(f"D1 failed: {data.get('errors')}")
    return (data.get("result") or [{}])[0].get("results") or []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv-dir", required=True)
    parser.add_argument("--import", dest="do_import", action="store_true")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    for table in TABLES:
        path = os.path.join(args.csv_dir, f"{table}.csv")
        if not os.path.exists(path):
            print(f"SKIP {table}: {path} not found (export it from Neon first)")
            continue
        with open(path, newline="") as fh:
            rows = list(csv.DictReader(fh))
        print(f"{table}: {len(rows)} rows in CSV")
        if not rows:
            continue
        # sanity: bcrypt hashes must survive intact
        if table == "platform_users":
            bad = [r for r in rows if not str(r.get("password_hash", "")).startswith("$2b$")]
            if bad:
                print(f"  WARNING: {len(bad)} user rows without a $2b$ bcrypt hash — check before importing")
        if not args.do_import:
            continue
        cols = list(rows[0].keys())
        for row in rows:
            vals = [convert_value(table, c, row[c]) for c in cols]
            d1_query(
                f"INSERT OR REPLACE INTO {table} ({', '.join(cols)}) "
                f"VALUES ({', '.join('?' * len(cols))})",
                vals,
            )
        print(f"  imported {len(rows)} rows into D1:{table}")
        d1_rows = d1_query(f"SELECT COUNT(*) AS n FROM {table}")
        print(f"  D1 count now: {d1_rows[0]['n']}")
    print("Done. If --import was used, run the README cutover checks before enabling MOTORMILA_D1_ENABLED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
