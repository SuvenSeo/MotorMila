import { describe, expect, it } from "vitest";
import { parseFlexibleTime, daysSince, relativeAgo } from "@/lib/parseTime";
import { buildTrustReport } from "@/lib/trustSignals";
import { computeAffordability, buildAffordableSearchUrl, DEFAULT_AFFORDABILITY_ASSUMPTIONS } from "@/lib/affordability";
import { isMeaningfulDrop, summarizePricePoints, toPricePoints } from "@/lib/priceHistory";
import { formatSourceName, getSourceAttribution } from "@/lib/sourceAttribution";
import { maxPrincipalForInstalment } from "@/lib/cashToOwn";

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0); // 2026-10-19 17:30 SLT

describe("parseFlexibleTime", () => {
  it("parses the snapshot human format honouring the offset", () => {
    expect(parseFlexibleTime("Mon 2026-10-19 1:48 PM (UTC+05:30)")).toBe(Date.UTC(2026, 9, 19, 8, 18));
    expect(parseFlexibleTime("Sat 2026-10-10 12:05 AM (UTC+05:30)")).toBe(Date.UTC(2026, 9, 9, 18, 35));
  });
  it("parses ISO and rejects junk", () => {
    expect(parseFlexibleTime("2026-10-19T08:18:00Z")).toBe(Date.UTC(2026, 9, 19, 8, 18));
    expect(parseFlexibleTime("not a date")).toBeNull();
    expect(parseFlexibleTime(null)).toBeNull();
  });
  it("computes days and relative labels", () => {
    expect(daysSince("Mon 2026-10-12 5:30 PM (UTC+05:30)", NOW)).toBe(7);
    expect(relativeAgo("Mon 2026-10-19 3:30 PM (UTC+05:30)", NOW)).toBe("2h ago");
  });
});

describe("buildTrustReport", () => {
  const base = { id: 1, price_lkr: 9_000_000, market_median_lkr: 9_200_000, mileage_km: 60_000, year: 2018, source: "ikman", thumbnail_url: "x" };

  it("flags far-below-market prices as high risk, worded as a signal", () => {
    const r = buildTrustReport({ listing: { ...base, price_lkr: 5_500_000 }, related: [], now: NOW });
    const s = r.signals.find((x) => x.id === "price-far-below");
    expect(s?.level).toBe("high");
    expect(s?.detail).not.toMatch(/scam\b(?! pattern)/i);
    expect(r.summary).toMatch(/risk signal/);
  });

  it("detects advance-payment / abroad wording", () => {
    const r = buildTrustReport({
      listing: { ...base, description: "Urgent sale, I am going abroad. Pay advance first to book." },
      related: [],
      now: NOW,
    });
    expect(r.signals.some((s) => s.id === "scam-wording")).toBe(true);
  });

  it("flags odometer going down across linked listings, ignoring tiny typos", () => {
    const related = [
      { id: 2, source: "riyasewana", price_lkr: 9_100_000, mileage: 128_000, first_seen_at: "2026-06-01T00:00:00Z" },
    ];
    const r = buildTrustReport({ listing: { ...base, mileage_km: 74_000, first_seen_at: "2026-09-01T00:00:00Z" }, related, now: NOW });
    expect(r.signals.find((s) => s.id === "odometer-drop")?.level).toBe("high");

    const typo = buildTrustReport({
      listing: { ...base, mileage_km: 127_500, first_seen_at: "2026-09-01T00:00:00Z" },
      related,
      now: NOW,
    });
    expect(typo.signals.some((s) => s.id === "odometer-drop")).toBe(false);
  });

  it("says when cross-site data is unavailable instead of claiming none", () => {
    const r = buildTrustReport({ listing: base, related: null, now: NOW });
    expect(r.crossSiteAvailable).toBe(false);
    expect(r.signals.some((s) => s.id === "cross-site-none")).toBe(false);
  });

  it("is calm for an in-band listing", () => {
    const r = buildTrustReport({ listing: base, related: [], now: NOW });
    expect(r.highCount).toBe(0);
    expect(r.signals[r.signals.length - 1].level).toBe("ok");
  });
});

describe("computeAffordability", () => {
  it("respects the LTV cap and the monthly budget", () => {
    const r = computeAffordability(3_000_000, 85_000);
    // Registered cars (60% LTV) allow a higher price than unregistered (40%).
    expect(r.registered.maxPriceLkr).toBeGreaterThan(r.unregistered.maxPriceLkr);
    for (const b of [r.registered, r.unregistered]) {
      expect(b.monthlyLkr).toBeLessThanOrEqual(85_000);
      expect(b.downPaymentLkr + b.upfrontCostsLkr).toBeLessThanOrEqual(3_000_000);
    }
    const maxLoan = maxPrincipalForInstalment(85_000, DEFAULT_AFFORDABILITY_ASSUMPTIONS.annualRatePct, DEFAULT_AFFORDABILITY_ASSUMPTIONS.termYears)!;
    expect(r.registered.loanLkr).toBeLessThanOrEqual(maxLoan + 1);
  });

  it("falls back to cash-only when no monthly budget", () => {
    const r = computeAffordability(2_000_000, 0);
    expect(r.registered.loanLkr).toBe(0);
    expect(r.registered.maxPriceLkr).toBeLessThan(2_000_000);
    expect(r.registered.maxPriceLkr).toBeGreaterThan(1_700_000);
  });

  it("builds a filtered search URL", () => {
    expect(buildAffordableSearchUrl(6_500_000, { condition: "used" })).toBe("/?price_max=6500000&condition=used");
  });
});

describe("price history helpers", () => {
  it("summarises drops and ignores rounding edits", () => {
    const pts = toPricePoints([
      [9_100_000, "Sun 2026-08-09 9:17 AM (UTC+05:30)"],
      [8_700_000, "Tue 2026-08-11 4:55 PM (UTC+05:30)"],
    ]);
    const s = summarizePricePoints(pts);
    expect(s?.cuts).toBe(1);
    expect(isMeaningfulDrop(s)).toBe(true);
    const tiny = summarizePricePoints(toPricePoints([[9_000_000, "2026-08-01"], [8_990_000, "2026-08-02"]]));
    expect(isMeaningfulDrop(tiny)).toBe(false);
  });
});

describe("source attribution", () => {
  it("names the source and links safely", () => {
    expect(formatSourceName("riyasewana")).toBe("riyasewana");
    const a = getSourceAttribution({ source: "ikman", url: "javascript:alert(1)", detail_url: "https://ikman.lk/en/ad/x" });
    expect(a.sourceName).toBe("ikman");
    expect(a.href).toBe("https://ikman.lk/en/ad/x");
  });
});
