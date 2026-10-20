import { describe, expect, it } from "vitest";
import { estimateListingMonthly, formatMonthlyLkr } from "@/lib/listingFinance";
import { monthlyPaymentForPrincipal } from "@/lib/cashToOwn";

describe("estimateListingMonthly", () => {
  it("uses 60% LTV for a registered car used more than a year", () => {
    const e = estimateListingMonthly({ priceLkr: 8_000_000, condition: "used", year: 2017, nowYear: 2026 });
    expect(e?.ltvPct).toBe(60);
    expect(e?.monthlyLkr).toBe(Math.round(monthlyPaymentForPrincipal(4_800_000, 15, 5)));
  });

  it("uses 40% LTV for unregistered / reconditioned and brand-new", () => {
    expect(estimateListingMonthly({ priceLkr: 8_000_000, condition: "reconditioned", year: 2020, nowYear: 2026 })?.ltvPct).toBe(40);
    expect(estimateListingMonthly({ priceLkr: 8_000_000, condition: "brand_new", year: 2026, nowYear: 2026 })?.ltvPct).toBe(40);
    expect(estimateListingMonthly({ priceLkr: 8_000_000, condition: "used", year: 2026, nowYear: 2026 })?.ltvPct).toBe(40);
  });

  it("returns null for lease takeovers and unusable prices", () => {
    expect(estimateListingMonthly({ priceLkr: 8_000_000, condition: "used", year: 2017, isLeaseTakeover: true })).toBeNull();
    expect(estimateListingMonthly({ priceLkr: null })).toBeNull();
    expect(estimateListingMonthly({ priceLkr: 50_000 })).toBeNull();
  });

  it("formats rounded rupees", () => {
    expect(formatMonthlyLkr(114_191)).toBe("Rs 114,000");
    expect(formatMonthlyLkr(114_300)).toBe("Rs 114,500");
  });
});
