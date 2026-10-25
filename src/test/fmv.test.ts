import { describe, expect, it } from "vitest";
import { summarizeFmv } from "@/lib/fmv";
import { priceVerdict, verdictHeadline } from "@/lib/priceVerdict";

describe("summarizeFmv", () => {
  it("labels below-market asks with the shared verdict headline", () => {
    const s = summarizeFmv(4_000_000, 5_000_000);
    expect(s?.band).toBe("below");
    expect(s?.label).toBe("Priced 20% below typical");
  });

  it("labels above-market asks with the shared verdict headline", () => {
    const s = summarizeFmv(5_400_000, 5_000_000);
    expect(s?.band).toBe("above");
    expect(s?.label).toBe("Priced 8% above typical");
  });

  it("labels the near band without jargon", () => {
    expect(summarizeFmv(5_000_000, 5_000_000)?.label).toBe("Near typical price");
  });

  it("never says FMV, fair market value or Overpriced", () => {
    for (const asking of [3_400_000, 4_000_000, 4_800_000, 5_000_000, 5_300_000, 6_000_000, 7_500_000]) {
      const label = summarizeFmv(asking, 5_000_000)?.label ?? "";
      expect(label).not.toMatch(/FMV|fair market|overpriced/i);
    }
  });

  it("is exactly the verdict headline every other panel uses", () => {
    for (const asking of [3_000_000, 4_500_000, 5_000_000, 5_600_000]) {
      const v = priceVerdict({ asking, reference: 5_000_000 });
      expect(summarizeFmv(asking, 5_000_000)?.label).toBe(verdictHeadline(v));
    }
  });

  it("returns null for missing inputs", () => {
    expect(summarizeFmv(0, 5_000_000)).toBeNull();
    expect(summarizeFmv(5_000_000, 0)).toBeNull();
  });
});

describe("summarizeFmv translation", () => {
  it("passes the verdict keys through the translator with the percentage", () => {
    const calls: Array<[string, Record<string, string | number> | undefined]> = [];
    const t = (key: string, _fallback?: string, vars?: Record<string, string | number>) => {
      calls.push([key, vars]);
      return `${key}:${vars?.pct ?? ""}`;
    };
    expect(summarizeFmv(4_500_000, 5_000_000, t)?.label).toBe("verdict.below:10");
    expect(summarizeFmv(5_000_000, 5_000_000, t)?.label).toBe("deal.nearTypical:");
    expect(summarizeFmv(6_000_000, 5_000_000, t)?.label).toBe("verdict.above:20");
    expect(calls[0][0]).toBe("verdict.below");
  });
});
