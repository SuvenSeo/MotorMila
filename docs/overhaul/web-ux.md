# Overhaul: web-ux (branch `overhaul/web-ux`)

Base: `main` @ 97ffbee. Scope: UI/UX polish plus new buyer features. No changes to `src/services/api.ts`, `vite.config.ts`, `index.html`, `vercel.json`, the SEO head, or the legal/pricing/payment pages.

## What changed

### Part A: UI/UX fixes
| Issue | Fix | Files |
|---|---|---|
| The "Motormila is going mobile" floating card covered the filters and the listing-detail panels | Replaced it with a slim, dismissible bottom strip. It shows once per browser (marked seen as soon as it renders), and never appears on `/listing/*`, filtered search (`/?…`), tools or sign-in. | `components/MobileAppPromo.tsx` |
| Blank photo tiles (riyasewana 403, proxy 401) | `VehicleThumbnail` paints a branded placeholder (Ink + Motormila Blue, "Photos on {source}", no car clip-art per the brand bible) as the `<img>` background while the photo loads, then as the final image if every source fails. The fallback order is direct → proxy → placeholder. Fixed `width/height` and aspect boxes, so nothing shifts. | `components/VehicleThumbnail.tsx`, `ListingImageCarousel.tsx` |
| Snapshot timestamps like `"Mon 2026-10-19 1:48 PM (UTC+05:30)"` gave NaN in Safari/Firefox and were read in the wrong zone in Chrome. Days-on-market, "listed", freshness and "x ago" labels were broken or off by 5.5 h | New tolerant `parseFlexibleTime` that honours the offset, wired into freshness, card meta, relative time and listing detail | `lib/parseTime.ts`, `lib/dataFreshness.ts`, `lib/listing-card-meta.ts`, `lib/formatting.ts` |
| No source attribution | Cards say "Listed on ikman · Listed 12 days · checked 2h ago". The detail header says "Listed on {source} · last checked …". The "View on {source}" CTA now uses the brand spelling of the source name. | `lib/sourceAttribution.ts`, `ListingCard.tsx`, `ListingDetail.tsx` |
| Seller phone and WhatsApp numbers revealed on listing detail | Removed. A single "Contact seller on {source}" CTA opens the original ad (safe-URL checked, tracked as `contact_on_source_clicked`). | `pages/ListingDetail.tsx` |
| No signal when the backend is down | `SnapshotModeNotice`: one `/health` probe (4 s timeout) plus a manifest read per page load, shared by every notice. It shows "Showing saved market data from 3h ago (19 Oct, 1:48 pm SLT)…" only when the API is down or the build is snapshot-only. Shown on the home results and on listing detail. | `components/SnapshotModeNotice.tsx`, `Dashboard.tsx`, `ListingDetail.tsx` |
| Listing-detail race (slow response for the previous id overwrote the new one) | A cancel flag in the effect | `ListingDetail.tsx` |
| Fabricated empty-description copy ("Market intelligence indicates this vehicle is priced within range…") | Replaced with honest copy | `ListingDetail.tsx` |
| Developer-speak error ("market API returned an error") | Plain-language title, body and Retry | `Dashboard.tsx` (+ test copy) |
| Stray `<<<<<<< HEAD` in `index.css` made the CSS parser drop the marquee rule that followed it | Removed | `src/index.css` |
| Tremor `BadgeDelta` on every card (a Tremor dependency on the home path) | Replaced with a token-styled pill | `ListingCard.tsx` |
| Tiny 10 px text on cards; no focus ring on the card's overlay link; hover-zoom ignored reduced-motion; ambiguous `duration-[800ms]` class | 11 px minimum, `focus-visible` ring, `motion-reduce:transform-none`, `duration-700` | `ListingCard.tsx` |
| Pre-existing failing test `listingCardRender` (priority was not passed when a listing had no photos) | Fixed in the carousel | `ListingImageCarousel.tsx` |

### Part B: features
1. **Price history on cards.** A dependency-free SVG step sparkline, "N price changes", and a "Price dropped X%" badge (only for a net cut of at least 1% and at least Rs 25k, or the snapshot's `price_drop_pct`). Data comes from `price-sparklines.json` (about 160 KB br, 5.8k listings), loaded once on browser idle through a module cache (no QueryClient needed). Days on market now render correctly thanks to the timestamp fix. Listing detail already had a timeline and a "Price cut N×" chip; both now get correct dates. Files: `hooks/usePriceSparklines.ts`, `lib/priceHistory.ts`, `components/PriceSparkline.tsx`.
2. **Trust Check panel** on listing detail. It is computed on-device from the listing, its price path and the optional `/history-report` related listings. Signals: price vs the market band (far below = high, below = medium, above = info); scam wording (advance or deposit, seller abroad or leaving, Western Union or crypto, delivery after payment, no inspection, "open papers"); cross-site duplicates and relists with price spread; **odometer decreasing across linked listings** (at least 5,000 km and at least 10%, so typos are ignored); very low km per year for age; price cuts; long time on market; no photos. When the cross-site data can't load, the panel says so instead of claiming "no duplicates". It includes guided links to the DMT record and the Customs check, the "never pay an advance" rule, and the Safe-Transfer Kit. All copy is phrased as risk signals with a disclaimer. Files: `lib/trustSignals.ts`, `components/TrustCheckPanel.tsx`.
3. **"What can I afford?"** at `/afford`. You enter cash and a monthly budget. It applies the CBSL LTV caps (60% for registered >1 yr, 40% for unregistered/recon/<1 yr; editable), the rate and term (default 15% for 5 years, from `cashToOwn`), stamp duty and lender fees (2% of the loan), the DMT transfer fee (Rs 6,500) and optional first-year insurance. A binary search finds the price ceiling and rounds down to Rs 10k. It shows two result cards (registered and recon), each linking to `/?price_max=…&condition=…`. Inputs are remembered locally. Files: `lib/affordability.ts`, `pages/Afford.tsx`.
4. **Safe-Transfer Kit** at `/safe-transfer`. It has a 3-phase checklist (persisted), the 14-day deadline calculator with the strict-enforcement flag from 1 Dec 2026, a cost estimator (indicative DMT fees by class, optional stamp duty %, extras), and a **sale agreement PDF** generated on-device with a lazily imported `jspdf` (blank fields print as lines; includes a no-"open papers" clause and the 14-day transfer clause). Everything is marked "check with DMT" or "not legal advice". Files: `lib/transferKit.ts`, `pages/SafeTransfer.tsx`.
5. **Buy-now-or-wait card** on `/cars/:make/:model`. It takes a least-squares slope over the last ≤6 months of median asking prices (months with fewer than 5 ads are dropped; at least 3 months needed) and reads the result as easing, firming, steady or "not enough history". It shows the confidence and sample size and is labelled "Indicative", based on asking prices, not advice. It reuses the `ModelTrendPanel` query key, so no extra request is made. Files: `lib/priceOutlook.ts`, `components/BuyOrWaitCard.tsx`.

Navigation: the Navbar "More → Tools", the footer and the command palette now link to `/afford` and `/safe-transfer`. The listing detail's ownership section links to `/afford`.

## Files outside my owned paths (smallest possible change; flag for the integrator)
- `src/App.tsx`: 2 lazy imports and 2 `<Route>`s (`/afford`, `/safe-transfer`).
- `src/lib/{parseTime,sourceAttribution,trustSignals,affordability,transferKit,priceOutlook,priceHistory}.ts` (new) and small edits to `src/lib/{dataFreshness,listing-card-meta,formatting}.ts` (timestamp parser).
- `src/hooks/usePriceSparklines.ts` (new). It only *consumes* the exported `fetchSnapshotJSON`; `api.ts` is untouched.
- `src/test/dashboardRuntime.test.tsx`: updated the error-copy regex. `src/test/webUxFeatures.test.ts`: new (16 tests).
- **Likely merge overlap with web-perf:** `ListingCard.tsx` (I removed the Tremor import; I left the hover `void getListing()` alone for web-perf to remove). If web-perf adds per-model or per-listing shards, `getPriceTrends` and `getListingHistoryReport` keep their signatures, so the new cards keep working. Route titles for `/afford` and `/safe-transfer` are set with `document.title`. RouteMeta entries (canonical, description) should be added by web-perf.

## How to test
```
npm ci && npx vitest run src/test/webUxFeatures.test.ts src/test/listingCardRender.test.tsx src/test/dashboardRuntime.test.tsx
npm test        # 29 failing, all pre-existing api.ts snapshot-mode tests (baseline was 30; listingCardRender now passes)
npm run build   # passes (vite build 40 s). In this sandbox the R2 snapshot sync + build was OOM-killed once; `npx vite build` succeeded.
```
Manual checks:
- `/`: wait 8 s; the app strip appears once at the bottom and doesn't come back after a reload. It never appears on `/?make=Toyota`.
- Cards show "Listed on …" lines; some show a sparkline and a "Price dropped" badge (e.g. listing 104150).
- `/listing/<id>` shows the Trust Check panel and "Contact seller on ikman" with no phone numbers. With the backend down, the saved-data notice appears.
- `/afford`, `/safe-transfer` (download the PDF), `/cars/toyota/aqua` (Buy-now-or-wait card).

## OPS STEPS FOR SUVEN
1. None of this needs env vars or secrets.
2. Check the figures before promoting: DMT transfer fees (Rs 6,500 car / 1,500 motorcycle / 2,000 three-wheeler, copied from `backend/app/services/ownership_costs.py`), the DMT record fee (Rs 150), the 1 Dec 2026 enforcement date, and whether a stamp duty % applies to private vehicle sales (defaults to 0, editable). Have a lawyer glance at the sale agreement template.
3. Images: the placeholder hides failures, but real photos for riyasewana still need the public cached `thumbnail-proxy` or R2 re-hosting (backend/data branches).

## Not done / TODO
- A full jsx-a11y lint pass and axe page tests. The contrast audit (A1–A8) was only partly addressed on cards and new pages.
- Mobile filter drawer: it already exists (`MobileFilterSheet`; the sidebar is `hidden lg:block`), so I made no change. I didn't re-verify it on a device.
- No headless browser in this sandbox, so all review was from code plus curl. Screenshots weren't taken.
- Trust Check doesn't yet do pHash photo reuse or phone reuse (needs backend data), flood risk, or Sinhala/Tamil copy (all new strings go through `t()` with English fallbacks).
- The odometer check depends on `/history-report`, which currently 500s while the DB is down. The panel says so.
- `RouteMeta` titles/descriptions for the new routes belong to web-perf.
