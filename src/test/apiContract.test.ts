import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Frontend↔backend route contract (read-only, no network).
 *
 * Every `api.ts` helper below is invoked with a mocked `fetch`; the test
 * captures the request path and asserts it matches a route in the FastAPI
 * OpenAPI snapshot (`BACKEND_OPENAPI_PATHS`).
 *
 * Snapshot source (read-only dump, 2026-09-03):
 *   cd backend && ./.venv/Scripts/python.exe -c \
 *     "from app.main import app; print('\n'.join(sorted(app.openapi()['paths']))))"
 * If the backend adds/renames a route, update the snapshot here and the
 * matching `api.ts` caller together.
 */
const BACKEND_OPENAPI_PATHS: string[] = [
  "/.well-known/security.txt",
  "/api/v1/admin/analytics",
  "/api/v1/admin/cache",
  "/api/v1/admin/dealers",
  "/api/v1/admin/dealers/{dealer_id}/verify",
  "/api/v1/admin/enrichment/geoapify",
  "/api/v1/admin/enrichment/openchargemap",
  "/api/v1/admin/enrichment/problemsbyvin",
  "/api/v1/admin/enrichment/revcardata",
  "/api/v1/admin/feedback",
  "/api/v1/admin/feedback/{feedback_id}",
  "/api/v1/admin/invites",
  "/api/v1/admin/invites/{invite_id}",
  "/api/v1/admin/overview",
  "/api/v1/admin/permits",
  "/api/v1/admin/pipeline",
  "/api/v1/admin/pipeline/trigger",
  "/api/v1/admin/system",
  "/api/v1/admin/users",
  "/api/v1/admin/users/{user_id}",
  "/api/v1/alerts",
  "/api/v1/alerts/match",
  "/api/v1/alerts/{alert_id}",
  "/api/v1/auth/invite/{token}",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/auth/self-signup",
  "/api/v1/auth/self-signup/status",
  "/api/v1/auth/signup",
  "/api/v1/b2b/collateral-value",
  "/api/v1/billing/checkout-intent",
  "/api/v1/billing/manual-pay",
  "/api/v1/billing/webhook",
  "/api/v1/calculators/import-eligibility",
  "/api/v1/calculators/landed-cost",
  "/api/v1/calculators/macro",
  "/api/v1/calculators/ownership-bundle",
  "/api/v1/calculators/permits",
  "/api/v1/calculators/revenue-licence",
  "/api/v1/calculators/tco",
  "/api/v1/calculators/third-party-insurance",
  "/api/v1/calculators/transfer-fees",
  "/api/v1/calculators/vehicle-news",
  "/api/v1/chat",
  "/api/v1/dealer/benchmark-urls",
  "/api/v1/dealer/claim",
  "/api/v1/dealer/me",
  "/api/v1/dealer/verify",
  "/api/v1/ev/charging-stations",
  "/api/v1/events",
  "/api/v1/feedback",
  "/api/v1/listings",
  "/api/v1/listings/custom-estimate",
  "/api/v1/listings/estimate",
  "/api/v1/listings/makes",
  "/api/v1/listings/models",
  "/api/v1/listings/nhtsa-models",
  "/api/v1/listings/price-drops",
  "/api/v1/listings/search-suggestions",
  "/api/v1/listings/sitemap-count",
  "/api/v1/listings/sitemap-ids",
  "/api/v1/listings/sources",
  "/api/v1/listings/{listing_id}",
  "/api/v1/listings/{listing_id}/fmv",
  "/api/v1/listings/{listing_id}/geo",
  "/api/v1/listings/{listing_id}/history-report",
  "/api/v1/listings/{listing_id}/price-history",
  "/api/v1/listings/{listing_id}/safety-research",
  "/api/v1/listings/{listing_id}/seller-profile",
  "/api/v1/listings/{listing_id}/similar",
  "/api/v1/listings/{listing_id}/thumbnail-proxy",
  "/api/v1/market/import-prices",
  "/api/v1/market/signals",
  "/api/v1/market/signals/{signal_id}",
  "/api/v1/market/summary",
  "/api/v1/notifications",
  "/api/v1/notifications/read-all",
  "/api/v1/notifications/{notification_id}/read",
  "/api/v1/pipeline/runs",
  "/api/v1/pipeline/status",
  "/api/v1/pipeline/trigger",
  "/api/v1/pro/arbitrage-gaps",
  "/api/v1/pro/district-detail",
  "/api/v1/pro/districts",
  "/api/v1/pro/market-snapshot",
  "/api/v1/pro/vehicle-lane-detail",
  "/api/v1/pro/vehicle-lanes",
  "/api/v1/stats/district-insight",
  "/api/v1/stats/district-prices",
  "/api/v1/stats/district-velocity",
  "/api/v1/stats/ev-insight",
  "/api/v1/stats/fuel-mix",
  "/api/v1/stats/hybrid-bands",
  "/api/v1/stats/import-era-split",
  "/api/v1/stats/insights",
  "/api/v1/stats/live",
  "/api/v1/stats/live/stream",
  "/api/v1/stats/make-insight",
  "/api/v1/stats/make-model-insight",
  "/api/v1/stats/model-price-history",
  "/api/v1/stats/price-index",
  "/api/v1/stats/source-quality",
  "/api/v1/stats/summary",
  "/api/v1/stats/trends",
  "/api/v1/vehicles/safety-research",
  "/health",
];

function templateToRegExp(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[^/]+\\\}/g, "[^/]+")}$`);
}

function matchesBackendRoute(pathname: string): boolean {
  return BACKEND_OPENAPI_PATHS.some((template) => templateToRegExp(template).test(pathname));
}

function stubFetch(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function firstPathname(fetchMock: ReturnType<typeof vi.fn>): string {
  const raw = String(fetchMock.mock.calls[0]?.[0] ?? "");
  return new URL(raw, "http://localhost").pathname;
}

describe("frontend↔backend route contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stats + market snapshot helpers hit OpenAPI routes", async () => {
    const api = await import("@/services/api");

    let fetchMock = stubFetch({ total_listings: 1 });
    await api.getStats();
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);
    expect(firstPathname(fetchMock)).toBe("/api/v1/stats/summary");

    fetchMock = stubFetch({ generated_at: "2026-05-21T10:00:00Z", total_listings: 1 });
    await api.getLiveMarketSnapshot();
    expect(firstPathname(fetchMock)).toBe("/api/v1/stats/live");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ points: [] });
    await api.getDistrictPrices();
    expect(firstPathname(fetchMock)).toBe("/api/v1/stats/district-prices");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ points: [], generated_at: "2026-05-21T10:00:00Z" });
    await api.getDistrictVelocity();
    expect(firstPathname(fetchMock)).toBe("/api/v1/stats/district-velocity");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({
      coverage_scope: "exact",
      coverage_note: null,
      points: [{ year: 2026, month: 4, median_price_lkr: 1, avg_price_lkr: 1, listing_count: 1 }],
    });
    await api.getPriceTrendSeries("Toyota", "Vitz", undefined, "Kandy");
    expect(firstPathname(fetchMock)).toBe("/api/v1/stats/trends");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ series: [], top_makes: [], generated_at: "2026-05-21T10:00:00Z" });
    await api.getPriceIndex();
    expect(firstPathname(fetchMock)).toBe("/api/v1/stats/price-index");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);
  });

  it("listing helpers hit OpenAPI routes", async () => {
    const api = await import("@/services/api");

    let fetchMock = stubFetch({ items: [], total: 0 });
    await api.getListings({ sort: "newest", page: 1 });
    expect(firstPathname(fetchMock)).toBe("/api/v1/listings");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ id: 42, year: 2020 });
    await api.getListing("42");
    expect(firstPathname(fetchMock)).toBe("/api/v1/listings/42");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch([]);
    await api.getSimilarListings("42");
    expect(firstPathname(fetchMock)).toBe("/api/v1/listings/42/similar");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch([
      { id: 501, make: "Honda", model: "Vezel", year: 2018, source: "ikman" },
    ]);
    await api.getListingSearchSuggestions("vez", 5);
    expect(firstPathname(fetchMock)).toBe("/api/v1/listings/search-suggestions");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ source: "ikman", source_url: "https://example.com", seller_type: "dealer" });
    await api.getSellerTrustProfile(123);
    expect(firstPathname(fetchMock)).toBe("/api/v1/listings/123/seller-profile");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ items: [] });
    await api.getPriceDrops();
    expect(firstPathname(fetchMock)).toBe("/api/v1/listings/price-drops");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ listing_id: 42, points: [] });
    await api.getListingPriceHistory(42);
    expect(firstPathname(fetchMock)).toBe("/api/v1/listings/42/price-history");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);
  });

  it("pro + feedback + calculator helpers hit OpenAPI routes", async () => {
    const api = await import("@/services/api");

    let fetchMock = stubFetch([]);
    await api.getProArbitrageGaps("Toyota", "Vitz", 5);
    expect(firstPathname(fetchMock)).toBe("/api/v1/pro/arbitrage-gaps");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({ id: 1, category: "bug", status: "new", created_at: "2026-05-21T10:00:00Z" });
    await api.sendFeedback({ category: "bug", message: "contract probe" });
    expect(firstPathname(fetchMock)).toBe("/api/v1/feedback");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);

    fetchMock = stubFetch({
      cif_lkr: 1,
      cid: 1,
      surcharge: 0,
      excise: 1,
      sscl: 0,
      vat: 1,
      luxury_tax: 0,
      total_tax: 1,
      landed_cost: 2,
      surcharge_applied: false,
      notes: "ok",
    });
    await api.calculateLandedCost({ cif_usd: 12000, exchange_rate: 300, fuel_type: "hybrid", engine_cc: 1500, apply_surcharge: true, apply_sscl: true });
    expect(firstPathname(fetchMock)).toBe("/api/v1/calculators/landed-cost");
    expect(matchesBackendRoute(firstPathname(fetchMock))).toBe(true);
  });

  it("every contract path resolves against the OpenAPI snapshot (no drift)", () => {
    const contractPaths = [
      "/api/v1/stats/summary",
      "/api/v1/stats/live",
      "/api/v1/stats/district-prices",
      "/api/v1/stats/district-velocity",
      "/api/v1/stats/trends",
      "/api/v1/stats/price-index",
      "/api/v1/listings",
      "/api/v1/listings/42",
      "/api/v1/listings/42/similar",
      "/api/v1/listings/search-suggestions",
      "/api/v1/listings/123/seller-profile",
      "/api/v1/listings/price-drops",
      "/api/v1/listings/42/price-history",
      "/api/v1/pro/arbitrage-gaps",
      "/api/v1/feedback",
      "/api/v1/calculators/landed-cost",
    ];
    for (const path of contractPaths) {
      expect(matchesBackendRoute(path)).toBe(true);
    }
  });
});
