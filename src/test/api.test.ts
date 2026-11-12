import { afterEach, describe, expect, it, vi } from "vitest";

describe("api module", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Fresh module per test: listing-detail cache and the API circuit breaker are module state.
    vi.resetModules();
  });

  it("formats prices in Mn", async () => {
    const { formatPrice } = await import("@/services/api");

    expect(formatPrice(null)).toBe("N/A");
    expect(formatPrice(925000)).toBe("Rs 0.93 Mn");
    expect(formatPrice(2500000)).toBe("Rs 2.5 Mn");
  });

  it("omits cookies for cross-origin HF API bases (HF preflight lacks Allow-Credentials)", async () => {
    const { resolveFetchCredentials } = await import("@/services/api");

    expect(resolveFetchCredentials("/api/v1")).toBe("include");
    expect(
      resolveFetchCredentials("https://seo292-vehicle-platform-backend.hf.space/api/v1"),
    ).toBe("omit");
  });

  it("posts landed-cost with same-origin credentials mode in tests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cif_lkr: 3600000,
        cid: 720000,
        surcharge: 360000,
        excise: 5775000,
        sscl: 261375,
        vat: 1928947.5,
        luxury_tax: 0,
        total_tax: 9045322.5,
        landed_cost: 12645322.5,
        surcharge_applied: true,
        notes: "ok",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { calculateLandedCost } = await import("@/services/api");
    const result = await calculateLandedCost({
      cif_usd: 12000,
      exchange_rate: 300,
      fuel_type: "hybrid",
      engine_cc: 1500,
      apply_surcharge: true,
      apply_sscl: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/calculators/landed-cost");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      // Vitest uses relative /api/v1 → same-origin → include is fine.
      credentials: "include",
    });
    expect(result.landed_cost).toBe(12645322.5);
  });

  it("exports listing detail helpers", async () => {
    const api: typeof import("@/services/api") = await import("@/services/api");

    expect(typeof api.getListing).toBe("function");
    expect(typeof api.getSimilarListings).toBe("function");
  });

  it("requests listing detail and similar listings from the backend api", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 42 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 7 }],
      });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const detail = await api.getListing("42");
    const similar = await api.getSimilarListings("42");

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/listings/42");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/v1/listings/42/similar");
    expect(detail).toMatchObject({ id: 42 });
    expect(similar[0]).toMatchObject({ id: 7 });
  });

  it("reuses a short-lived listing detail fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 4242, make: "Toyota", model: "Aqua" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const first = await api.getListing("4242");
    const second = await api.getListing("4242");

    expect(first).toMatchObject({ id: 4242 });
    expect(second).toMatchObject({ id: 4242 });
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes("/listings/4242")).length).toBe(1);
  });

  it("does not infer listing specs from title or description text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 77,
        source: "ikman",
        source_id: "ik-77",
        url: "https://ikman.lk/en/ad/example-77",
        detail_url: "https://ikman.lk/en/ad/example-77",
        external_url: "https://ikman.lk/en/ad/example-77",
        title: "Toyota Hilux diesel manual pickup used 189,000 km 2500cc",
        description: "Excellent condition diesel manual pickup",
        make: "Toyota",
        model: "Hilux",
        year: 2016,
        price_lkr: 10200000,
        deal_score: 3.1,
        market_median_lkr: 10300000,
        mileage: null,
        condition: null,
        transmission: null,
        fuel_type: null,
        body_type: null,
        engine_capacity: null,
        scraped_at: "2026-04-21T10:30:00Z",
        first_seen_at: "2026-04-21T10:30:00Z",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const detail = await api.getListing("77");

    expect(detail.mileage_km).toBeNull();
    expect(detail.engine_cc).toBeUndefined();
    expect(detail.condition).toBeUndefined();
    expect(detail.transmission).toBeUndefined();
    expect(detail.fuel_type).toBeUndefined();
    expect(detail.body_type).toBeUndefined();
  });

  it("drops the card rating when the backend withholds the detail verdict (price_withheld_reason)", async () => {
    const row = (id: number, extra: Record<string, unknown>) => ({
      id,
      source: "ikman",
      source_id: `ik-${id}`,
      url: `https://ikman.lk/en/ad/example-${id}`,
      title: "Perodua Viva 2011",
      make: "Perodua",
      model: "Viva",
      year: 2011,
      vehicle_category: "wagons",
      price_lkr: 4190000,
      deal_score: 5.8,
      market_median_lkr: 4450000,
      scraped_at: "2026-10-20T00:00:00Z",
      first_seen_at: "2026-10-20T00:00:00Z",
      ...extra,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [row(1, { price_withheld_reason: "thin_comps" }), row(2, {})], total: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const { listings } = await api.getListings({ sort: "newest", page: 1 });
    const withheld = listings.find((l) => l.id === 1)!;
    const rated = listings.find((l) => l.id === 2)!;
    expect(withheld.deal_score ?? null).toBeNull();
    expect(withheld.market_median_lkr).toBeUndefined();
    expect(rated.market_median_lkr).toBe(4450000);
  });

  it("sends source filter when requesting listings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    await api.getListings({
      sort: "newest",
      page: 1,
      source: "ikman",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(requestedUrl).toContain("/api/v1/listings");
    expect(requestedUrl).toContain("source=ikman");
  });

  it("normalizes thumbnail from image fields when thumbnail_url is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 100,
            year: 2020,
            mileage: 30000,
            price_lkr: "7500000",
            deal_score: "9.2",
            market_median_lkr: "8000000",
            images: ["https://example.com/primary.jpg"],
          },
        ],
        total: 1,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const result = await api.getListings({
      sort: "newest",
      page: 1,
    });

    expect(result.listings[0]?.thumbnail_url).toBe("https://example.com/primary.jpg");
  });

  it("posts custom vehicle estimate payload to backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        vehicle_label: "Toyota Aqua (2018)",
        estimated_low_lkr: 6200000,
        estimated_median_lkr: 6900000,
        estimated_high_lkr: 7600000,
        comparable_count: 12,
        confidence: "high",
        verdict: "Within market range",
        verdict_label: "Fair price",
        delta_pct: 1.8,
        methodology: "test",
        comparables: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const result = await api.estimateCustomVehicle({
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      mileage_km: 54000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/listings/custom-estimate");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"))).toMatchObject({
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      mileage_km: 54000,
    });
    expect(result.estimated_median_lkr).toBe(6900000);
  });

  it("falls back to deriving sources from listings when sources endpoint fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        text: async () => JSON.stringify({ detail: [{ msg: "Input should be integer" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { source: "Ikman" },
            { source: "ikman" },
            { source: "auto-lanka" },
          ],
          total: 3,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const result = await api.getListingSources();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/listings/sources");
    expect(String(fetchMock.mock.calls[1]?.[0] || "")).toContain("/api/v1/listings");
    expect(result).toEqual([
      { source: "ikman", label: "Ikman", count: 2 },
      { source: "autolanka", label: "AutoLanka", count: 1 },
    ]);
  });

  it("keeps freshness metadata truthful in stats responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_listings: 120,
        avg_price_lkr: 7800000,
        listings_this_week: 11,
        price_change_mom: -2.1,
        good_deals_count: 9,
        district_count: 6,
        source_count: 4,
        last_updated: null,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const stats = await api.getStats();

    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/stats/summary");
    expect(stats.source_count).toBe(4);
    expect(stats.last_updated).toBeNull();
  });

  it("preserves null month-over-month change when backend has no history", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_listings: 120,
        avg_price_lkr: 7800000,
        listings_this_week: 11,
        price_change_mom: null,
        good_deals_count: 9,
        district_count: 6,
        source_count: 4,
        last_updated: "2026-07-13T10:00:00Z",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const stats = await api.getStats();

    expect(stats.price_change_mom).toBeNull();
  });

  it("normalizes live market snapshot responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: "2026-05-21T10:00:00Z",
        total_listings: "120",
        priced_listings: "110",
        unavailable_price_listings: "10",
        avg_price_lkr: "7800000",
        latest_listing_at: "2026-05-21T09:59:00Z",
        active_scrape_sources: ["riyahub"],
        latest_run: {
          source: "riyahub",
          status: "RUNNING",
          listings_found: "20",
          listings_new: "3",
        },
        source_status: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const snapshot = await api.getLiveMarketSnapshot();

    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/stats/live");
    expect(snapshot).toMatchObject({
      total_listings: 120,
      priced_listings: 110,
      unavailable_price_listings: 10,
      avg_price_lkr: 7800000,
      active_scrape_sources: ["riyahub"],
    });
  });

  it("maps district top-model metadata from district price aggregates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        points: [
          {
            district: "Colombo",
            avg_price_lkr: 11750000,
            count: 3041,
            lat: 6.9271,
            lng: 79.8612,
            top_make: "Toyota",
            top_model: "Vitz",
            top_model_count: 186,
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const districts = await api.getDistrictPrices();

    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/stats/district-prices");
    expect(districts[0]).toMatchObject({
      district: "Colombo",
      listing_count: 3041,
      top_make: "Toyota",
      top_model: "Vitz",
      top_model_count: 186,
    });
  });

  it("fetches listing search suggestions for live typeahead", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 501,
          make: "Honda",
          model: "Vezel",
          year: 2018,
          district: "Colombo",
          price_lkr: 12800000,
          source: "ikman",
        },
      ]),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const suggestions = await api.getListingSearchSuggestions("vez", 5);

    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/listings/search-suggestions");
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("q=vez");
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("limit=5");
    expect(suggestions[0]).toMatchObject({
      id: 501,
      make: "Honda",
      model: "Vezel",
      year: 2018,
      district: "Colombo",
      price_lkr: 12800000,
      source: "ikman",
    });
  });

  it("requests listings with keyword search filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    await api.getListings({ q: "Toyota Axio", sort: "newest", page: 1 });

    const url = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(url).toContain("/api/v1/listings");
    expect(url).toContain("q=Toyota+Axio");
  });

  it("returns trend coverage metadata with trend points", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        coverage_scope: "district_fallback",
        coverage_note: "District samples are thin.",
        points: [
          {
            year: 2026,
            month: 4,
            median_price_lkr: 7200000,
            avg_price_lkr: 7300000,
            listing_count: 18,
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const series = await api.getPriceTrendSeries("Toyota", "Vitz", undefined, "Kandy");

    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/stats/trends");
    expect(series.coverage_scope).toBe("district_fallback");
    expect(series.coverage_note).toBe("District samples are thin.");
    expect(series.points[0]).toMatchObject({
      month: "2026-04",
      median_price: 7200000,
      sample_count: 18,
    });
  });

  it("posts user feedback and returns a receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 12,
        category: "bug",
        route: "/trends",
        status: "new",
        created_at: "2026-05-21T10:00:00Z",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const receipt = await api.sendFeedback({
      category: "bug",
      route: "/trends",
      message: "Trend fallback button needs checking",
    });

    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/feedback");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body)).toMatchObject({
      category: "bug",
      route: "/trends",
    });
    expect(receipt).toMatchObject({ id: 12, category: "bug", status: "new" });
  });

  it("falls back to custom estimate when strict estimate lacks comparables", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => JSON.stringify({ detail: "Not enough data to estimate price for this vehicle." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vehicle_label: "Toyota Aqua (2018)",
          estimated_low_lkr: 6200000,
          estimated_median_lkr: 6900000,
          estimated_high_lkr: 7600000,
          comparable_count: 9,
          confidence: "medium",
          verdict: "Within market range",
          verdict_label: "Fair price",
          delta_pct: null,
          methodology: "fallback custom-estimate strategy",
          comparables: [],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const result = await api.estimatePrice({
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      condition: "reconditioned",
      mileage_km: 55000,
      transmission: "automatic",
      fuel_type: "hybrid",
      district: "Colombo",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/listings/estimate");
    expect(String(fetchMock.mock.calls[1]?.[0] || "")).toContain("/api/v1/listings/custom-estimate");
    expect(result).toMatchObject({
      low: 6200000,
      median: 6900000,
      high: 7600000,
      comparable_count: 9,
      confidence: "medium",
      methodology: "fallback custom-estimate strategy",
    });
  });

  it("fetches seller trust profile details from listing source endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: "ikman",
        source_url: "https://ikman.lk/en/ad/example",
        seller_name: "Sell Fast | LSJ Computer Centre",
        seller_type: "dealer",
        member_since: "2019",
        listing_count: 142,
        review_count: 18,
        rating: 4.2,
        phone_numbers: ["0768481559"],
        whatsapp_numbers: ["94768481559"],
        verified_badges: ["Verified Dealer"],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const profile = await api.getSellerTrustProfile(123);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/listings/123/seller-profile");
    expect(profile).toMatchObject({
      source: "ikman",
      seller_name: "Sell Fast | LSJ Computer Centre",
      seller_type: "dealer",
      member_since: "2019",
      listing_count: 142,
      review_count: 18,
      rating: 4.2,
    });
  });

  it("exports getProArbitrageGaps function", async () => {
    const api: typeof import("@/services/api") = await import("@/services/api");
    expect(typeof api.getProArbitrageGaps).toBe("function");
  });

  it("calls /pro/arbitrage-gaps with make, model, and limit params", async () => {
    const mockGaps = [
      {
        buy_district: "Kandy",
        sell_district: "Colombo",
        buy_median_lkr: 6_300_000,
        sell_median_lkr: 7_300_000,
        gap_pct: 15.87,
        buy_listing_count: 8,
        sell_listing_count: 42,
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGaps,
    });
    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const result = await api.getProArbitrageGaps("Toyota", "Vitz", 5);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(calledUrl).toContain("/api/v1/pro/arbitrage-gaps");
    expect(calledUrl).toContain("make=Toyota");
    expect(calledUrl).toContain("model=Vitz");
    expect(calledUrl).toContain("limit=5");
    expect(result).toEqual(mockGaps);
  });

  it("returns empty array from getProArbitrageGaps when response is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    const api: typeof import("@/services/api") = await import("@/services/api");
    const result = await api.getProArbitrageGaps("Honda", "Fit");

    expect(result).toEqual([]);
  });
});
