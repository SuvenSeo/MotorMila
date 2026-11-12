import { describe, expect, it } from "vitest";
import { priceVerdict, resolveListingVerdict, verdictHeadline, withheldVerdictDetail, withheldVerdictHeadline } from "@/lib/priceVerdict";
import { buildTrustReport } from "@/lib/trustSignals";

describe("withheld wording", () => {
  it("an \"Other\" model says the model is unspecified, not that comparables are missing", () => {
    const v = priceVerdict({ asking: 735_000, reference: 650_000, model: "Other", category: "motorbikes" });
    expect(v.status).toBe("withheld");
    if (v.status !== "withheld") return;
    expect(v.reason).toBe("generic_model");
    expect(withheldVerdictHeadline(v)).toBe("Model not specified in the ad");
    expect(withheldVerdictDetail(v)).toMatch(/“Other”/);
    expect(withheldVerdictDetail(v)).not.toMatch(/enough similar ads/i);
    expect(verdictHeadline(v)).toBe("Model not specified in the ad");
  });

  it("a server-withheld generic_model (680073 shape) keeps its reason on the detail page", () => {
    const v = resolveListingVerdict(
      { price_lkr: 735_000, market_median_lkr: 7_200_000, model: "Other", vehicle_category: "motorbikes", title: "Honda Other 2026" },
      { fmv_lkr: 122_954, sample_size: 12, confidence: "medium", method: "comps", verdict: { status: "withheld", reason: "generic_model" } },
    );
    expect(v.status === "withheld" && v.reason).toBe("generic_model");
  });

  it("thin comps keep the generic not-enough-data copy", () => {
    const v = priceVerdict({ asking: 5_000_000, reference: 5_200_000, comps: 2 });
    if (v.status !== "withheld") throw new Error("expected withheld");
    expect(withheldVerdictHeadline(v)).toBe("Not enough comparable data");
  });
});

describe("Trust Check severity for a withheld price", () => {
  const base = { model: "Wagon", vehicle_category: "cars", title: "Suzuki Wagon R 2018", year: 2018, source: "ikman", thumbnail_url: "x" };

  it("\"Price doesn't line up\" is Worth checking, never below a lesser note like missing mileage (628180)", () => {
    // Detail page with the old backend: FMV 5.50 Mn says above, stored median 7.17 Mn says below.
    const listing = { ...base, price_lkr: 6_290_000, market_median_lkr: 7_170_000, mileage_km: null };
    const verdict = resolveListingVerdict(listing, { fmv_lkr: 5_500_000, sample_size: 20, confidence: "medium", method: "comps" });
    expect(verdict.status === "withheld" && verdict.reason).toBe("estimates_disagree");
    const report = buildTrustReport({ listing, related: [], verdict });
    const price = report.signals.find((s) => s.id === "price-no-band")!;
    expect(price.title).toBe("Price doesn't line up with comparable ads");
    expect(price.level).toBe("medium");
    const rank = { high: 0, medium: 1, info: 2, ok: 3 } as const;
    for (const s of report.signals) {
      if (s.id !== price.id && s.level !== "high") expect(rank[s.level]).toBeGreaterThanOrEqual(rank[price.level]);
    }
    expect(report.mediumCount).toBeGreaterThanOrEqual(1);
  });

  it("not-enough-data stays Good to know", () => {
    const listing = { ...base, price_lkr: 6_290_000, market_median_lkr: null, mileage_km: 60_000 };
    const report = buildTrustReport({ listing, related: [], verdict: priceVerdict({ asking: 6_290_000, reference: null }) });
    expect(report.signals.find((s) => s.id === "price-no-band")?.level).toBe("info");
  });

  it("Trust Check copy never says \"the car\"", () => {
    const listing = { ...base, vehicle_category: "motorbikes", price_lkr: 300_000, market_median_lkr: 600_000, mileage_km: 1_000, year: 2010, description: "advance payment required first, going abroad" };
    const report = buildTrustReport({
      listing,
      related: [{ id: 2, source: "riyasewana", price_lkr: 400_000, mileage: 30_000, first_seen_at: "2024-01-01" }],
      now: Date.parse("2026-10-25"),
    });
    for (const s of report.signals) expect(`${s.title} ${s.detail}`).not.toMatch(/\bthe car\b|\bsame car\b|\bthis car\b|steering wheel and/i);
  });
});
