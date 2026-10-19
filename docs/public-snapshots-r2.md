# Motormila public snapshots

The production site can read public JSON snapshots from Cloudflare R2 before it
falls back to the API. This keeps normal visitors away from Postgres for the
high-volume read paths and protects the free database quota.

## What this solves

- The scraper still writes to the configured Postgres database.
- After scraping, GitHub Actions exports read-only JSON snapshots.
- The frontend reads `VITE_SNAPSHOT_BASE_URL` first for dashboard, live stats,
  listings, sources, makes, models, pipeline status, and district summaries.
- If snapshots are missing, the existing backend API is still used.

## Required GitHub secrets

The scraper/export workflows need:

- `COLD_DATABASE_URL`: Neon/Postgres connection string.
- `R2_ACCOUNT_ID`: Cloudflare account id.
- `R2_ACCESS_KEY_ID`: R2 token access key.
- `R2_SECRET_ACCESS_KEY`: R2 token secret key.
- `R2_BUCKET`: R2 bucket name.
- `R2_PREFIX`: optional, defaults to `latest`.

The R2 token only needs object read/write access for the snapshot bucket.

## Required Vercel env

Set this on the frontend project:

```text
VITE_SNAPSHOT_BASE_URL=https://<public-r2-domain>/latest
VITE_SNAPSHOT_ONLY=true
```

Use the public R2/custom domain, not the S3 API endpoint. Redeploy the frontend
after changing it. With `VITE_SNAPSHOT_ONLY=true`, missing snapshots return
empty/error instead of falling back to the Postgres-backed API.

Large catalogs may ship as a `listing-catalog.json` manifest with `parts`
(`listing-catalog-part-*.json`) when hosting on Vercel’s 100 MB static-file
limit; the frontend concatenates parts automatically.

## Recovering the 80k+ listings

The old 80k+ rows are expected to still be in Neon. They cannot be exported
while Neon is rejecting queries for data transfer quota. Once Neon resets or is
temporarily upgraded/unblocked:

1. Run GitHub Actions -> `Export Public Snapshots`.
2. Open the uploaded `public-snapshot-manifest-*` artifact.
3. Confirm `listing_count` is above `80000`.
4. Confirm the R2 bucket has the `latest/*.json` files.
5. Redeploy Vercel with `VITE_SNAPSHOT_BASE_URL` set.

After that, normal public browsing should use R2 snapshots and no longer burn
database transfer for every visitor.

## Daily operation

`Unified Vehicle Scraper` runs twice daily at 07:30 and 18:10 Sri Lanka time
(02:00 and 12:40 UTC). `Midday Top Sources Scraper` refreshes ikman and
riyasewana at 12:00 Sri Lanka time (06:30 UTC). After each scrape and market
analysis job, workflows export and upload **stats-only** snapshots
(`export_public_snapshots.py --skip-catalog`) so dashboards stay fresh without
a full-table read. The **full catalog** refresh runs weekly or manually via
**Ikman Deep Backfill** / **Scrape → Export → Redeploy** — this keeps Neon
egress well inside the free allowance (see `docs/neon-egress-budget.md`).
If R2 secrets are not set yet, upload is skipped without failing the exporter
script locally; in GitHub, the export step still fails clearly if the database
itself is unavailable.
