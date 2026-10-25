import { describe, expect, it } from "vitest";
import fixtures from "../../docs/price-verdict-fixtures.json";
import {
  MAX_PLAUSIBLE_GAP_PCT,
  askingPriceIssue,
  hasPlausibleStoredSignal,
  isPlaceholderPrice,
  listingRowVerdict,
  priceVerdict,
  resolveListingVerdict,
  verdictHeadline,
  withheldHeadline,
} from "@/lib/priceVerdict";
import { computeDealBadge } from "@/lib/dealBadge";
import { summarizeFmv } from "@/lib/fmv";
import { buildTrustReport } from "@/lib/trustSignals";
import { computeDealLadder } from "@/lib/dealLadder";
import { getDealTier } from "@/lib/dealTiers";
import { getListingDealLabel } from "@/lib/listing-card-meta";

interface FixtureCase {
  name: string;
  input: {
    asking?: number | null;
    reference?: number | null;
    comps?: number;
    confidence?: string;
    category?: string;
    model?: string;
    title?: string;
    secondary?: number;
  };
  expect: { status: "ok" | "withheld"; band?: string; pct?: number; verify_first?: boolean; reason?: string };
}

describe("priceVerdict — shared fixtures (backend + Android assert the same file)", () => {
  for (const c of (fixtures as { cases: FixtureCase[] }).cases) {
    it(c.name, () => {
      const v = priceVerdict({
        asking: c.input.asking,
        reference: c.input.reference,
        comps: c.input.comps,
        confidence: c.input.confidence,
        category: c.input.category,
        model: c.input.model,
        title: c.input.title,
        secondaryReference: c.input.secondary,
      });
      expect(v.status).toBe(c.expect.status);
      if (v.status === "ok") {
        expect(v.band).toBe(c.expect.band);
        expect(v.pct).toBe(c.expect.pct);
        expect(v.verifyFirst).toBe(Boolean(c.expect.verify_first));
      } else {
        expect(v.reason).toBe(c.expect.reason);
      }
    });
  }
});

describe("priceVerdict guards", () => {
  it("never yields NaN, negative or band-contradicting percentages", () => {
    for (let ratio = 0.3; ratio <= 1.8; ratio += 0.0137) {
      const v = priceVerdict({ asking: Math.round(5_000_000 * ratio), reference: 5_000_000, model: "Aqua", category: "cars" });
      if (v.status !== "ok") {
        expect(["implausible_gap"]).toContain(v.reason);
        continue;
      }
      expect(Number.isFinite(v.pct)).toBe(true);
      expect(v.pct).toBeGreaterThanOrEqual(0);
      expect(v.pct).toBeLessThanOrEqual(MAX_PLAUSIBLE_GAP_PCT);
      if (v.band === "fair") expect(v.pct).toBeLessThan(8);
      if (v.band === "below") expect(v.pct).toBeGreaterThanOrEqual(5);
      if (v.band === "above") expect(v.pct).toBeGreaterThanOrEqual(8);
    }
  });

  it("knows placeholder and lucky-number prices apart", () => {
    expect(isPlaceholderPrice(123456)).toBe(true);
    expect(isPlaceholderPrice(1111111)).toBe(true);
    expect(isPlaceholderPrice(7777777)).toBe(false);
    expect(askingPriceIssue(0)).toBe("no_price");
    expect(askingPriceIssue(Number.NaN)).toBe("no_price");
  });

  it("drops the implausible stored signal at the data boundary (listing 680073)", () => {
    expect(
      hasPlausibleStoredSignal({ price_lkr: 735_000, market_median_lkr: 7_201_142.86, deal_score: 89.8, model: "Other", vehicle_category: "motorbikes" }),
    ).toBe(false);
    expect(hasPlausibleStoredSignal({ price_lkr: 5_000_000, market_median_lkr: 5_200_000, deal_score: 3.8, model: "Aqua" })).toBe(true);
    expect(hasPlausibleStoredSignal({ price_lkr: 5_000_000, deal_score: 89.8 })).toBe(false);
    expect(hasPlausibleStoredSignal({ price_lkr: 5_000_000 })).toBe(true);
  });
});

describe("one verdict, every surface agrees", () => {
  const t = (_k: string, fallback?: string, vars?: Record<string, string | number>) =>
    (fallback ?? "").replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? ""));

  it("listing 680073: Trust Check, FMV card, badge and ladder all stand down together", () => {
    const listing = {
      id: 680073,
      title: "Hero-Honda Hunk Motorbike",
      make: "Honda",
      model: "Other",
      year: 2026,
      vehicle_category: "motorbikes",
      price_lkr: 735_000,
      market_median_lkr: 7_201_142.86,
      deal_score: 89.8,
    };
    // Old live backend payload: "Overpriced 498% vs FMV" off a 123k estimate.
    const oldFmv = { fmv_lkr: 122_954.2, sample_size: 80, confidence: "high", method: "ols_comps" };
    const v = resolveListingVerdict(listing, oldFmv);
    expect(v.status).toBe("withheld");
    const trust = buildTrustReport({ listing, related: [], verdict: v });
    const price = trust.signals.find((s) => s.id.startsWith("price-"));
    expect(price?.id).toBe("price-no-band");
    expect(price?.title).not.toMatch(/%/);
    expect(computeDealBadge({ askingLkr: 735_000, fmvLkr: 122_954, verdict: v }).kind).toBe("none");
    expect(computeDealLadder({ askingPrice: 735_000, marketMedianLkr: 122_954, verdict: v })).toBeNull();
    expect(verdictHeadline(v, t)).not.toMatch(/\d/);
    // Card path (row only) stands down too.
    expect(listingRowVerdict(listing).status).toBe("withheld");
  });

  it("bands, percent and tone match across badge, FMV card, Trust Check, tier and label", () => {
    for (const asking of [3_000_000, 4_000_000, 4_600_000, 4_760_000, 5_000_000, 5_390_000, 5_400_000, 6_500_000, 7_900_000]) {
      const listing = { price_lkr: asking, market_median_lkr: 5_000_000, model: "Aqua", vehicle_category: "cars", title: "Toyota Aqua 2016" };
      const v = listingRowVerdict(listing);
      if (v.status !== "ok") throw new Error(`expected ok for ${asking}`);
      const badge = computeDealBadge({ askingLkr: asking, fmvLkr: 5_000_000, verdict: v });
      const fmv = summarizeFmv(asking, 5_000_000, t, { model: "Aqua", category: "cars" });
      const trust = buildTrustReport({ listing, related: [], verdict: v });
      const sig = trust.signals.find((s) => s.id.startsWith("price-"))!;
      const ladder = computeDealLadder({ askingPrice: asking, marketMedianLkr: 5_000_000, verdict: v })!;
      const score = -v.gapPct;
      const tier = getDealTier(score);
      const label = getListingDealLabel(score);
      expect(fmv?.band).toBe(v.band);
      expect(fmv?.pct).toBe(v.pct);
      if (v.band === "below") {
        expect(["below", "verify"]).toContain(badge.kind);
        expect(sig.title).toContain(`${v.pct}% below`);
        expect(ladder.band).toBe("good_deal");
        expect(["steal", "great"]).toContain(tier);
        expect(label).toBe("Good Deal");
      } else if (v.band === "above") {
        expect(badge.kind).toBe("above");
        expect(sig.title).toContain(`${v.pct}% above`);
        expect(ladder.band).toBe("overpriced");
        expect(tier).toBe("overpriced");
        expect(label).toBe("Overpriced");
      } else {
        expect(badge.kind).toBe("fair");
        expect(sig.id).toBe("price-in-band");
        expect(ladder.band).toBe("fair");
        expect(tier).toBe("fair");
        expect(label).toBe("Fair Price");
      }
      if (v.verifyFirst) {
        expect(badge.kind).toBe("verify");
        expect(sig.level).toBe("high");
      }
    }
  });

  it("FMV and the stored median pointing opposite ways withholds on the detail page", () => {
    const listing = { price_lkr: 6_290_000, market_median_lkr: 7_175_000, model: "Wagon R", vehicle_category: "cars" };
    const v = resolveListingVerdict(listing, { fmv_lkr: 5_504_988, sample_size: 36, confidence: "high", method: "ols_comps" });
    expect(v.status).toBe("withheld");
    if (v.status === "withheld") expect(v.reason).toBe("estimates_disagree");
  });

  it("a backend-withheld verdict wins over the numbers", () => {
    const listing = { price_lkr: 5_000_000, market_median_lkr: 5_200_000, model: "Aqua", vehicle_category: "cars" };
    const v = resolveListingVerdict(listing, { fmv_lkr: null, sample_size: 3, confidence: "low", method: "adjusted_median", verdict: { status: "withheld", reason: "thin_comps" } });
    expect(v.status).toBe("withheld");
    expect(withheldHeadline(v.status === "withheld" ? v.group : "insufficient_data", t)).toBe("Not enough comparable data");
  });

  it("FMV not loaded: the detail page uses exactly the card's reference", () => {
    const listing = { price_lkr: 4_500_000, market_median_lkr: 5_000_000, model: "Aqua", vehicle_category: "cars" };
    expect(resolveListingVerdict(listing, null)).toEqual(listingRowVerdict(listing));
  });
});
