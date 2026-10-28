# Overhaul: web-perf (branch `overhaul/web-perf`)

Base: `main @ 97ffbee`. Scope: data loading, bundle/critical path, SEO, snapshot export, tests.

## Results (before → after)

Measured with `node scripts/measure-bundle.mjs <dist>` on a local `vite build` (critical path = everything `dist/index.html` references: entry, modulepreloads, CSS, preloaded images and fonts).

| Metric | Before | After |
|---|---|---|
| Critical path, brotli | **831 KB** | **352 KB** (−58%) |
| Critical path, gzip | 976 KB | 418 KB |
| Critical path, raw | 3.05 MB | 1.49 MB |
| Files on first load | 13 | 10 |
| `pdf-vendor` + `chart-vendor` modulepreloaded on every page | yes (318 KB br) | no |
| Render-blocking third-party font CSS | 2 (Google + Fontshare, 9 families) | 0 (non-blocking, 3 families) |
| Font preloads (Azonix, Nofex DEMO) | 2 | 0 |
| Logo preload | 134 KB PNG | 4 KB WebP |
| Home hero image | 630 KB | 158 KB (WebP, 1920 px) |
| CSS "self-heal" script re-downloading stylesheets | yes | removed |
| Listing detail data | whole catalogue: 18 files, ~38 MB br / ~378 MB raw | manifest (0.2 KB) + one id shard (~50 KB gz) + model index for "similar" (~25–40 KB gz) |
| Make/model hub, trends, district hub, EV hub | whole catalogue | one index file each (25–45 KB gz) |
| Backend down: wait per public call | up to 3 × 60 s + backoff | first call fails (≤10 s, usually ~3 s on a 500), then 0 ms for 3 min (sessionStorage) |
| Frontend tests | 465 pass / 30 fail (495) | **537 pass / 0 fail** (97 files) |
| `tsc` / `eslint` | 0 errors / 39 warnings | 0 errors / 39 warnings |

Index sizes above are from a 17.5k-listing sample; with the full catalogue the model files are capped (600 newest rows + compact comps for every row), so they grow only by the comps (~40 bytes/listing).

## What changed

1. **Hover prefetch removed** (`src/components/ListingCard.tsx`): hovering a card warms only the route chunk, not `getListing()` (which pulled the full catalogue).
2. **Per-entity snapshot index** (`scripts/build-snapshot-indexes.mjs`, new). It reads `listing-catalog.json` (+ parts) and `live-market.json` and writes `snapshots/latest/idx/`:
   - `listings/<floor(id/250)>.json`: listings sharded by id prefix (full rows, nulls/duplicates stripped).
   - `models/<make>/<model>.json`: the 600 newest rows, plus compact comps `[id, price, year, km, district, condition, first_seen, fuel]` for **every** listing of that model (exact totals, medians, trends, offline FMV), plus min/avg/median/max.
   - `makes/<make>.json` and `districts/<district>.json`: newest rows, model list or top models, and price stats.
   - `latest.json`, `search.json` (suggestions), `ev.json`, `aggregates.json` (fuel mix, district velocity counts, sources, makes, hot deals, top models, good-deal count) and `routes.json` (SEO hubs).
   - Keys use the frontend's own canonicalizers, imported straight from `src/lib/makeNormalization.ts` and `src/data/districts.ts`. Node ≥22.18 strips the types natively; older Node falls back to esbuild, then to a naive canonicalizer.
   - It also writes ISO-8601 sitemaps into `public/`: `sitemap-index.xml`, `sitemap-hubs.xml` and `sitemap-listings-N.xml`.
   - It runs in three places: `npm run build` (Vercel builds already download the catalogue from R2), `backend/export_public_snapshots.py` after a full export, and `backend/upload_snapshots_r2.py` before upload when `idx/` is stale. R2 upload is now parallel (16 threads) because of the extra files.
3. **Frontend data layer** (`src/services/api.ts`):
   - All 17 `getSnapshotListingCatalog()` call sites now read the narrowest index: shard, model, make, district, latest or aggregates.
   - Once `idx/manifest.json` exists, the legacy loader always returns `null`, so no code path can download the catalogue.
   - Without `idx/`, the old catalogue path still works (backward compatible).
   - Inventory totals beyond a capped sample are estimated from the sample's match rate.
4. **Fail fast to snapshots** (`fetchJSON` circuit breaker):
   - Public GETs get a 10 s timeout and no retry on 5xx or timeout. Only a bare network error is retried once.
   - On failure, the next 3 minutes of public reads short-circuit straight to snapshots. This is stored in `sessionStorage` (`motormila.api_down_until`), so it survives reloads. Any success resets it.
   - Auth, alerts, pro, dealer, admin and account paths are never short-circuited.
   - Exports: `isLiveApiDegraded`, `markLiveApiDown`, `resetLiveApiHealth`.
5. **Code-splitting and assets**:
   - `vite.config.ts` adds a `core` chunk (vite preload-helper, commonjs helpers, clsx, tailwind-merge, cva). Before, rollup hoisted these into `pdf-vendor` and `chart-vendor`, which forced both onto every page.
   - Routes were already lazy.
   - `index.html`: removed the CSS reload script; fonts are now Inter + JetBrains Mono + Satoshi, non-blocking with `display=swap`; other FontStudio families load only when a saved choice needs them (FontStudio is dev-only); removed Azonix/Nofex preloads and the hard-coded canonical and `og:url`.
   - `src/main.tsx`: dropped unused `@fontsource` Geist and Fraunces imports.
   - `public/logo-mark*.webp` (256 px) is used by `BrandLogo`.
   - `assets/page_home_hero_coastal.webp` re-encoded.
6. **SEO**:
   - `scripts/prerender-seo.mjs` (new, runs after `vite build`) writes `dist/<route>.html` for every make, make/model (≥3 listings, cap 1500) and district hub, plus static pages. Each gets its own title, description, self canonical, OG/Twitter tags, robots and JSON-LD (`Vehicle` + `AggregateOffer` + `BreadcrumbList` for models; `CollectionPage` for makes and districts), plus a crawlable summary with internal links inside `#root`.
   - It also writes a noindex `dist/404.html`.
   - `vercel.json`:
     - `cleanUrls: true`, so the prerendered `.html` files serve at `/cars/toyota/aqua`.
     - The catch-all SPA rewrite is replaced by an explicit allowlist that mirrors `App.tsx`. Unknown paths now get a **real 404** (`404.html`).
     - `X-Robots-Tag: noindex` on utility routes.
     - `/listing/:id` for social **and search** bots goes to `api/listing-og.js`.
   - `api/listing-og.js` (rewritten) returns the real SPA shell with per-listing title, description, canonical, OG and `Vehicle`/`Offer`/`BreadcrumbList` JSON-LD. It reads the snapshot shard first (works with the DB down), then the API. There is no meta-refresh. Unknown ids get noindex.
   - `RouteMeta`:
     - noindex for auth, dashboard, admin and hero-lab, and for unknown routes (title "Page not found").
     - Titles added for `/sell`, `/mobile-app`, `/sign-up`, `/permits`, `/privacy`, `/terms`, `/profile`, `/hero-lab` and the admin page.
     - District names are title-cased in `getDistrictQuickInsight` (fixes "colombo").
     - Helpers live in `src/lib/routeIndexing.ts`.
   - `public/robots.txt` references `sitemap-index.xml` and drops the DB-backed `/api/v1/seo/sitemap-index.xml`.
   - `src/test/vercelRoutes.test.ts` fails if a new `<Route>` is not covered by the vercel allowlist or RouteMeta.
7. **Personal contact details removed**:
   - `src/lib/brand.ts` reads `VITE_CONTACT_EMAIL` (default `hello@ardenostudio.com`) and `VITE_CONTACT_PHONE` (default empty; `Pricing.tsx` hides the phone link when it is empty).
   - The `pricingContent.ts` FAQ uses `BRAND.contactEmail`.
   - `public/.well-known/security.txt` now points to GitHub private advisories. Set `SECURITY_CONTACT_EMAIL` at build time to prepend a role mailbox.
8. **Tests**:
   - `vitest.config.ts` sets `VITE_SNAPSHOT_BASE_URL=off` (new supported value) so live-API contract tests no longer read stray snapshots.
   - `setup.ts` clears `sessionStorage` (the breaker) between tests.
   - `api.test.ts` resets modules per test.
   - Snapshot-mode assertions were updated to allow the existing same-origin fallback.
   - The district-velocity retry test was rewritten to cover fail-fast.
   - Real bug fixed: the `ListingImageCarousel` empty-gallery fallback dropped `priority`, so the first card never loaded eagerly.
   - New tests: `snapshotIndex.test.ts` and `vercelRoutes.test.ts`.

## Files

- New: `scripts/build-snapshot-indexes.mjs`, `scripts/prerender-seo.mjs`, `scripts/measure-bundle.mjs`, `src/lib/routeIndexing.ts`, `src/test/snapshotIndex.test.ts`, `src/test/vercelRoutes.test.ts`, `public/logo-mark.webp`, `public/logo-mark-light.webp`, this doc.
- Changed: `src/services/api.ts`, `src/components/{ListingCard,ListingImageCarousel,BrandLogo,RouteMeta}.tsx`, `src/pages/Pricing.tsx` (phone link conditional), `src/lib/{brand,pricingContent}.ts`, `src/main.tsx`, `index.html`, `vite.config.ts`, `vercel.json`, `package.json` (build = sync → index → vite → prerender; adds `snapshots:index`), `.gitignore` (generated idx/ and sitemaps), `api/listing-og.js`, `public/robots.txt`, `public/.well-known/security.txt`, `assets/page_home_hero_coastal.webp`, `backend/export_public_snapshots.py`, `backend/upload_snapshots_r2.py`, `vitest.config.ts`, `src/test/{setup,api.test,snapshotOnlyMode.test,districtVelocityApi.test}.ts`.

## How to test

```bash
npm ci
npm test                      # 537 passing
npm run lint && npx tsc --noEmit -p tsconfig.app.json
npm run build                 # sync R2 -> build idx/ + sitemaps -> vite -> prerender
node scripts/measure-bundle.mjs dist
grep -o '<title>[^<]*' dist/cars/toyota/aqua.html
ls dist/snapshots/latest/idx  # manifest.json listings/ models/ makes/ districts/ ...
```

After deploy, check:

- `curl -sI https://motormila.vercel.app/this-does-not-exist` returns 404.
- `curl -s https://motormila.vercel.app/cars/toyota/aqua | grep canonical` shows a self canonical.
- `curl -s -A Googlebot https://motormila.vercel.app/listing/<id> | grep application/ld+json`.
- On `/cars/toyota/aqua`, DevTools shows no `listing-catalog*` requests.

## OPS STEPS FOR SUVEN

1. **Vercel env**: set `VITE_CONTACT_EMAIL` to a role inbox (for example `hello@<your domain>`). The default is `hello@ardenostudio.com` (Ardeno Studio's contact). motormila.lk is not owned — do not use it as a contact domain. Optionally set `VITE_CONTACT_PHONE` (a business number, not a personal one) and `SECURITY_CONTACT_EMAIL` (for example `security@<domain>`). Mirror these in Cloudflare Pages if you still use it.
2. **Vercel Node version**: use Node 22.x (≥22.18) so the index builder imports the TS canonicalizers natively. It falls back to esbuild if not.
3. **First deploy**: the Vercel build creates `idx/` from the R2 catalogue automatically. If `VITE_SNAPSHOT_BASE_URL` points at R2, the R2 copy of `idx/` appears after the next full export/upload; until then each idx file falls back to the same-origin copy.
4. **Search Console**: submit `https://motormila.vercel.app/sitemap-index.xml`.
5. **Deploy file count**: `idx/` adds about 3–7k small files per deploy (id shards plus one file per model). This is within Cloudflare Pages' 20k-file limit; check your Vercel plan if a deploy ever complains.
6. **Integrator**: any **new top-level route** must be added to the SPA allowlist in `vercel.json` (and to `src/lib/routeIndexing.ts`), or a hard load will 404. `vercelRoutes.test.ts` enforces this, and the UI branch adds routes (for example `/safe-transfer`). The money/legal branch also edits `src/lib/pricingContent.ts` (same FAQ line) and `Pricing.tsx`; take theirs for the FAQ line and keep the `BRAND.contactPhone ?` guard.

## Not done / follow-ups

- The Cloudflare Pages mirror (`public/_redirects`, `functions/api/listing-og.js`) still uses the catch-all SPA rule and the old OG function. Real 404s and listing SSR are Vercel-only for now.
- Individual listing pages are not statically prerendered (351k pages). They are rendered for bots by `api/listing-og.js`; the listing sitemap comes from the snapshot.
- `api/sitemap-listings.js` (DB-backed) is left in place but no longer referenced.
- Idle prefetch of 11 routes (old P6), Tremor removal (CSS 381 KB raw / 37 KB br) and the `assets1/` cleanup were not done.
- In snapshot mode, inventory pages beyond the capped sample (600 rows per model, 300 per make/district, 600 latest) come back empty, and the total shown is an estimate. Fully paginated search needs the live API or a server-side index.
- Snapshot-mode search suggestions are model-level ("Toyota Aqua 2024 · median price"), not individual listings.
- Correction to the audit: the "non-ISO timestamps" finding (B4–B15) comes from the audit sandbox's display layer rewriting ISO strings. The raw snapshot bytes are ISO-8601 (`2026-10-19T08:17:58+00:00`). The index builder normalizes any human-format timestamps anyway.
