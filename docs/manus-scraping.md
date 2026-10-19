# Manus Cloud Computer scraping (outage boost)

Manus's Cloud Computer keeps a Linux VM alive for days, runs while the laptop
is closed, and can run tasks on a schedule. While it's available, use it as a
**second scraping farm** for the sources that don't Cloudflare-wall datacenter
IPs, and deliver results to GitHub so the laptop pipeline can merge them.

## Why not every source

Manus VMs run on datacenter IPs. riyasewana and patpat block datacenter IPs
(the reason the laptop runners exist). **Use Manus for:** `ikman`
(API-based — proven to work from hosted runners), `autolanka`, `hitad`,
`autostream`, `saleme`, `riyahub`, `carshop`, `dimo`, `autodirect`,
`cartivate`. **Keep on the laptop:** `riyasewana`, `patpat`.

## One-time setup (you do this once)

1. Create a fine-scoped GitHub token for the Manus session:
   - GitHub → Settings → Developer settings → Personal access tokens →
     Fine-grained → New token
   - Repo access: `SuvenSeo/Vehicle-Platform` only
   - Permissions: **Contents: read**, **Releases: write**
2. Keep that token handy — you'll paste it into the Manus task below
   (or set it as `GH_TOKEN` in the Manus session when asked).

## The task to paste into Manus

> You have a Linux cloud computer. Clone
> `https://github.com/SuvenSeo/Vehicle-Platform` and run:
>
> ```
> GH_TOKEN=<the fine-grained token> bash backend/scripts/ops/manus_scrape_dump.sh ikman autolanka hitad autostream saleme riyahub carshop dimo autodirect cartivate
> ```
>
> This installs dependencies (may take a few minutes), scrapes each listed
> source into a local SQLite database, compresses it, and uploads it as a
> GitHub Release asset tagged `manus-scrape-*`. Do not modify any repo code.
> When it finishes, report the printed "scraped N listings" number and the
> release tag. If a source errors, let the script continue with the others and
> still report what succeeded.

You can run several Manus tasks in parallel for different subsets, and repeat
the task daily — each run creates a fresh **GitHub Release** tagged
`manus-scrape-*` with asset `motormila.db.gz` (+ legacy `autolens.db.gz` copy). Do **not** commit dumps onto
`main`; `manus-to-live.yml` only reads Release assets. Old dumps are kept so
unmerged hours are not deleted.

## Cadence

- **GitHub Actions** `.github/workflows/manus-scrape-every-2h.yml` — cron
  `30 */2 * * *` (every two hours). This is the durable scrape. Hourly would
  roughly double Actions minutes for mostly-overlapping pages.
- **Manus cloud computer** can run the same dump script on its own schedule
  (often ~hourly). Those extra dumps are useful as long as they upload as
  Releases. If `gh` / `GH_TOKEN` is missing, the script now **fails** instead
  of `git push`ing binaries onto `main` (that path never updated the live
  site).

## Merging into the laptop pipeline

On the laptop, download the newest `manus-scrape-*` release asset
(`motormila.db.gz`) and merge it into the local outage DB:

```
cd backend
python scripts/ops/merge_sqlite_dump.py path/to/motormila.db.gz --dry-run   # preview first
python scripts/ops/merge_sqlite_dump.py path/to/motormila.db.gz             # merge
```

Rows are upserted by `(source, source_id)` — existing cars get refreshed with
the Manus-scraped data, genuinely new cars are inserted, price history is
recorded. Nothing is duplicated. After merging, run the outage pipeline's
analysis + export (`gh workflow run outage-local-pipeline.yml` and wait, or
run `python run_sync.py` + `python export_public_snapshots.py` locally) so the
site picks up the merged data.

## Hosted merge → live site (no laptop needed)

`.github/workflows/manus-to-live.yml` runs entirely on GitHub-hosted runners
and keeps the live site updated **~whenever a dump is published** — no laptop
or Manus session required. It triggers:

- right after `manus-scrape-every-2h.yml` completes,
- right after `neon-export.yml` completes,
- every 30 minutes on a schedule (catches laptop-made dumps + retries),
- manually, with an optional `release-tag` input to force-merge a specific dump.

Each run:

1. restores a **durable merged SQLite DB** published as the `merged-db`
   release (`merged-motormila.db.gz` + `last-merged.txt` marker),
2. merges every dump newer than the marker — it **paginates** GitHub
   Releases (a single `per_page=100` page is not enough) and compares the
   `YYYYMMDDTHHMMZ` timestamp inside the tag **and** inside
   `last-merged.txt` (so a marker that stored a full tag name still works).
   Dump prefixes: `manus-scrape-*`, `manus-scrape-dedicated-*` (laptop
   riyasewana runs), `laptop-db-*` (full laptop DB, below), and
   `neon-export-*`. Discovery lives in
   `backend/scripts/ops/discover_dump_releases.py`.
3. runs market analysis + dedup (`run_sync.py`),
4. exports full public snapshots and deploys them to Vercel via
   `scripts/deploy-snapshots-to-prod.sh`,
5. re-publishes the merged DB + marker **only after a successful deploy**,
   so a failed run is retried from the same point.

Requires the repo secrets `VERCEL_TOKEN` / `VERCEL_ORG_ID` /
`VERCEL_PROJECT_ID` (already used by the other workflows). Optional:
`SLACK_WEBHOOK_URL` for failure alerts.

The first run merges all existing `manus-scrape-*` dumps at once. Subsequent
runs only merge what's new. Because `last-merged.txt` lives on the release,
the merged DB is durable across runner restarts and GitHub-hosted runners are
fully interchangeable.

### Verified data inventory (2026-08-14, 33 releases)

A local replay of the first-run merge over all released dumps produced:

| Metric | Count |
|---|---:|
| Dump releases merged | 32 (`manus-scrape-*` + 1 `manus-scrape-dedicated-*`) |
| Raw scraped rows across all dumps | 218,682 |
| **Unique listings after (source, source_id) merge** | **16,485** |
| Re-scrape rows that were duplicates/updates | 202,197 (92.5%) |
| Cross-source duplicates flagged by dedup | 3,084 (same car on 2+ sites) |
| Outliers flagged | 518 |
| Listings exported to the live catalog | 15,967 (unique − outliers) |
| Price-history points recorded | 15,995 |

Per-source unique listings: ikman 7,917 · riyasewana 5,370 (laptop dedicated
dump) · autostream 1,420 · riyahub 1,113 · hitad 439 · saleme 81 ·
cartivate 51 · dimo 29 · autolanka 26 · autodirect 24 · carshop 15.

The `manus-scrape-parallel-*` experimental release (asset
`autolens-recovered.db.gz`) is intentionally skipped — the merge only looks
for assets named `motormila.db.gz` (legacy `autolens.db.gz` still accepted). riyasewana/patpat/auto-lanka bulk coverage
comes from `laptop-db-*` releases and the post-reset Neon export.

### Laptop full-DB upload

`outage-local-pipeline.yml` now also uploads the laptop's complete DB
(all 12 sources, incl. `patpat`/`auto-lanka`, which Manus dumps don't cover)
as a `laptop-db-*` release. The hosted workflow merges it too, so the live
catalog stays complete even when the laptop is off. The laptop pipeline still
scrapes + deploys directly when it runs; the hosted workflow is the safety
net that keeps the site fresh the rest of the time.

## Post-reset Neon export (180k+ listings)

Hitting Neon's free **5 GB/mo transfer** quota **does not delete rows**. It
blocks every connection until the quota resets on the **1st of the next
month**. The 180k+ listings stay in Neon the whole time. "Getting them back"
on the live site means: **read Neon once**, publish a `neon-export-*`
release, let `manus-to-live.yml` merge it into the snapshot catalog.

The live site during the outage is the **Manus-merged SQLite catalog**
(~16k unique listings as of 2026-08-14), not the 180k Neon table.

### Automatic path (preferred)

`.github/workflows/neon-export.yml` runs **daily at 03:20 UTC**:

1. If a `neon-export-YYYYMM*` release already exists this calendar month,
   skip (do not burn the new quota with a second full-table read). Override
   with `force=true`.
2. Probe Neon (`SELECT 1`). If it is still blocked, **skip** (green), do
   not fail Slack.
3. Stream `car_listings` + `vehicle_price_history` into `motormila.db.gz`.
4. Publish `neon-export-YYYYMMDDTHHMMZ`.
5. `manus-to-live.yml` merges it (workflow_run + 30 min schedule).

Use `limit: 5000` once as a connectivity test **after** the probe is green,
then run a full export (`limit: 0`). One full export is a large egress
event — keep `VITE_SNAPSHOT_ONLY=true` so public browsing does not hit
Neon afterwards.

### Manual / local

1. Repo secret `HOT_DATABASE_URL` must be set.
2. Actions → **Neon Export** → Run workflow (`limit: 5000` first, then `0`).
3. Or locally:

```
cd backend
export DATABASE_URL=postgresql://...
python scripts/ops/export_neon_to_sqlite.py --output motormila.db.gz
```

### Push Manus-only rows back into Neon (optional)

The site does **not** need this to show the 180k catalog (that data is
already in Neon). Use it only so the canonical DB also contains unique
listings scraped during the outage that Neon never saw:

```
cd backend
export HOT_DATABASE_URL=postgresql://...
python scripts/ops/import_sqlite_to_neon.py merged-motormila.db.gz --dry-run
python scripts/ops/import_sqlite_to_neon.py merged-motormila.db.gz
```

Download `merged-motormila.db.gz` from the `merged-db` release first. Rows
upsert on `(source, source_id)`.
