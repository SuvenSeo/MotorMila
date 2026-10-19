import { describe, expect, it } from "vitest";
import {
  changeTone,
  cleanDistrict,
  computedDropPct,
  formatChangePct,
  formatLakhs,
  formatLkrWhole,
  isCountryLevelDistrict,
  isPlausiblePriceDrop,
  isUnitMismatch,
  isUsStyleVin,
  listingVin,
  looksLikeLeaseTakeover,
  paddedDomain,
  rejectPriceDrop,
} from "./dataSanity";

const drop = (prev: number, next: number, extra: Record<string, unknown> = {}) => ({
  previous_price_lkr: prev,
  new_price_lkr: next,
  drop_pct: computedDropPct(prev, next),
  ...extra,
});

describe("price-drop sanity guard", () => {
  it("rejects the live −90% Hyundai H100 cut (Rs 6.50M → 0.65M) as a unit mismatch", () => {
    expect(rejectPriceDrop(drop(6_500_000, 650_000))).toBe("unit_mismatch");
  });

  it("rejects lakhs-vs-rupees mismatches (65 lakhs parsed as Rs 65)", () => {
    expect(isUnitMismatch(6_500_000, 65)).toBe(true);
    expect(isUnitMismatch(6_500_000, 6_500)).toBe(true);
    expect(isUnitMismatch(6_500_000, 5_900_000)).toBe(false);
  });

  it("rejects unconfirmed drops over 50% (the −78.7% / −74.6% cases)", () => {
    expect(rejectPriceDrop(drop(470_000, 100_000))).toBe("unconfirmed_large_drop");
    expect(rejectPriceDrop(drop(1_000_000, 254_000))).toBe("unconfirmed_large_drop");
  });

  it("allows a >50% drop when confirmed by at least 2 points", () => {
    expect(isPlausiblePriceDrop(drop(1_000_000, 400_000, { confirmations: 2 }))).toBe(true);
    expect(isPlausiblePriceDrop(drop(1_000_000, 400_000, { confirmations: 1 }))).toBe(false);
  });

  it("keeps ordinary cuts", () => {
    expect(isPlausiblePriceDrop(drop(7_650_000, 7_250_000))).toBe(true);
    expect(isPlausiblePriceDrop(drop(12_000_000, 6_500_000))).toBe(true); // 45.8%
  });

  it("rejects lease takeovers", () => {
    expect(
      rejectPriceDrop(drop(6_000_000, 4_000_000, { listing: { title: "Toyota Aqua lease take over" } })),
    ).toBe("lease_takeover");
    expect(looksLikeLeaseTakeover("Leasing balance 2.1M, monthly rental 48,000")).toBe(true);
    expect(looksLikeLeaseTakeover("Toyota Aqua 2014, first owner")).toBe(false);
  });

  it("rejects invalid and non-drops", () => {
    expect(rejectPriceDrop(drop(0, 100))).toBe("invalid");
    expect(rejectPriceDrop(drop(100_000, 120_000))).toBe("not_a_drop");
  });

  it("computes drop % from the prices", () => {
    expect(computedDropPct(1_000_000, 900_000)).toBe(10);
    expect(computedDropPct(3_000_000, 2_870_000)).toBe(4.3);
    expect(computedDropPct(100, 200)).toBe(0);
  });
});

describe("district cleanup", () => {
  it("treats the country and island-wide labels as unknown", () => {
    for (const v of ["Sri Lanka", "sri lanka", "SriLanka", "LK", "Island-wide", "All Island", "", null, undefined]) {
      expect(isCountryLevelDistrict(v)).toBe(true);
      expect(cleanDistrict(v)).toBeNull();
    }
  });
  it("keeps real districts", () => {
    expect(cleanDistrict(" Colombo ")).toBe("Colombo");
    expect(cleanDistrict("Nuwara Eliya")).toBe("Nuwara Eliya");
  });
});

describe("US VIN gate", () => {
  it("accepts 17-char ISO VINs and rejects JDM chassis numbers", () => {
    expect(isUsStyleVin("1HGCM82633A004352")).toBe(true);
    expect(isUsStyleVin("NHP10-1234567")).toBe(false);
    expect(isUsStyleVin("ZVW30-1234567")).toBe(false);
    expect(isUsStyleVin("1HGCM82633A00435O")).toBe(false); // contains O
    expect(isUsStyleVin(null)).toBe(false);
  });
  it("reads vin/chassis fields off a listing", () => {
    expect(listingVin({ chassis_no: " NHP10-1 " })).toBe("NHP10-1");
    expect(listingVin({ vin: "1HGCM82633A004352" })).toBe("1HGCM82633A004352");
    expect(listingVin({})).toBeNull();
  });
});

describe("ticker / trend tone", () => {
  it("is stable under 1%, otherwise up/down", () => {
    expect(changeTone(0.4)).toBe("stable");
    expect(changeTone(-0.99)).toBe("stable");
    expect(changeTone(null)).toBe("stable");
    expect(changeTone(2.3)).toBe("up");
    expect(changeTone(-4.8)).toBe("down");
  });
  it("formats percent with sign and one decimal", () => {
    expect(formatChangePct(2.345)).toBe("+2.3%");
    expect(formatChangePct(-11.5)).toBe("−11.5%");
  });
  it("formats whole rupees with no cents", () => {
    expect(formatLkrWhole(477_589.37)).not.toMatch(/\.\d{2}$/);
    expect(formatLkrWhole(477_589.37)).toMatch(/477,589/);
  });
});

describe("chart scales", () => {
  it("does not force zero into the domain", () => {
    const d = paddedDomain([7.6, 7.7, 7.9, 8.0])!;
    expect(d[0]).toBeGreaterThan(5);
    expect(d[0]).toBeLessThan(7.6);
    expect(d[1]).toBeGreaterThan(8.0);
  });
  it("handles flat series and empty input", () => {
    const d = paddedDomain([5, 5, 5])!;
    expect(d[0]).toBeLessThan(5);
    expect(d[1]).toBeGreaterThan(5);
    expect(paddedDomain([])).toBeNull();
  });
  it("labels in lakhs", () => {
    expect(formatLakhs(7_650_000)).toBe("76.5 L");
    expect(formatLakhs(12_000_000)).toBe("12 Mn");
    expect(formatLakhs(450_000)).toBe("4.5 L");
    expect(formatLakhs(85_000)).toBe("85,000");
  });
});
