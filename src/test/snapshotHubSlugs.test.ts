import { afterEach, describe, expect, it, vi } from "vitest";
import { slugifyHubSegment } from "@/lib/makeNormalization";

const MAKE_INSIGHTS_SNAPSHOT = {
  "Land Rover": {
    make: "Land Rover",
    total: 12,
    avg_price_lkr: 42_000_000,
    median_price_lkr: 40_000_000,
    top_models: [{ model: "Defender", count: 7, avg_price_lkr: 45_000_000 }],
    top_districts: [{ district: "Colombo", count: 9, avg_price_lkr: 43_000_000 }],
  },
  Toyota: {
    make: "Toyota",
    total: 20,
    avg_price_lkr: 14_500_000,
    median_price_lkr: 14_000_000,
    top_models: [
      { model: "C-HR", count: 8, avg_price_lkr: 14_200_000 },
      { model: "Land Cruiser", count: 5, avg_price_lkr: 38_000_000 },
    ],
    top_districts: [{ district: "Colombo", count: 14, avg_price_lkr: 15_000_000 }],
  },
};

const LISTINGS_CATALOG_SNAPSHOT = {
  items: [
    {
      id: 701,
      source: "ikman",
      source_id: "ik-701",
      make: "Toyota",
      model: "C-HR",
      year: 2018,
      condition: "used",
      price_lkr: 14_200_000,
      district: "Colombo",
      is_active: true,
      scraped_at: "2026-10-10T00:00:00Z",
    },
    {
      id: 702,
      source: "ikman",
      source_id: "ik-702",
      make: "Toyota",
      model: "Land Cruiser",
      year: 2016,
      condition: "used",
      price_lkr: 38_000_000,
      district: "Colombo",
      is_active: true,
      scraped_at: "2026-10-11T00:00:00Z",
    },
  ],
};

function stubSnapshotFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/snapshots/latest/make-insights.json")) {
      return { ok: true, status: 200, json: async () => MAKE_INSIGHTS_SNAPSHOT } as Response;
    }
    if (
      url.endsWith("/snapshots/latest/listing-catalog.json") ||
      url.endsWith("/snapshots/latest/listings-all.json")
    ) {
      return { ok: true, status: 200, json: async () => LISTINGS_CATALOG_SNAPSHOT } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("slugifyHubSegment & snapshot slug lookup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("produces canonical lowercase hyphenated hub segments", () => {
    expect(slugifyHubSegment("Land Rover")).toBe("land-rover");
    expect(slugifyHubSegment("C-HR")).toBe("c-hr");
    expect(slugifyHubSegment("Mercedes Benz")).toBe("mercedes-benz");
    expect(slugifyHubSegment("Nuwara Eliya")).toBe("nuwara-eliya");
  });

  it("matches hyphenated make and model slugs in snapshot fallbacks", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "/snapshots/latest");
    vi.stubEnv("VITE_SNAPSHOT_ONLY", "true");
    stubSnapshotFetch();

    const api = await import("@/services/api");

    const landRover = await api.getMakeInsight("land-rover");
    expect(landRover.make).toBe("Land Rover");
    expect(landRover.total).toBe(12);

    const chr = await api.getMakeModelInsight("toyota", "c-hr");
    expect(chr.make).toBe("Toyota");
    expect(chr.model).toBe("C-HR");
    expect(chr.total).toBe(1);

    const filtered = await api.getListings({ make: "toyota", model: "land-cruiser", sort: "newest", page: 1 });
    expect(filtered.listings.map((item) => item.id)).toEqual([702]);
  });
});
