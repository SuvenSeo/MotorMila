import { describe, expect, it } from "vitest";
import type { CarListing } from "@/types/car";
import { estimateFromComps, positionBand, quizFlags, rangePosition } from "@/lib/estimateQuiz";

const comp = (id: number, price: number, year = 2018, km = 60000): CarListing =>
  ({ id, make: "Toyota", model: "Aqua", price_lkr: price, year, mileage_km: km, condition: "used", district: "Colombo" }) as unknown as CarListing;

describe("estimate quiz", () => {
  it("places answers in the range without changing it", () => {
    expect(rangePosition({ accidents: "none", service: "full", owners: "1" })).toBe("upper");
    expect(rangePosition({})).toBe("middle");
    expect(rangePosition({ accidents: "none", service: "full", flood: "yes" })).toBe("lower");
    expect(positionBand(90, 120, "lower")).toEqual({ from: 90, to: 100 });
    expect(positionBand(90, 120, "upper")).toEqual({ from: 110, to: 120 });
  });

  it("flags flood and major accidents as high severity", () => {
    const flags = quizFlags({ flood: "yes", accidents: "major", service: "none" });
    expect(flags.filter((f) => f.severity === "high").map((f) => f.key).sort()).toEqual(["accidents", "flood"]);
  });

  it("snapshot fallback returns a range from comps, or null when too thin", () => {
    const profile = { make: "Toyota", model: "Aqua", year: 2018, mileage_km: 60000, condition: "used" as const, district: "Colombo" };
    expect(estimateFromComps([comp(1, 6e6), comp(2, 6.2e6)], profile)).toBeNull();
    const comps = [5.6e6, 5.8e6, 6e6, 6.1e6, 6.3e6, 6.5e6].map((p, i) => comp(i + 1, p, 2017 + (i % 3)));
    const est = estimateFromComps(comps, profile);
    expect(est).not.toBeNull();
    expect(est!.source).toBe("snapshot");
    expect(est!.low).toBeLessThanOrEqual(est!.median);
    expect(est!.high).toBeGreaterThanOrEqual(est!.median);
    expect(est!.comparable_count).toBe(6);
  });
});
