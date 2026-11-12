# Motormila Disaster Recovery Plan

**Owner:** suvenseoras@gmail.com · 0758504424  
**Last reviewed:** 2026-07-28  
**Scope:** Production data, backend API, pipeline auth

---

## RTO / RPO Targets

| Component | RPO (data loss tolerance) | RTO (recovery time target) |
|---|---|---|
| Database (listings, stats) | 24 h (daily backup) | 2 h |
| Backend API (HF Space) | N/A (stateless) | 30 min |
| Frontend (Cloudflare Pages) | N/A (static) | 15 min |
| Scrapers / pipeline | 24 h | 4 h |

---

## 1. Daily Backup Workflow

The `.github/workflows/daily-db-backup.yml` workflow fires at **02:00 UTC** every day (and on `workflow_dispatch`).

**What it does:**

1. Reads `HOT_DATABASE_URL` (primary) or `SUPABASE_DB_URL` (fallback) from GitHub Secrets.
2. Runs `pg_dump --format=custom --compress=9 --no-owner --no-privileges`.
3. Uploads the dump as a GitHub Actions artifact (`motormila-backup-<TIMESTAMP>.dump`) with **30-day retention**.
4. Posts a Slack alert if the job fails (requires `SLACK_WEBHOOK_URL` secret).

**Required GitHub Secrets:**

| Secret | Purpose |
|---|---|
| `HOT_DATABASE_URL` | Primary Postgres connection string (preferred) |
| `SUPABASE_DB_URL` | Fallback Supabase Postgres URL |
| `SLACK_WEBHOOK_URL` | Optional — failure alerts only |

If neither database secret is set the job logs a message and exits cleanly (no artifact, no failure status).

---

## 2. Restore Steps

### 2a. Download the backup artifact

1. Go to **GitHub → Actions → Daily DB Backup → select the relevant run**.
2. Under **Artifacts**, download `motormila-backup-<TIMESTAMP>.dump`.

### 2b. Restore to a Postgres database

```bash
# Restore into a target database (will drop/recreate objects)
pg_restore \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --dbname "$TARGET_DATABASE_URL" \
  motormila-backup-<TIMESTAMP>.dump
```

For Supabase: use the **direct connection string** (port 5432), not the pooler, so DDL commands are allowed.

### 2c. Clear the stats cache

After restoring, the `market_stats_cache` table will contain stale entries. Flush them so aggregates are recomputed on next request:

```sql
DELETE FROM market_stats_cache;
```

### 2d. Smoke-test the restore

```bash
# Quick row-count sanity check
psql "$TARGET_DATABASE_URL" -c "SELECT COUNT(*) FROM car_listings;"
```

Then start the backend locally against the restored DB and hit `GET /health`.

---

## 3. Supabase PITR (Point-in-Time Recovery)

Supabase **Pro** plan includes PITR with up to **7-day retention** (configurable up to 28 days on paid add-ons).

To enable: **Supabase Dashboard → Project → Settings → Backups → Enable PITR**.

To restore to a point in time: **Dashboard → Settings → Backups → Restore** — select target timestamp. A new project is provisioned; swap the connection string in GitHub Secrets.

> PITR is the preferred recovery path for surgical rollbacks (e.g. bad scraper run that corrupted data). The daily dump covers catastrophic loss.

---

## 4. Pipeline Auth Recovery

The scraper and digest pipelines authenticate via HuggingFace and Cloudflare tokens stored as GitHub Secrets.

| Secret | Used by |
|---|---|
| `HF_TOKEN` | HF Spaces deployment + keep-alive |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Pages rebuild (retry latest github:push production deployment) |
| `IKMAN_SESSION_COOKIE` | Ikman scraper |

**If a token is compromised or expired:**

1. Revoke the old token on the provider dashboard (HF → Settings → Tokens; Cloudflare → My Profile → API Tokens).
2. Generate a new token with the minimum required scope.
3. Update the corresponding GitHub Secret: **Repo → Settings → Secrets and variables → Actions**.
4. Trigger the affected workflow manually via `workflow_dispatch` to verify.

---

## 5. Secret Rotation Schedule

| Secret | Recommended rotation |
|---|---|
| `HOT_DATABASE_URL` / `SUPABASE_DB_URL` | On any personnel change or every 6 months |
| `HF_TOKEN` | Every 6 months |
| `CLOUDFLARE_API_TOKEN` | Every 6 months |
| `SLACK_WEBHOOK_URL` | When Slack workspace membership changes |
| `IKMAN_SESSION_COOKIE` | When scraper auth breaks (session expiry) |

---

## 6. Backend API Recovery

The API runs as a HuggingFace Space (Docker). It is **stateless** — all state lives in the database.

**To redeploy:**

```bash
# Trigger a fresh HF Spaces deployment by pushing to main
git push origin main
# or manually via HF dashboard → Restart Space
```

**Startup requirements:**

- `DATABASE_URL` (or `ALLOW_SQLITE_FALLBACK=true` for local dev)
- `ALLOW_SQLITE_FALLBACK`, `PRO_ACCESS_ENFORCED`, `APP_ACCESS_ENFORCED` (see `AGENTS.md`)
- Optional: `SENTRY_DSN`, `AUTH_USERS`, `CORS_ORIGINS`

If `DB_INIT_TIMEOUT_SECONDS` (default 60s) is exceeded, the Space aborts startup. Increase if the DB cold-start is slow.

---

## 7. Frontend Recovery

The frontend is deployed to Cloudflare Pages. It is fully static; no database writes occur from the frontend.

**To redeploy:** push to `main`, or retry the latest production deployment from the Cloudflare dashboard (Pages → motormila → Deployments → Retry deployment).

**If the Pages deployment is broken:**

1. Identify the last known-good deployment in the Cloudflare dashboard (Pages → motormila → Deployments).
2. Click **Retry deployment** on that deployment.
3. Investigate the failing build's logs before re-enabling auto-deploy.
