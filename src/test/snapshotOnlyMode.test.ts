import { afterEach, describe, expect, it, vi } from "vitest";

describe("snapshot-only mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("refuses live API fallback for stats when VITE_SNAPSHOT_ONLY is set", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    expect(api.SNAPSHOT_ONLY).toBe(true);

    await expect(api.getStats()).rejects.toMatchObject({ status: 503 });
    // Only snapshot fetches (CDN, then the same-origin bundled copy) — never /stats/summary.
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("cdn.example/latest/stats-summary.json");
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/api/v1/"))).toBe(true);
  });

  it("returns empty listings instead of calling live API in snapshot-only mode", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    const result = await api.getListings({
      page: 1,
      sort: "newest",
      vehicle_category: "cars",
    });

    expect(result).toEqual({ listings: [], total: 0 });
    // Catalog fetch only — no /listings API call.
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/api/v1/"))).toBe(true);
  });

  it("loads multi-part listing-catalog manifests from CDN", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");

    const listingA = {
      id: 1,
      title: "Toyota Aqua",
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      price_lkr: 5_500_000,
      mileage_km: 42000,
      district: "Colombo",
      source: "ikman",
      url: "https://example.com/1",
    };
    const listingB = {
      id: 2,
      title: "Honda Fit",
      make: "Honda",
      model: "Fit",
      year: 2017,
      price_lkr: 4_800_000,
      mileage_km: 61000,
      district: "Gampaha",
      source: "riyasewana",
      url: "https://example.com/2",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listing-catalog.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            parts: ["listing-catalog-part-000.json", "listing-catalog-part-001.json"],
            listing_count: 2,
            generated_at: "2026-07-30T00:00:00.000Z",
          }),
        };
      }
      if (url.endsWith("/listing-catalog-part-000.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [listingA] }),
        };
      }
      if (url.endsWith("/listing-catalog-part-001.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [listingB] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    const result = await api.getListings({
      page: 1,
      sort: "newest",
      vehicle_category: "cars",
    });

    expect(result.total).toBe(2);
    expect(result.listings.map((row) => row.id).sort()).toEqual([1, 2]);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/listing-catalog.json"),
        expect.stringContaining("/listing-catalog-part-000.json"),
        expect.stringContaining("/listing-catalog-part-001.json"),
      ]),
    );
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/api/v1/"))).toBe(true);
  });

  it("sorts snapshot newest by first_seen_at, not re-scrape time", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");

    const dealer = {
      id: 10,
      title: "Dealer Taisor",
      make: "Toyota",
      model: "Taisor",
      year: 2026,
      price_lkr: 12_000_000,
      mileage_km: 12,
      district: "Colombo",
      source: "cartivate",
      url: "https://example.com/10",
      first_seen_at: "2026-01-02T00:00:00.000Z",
      scraped_at: "2026-09-09T14:45:00.000Z",
    };
    const fresh = {
      id: 20,
      title: "Ikman Vitz",
      make: "Toyota",
      model: "Vitz",
      year: 2014,
      price_lkr: 4_200_000,
      mileage_km: 89000,
      district: "Gampaha",
      source: "ikman",
      url: "https://example.com/20",
      first_seen_at: "2026-09-09T12:00:00.000Z",
      scraped_at: "2026-09-09T12:00:00.000Z",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listing-catalog.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [dealer, fresh] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    const result = await api.getListings({
      page: 1,
      sort: "newest",
      vehicle_category: "cars",
    });

    expect(result.listings.map((row) => row.id)).toEqual([20, 10]);
  });

  it("fails closed when a multi-part catalog chunk is missing", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listing-catalog.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            parts: ["listing-catalog-part-000.json", "listing-catalog-part-001.json"],
            listing_count: 2,
          }),
        };
      }
      if (url.endsWith("/listing-catalog-part-000.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 1,
                title: "Toyota Aqua",
                make: "Toyota",
                model: "Aqua",
                year: 2018,
                price_lkr: 5_500_000,
                mileage_km: 42000,
                district: "Colombo",
                source: "ikman",
                url: "https://example.com/1",
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    const result = await api.getListings({
      page: 1,
      sort: "newest",
      vehicle_category: "cars",
    });

    expect(result).toEqual({ listings: [], total: 0 });
  });

  it("prepends live-market latest_listings onto the frozen catalog for newest sort", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");

    const staleTop = {
      id: 433500,
      title: "Toyota Taisor V",
      make: "Toyota",
      model: "Taisor",
      year: 2026,
      price_lkr: 12_000_000,
      mileage_km: 12,
      district: "Colombo",
      source: "cartivate",
      url: "https://example.com/cartivate/1",
      first_seen_at: "2026-01-02T00:00:00.000Z",
      scraped_at: "2026-09-09T14:45:00.000Z",
    };
    const incoming = {
      id: 558905,
      title: "Toyota Vitz KSP90",
      make: "Toyota",
      model: "Vitz",
      year: 2014,
      price_lkr: 4_200_000,
      mileage_km: 89000,
      district: "Gampaha",
      source: "riyasewana",
      url: "https://example.com/riyasewana/1",
      first_seen_at: "2026-09-09T17:08:00.000Z",
      scraped_at: "2026-09-09T17:08:00.000Z",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listing-catalog.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            parts: ["listing-catalog-part-000.json"],
            listing_count: 1,
            generated_at: "2026-09-09T14:47:00.000Z",
          }),
        };
      }
      if (url.endsWith("/listing-catalog-part-000.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [staleTop] }),
        };
      }
      if (url.endsWith("/live-market.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            generated_at: "2026-09-09T17:10:00.000Z",
            total_listings: 192895,
            latest_listings: [incoming],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    const result = await api.getListings({
      page: 1,
      sort: "newest",
      vehicle_category: "cars",
    });

    expect(result.listings.map((row) => row.id)).toEqual([558905, 433500]);
    expect(result.listings[0].source).toBe("riyasewana");
    expect(result.total).toBe(2);
  });

  it("falls through to the live listings API when the snapshot catalog is empty", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "false");

    const liveRow = {
      id: 7,
      title: "Toyota Aqua 2018 Hybrid",
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      price_lkr: 6_450_000,
      mileage: 42000,
      district: "Colombo",
      source: "ikman",
      url: "https://example.com/7",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listing-catalog.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
        };
      }
      if (url.includes("/api/v1/listings")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [liveRow], total: 1 }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    const result = await api.getListings({
      page: 1,
      sort: "newest",
      vehicle_category: "cars",
    });

    expect(result.total).toBe(1);
    expect(result.listings[0]?.id).toBe(7);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/v1/listings"))).toBe(true);
  });

  it("does not call the live listings API for an empty catalog in snapshot-only mode", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listing-catalog.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("@/services/api");
    const result = await api.getListings({
      page: 1,
      sort: "newest",
      vehicle_category: "cars",
    });

    expect(result).toEqual({ listings: [], total: 0 });
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/api/v1/"))).toBe(true);
  });
});
