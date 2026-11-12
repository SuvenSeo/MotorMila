import { afterEach, describe, expect, it, vi } from "vitest";

// Live production backend validates sort against newest|deal_score|price_*|mileage_asc
// and answers 422 for "best_match". The frontend must retry with newest and rank client-side.
const reject422 = () => ({
  ok: false,
  status: 422,
  statusText: "Unprocessable Entity",
  text: async () =>
    JSON.stringify({ detail: [{ msg: "String should match pattern '^(newest|deal_score|price_asc|price_desc|mileage_asc)$'" }] }),
});

const page = {
  ok: true,
  status: 200,
  json: async () => ({
    items: [
      { id: 1, make: "Toyota", model: "Aqua", price_lkr: null, images: [] },
      { id: 2, make: "Toyota", model: "Aqua", price_lkr: "7500000", images: [] },
      { id: 3, make: "Toyota", model: "Aqua", price_lkr: "7400000", images: ["https://example.com/a.jpg"] },
    ],
    total: 3,
  }),
};

describe("best_match sort fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("retries with sort=newest on 4xx and applies best-match order client-side", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(String(url).includes("sort=best_match") ? reject422() : page),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api: typeof import("@/services/api") = await import("@/services/api");

    const result = await api.getListings({ sort: "best_match", page: 1 });

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("sort=best_match");
    expect(urls[urls.length - 1]).toContain("sort=newest");
    // priced + photo first, then priced, then priceless
    expect(result.listings.map((l) => l.id)).toEqual([3, 2, 1]);
    expect(result.total).toBe(3);

    // Remembered: the next page goes straight to newest.
    fetchMock.mockClear();
    await api.getListings({ sort: "best_match", page: 2 });
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("sort=best_match"))).toBe(true);
  });

  it("passes best_match through when the backend accepts it", async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve(page));
    vi.stubGlobal("fetch", fetchMock);
    const api: typeof import("@/services/api") = await import("@/services/api");

    const result = await api.getListings({ sort: "best_match", page: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("sort=best_match");
    // server order kept as-is
    expect(result.listings.map((l) => l.id)).toEqual([1, 2, 3]);
  });
});
