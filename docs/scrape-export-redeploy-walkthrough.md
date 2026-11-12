# Walkthrough: scrape → export → redeploy

Manual loop that refreshes Motormila **without** turning daily cron back on.
Public site stays on `VITE_SNAPSHOT_ONLY=true`; scrapers only write to the DB,
then snapshots are rebuilt for CDN/same-origin reads.

Workflow file: `.github/workflows/scrape-export-redeploy.yml`  
Actions name: **Scrape → Export → Redeploy**

---

## Before you start

### 1) Check Neon data-transfer budget
If Neon's free transfer allowance is exhausted, the scrape job will fail or
hang on DB writes. Run Actions → **Neon Egress Watchdog** (or check the
`neon-egress-watch` Monday run) to see where the month stands.
See `docs/neon-egress-budget.md`.

### 2) Confirm GitHub Actions billing
Recent Motormila CI failed with *“spending limit needs to be increased”*.  
If Actions still won’t start, fix billing first — the workflow cannot run.

Repo → **Settings → Billing** (or org billing) → raise spending limit / fix payment.

### 3) Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | Required for | Notes |
|--------|----------------|-------|
| `HOT_DATABASE_URL` | Scrape + DB export fallback | Already used by other scrape workflows |
| `SNAPSHOT_EXPORT_SECRET` | **RETIRED 2026-11-12** | The export API (`api/internal-snapshot-export.js`) was deleted; snapshots refresh via R2 (direct DB export fallback) |
| `CLOUDFLARE_API_TOKEN` | Auto production rebuild | Cloudflare → My Profile → API Tokens (Pages:Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Auto production rebuild | Cloudflare account id |
| `R2_*` | Optional R2 upload | Only if you already set up Cloudflare R2 |

`HOT_DATABASE_URL` should already exist (other scrape workflows use it).

Add the two Cloudflare secrets under  
**Repo → Settings → Secrets and variables → Actions → New repository secret**.

Without them the workflow still exports snapshots and uploads them to R2,
but the Pages rebuild step is skipped — run
`scripts/trigger-pages-rebuild.py` locally instead (see below).

```bash
# with CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set:
python3 scripts/trigger-pages-rebuild.py
```

---

## First run (recommended): ikman only

1. Open  
   https://github.com/SuvenSeo/MotorMila/actions/workflows/scrape-export-redeploy.yml  
2. Click **Run workflow** (branch: `main`).
3. Set inputs:

| Input | Value |
|-------|--------|
| `source` | **ikman** |
| `max_pages` | **10** or **20** (start small) |
| `refresh_catalog` | **true** (so new listings appear on the site) |
| `redeploy` | **true** |

4. Click **Run workflow**.
5. Watch jobs in order:
   - `scrape` — ikman write to Postgres  
   - `refresh-snapshots` — rebuild `/snapshots/latest`  
   - `redeploy` — production deploy **with** snapshot JSON  

6. When green, hard-refresh https://motormila.pages.dev  
   Confirm `/snapshots/latest/stats-summary.json` is JSON (not HTML).

### What “good” looks like in the logs
- `ikman_active_before=…` / `ikman_active_after=…` / `ikman_scraped_last_2h=…`
- Snapshot pull finishes without auth errors
- Rebuild serves `https://motormila.pages.dev`
- Verify step prints `content-type=application/json`

---

## Export-only (no scrape)

Use when the DB already has fresh rows and you only need to refresh the site:

| Input | Value |
|-------|--------|
| `source` | **none** |
| `refresh_catalog` | true (or false for stats/insights only) |
| `redeploy` | true |

---

## If redeploy is skipped / fails

1. Open the successful run → **Artifacts** → `public-snapshots-latest-<id>`
2. Download and unpack into `public/snapshots/latest/`
3. Locally (with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` set):

```bash
python3 scripts/trigger-pages-rebuild.py
```

---

## After it works once

- Daily + midday cron are **enabled again** (Neon-first) — writes are free.
- Daily runs export **stats-only** snapshots (`--skip-catalog`); this workflow
  is the weekly/manual **full catalog** refresh.
- Keep `VITE_SNAPSHOT_ONLY=true` — do not flip back to live API browsing; the
  DB must only serve scrapes/auth/alerts, never public page reads.
- Every full-catalog scrape should end with snapshot refresh + redeploy (this workflow).

## Do not (yet)

- Run the full scrape matrix more than daily (egress is fine, but source sites
  may rate-limit)
- Run `historical-backfill` while the Neon budget is tight
- Unset `VITE_SNAPSHOT_ONLY` “to make maps live again”

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Workflow never starts | Actions spending limit | Fix GitHub billing |
| Scrape fails on DB connect | Egress exhausted / bad DSN | Wait for quota; check `HOT_DATABASE_URL` |
| Snapshot refresh 401 | RETIRED — the export API was deleted 2026-11-12 | Snapshots now refresh via R2 (direct DB export fallback) |
| Site empty after GitHub merge | Git deploy wiped gitignored JSON | Re-run this workflow with `source=none`, or run `scripts/trigger-pages-rebuild.py` locally |
| Catalog too large / deploy fails | Part split missing | Ensure `split-listing-catalog.mjs` multi-part ran |
