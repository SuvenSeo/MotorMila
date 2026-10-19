# Overhaul: data-legal (branch `overhaul/data-legal`)

Goal: make scraping legally defensible (no block evasion, robots-compliant, no
seller personal data, no photo re-serving) and make the catalogue data clean.
Policy for the public: `docs/legal/data-sourcing.md`.

## What changed and why

### 1. Honest crawling
- **New `backend/app/scrapers/polite.py`**, used by every source fetcher:
  - One UA: `MotorMilaBot/1.0 (+https://motormila.vercel.app/bot; $BOT_CONTACT)`.
  - `RobotsCache`: robots.txt per origin, cached 6 h (`SCRAPE_ROBOTS_TTL_SECONDS`),
    built on `urllib.robotparser` (Crawl-delay) plus an RFC 9309 wildcard matcher,
    because `robotparser` ignores `*`/`$` (ikman's `Disallow: /*?*sort=*`).
    401/403/429/5xx/network error/challenge page = disallow all.
  - `HostThrottle`: concurrency 1 per host, jittered delay
    `SCRAPE_HOST_DELAY_MIN`/`MAX` (default 2-5 s), max'ed with Crawl-delay.
  - `PoliteAsyncTransport` / `PoliteTransport` (httpx) and `polite_goto`
    (Playwright) apply robots + throttle + UA to every request, redirects included.
    Disallowed URL -> `RobotsDisallowedError` -> the scraper skips that page/category.
- `net.py`: proxies, UA/viewport rotation and stealth script removed. Legacy env vars
  (`SCRAPE_PROXY_URL`, `SCRAPE_PROXIES`, `SCRAPE_ROTATE_UA`, `SCRAPE_STEALTH`) are ignored.
  `httpx_client_kwargs()` now returns the polite transport, so hitad/patpat/
  generic_detail/autolanka/auto_lanka_site/autodirect/autostream/cartivate/permitsale
  all go through it. Hard-coded Chrome UA strings replaced.
- `riyasewana.py`: `curl_cffi` Chrome TLS impersonation removed (dependency dropped
  from requirements), no challenge retries/waits, no human-like scrolling, no
  HTTP->Playwright fallback on a block. Block/challenge/429 -> `source_blocked_backoff`
  log + `RiyasewanaBlockedError` (run marked FAILED). Default mode `http`
  (`auto` = `http`). Wayback archive fallback now **off by default**
  (`RIYASEWANA_ARCHIVE_FALLBACK=1` to opt in - not recommended).
- Workflows: deleted `residential-cf-sources.yml`; `manus-scrape-every-2h.yml`
  riyasewana job is a single attempt (no 3-leg runner-IP matrix, no proxy);
  `riyasewana-bulk-backfill.yml` proxy removed; scrape workflows pass
  `SOURCES_ENABLED` and `BOT_CONTACT` repo **variables**.
- Deleted `scripts/ops/probe_impersonation.py`.

### 2. ikman
- `api.ikman.lk` is no longer called (API fetch/scrape methods deleted).
- ikman is **disabled by default** (`DEFAULT_DISABLED_SOURCES`); when opted in with
  `SOURCES_ENABLED=ikman` only robots-permitted public HTML search pages are read
  (`?page=` only, no `?sort=`), via `polite_goto`; no per-listing detail fetches.
- Generic flags: `SOURCES_ENABLED` (allow-list, `all` = everything incl. ikman) and
  `SOURCES_DISABLED` (always wins). Applied in `run_sync.main()` and in ikman's `scrape()`.

### 3. Personal data and photos
- `GET /listings/{id}/seller-profile` -> **410** `{"detail": "Contact the seller on {Source}", "source", "source_url"}`.
  All seller scraping helpers (name/phone/WhatsApp extraction, cache) deleted.
- `GET /listings/{id}/thumbnail-proxy` -> **410**; image download helpers deleted.
- `app/utils/pii.py`: strips SL phones (07X…, 0XX…, +94/94/0094, spaced/dashed/parens,
  with "Tel:/Call/WhatsApp" labels) and emails; titles capped at 200 chars.
  Applied in `CarCleaner.normalize_listing_payload` for every scraped source
  (not `motormila_user`); contact fields dropped from scraped payloads.
- `scripts/ops/scrub_listing_pii.py`: one-off back-fill, dry-run by default, refuses
  non-SQLite URLs without `--allow-remote`. **Not run against anything.**
- `image_phash.compute_phash` now uses the polite transport (bytes hashed in memory only).

### 4. Data quality
- Lifecycle (`listing_lifecycle.py`): default stale window **30 days**
  (`LISTING_STALE_DAYS`). The 30% fraction cap is gone. New guard: if a source's
  latest `scrape_runs` row is FAILED, only rows older than the hard ceiling
  (`LISTING_HARD_MAX_DAYS`, default 2x = 60 d) are expired. `motormila_user` rows are
  never swept (B-3). Expect a one-time drop of ~258k ghost "live" listings on the
  first pass.
- Dedup (`deduplication.mark_duplicates_batch`): strict matcher - same image pHash,
  or same district + mileage within 2% (both present) + price within 2%; active rows
  only; each canonical row pairs once. `manus-to-live.yml` now resets old loose
  flags first, then runs `RUN_DEDUP=true`, `DEDUP_FULL_PASS=true` on the local SQLite.
- Prices (`CarCleaner.clean_price`): lakh grouping `12,50,000`, `1,25,00,000`,
  `Rs. 85,00,000/=`; `45L`, `Rs 45 L`, `laks`; `1.5L`/`2.5L` (engine) rejected.
- Models (`CarCleaner.clean_title`): alias windows keep `X-Trail`, `CR-V`, `C-HR`,
  `CX-5`, `A-Star`, `Land Cruiser Prado`, `Wagon R`, `Corolla Axio`; short models
  like `X5` no longer dropped. New aliases in `make_canonical.MODEL_ALIASES`.
- Upsert (`listing_upsert.upsert_listing`): never overwrites a known value with
  NULL/""/placeholder (`model="Other"`, `district="Sri Lanka"`, `data:` thumbnails) (B-4);
  dump merges (`preserve_lifecycle=True`) skip rows older than the stored `scraped_at` (B-5).
  Note: a re-scrape that shows "Negotiable" keeps the last known price.

### 5. Attribution / freshness
- `source` and `url` are always kept (url back-filled from an http `source_id`;
  upsert never blanks it). `last_seen_at` already exists per listing.
- `GET /listings/sources` now also returns `last_checked_at` per source
  (latest SUCCESS scrape run) for the frontend's source credit.

### 6. Docs
- `docs/legal/data-sourcing.md` (collected / not collected, robots, 72 h takedown, contact).

## Files
New: `backend/app/scrapers/polite.py`, `backend/app/utils/pii.py`,
`backend/scripts/ops/scrub_listing_pii.py`, `docs/legal/data-sourcing.md`, this file,
tests `test_retired_personal_data_endpoints.py`, `test_ingest_parsers_and_pii.py`,
`test_upsert_merge_and_attribution.py`.
Changed: all `backend/app/scrapers/*.py` fetchers, `cleaner.py`, `net.py`,
`app/utils/{listing_lifecycle,listing_upsert,deduplication,make_canonical,image_phash}.py`,
`run_sync.py`, `requirements.txt` (-curl_cffi), `app/api/v1/endpoints/listings.py`
(seller-profile, thumbnail-proxy, /sources only), workflows `manus-scrape-every-2h`,
`manus-to-live`, `daily-scrape`, `midday-top-sources-scrape`, `scrape-export-redeploy`,
`scrape-ikman-once`, `ikman-bulk-backfill`, `riyasewana-bulk-backfill`,
`scripts/ops/manus_scrape_dump.sh`, tests (conftest autouse: robots off, 0 delay,
`SOURCES_ENABLED=all`).
Deleted: `.github/workflows/residential-cf-sources.yml`,
`backend/scripts/ops/probe_impersonation.py`, `tests/test_seller_profile_extraction.py`.

## How to test
```
cd backend
ALLOW_SQLITE_FALLBACK=true APP_ACCESS_ENFORCED=false PRO_ACCESS_ENFORCED=false python -m pytest tests/
```
Result on this branch: 1171 passed, 2 failed - both pre-existing and outside this
area: `test_public_browse_paths::test_gated_product_paths_stay_private` (S-6,
backend-sec) and `test_sse_limits::test_first_yielded_chunk_contains_snapshot_event`
(times out under xdist; also failed on main).
Key suites: `test_scraper_net.py` (UA, robots wildcards, throttle, flags),
`test_ingest_parsers_and_pii.py`, `test_listing_lifecycle.py`, `test_deduplication.py`,
`test_upsert_merge_and_attribution.py`, `test_retired_personal_data_endpoints.py`.

## OPS STEPS FOR SUVEN
1. GitHub repo **Variables** (Settings -> Secrets and variables -> Actions -> Variables):
   - `BOT_CONTACT` = a role email you read (e.g. `data@<your domain>`; avoid the personal Gmail/phone).
   - `SOURCES_ENABLED` = leave **unset** (ikman stays off). Set to e.g. `all` only after a partnership.
   Same two env vars on the HF Space if scrapers ever run there.
2. Delete the `SCRAPE_PROXY_URL` repo secret (nothing reads it any more).
3. Publish a page at `https://motormila.vercel.app/bot` (frontend) describing the bot
   and linking `docs/legal/data-sourcing.md` content + the takedown contact.
4. Before the first lifecycle pass after deploy, expect public counts to drop sharply
   (ghost listings expire). Optionally announce "now showing only listings seen in the last 30 days".
5. Back up the merged SQLite, then run the PII back-fill on it:
   `python scripts/ops/scrub_listing_pii.py --database-url sqlite:///motormila.db` (dry run)
   then add `--apply`. For Neon: take a branch/backup first, then `--allow-remote --apply`.
6. Email ikman (Saltside) and Riyasewana asking for a feed/partnership (legal.md §6 item 14).
7. If riyasewana keeps blocking MotorMilaBot, accept it: its rows will expire after
   60 days. Do not re-add proxies.

## Not done / notes for the integrator
- Frontend still calls `/seller-profile` and `/thumbnail-proxy` (`src/services/api.ts`
  L1634, L2162): it must handle 410 and show "Contact the seller on {source}" / use
  the source image URL with credit. Frontend contract test lists both paths (kept).
- Frontend should display `source`, `url`, `last_seen_at` and `/listings/sources`
  `last_checked_at`.
- Full ikman gallery hotlinking (`images` column, 1080x810) is still stored for old
  rows; limiting display to one credited thumbnail is a frontend/snapshot-export
  decision (not owned here).
- Takedown form/endpoint and suppression list are not built here (doc describes the
  email process); another branch appears to be adding a legal-requests router.
- Historical archive (Wayback/Common Crawl) price-history importers untouched; they
  read archive.org/Common Crawl, not the sources directly.
- `find_duplicate_candidates` (unused helper) keeps the looser rules.
