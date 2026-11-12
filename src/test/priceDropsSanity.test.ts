import { afterEach, describe, expect, it, vi } from "vitest";

/** getPriceDrops must never surface parse/unit-bug "cuts" (live −90% H100 case). */
describe("getPriceDrops sanity guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops unit mismatches, unconfirmed >50% cuts and lease takeovers; keeps real cuts", async () => {
    const items = [
      { listing: { id: 1, make: "Hyundai", model: "H100", year: 1992, district: "Gampaha" }, previous_price_lkr: 6_500_000, new_price_lkr: 650_000, drop_pct: 90 },
      { listing: { id: 2, make: "Bajaj", model: "CT100", year: 2025 }, previous_price_lkr: 470_000, new_price_lkr: 100_000, drop_pct: 78.7 },
      { listing: { id: 3, make: "Toyota", model: "Aqua", title: "Aqua lease take over" }, previous_price_lkr: 6_000_000, new_price_lkr: 4_200_000, drop_pct: 30 },
      { listing: { id: 4, make: "Toyota", model: "Vitz", district: "Sri Lanka" }, previous_price_lkr: 7_650_000, new_price_lkr: 7_250_000, drop_pct: 5.2 },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) }));
    const api = await import("@/services/api");
    const out = await api.getPriceDrops(7, 8);
    expect(out.map((d) => d.listing.id)).toEqual([4]);
    expect(out[0].drop_pct).toBe(5.2);
    // "Sri Lanka" is not a district
    expect(out[0].listing.district ?? null).toBeNull();
  });
});
