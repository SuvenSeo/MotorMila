# Motormila on Cloudflare: account/user data in D1

## The split (this is the whole design)

| Data | Lives on | Why |
|---|---|---|
| Public catalog, price history, aggregates | Pages / R2 snapshots (already live) | Public traffic never touches a database; no D1 row caps from browsing |
| Accounts, invites, dealer profiles, alerts, notifications, push, feedback, billing events, analytics | D1 `motormila-accounts` (this folder) | Small, low-write, user-specific — exactly what D1 free tier fits |
| Scraper + maintenance jobs | GitHub Actions on SQLite dumps (already live, `manus-to-live`) | Heavy compute stays off Workers; outputs go to R2 snapshots + D1 via this service |
| Photo uploads | R2 `motormila-snapshots` (already live) | Unchanged |

## Why not a full auth rewrite in a Worker

Passwords are bcrypt rounds=12 and tokens are HMAC-SHA256, both in the
Python backend. Workers Free allows 10 ms of CPU per invocation — bcrypt
in a Worker would blow that and force Workers Paid ($5/mo). So:

- **D1 is storage only.** `src/index.ts` is a data service: fixed,
  parameterized queries, authenticated by `X-Motormila-Db-Key`.
- **Auth logic stays in Python** (`backend/app/api/v1/endpoints/auth.py`).
  It calls D1 through `backend/app/db/d1_client.py` (D1 HTTP API) or
  through this Worker — same operations, same row shapes.
- **Pages needs no change.** `/api/v1` already proxies to the HF backend,
  so once the backend points its account tables at D1, the frontend
  keeps calling the same URLs.

## D1 database

- Name: `motormila-accounts`
- ID: `75755d8a-d5c6-4eea-8759-69aeba14b515` (in `wrangler.toml`; do not
  recreate the database or this changes)
- Schema: `migrations/0001_account_tables.sql`, generated from
  `backend/db/models.py` via SQLAlchemy `create_all` on SQLite, 2026-10-28.
  No Postgres-only types exist in these 12 tables.
- Gotcha found while testing: several NOT NULL columns have no
  server-side DEFAULT (Postgres relied on SQLAlchemy client defaults).
  Every insert through the Worker or `d1_client.py` must therefore
  supply `plan`, `subscription_status`, `role`, `is_active`,
  `token_version`, and `email_verified` explicitly — both do.

## Deploy the Worker (when ready)

```bash
cd workers/motormila-db
npm install
wrangler secret put DB_SERVICE_KEY   # shared key, never committed
wrangler deploy
```

The Worker is code-complete but NOT yet deployed: deploying it is
harmless (it does nothing without the secret), but it is not on the
live path until the backend switches to it. The D1 database itself
IS live, schema applied and tested 2026-10-28 (test user/invite/alert
inserted, read back, deleted — 0 test rows remain).

## Nov 1 cutover (Neon account export) — see scripts/nov1-neon-export.py

1. On Nov 1, check Neon: project `autolens-raw-data`
   (`frosty-sound-46661850`), production branch `br-small-mud-ao1vnwl9`.
   As of 2026-10-28 that branch is `archived` and the project is quota
   blocked — if it is still archived after the reset, restore it in
   Neon first; the export cannot run against an archived branch.
2. Export ONLY the 12 account/user tables (not `car_listings` etc. —
   catalog is already on Cloudflare). Convert booleans to 1/0,
   timestamps to ISO strings, JSON to strings.
3. Import to D1 in batches, verify row counts per table, spot-check
   that `password_hash` values still start with `$2b$` and that
   `token_version` values survived (otherwise every session dies).
4. In the HF Space secrets, set `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_D1_API_TOKEN` (scoped to
   D1 edit on this database only), and `MOTORMILA_D1_ENABLED=true`.
   **Do NOT change `AUTH_TOKEN_SECRET`** — existing sessions are
   HMAC-signed with it; rotating it logs everyone out.
5. Test login with a real invite account, then alerts, notifications,
   dealer claim, and feedback. Keep Neon as fallback for a week.
6. Only then delete the Neon project.

## Maintenance on Cloudflare

- Schema changes: add a new migration file, apply it with
  `wrangler d1 execute motormila-accounts --file <migration>`.
- Backups: D1 has no `pg_dump` equivalent — schedule a weekly export
  (query all 12 tables, write JSON to R2 `motormila-snapshots/backups/`).
- Monitoring: D1 row read/write counts in the Cloudflare dashboard;
  caps reset daily at midnight UTC, unlike Neon's monthly quota.
- Cost guardrail: this design stays on Workers/D1 free tier as long as
  public catalog traffic stays on snapshots. If D1 ever needs Paid,
  that is a $5/mo decision, not a silent charge.
