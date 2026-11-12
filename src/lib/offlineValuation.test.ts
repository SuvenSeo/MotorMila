/** Parity tests: the offline valuation engine must match backend/fmv.py. */
import { describe, expect, it } from "vitest";
import type { CarListing } from "@/types/car";
import { predictFmvOffline, summarizeSparkline } from "./offlineValuation";

let nextId = 1;
function mk(overrides: Partial<CarListing>): CarListing {
  return {
    id: nextId++,
    source: "test",
    source_id: `t-${nextId}`,
    make: "Toyota",
    model: "Aqua",
    year: 2017,
    condition: "used",
    mileage_km: 80000,
    transmission: "automatic",
    fuel_type: "hybrid",
    body_type: "hatchback",
    price_lkr: 8450000,
    deal_score: 8.5,
    district: "Colombo",
    province: "Western",
    is_dealer: false,
    title: "Toyota Aqua",
    detail_url: "/listing/1",
    scraped_at: "2026-09-20T00:00:00Z",
    first_seen_at: "2026-09-01T00:00:00Z",
    ...overrides,
  } as CarListing;
}

function compCatalog(): CarListing[] {
  const comps: CarListing[] = [];
  const specs: Array<[number, number, number]> = [
    [2016, 95000, 8100000],
    [2016, 70000, 8600000],
    [2017, 85000, 8400000],
    [2017, 60000, 8900000],
    [2017, 100000, 8000000],
    [2018, 55000, 9100000],
    [2018, 75000, 8700000],
    [2016, 110000, 7900000],
    [2017, 90000, 8300000],
    [2018, 65000, 9000000],
  ];
  for (const [year, mileage_km, price_lkr] of specs) {
    comps.push(mk({ year, mileage_km, price_lkr, district: "Colombo" }));
  }
  return comps;
}

describe("predictFmvOffline", () => {
  it("runs the OLS path on 10 comps and clamps inside the market", () => {
    const catalog = compCatalog();
    const subject = mk({ id: 9999, price_lkr: 8450000 });
    const res = predictFmvOffline([...catalog, subject], subject);
    expect(res.method).toBe("ols_comps");
    expect(res.sample_count).toBe(10);
    expect(res.confidence).toBe("medium");
    expect(res.fmv_lkr).not.toBeNull();
    // IQR soft-clamp: q1=8.1M*0.75=6.075M .. q3=8.9M*1.25=11.125M
    expect(res.fmv_lkr as number).toBeGreaterThan(6000000);
    expect(res.fmv_lkr as number).toBeLessThan(11200000);
    expect(res.offline).toBe(true);
    expect(res.method_breakdown?.final_fmv_lkr).toBe(res.fmv_lkr);
  });

  it("falls back to the stored cohort median with no comps", () => {
    const subject = mk({ id: 9999, make: "Unobtanium", model: "Zzz", price_lkr: 5_100_000, market_median_lkr: 5000000 });
    const res = predictFmvOffline([subject], subject);
    expect(res.method).toBe("cohort_median");
    // Uncorroborated: kept as the raw estimate, never shown as the FMV.
    expect(res.estimate_lkr).toBe(5000000);
    expect(res.fmv_lkr).toBeNull();
    expect(res.confidence).toBe("low");
    expect(res.verdict?.status).toBe("withheld");
  });

  it("uses the corroborated stored median as the FMV (card and detail share one number)", () => {
    const catalog = compCatalog();
    const subject = mk({ id: 9998, price_lkr: 8_000_000, market_median_lkr: 8_500_000 });
    const res = predictFmvOffline([...catalog, subject], subject);
    expect(res.method).toBe("cohort_median");
    expect(res.corroborated_by_comps).toBe(true);
    expect(res.fmv_lkr).toBe(8_500_000);
    expect(res.band).toBe("below");
  });

  it("keeps comps in the same vehicle category and nearest years", () => {
    const bikes = Array.from({ length: 10 }, (_, i) => mk({ make: "Honda", model: "Hunk", vehicle_category: "motorbikes", year: 2018, price_lkr: 700_000 + i * 10_000, mileage_km: null }));
    const cars = Array.from({ length: 10 }, () => mk({ make: "Honda", model: "Hunk", vehicle_category: "cars", year: 2018, price_lkr: 7_000_000, mileage_km: null }));
    const subject = mk({ id: 9997, make: "Honda", model: "Hunk", vehicle_category: "motorbikes", year: 2018, price_lkr: 735_000, mileage_km: null, market_median_lkr: undefined });
    const res = predictFmvOffline([...bikes, ...cars, subject], subject);
    expect(res.sample_size).toBe(10);
    expect(res.fmv_lkr as number).toBeGreaterThan(600_000);
    expect(res.fmv_lkr as number).toBeLessThan(900_000);
  });

  it("reports insufficient_data with no comps and no stored median", () => {
    const subject = mk({ id: 9999, make: "Unobtanium", model: "Zzz" });
    const res = predictFmvOffline([subject], subject);
    expect(res.method).toBe("insufficient_data");
    expect(res.fmv_lkr).toBeNull();
    expect(res.confidence).toBe("none");
  });

  it("bands a cheap listing below FMV", () => {
    const catalog = compCatalog();
    const subject = mk({ id: 9999, price_lkr: 7000000 });
    const res = predictFmvOffline([...catalog, subject], subject);
    expect(res.band).toBe("below");
    expect(res.delta_pct as number).toBeLessThanOrEqual(-5);
  });
});

describe("summarizeSparkline", () => {
  it("mirrors price_history.py cut/raise/range math", () => {
    const res = summarizeSparkline(7, [
      { price_lkr: 9000000, scraped_at: "2026-09-01T00:00:00Z" },
      { price_lkr: 8700000, scraped_at: "2026-09-05T00:00:00Z" },
      { price_lkr: 8900000, scraped_at: "2026-09-10T00:00:00Z" },
      { price_lkr: 8450000, scraped_at: "2026-09-15T00:00:00Z" },
    ]);
    expect(res.listing_id).toBe(7);
    expect(res.points).toHaveLength(4);
    expect(res.first_price_lkr).toBe(9000000);
    expect(res.current_price_lkr).toBe(8450000);
    expect(res.change_pct).toBeCloseTo(-6.1, 1);
    expect(res.cut_count).toBe(2);
    expect(res.raise_count).toBe(1);
    expect(res.highest_price_lkr).toBe(9000000);
    expect(res.lowest_price_lkr).toBe(8450000);
    expect(res.last_change_at).toBe("2026-09-15T00:00:00Z");
    expect(res.tracked_points).toBe(4);
  });
});
