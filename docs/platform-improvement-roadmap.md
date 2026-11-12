# Motormila Platform Improvement Roadmap

Last updated: 2026-07-28. Live inventory across **13 sources**.

## Wave 0–2 — Platform hardening (branch `cursor/platform-hardening-phases-0a52`)

### Wave 0 — Survival / hardening
- Daily DB backup GHA (`.github/workflows/daily-db-backup.yml`) + `docs/disaster-recovery-plan.md`
- CSP, Permissions-Policy, body 1MB limit, GZip, X-Request-ID, `/.well-known/security.txt`
- Pipeline GET routes require admin key or session when `APP_ACCESS_ENFORCED=true`
- RateLimit-* + Retry-After headers on limiter responses
- `POST /api/v1/events` analytics + `src/lib/analytics.ts` (listing_viewed, alert_created, search_submit, dealer_claim_success)
- Scrape checkpoint + circuit breaker (skip mass-deactivate on MASS_DEACTIVATION / PRICE_ANOMALY)
- Supabase egress cuts: slower polls, Cache-Control on stats, `docs/supabase-egress-mitigation.md`

### Wave 1 — Monetization / legal scaffold
- `/privacy` + `/terms` pages + footer Legal column
- `POST /api/v1/billing/checkout-intent` (env checkout URL → redirect; else contact sales)
- Pricing Pro/Dealer CTAs call checkout-intent

### Wave 2 — Trust / DX
- FMV explainability: sample_size, confidence, comps_median_lkr, updated_at + ListingDetail line
- Light Alembic scaffold (`docs/alembic-notes.md`) — schema_patches still owns additive DDL

## Shipped on `main` (Jul 19–21)

### Hardening & P1
- Security headers, CORS guard, pro `subscription_status`, B2B timing-safe keys
- Stats cache (summary/trends/insights/price-index), composite + `pg_trgm` indexes
- Slack scrape-failure hooks, optional scraper proxy/UA/stealth
- Granular React Query staleTime, CID surcharge notify, sitemap `content_updated_at`
- SEO hubs `/cars/:make` + `/locations/:district`, HF keep-alive cron

### P2 (shipped)
- HttpOnly `mm_session` cookie auth (+ Bearer fallback / logout clear)
- `/auth/me` session bootstrap + `credentials: include` on API client
- Twilio WhatsApp notify on alert match deltas (`notify_phone`, row badge + validation)
- Fair Market Value badges on cards + listing detail + `GET /listings/{id}/fmv`
- Dealer claim-profile (`/dealer/claim`, `/dealer/me`) with seller pattern + URL
- SI/TA i18n for hero, alerts, calculator, make hub
- Ops activation docs in `.env.example` / `backend/.env.example`

### Optional-later (this wave)
- Multi-feature OLS FMV (`method: ols_comps|adjusted_median|cohort_median`)
- pHash background job queue (`image_phash_jobs` + threaded drain)
- Dealer verified badge + billing fields + `POST /dealer/verify`
- Pro write CSRF: Bearer required + trusted Origin/Referer
- Expanded SI/TA coverage: nav, sign-in, Pro gate, dealer, listing, pricing, home pulse
- Historical asking-price backfill (Wayback/CC → `historical_price_observations`) — see `docs/historical-price-data-sources.md`

### Hotfixes
- `require_pro_access(request: Request)` — Optional[Request] broke FastAPI startup / B2B CI

## Phase 7 backlog (Ardeno deferred epics) — shipped 2026-07-23

| Epic | Delivered |
|------|-----------|
| B1 Scraper field enrichment | Cleaner canonicalize + Auto/hatch/PHEV/CVT/`brand_new` aliases; junk structured reset; riyasewana richer blobs |
| B2 Scraper guard fixtures | `tests/fixtures/scraper_payloads/*` + `test_scraper_payload_guards.py` |
| B3 Frontend test warnings | `TestRouter` future flags; async flush for Alerts / MobileFilterSheet act noise |
| B4 Bundle / code-splitting | Dashboard sub-lazies; pdf/report/form `manualChunks`; leaflet CSS deferred; FeedbackWidget lazy |
| B5 Repo hygiene | browserslist/`caniuse-lite` bump; `.gitignore` py/tooling cache coverage |

## Remaining ops activation (secrets — not code)

| Item | Where |
|------|-------|
| `PRO_ACCESS_ENFORCED` / `VITE_PRO_ACCESS_ENFORCED` | HF + Cloudflare Pages |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | HF + Cloudflare Pages |
| `SLACK_WEBHOOK_URL` | GitHub Actions secret |
| `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` / `WHATSAPP_FROM` | HF (WhatsApp alerts) |
| `DEALER_ADMIN_TOKEN` | HF (verify yards) |
| `SCRAPE_PROXY_*` / `SCRAPE_STEALTH` | HF / GHA when banned |
| `SENDGRID_API_KEY` + `DIGEST_RECIPIENTS` | Weekly Pro digest |

## Verification

1. `npm run typecheck && npm run lint && npm run test`
2. `npm run build`
3. `cd backend && ALLOW_SQLITE_FALLBACK=true pytest tests/ -q`
4. Spot-check `/health`, `/cars/toyota`, `/dealer`, `/alerts`, Calculator notify, language switch SI/TA
