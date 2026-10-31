# Buyer journey verification — 2026-10-31

## Scope
Read-only production API requests and execution of the existing frontend API adapter against the real backend. No inventory mutations, account writes, deployment, commit, or browser automation. No source changes in this verification pass.

Backend: https://seo292-vehicle-platform-backend.hf.space/api/v1

## Verified
- Toyota Aqua / cars / best_match search: HTTP 200, 1,408 results at check time. Adapter normalized numeric prices and HTTPS source links. Sample IDs: 705241 and 705170.
- Search suggestions for aqua: HTTP 200, three results.
- Both sample detail endpoints: HTTP 200, is_active=true.
- Both FMV endpoints: HTTP 200, cohort_median, 80 samples; FMV LKR 7,025,000 and 7,892,500 respectively. These are estimates, not sale prices.
- Similar listings: HTTP 200, four results per sample.
- Price history: HTTP 200 for both samples; this does not certify sufficient historical observations.
- Nonmatching query: HTTP 200, total=0 and empty items, also confirmed through the adapter.
- Missing ID 2147483647: HTTP 404, Listing not found; adapter preserves status 404.
- Real two-ID comparison hydration preserves the requested IDs/order.
- Mixed valid/missing comparison hydration returns only the valid row. This confirms silent omission, NOT successful recovery UX.
- CORS permits the production origin and current preview origin for the sampled public GET requests.
- Published snapshot manifest: generated_at=2026-10-31T16:19:13.442407+00:00, listing_count=120972, priced_listing_count=120215. Workspace manifest is older (2026-09-02) and is not proof of production freshness.

## Recovery gaps (not fixed in a verification-only pass)
1. Compare: getListingsBatch uses allSettled and drops every rejection, including network errors. Compare's catch/retry path cannot receive those individual failures. Partial results have no missing-ID explanation; all failed lookups can look like no selection.
2. Detail: listingHandoff.fetchBundle converts every detail error to null. ListingDetail then shows Listing not found, including for transient network/server errors, with Return to inventory but no retry.
3. Saved listings: failures are converted to null. Partial failures are described as no longer available even when they could be temporary; all failures have a generic unavailable state without an inline retry or a way to remove the unresolved saved IDs.
4. Snapshot precedence: detail reads prefer snapshots while search reads prefer live. Freshness/parity for the same IDs was not established; the local snapshot manifest is stale.

## Checks
- Live adapter verification: 4/4 passed (artifacts/buyer-live-adapter.log).
- Existing focused frontend checks: 32/32 passed across watchlist, dashboardRuntime, listingDetailLayout and compareTrayHook. React act warnings remain in the detail test output.
- Initial live adapter harness failed due to jsdom AbortSignal incompatibility with Node fetch; corrected the harness to use a Node-native signal, then reran successfully. This was a test-environment issue, not a backend outage.
- Local preview bound to 0.0.0.0:3004, exact Host accepted, served module confirms live API configuration. No tracked configuration changed.

## Pending human checks / limitations
No interactive browser automation is available in this cloud host. In the preview, search Toyota Aqua, open one result, save it, add a second car to compare, navigate Back, and reload to check local selections. Check /listing/2147483647 and /compare?ids=705241,2147483647 to observe missing states. Account synchronization and alert delivery were not tested; saved listings remain browser-local. No source-marketplace availability, sold/withdrawn record, source image delivery, mobile layout, or actual offline/network-failure browser run was certified.

Evidence: buyer-live-api.json contains timestamped sampled API responses; buyer-live-adapter.log records adapter assertions. The one-off harness is kept as buyer-live-verification.ts rather than *.test.ts to avoid introducing live network dependencies into the ordinary suite.
