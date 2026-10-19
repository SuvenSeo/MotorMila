# SEO Rescue Runbook (TRACK B2-C)

Owner: B2-C builder. Scope: route manifest, RouteMeta hubs, compare-slug
canonicalization, hub sitemaps, compare OG card. Out of scope: App.tsx
routing logic (snippet below for the router owner), auth, billing,
`market_stats_cache`.

## What shipped

| File | Change |
|---|---|
| `scripts/generate-routes.ts` | NEW — pulls `GET /api/v1/seo/route-manifest`, emits `public/seo/routes.json` (cap 500) + `public/seo/sample-toyota-aqua.html`; `--check` link-checks sample links ⊆ manifest; seed fallback when backend unreachable |
| `src/lib/compareSlug.ts` | NEW — `toCompareSlug` / `fromCompareSlug` / `canonicalComparePath`; grammar `^\d+(-vs-\d+){0,3}$`, max 4 ids, numeric-ascending |
| `src/components/RouteMeta.tsx` | EXTENDED — hub titles (`{Vehicle} Price Sri Lanka … | Motormila`), canonical (compare `?ids=` → slug path), per-route `og:image`, JSON-LD graph Car + AggregateOffer(LKR) + BreadcrumbList, Dataset stub on `/price-index` |
| `api/compare-og.js` | NEW — crawler HTML + `?format=image` SVG dark-terminal card (1200×630, `#09090b`, mono, blue accent), zero new deps |
| `backend/app/api/v1/endpoints/seo.py` | NEW — `/seo/sitemap-index.xml` → cars/districts/compare + `/api/sitemap-listings`; child sitemaps; `/seo/route-manifest` JSON; hourly lastmod; reads aggregates/distincts only |
| `backend/app/api/v1/api.py` | +2 lines — `seo` import + public (ungated) `include_router` |

## Regenerate manifest

```bash
node scripts/generate-routes.ts            # fetch backend, fallback to seed
SEO_API_BASE=http://127.0.0.1:8000/api/v1 node scripts/generate-routes.ts
node scripts/generate-routes.ts --check    # link check (CI)
```

## Snippet 1 — App.tsx (router owner to apply, NOT applied by B2-C)

```tsx
// Canonical compare-slug route + legacy ?ids= redirect. Place BEFORE
// <Route path="/compare" element={<Compare />} />.
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { canonicalComparePath, fromCompareSlug } from "@/lib/compareSlug";

function CompareSlugRoute() {
  const { slug = "" } = useParams();
  const ids = fromCompareSlug(slug);
  // Invalid slug -> fall back to the picker instead of 404.
  if (ids.length < 2) return <Navigate to="/compare" replace />;
  return <Compare initialIds={ids} canonicalPath={canonicalComparePath(ids)} />;
}

function CompareLegacyRedirect() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter(Boolean);
  return <Navigate to={canonicalComparePath(ids)} replace />;
}

<Route path="/compare/:slug" element={<CompareSlugRoute />} />
<Route path="/compare-legacy" element={<CompareLegacyRedirect />} />
// + inside Compare page: if location.search has ids, <Navigate> to slug.
// NOTE: Compare/CompareTray currently disagree on max ids (4 vs 3) —
// canonical grammar allows 4; align on one before enabling the redirect.
// NOTE: bare /{model}/{year} intentionally NOT routed (collides with the
// SPA catch-all + duplicate-content risk); canonical year form is
// /cars/:make/:model/:year (RouteMeta + sitemap already emit it).
```

`Compare` needs optional `initialIds`/`canonicalPath` props — page owner call.

## Snippet 2 — vercel.json (NOT applied; read file first, minimal diff)

Insert BEFORE the SPA catch-all rewrite; keeps existing `/listing/:id`
crawler rule untouched. Query→slug needs a `redirect` (rewrite cannot
match query strings — hence the in-app `CompareLegacyRedirect` above as
the real `?ids=` handler; the redirect below covers the extensionless
crawler case only if ever linked).

```json
{
  "source": "/compare/:slug(\\d+(-vs-\\d+)*)",
  "has": [{ "type": "header", "key": "user-agent",
    "value": ".*(facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|Viber|Pinterest|vkShare).*" }],
  "destination": "/api/compare-og?slug=:slug"
}
```

No SPA rewrite change. No `cleanUrls`/`trailingSlash` change.

## Crawler flow

- `/cars/*`, `/locations/*`, `/compare/*` → SPA for humans; sitemap +
  canonical + RouteMeta JSON-LD for crawlers (no prerender yet — full SSG
  is the follow-up).
- `/listing/:id` → existing `api/listing-og.js` (unchanged).
- `/compare/:slug` → new `api/compare-og.js` (snippet 2).

## Verify

```bash
npm run typecheck            # must pass
npx eslint src/lib/compareSlug.ts src/components/RouteMeta.tsx scripts/generate-routes.ts
node scripts/generate-routes.ts --check
cd backend && ALLOW_SQLITE_FALLBACK=true .venv/bin/python -m pytest tests -q
curl -s localhost:8000/api/v1/seo/sitemap-index.xml | head -12
```

## Follow-ups (not B2-C)

1. Router owner: apply snippet 1; align Compare max-ids (4 vs 3).
2. Vercel owner: apply snippet 2 after reading `vercel.json`.
3. Full SSG/prerender of top-500 manifest entries (manifest + sample only for now).
4. Remove page-level `setCanonical`/`setJsonLd` in `MakeModelHub.tsx` (id
   `motormila-jsonld` collides with RouteMeta graph — last-write wins today).
5. Point `public/robots.txt` + `public/sitemap.xml` at `/api/v1/seo/sitemap-index.xml`.
6. `stats_cache` TTL still 1h — hub numbers can lag fresh listings by 1h.
