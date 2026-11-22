import { describe, expect, it } from "vitest";
import {
  changeOverMonths,
  daysSince,
  formatSignedPct,
  freshness,
  isThinSample,
  momentum,
  movingAverage,
  normalize,
  pctChange,
  percentileRank,
  priceBands,
  pricePosition,
  rankOf,
  sparkValues,
  trendChange,
} from "@/lib/proAnalytics";

describe("pctChange", () => {
  it("returns a signed percentage against the previous value", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(90, 100)).toBeCloseTo(-10);
  });

  it("refuses to invent a change from unusable inputs", () => {
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(100, null)).toBeNull();
    expect(pctChange(Number.NaN, 10)).toBeNull();
  });
});

describe("percentileRank / rankOf", () => {
  const sample = [5, 10, 15, 20, 25];

  it("places a mid value at the middle of the sample", () => {
    expect(percentileRank(15, sample)).toBeCloseTo(50);
  });

  it("splits ties instead of picking a side", () => {
    expect(percentileRank(15, [15, 15, 15, 15, 15])).toBeCloseTo(50);
  });

  it("ranks 1 as the largest value", () => {
    expect(rankOf(25, sample)).toEqual({ rank: 1, total: 5 });
    expect(rankOf(5, sample)).toEqual({ rank: 5, total: 5 });
  });

  it("returns null under a two-value sample", () => {
    expect(percentileRank(5, [5])).toBeNull();
    expect(rankOf(5, [])).toBeNull();
  });
});

describe("pricePosition", () => {
  it("normalises inside the band and clamps outside it", () => {
    expect(pricePosition(150, 100, 200)).toBeCloseTo(0.5);
    expect(pricePosition(50, 100, 200)).toBe(0);
    expect(pricePosition(300, 100, 200)).toBe(1);
  });

  it("needs a real range", () => {
    expect(pricePosition(100, 100, 100)).toBeNull();
    expect(pricePosition(null, 100, 200)).toBeNull();
  });
});

describe("momentum", () => {
  it("treats small moves as flat", () => {
    expect(momentum(1.2)).toBe("flat");
    expect(momentum(-1.4)).toBe("flat");
    expect(momentum(2)).toBe("rising");
    expect(momentum(-2)).toBe("falling");
    expect(momentum(null)).toBeNull();
  });
});

describe("trendChange / changeOverMonths", () => {
  const points = [
    { month: "2026-01", median_price_lkr: 100, listing_count: 10 },
    { month: "2026-02", median_price_lkr: null, listing_count: 8 },
    { month: "2026-03", median_price_lkr: 120, listing_count: 12 },
    { month: "2026-04", median_price_lkr: 110, listing_count: 14 },
  ];

  it("measures the oldest usable point to the newest", () => {
    const change = trendChange(points);
    expect(change?.pct).toBeCloseTo(10);
    expect(change?.months).toBe(2);
    expect(change?.fromMonth).toBe("2026-01");
  });

  it("needs two usable points", () => {
    expect(trendChange([points[0]])).toBeNull();
    expect(trendChange([])).toBeNull();
  });

  it("compares over the trailing window when asked", () => {
    const indexPoints = [
      { period: "2026-01", median_price_lkr: 100 },
      { period: "2026-02", median_price_lkr: 110 },
      { period: "2026-03", median_price_lkr: 121 },
    ];
    expect(changeOverMonths(indexPoints, 1)).toBeCloseTo(10);
    expect(changeOverMonths(indexPoints, null)).toBeCloseTo(21);
  });
});

describe("sparkValues", () => {
  it("drops gaps so a missing month never draws as zero", () => {
    expect(sparkValues([{ month: "2026-01", median_price_lkr: 5 }, { month: "2026-02", median_price_lkr: null }])).toEqual([5]);
  });
});

describe("priceBands", () => {
  it("splits a sample into ordered bands that account for every value", () => {
    const bands = priceBands([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bands).toHaveLength(5);
    expect(bands.reduce((sum, band) => sum + band.count, 0)).toBe(10);
    expect(bands[0].low_lkr).toBe(1);
    expect(bands[4].high_lkr).toBe(10);
  });

  it("returns nothing for an empty sample", () => {
    expect(priceBands([null, undefined])).toEqual([]);
  });
});

describe("isThinSample", () => {
  it("flags lanes under the threshold", () => {
    expect(isThinSample(4)).toBe(true);
    expect(isThinSample(5)).toBe(false);
    expect(isThinSample(null)).toBe(true);
  });
});

describe("daysSince / freshness", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");

  it("counts whole days", () => {
    expect(daysSince("2026-11-20T12:00:00Z", now)).toBe(2);
    expect(daysSince("2026-11-22T09:00:00Z", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
  });

  it("maps age to a trust state", () => {
    expect(freshness("2026-11-22T09:00:00Z", now)).toBe("live");
    expect(freshness("2026-11-21T09:00:00Z", now)).toBe("fresh");
    expect(freshness("2026-11-10T09:00:00Z", now)).toBe("stale");
    expect(freshness(null, now)).toBe("unknown");
  });
});

describe("formatting helpers", () => {
  it("always signs a percentage", () => {
    expect(formatSignedPct(3.456)).toBe("+3.5%");
    expect(formatSignedPct(-3.456)).toBe("−3.5%");
    expect(formatSignedPct(0)).toBe("0.0%");
    expect(formatSignedPct(null)).toBeNull();
  });
});

describe("normalize / movingAverage", () => {
  it("keeps a flat series mid-height instead of dividing by zero", () => {
    expect(normalize([7, 7, 7])).toEqual([0.5, 0.5, 0.5]);
  });

  it("shortens rather than pads the average", () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1.5, 2.5, 3.5]);
  });
});
