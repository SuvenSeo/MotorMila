# Permanent free ops: R2 snapshots + Neon single DB

> **Updated** — Motormila runs **Neon-only** (single DB) with R2 snapshots as
> the public read layer. See **`docs/neon-egress-budget.md`** for the current
> runbook. The Oracle-optional path below is kept as a fallback option.

Motormila burned free Neon/Supabase because **public browsing hits live Postgres**.
The durable $0 path is: **R2 for public reads**, DB only for scrapes/auth/alerts.

> **WARNING — Git deploys omit gitignored snapshot JSON.**  
> `public/snapshots/latest/*.json` is gitignored, so every GitHub → Pages
> deploy from `main` ships **without** those files. With
> `VITE_SNAPSHOT_ONLY=true`, the SPA then serves HTML for snapshot URLs and
> the site breaks. After every snapshot refresh you must trigger a Pages
> rebuild (retry of the latest github:push production deployment —
> `scripts/trigger-pages-rebuild.py`), which pulls the fresh R2 snapshots
> at build time.

## ASAP checklist (do in order)

### 0. Manual scrape → export → redeploy (wired)
Use GitHub Action **Scrape → Export → Redeploy**  
(`.github/workflows/scrape-export-redeploy.yml`).  
Step-by-step UI guide: [`docs/scrape-export-redeploy-walkthrough.md`](./scrape-export-redeploy-walkthrough.md).

Start with `source=ikman`, `max_pages=10–20`, then hard-refresh the site.

### 1. Stop DB burners
Already paused: `daily-scrape`, `midday-top-sources-scrape`, `keep-hf-awake`.  
Also paused: `pipeline-monitor` (hourly `/health` + `/pipeline/status`).

Do **not** run historical-backfill or full scrape matrix until R2 is live.

### 2. Export public snapshots (one-time while DB still readable)
GitHub → Actions → export / scrape workflow that runs `export_public_snapshots.py`,  
**or** locally:

```bash
cd backend
export HOT_DATABASE_URL='postgresql://…'   # pooler :6543 preferred
export COLD_DATABASE_URL="$HOT_DATABASE_URL"
export ALLOW_SQLITE_FALLBACK=false
.venv/bin/python export_public_snapshots.py
```

Confirm `listing-catalog.json`, `stats-summary.json`, `live-market.json`, etc. exist under the export dir.

If the catalog is too large for a single static file (Cloudflare Pages serves files up to 25 MB),
`listing-catalog.json` may be a **manifest** with a `parts` array pointing at
`listing-catalog-part-000.json`, … — the frontend loads and concatenates them.

### 2b. SUPERSEDED 2026-11-12 — Alternative while DB was still reachable from Vercel (no R2 yet)

> The export API (`api/internal-snapshot-export.js`) and the scripts below
> (`apply-snapshot-vercel-env.sh`, `redeploy-prod-with-snapshots.sh`) were
> deleted in the Cloudflare-only move. This section is kept as history only;
> snapshots now refresh via R2 + `scripts/trigger-pages-rebuild.py`.

Use the authenticated exporter + pull script (needs `SNAPSHOT_EXPORT_SECRET`
on Vercel; do not commit the secret):

```bash
# After deploying api/internal-snapshot-export.js
SNAPSHOT_EXPORT_SECRET=… node scripts/pull-vercel-snapshots.mjs
# Writes public/snapshots/latest/*.json (gitignored), including multi-part catalog
bash scripts/apply-snapshot-vercel-env.sh   # sets VITE_SNAPSHOT_BASE_URL + VITE_SNAPSHOT_ONLY
# Deploy the working tree so /snapshots/latest/* is served same-origin
bash scripts/redeploy-prod-with-snapshots.sh
```


`VITE_SNAPSHOT_BASE_URL` for this path:
`https://motormila.vercel.app/snapshots/latest`

Prefer R2 long-term (step 3) — Vercel deploys have size limits; R2 does not
burn the same constraints for large catalogs.

### 3. Upload to Cloudflare R2 (permanent free tier)
R2 free: **10 GB storage**, **1M Class A**, **10M Class B**/mo, **$0 egress**  
(see https://developers.cloudflare.com/r2/pricing/).

GitHub secrets:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PREFIX` (optional, default `latest`)

Run `upload_snapshots_r2.py` (or the workflow step that wraps it).  
Attach a **public** custom domain / r2.dev URL to the bucket.

### 4. Cloudflare Pages env (required)
```text
VITE_SNAPSHOT_BASE_URL=https://<public-r2-domain>/latest
VITE_SNAPSHOT_ONLY=true
```

Push to `main` (Pages rebuilds on push) or retry the latest production deployment. With `VITE_SNAPSHOT_ONLY=true`, public reads **never** fall back to the HF/Postgres API (empty/error instead of burning egress).

### 5. HF Space (optional egress brakes)
```text
DISABLE_LIVE_SSE=true
LIVE_STREAM_INTERVAL_SECONDS=120
```

### 6. Re-enable scrapes carefully
Only after R2 + `VITE_SNAPSHOT_ONLY=true` are verified in production:

- Manual `workflow_dispatch` first
- Prefer **weekly** or single-source scrapes, not the full twice-daily matrix
- Every scrape must end with snapshot export → R2 upload

---

## Optional: leave Supabase forever (still free)

**Oracle Cloud Always Free** Ampere VM + self-hosted Postgres:

- Always Free compute + **~10 TB/month egress** (OCI tenancy allowance)
- Ampere free quota was reduced (Jun 2026) to **2 OCPU / 12 GB** — stay under that
- Signup/capacity can fail; expect DIY ops (updates, backups, firewall)

Then set HF + GitHub:

```text
HOT_DATABASE_URL=postgresql://motormila:…@<oracle-public-ip>:5432/motormila
COLD_DATABASE_URL=<same or separate>
```

Restore from emergency backup / `pg_dump` into that instance.  
**Still keep R2 + `VITE_SNAPSHOT_ONLY=true`** — otherwise Oracle will also get hammered by visitors.

Do **not** move to Neon free expecting a fix — same ~5 GB egress cliff.

---

## What stays interactive vs snapshot

| Works from R2 (snapshot-only) | Still needs a live DB |
|-------------------------------|------------------------|
| Dashboard stats / live panel (poll) | Sign-in / invites |
| Listings browse / detail from catalog | Alerts / WhatsApp / Telegram / email |
| Makes / models / sources / district prices | AI chat, FMV live estimate |
| Pipeline status JSON (if exported) | Scrapers, admin CRUD |

---

## Verify

1. Open site with DevTools → Network: listing/stats requests hit **R2**, not `/api/v1/...`.
2. Unset `HOT_DATABASE_URL` temporarily on a staging Space: public UI still loads from R2.
3. Supabase dashboard egress stays flat while browsing.
