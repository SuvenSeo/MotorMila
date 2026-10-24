import { describe, expect, it } from "vitest";
import { summarizeFmv } from "@/lib/fmv";

describe("summarizeFmv", () => {
  it("labels below-market asks", () => {
    const s = summarizeFmv(4_500_000, 5_000_000);
    expect(s?.band).toBe("below");
    expect(s?.label).toMatch(/below FMV/i);
  });

  it("labels overpriced asks", () => {
    const s = summarizeFmv(6_000_000, 5_000_000);
    expect(s?.band).toBe("above");
    expect(s?.label).toMatch(/Overpriced/i);
  });

  it("returns null for missing inputs", () => {
    expect(summarizeFmv(0, 5_000_000)).toBeNull();
    expect(summarizeFmv(5_000_000, 0)).toBeNull();
  });
});

describe("summarizeFmv translation", () => {
  it("passes the band label through the translator with the percentage", () => {
    const calls: Array<[string, Record<string, string | number> | undefined]> = [];
    const t = (key: string, fallback?: string, vars?: Record<string, string | number>) => {
      calls.push([key, vars]);
      return `${key}:${vars?.pct ?? ""}`;
    };
    expect(summarizeFmv(4_500_000, 5_000_000, t)?.label).toBe("fmv.band.below:10");
    expect(summarizeFmv(5_000_000, 5_000_000, t)?.label).toBe("fmv.band.near:");
    expect(calls[0][0]).toBe("fmv.band.below");
  });

  it("keeps the English label without a translator", () => {
    expect(summarizeFmv(4_500_000, 5_000_000)?.label).toBe("Priced 10% below FMV");
    expect(summarizeFmv(5_000_000, 5_000_000)?.label).toBe("Near fair market value");
  });
});
