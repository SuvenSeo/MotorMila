import { describe, expect, it } from "vitest";
import { nearbyDistricts, paginationItems, widenPrice } from "@/lib/searchSuggestions";
import { buildPriceHistogram, priceToStepIndex, stepIndexToPrice, PRICE_STEPS } from "@/lib/priceSteps";

describe("search empty-state helpers", () => {
  it("suggests the closest districts", () => {
    const near = nearbyDistricts("Colombo");
    expect(near).toHaveLength(3);
    expect(near).toContain("Gampaha");
    expect(near).not.toContain("Colombo");
    expect(nearbyDistricts("colombo")).toEqual(near);
    expect(nearbyDistricts(undefined)).toEqual([]);
  });

  it("widens price by ~20% rounded to lakhs", () => {
    expect(widenPrice(5_000_000, 7_500_000)).toEqual({ price_min: 4_000_000, price_max: 9_000_000 });
    expect(widenPrice(undefined, 3_000_000)).toEqual({ price_min: undefined, price_max: 3_600_000 });
  });

  it("builds compact pagination", () => {
    expect(paginationItems(1, 3)).toEqual([1, 2, 3]);
    expect(paginationItems(5, 20)).toEqual([1, "gap", 4, 5, 6, "gap", 20]);
    expect(paginationItems(1, 20)).toEqual([1, 2, "gap", 20]);
  });
});

describe("price slider steps", () => {
  it("maps prices to lakh steps and back", () => {
    expect(stepIndexToPrice(priceToStepIndex(8_500_000, "min"))).toBe(8_500_000);
    expect(priceToStepIndex(undefined, "max")).toBe(PRICE_STEPS.length - 1);
    expect(priceToStepIndex(1, "min")).toBe(0);
  });

  it("bins prices into slider segments", () => {
    const bins = buildPriceHistogram([600_000, 7_200_000, 7_300_000, 250_000_000]);
    expect(bins.reduce((a, b) => a + b, 0)).toBe(4);
    expect(bins[bins.length - 1]).toBe(1);
  });
});
