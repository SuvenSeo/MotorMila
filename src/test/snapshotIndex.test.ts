import { afterEach, describe, expect, it, vi } from "vitest";

// The per-entity idx/ layout must serve listing detail, hubs and trends
// without ever requesting listing-catalog*.json.
const manifest = { version: 1, shard_size: 250, listing_count: 3 };
const aqua = {
  id: 1001,
  make: "Toyota",
  model: "Aqua",
  year: 2015,
  price_lkr: 6_500_000,
  district: "Colombo",
  first_seen_at: "2026-10-01T00:00:00Z",
  source: "ikman",
  url: "https://ikman.lk/en/ad/1001",
};
const aqua2 = { ...aqua, id: 1002, price_lkr: 7_000_000, url: "https://ikman.lk/en/ad/1002" };
const files: Record<string, unknown> = {
  "idx/manifest.json": manifest,
  "idx/listings/4.json": { items: [aqua, aqua2] },
  "idx/models/toyota/aqua.json": {
    make: "Toyota",
    model: "Aqua",
    total: 2,
    avg_price_lkr: 6_750_000,
    median_price_lkr: 6_750_000,
    comp_fields: ["id", "price_lkr", "year", "mileage_km", "district", "condition", "first_seen_at", "fuel_type"],
    comps: [
      [1001, 6_500_000, 2015, 80000, "Colombo", null, "2026-10-01", "hybrid"],
      [1002, 7_000_000, 2015, 60000, "Gampaha", null, "2026-10-02", "hybrid"],
    ],
    items: [aqua2, aqua],
  },
  "idx/districts/colombo.json": {
    district: "Colombo",
    listing_count: 1,
    avg_price_lkr: 6_500_000,
    median_price_lkr: 6_500_000,
    top_models: [{ make: "Toyota", model: "Aqua", listing_count: 1, avg_price_lkr: 6_500_000 }],
    items: [aqua],
  },
  "live-market.json": { latest_listings: [] },
};

function stubSnapshots() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(files).find((name) => url.endsWith(`/snapshots/latest/${name}`) || url.endsWith(`/latest/${name}`));
    if (match) return { ok: true, status: 200, json: async () => files[match] } as Response;
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("snapshot idx/ layout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads a listing from its id shard and never the full catalogue", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "/snapshots/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");
    const fetchMock = stubSnapshots();
    const api = await import("@/services/api");

    const listing = await api.getListing(1002);
    expect(listing).toMatchObject({ id: 1002, make: "Toyota", model: "Aqua" });
    const similar = await api.getSimilarListings(1002);
    expect(similar.map((row) => row.id)).toEqual([1001]);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("idx/listings/4.json"))).toBe(true);
    expect(urls.some((u) => u.includes("listing-catalog"))).toBe(false);
  });

  it("serves make/model insight, trends and listings from the model index", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "/snapshots/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");
    const fetchMock = stubSnapshots();
    const api = await import("@/services/api");

    const insight = await api.getMakeModelInsight("toyota", "aqua");
    expect(insight).toMatchObject({ make: "Toyota", model: "Aqua", total: 2, median_price_lkr: 6_750_000 });
    expect(insight.top_districts.map((d) => d.district).sort()).toEqual(["Colombo", "Gampaha"]);

    const page = await api.getListings({ make: "toyota", model: "aqua", sort: "newest", page: 1 });
    expect(page.total).toBe(2);
    expect(page.listings[0].id).toBe(1002);

    const district = await api.getDistrictQuickInsight("colombo");
    expect(district).toMatchObject({ district: "Colombo", listing_count: 1 });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("listing-catalog"))).toBe(false);
  });

  it("falls back to the legacy catalogue only when idx/ is missing", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "/snapshots/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");
    delete files["idx/manifest.json"];
    files["listing-catalog.json"] = { items: [aqua] };
    try {
      const fetchMock = stubSnapshots();
      const api = await import("@/services/api");
      const listing = await api.getListing(1001);
      expect(listing).toMatchObject({ id: 1001 });
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("listing-catalog.json"))).toBe(true);
    } finally {
      files["idx/manifest.json"] = manifest;
      delete files["listing-catalog.json"];
    }
  });
});
