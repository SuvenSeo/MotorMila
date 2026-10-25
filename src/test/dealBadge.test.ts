import { describe, expect, it } from "vitest";
import {
  computeDealBadge,
  dealBadgeLabel,
  formatLkrShort,
  DEAL_BADGE_CLASSES,
  DEAL_SOFT_CLASSES,
} from "@/lib/dealBadge";

const t = (_k: string, fallback?: string, vars?: Record<string, string | number>) =>
  (fallback ?? "").replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? ""));

describe("computeDealBadge", () => {
  it("reports the rupee gap below typical", () => {
    const b = computeDealBadge({ askingLkr: 7_580_000, fmvLkr: 8_000_000, confidence: "high", compsCount: 40 });
    expect(b.kind).toBe("below");
    expect(b.gapLkr).toBe(420_000);
    expect(dealBadgeLabel(b, t)).toBe("Rs 0.42 Mn below typical");
  });

  it("calls near-FMV asks fair and expensive asks above", () => {
    expect(computeDealBadge({ askingLkr: 8_100_000, fmvLkr: 8_000_000 }).kind).toBe("fair");
    expect(computeDealBadge({ askingLkr: 7_700_000, fmvLkr: 8_000_000 }).kind).toBe("fair");
    const above = computeDealBadge({ askingLkr: 9_000_000, fmvLkr: 8_000_000 });
    expect(above.kind).toBe("above");
    expect(dealBadgeLabel(above, t)).toBe("Rs 1 Mn above typical");
  });

  it("turns very cheap outliers amber, never green", () => {
    const b = computeDealBadge({ askingLkr: 4_800_000, fmvLkr: 8_000_000, confidence: "high", compsCount: 80 });
    expect(b.kind).toBe("verify");
    expect(dealBadgeLabel(b, t)).toBe("Unusually low — verify first");
    expect(DEAL_BADGE_CLASSES.verify).toMatch(/deal-caution/);
    expect(DEAL_BADGE_CLASSES.verify).not.toMatch(/emerald|green|deal-good/);
    expect(DEAL_SOFT_CLASSES.verify).not.toMatch(/emerald|green|deal-good/);
  });

  it("shows no badge on a low-confidence / thin estimate (the verdict is withheld)", () => {
    expect(computeDealBadge({ askingLkr: 7_000_000, fmvLkr: 8_000_000, confidence: "low" }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 7_000_000, fmvLkr: 8_000_000, confidence: "none" }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 7_000_000, fmvLkr: 8_000_000, compsCount: 2 }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 8_000_000, fmvLkr: 8_000_000, confidence: "low" }).kind).toBe("none");
  });

  it("never rates an implausible gap, a placeholder or a parts/rental ad", () => {
    expect(computeDealBadge({ askingLkr: 735_000, fmvLkr: 7_201_142 }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 30_000_000, fmvLkr: 8_000_000 }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 1_234_567, fmvLkr: 1_300_000 }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 5_000_000, fmvLkr: 8_000_000, title: "Toyota Axio for parts" }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 5_000_000, fmvLkr: 5_200_000, title: "Prius for rent" }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 5_000_000, fmvLkr: 5_200_000, model: "Other" }).kind).toBe("none");
  });

  it("does not penalise unknown confidence (cards have only the median)", () => {
    expect(computeDealBadge({ askingLkr: 7_000_000, fmvLkr: 8_000_000 }).kind).toBe("below");
  });

  it("gives lease takeovers no deal call", () => {
    const b = computeDealBadge({ askingLkr: 2_175_000, fmvLkr: 8_000_000, isLeaseTakeover: true });
    expect(b.kind).toBe("lease");
    expect(b.gapLkr).toBe(0);
    expect(dealBadgeLabel(b, t)).toBe("Lease takeover — price shown isn't full price");
  });

  it("keeps safety labels when the rating is not allowed, hides the rest", () => {
    expect(computeDealBadge({ askingLkr: 7_000_000, fmvLkr: 8_000_000, ratingAllowed: false }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 4_000_000, fmvLkr: 8_000_000, ratingAllowed: false }).kind).toBe("verify");
    expect(
      computeDealBadge({ askingLkr: 3_000_000, fmvLkr: 8_000_000, ratingAllowed: false, isLeaseTakeover: true }).kind,
    ).toBe("lease");
  });

  it("returns none without usable numbers", () => {
    expect(computeDealBadge({ askingLkr: null, fmvLkr: 8_000_000 }).kind).toBe("none");
    expect(computeDealBadge({ askingLkr: 8_000_000, fmvLkr: 0 }).kind).toBe("none");
    expect(dealBadgeLabel({ kind: "none", gapLkr: 0, gapPctBelow: 0 }, t)).toBeNull();
  });
});

describe("formatLkrShort", () => {
  it("formats gaps in millions only", () => {
    expect(formatLkrShort(420_000)).toBe("Rs 0.42 Mn");
    expect(formatLkrShort(1_000_000)).toBe("Rs 1 Mn");
    expect(formatLkrShort(12_500_000)).toBe("Rs 12.5 Mn");
    expect(formatLkrShort(45_000)).toBe("Rs 0.045 Mn");
    expect(formatLkrShort(-300_000)).toBe("Rs 0.3 Mn");
  });
});
