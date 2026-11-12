import { formatLkrCompact } from "@/lib/price";
import { priceVerdict, type PriceContext, type PriceVerdict } from "@/lib/priceVerdict";
/**
 * Deal badge for listing cards and detail — a VIEW of the one price verdict
 * (src/lib/priceVerdict.ts), never a second rule set.
 *
 * Compares the asking price with the FMV (cohort/model estimate of typical
 * *asking* prices — never "market value" or a sale price) and turns the gap
 * into a rupee figure in millions ("Rs 0.42 Mn below typical").
 *
 * Honesty rules (all from the verdict):
 * - Lease takeovers get no deal call at all (the price isn't the full price).
 * - A withheld verdict (weak estimate, implausible gap, placeholder / parts /
 *   rental price…) shows no badge rather than a fake-looking one.
 * - Deep discounts (≥ 35 % below) are amber "Unusually low — verify first",
 *   never green: the classic bait-price / advance-fee scam shape.
 */

export type DealBadgeKind = "below" | "fair" | "above" | "verify" | "lease" | "none";
export type DealConfidence = "high" | "medium" | "low" | "none";

export { VERDICT_BELOW_PCT as DEAL_BELOW_PCT, VERDICT_ABOVE_PCT as DEAL_ABOVE_PCT, VERIFY_BELOW_PCT, MIN_COMPS as MIN_COMPS_FOR_GREEN } from "@/lib/priceVerdict";

export interface DealBadgeInput extends PriceContext {
  askingLkr: number | null | undefined;
  fmvLkr: number | null | undefined;
  /** FMV confidence when known (detail page). Unknown (card) is not penalised. */
  confidence?: DealConfidence | null;
  /** Number of comparable listings behind the FMV, when known. */
  compsCount?: number | null;
  isLeaseTakeover?: boolean;
  /**
   * False when the server suppressed the rating or the plan doesn't include
   * deal calls. Only safety labels (verify / lease) are shown then.
   */
  ratingAllowed?: boolean;
  /** The page's already-resolved verdict (detail page) — wins over the numbers above. */
  verdict?: PriceVerdict | null;
}

export interface DealBadge {
  kind: DealBadgeKind;
  /** Absolute rupee gap between asking and FMV (0 for lease/none). */
  gapLkr: number;
  /** Positive = asking is below FMV. */
  gapPctBelow: number;
  /** Whole percent from the verdict (0 for lease/none). */
  pct?: number;
}

const NONE: DealBadge = { kind: "none", gapLkr: 0, gapPctBelow: 0, pct: 0 };

export function dealBadgeFromVerdict(v: PriceVerdict, opts: { isLeaseTakeover?: boolean; ratingAllowed?: boolean } = {}): DealBadge {
  if (opts.isLeaseTakeover) return { kind: "lease", gapLkr: 0, gapPctBelow: 0, pct: 0 };
  if (v.status !== "ok") return NONE;
  const base = { gapLkr: v.gapLkr, gapPctBelow: -v.gapPct, pct: v.pct };
  // Safety first: shown regardless of plan / suppression.
  if (v.verifyFirst) return { kind: "verify", ...base };
  if (opts.ratingAllowed === false) return NONE;
  return { kind: v.band, ...base };
}

export function computeDealBadge(input: DealBadgeInput): DealBadge {
  if (input.isLeaseTakeover) return { kind: "lease", gapLkr: 0, gapPctBelow: 0, pct: 0 };
  const verdict =
    input.verdict ??
    priceVerdict({
      asking: input.askingLkr,
      reference: input.fmvLkr,
      comps: input.compsCount,
      confidence: input.confidence,
      category: input.category,
      model: input.model,
      title: input.title,
      description: input.description,
      variant: input.variant,
    });
  return dealBadgeFromVerdict(verdict, { ratingAllowed: input.ratingAllowed });
}

/**
 * Compact gap in millions, like every compact price on the site:
 * "Rs 0.42 Mn", "Rs 1.2 Mn", "Rs 12.5 Mn". Gaps under Rs 10,000 stay full.
 */
export function formatLkrShort(value: number): string {
  const v = Math.abs(Number(value));
  if (!Number.isFinite(v)) return "Rs —";
  return formatLkrCompact(v, "Rs —");
}

/**
 * The single deal palette, on the ui/design semantic tokens (src/styles/tokens.css):
 * below→deal-good, fair→deal-fair, above→deal-high, verify→deal-caution.
 * Lease stays informational (sky) — it is not a price verdict.
 *
 * Photo-overlay badges use the solid fill + its foreground so 11–12px text
 * keeps contrast on any photo (WCAG 1.4.3).
 */
export const DEAL_BADGE_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "border-deal-good/40 bg-deal-good/95 text-deal-good-foreground",
  fair: "border-deal-fair/40 bg-deal-fair/95 text-deal-fair-foreground",
  above: "border-deal-high/40 bg-deal-high/95 text-deal-high-foreground",
  verify: "border-deal-caution/50 bg-deal-caution/95 text-deal-caution-foreground",
  lease: "border-primary/40 bg-primary/95 text-primary-foreground",
};

/** Same kinds as soft pills on plain (non-photo) surfaces, theme-aware via tokens. */
export const DEAL_SOFT_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "border-deal-good/30 bg-deal-good/10 text-deal-good-text",
  fair: "border-deal-fair/30 bg-deal-fair/10 text-deal-fair-text",
  above: "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
  verify: "border-deal-caution/40 bg-deal-caution/10 text-deal-caution-text",
  lease: "border-primary/25 bg-primary/10 text-primary",
};

/** Text tones for the same kinds on plain card surfaces (theme-aware via tokens). */
export const DEAL_TEXT_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "text-deal-good-text",
  fair: "text-deal-fair-text",
  above: "text-deal-high-text",
  verify: "text-deal-caution-text",
  lease: "text-primary",
};

export const DEAL_BAR_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "bg-deal-good",
  fair: "bg-deal-fair",
  above: "bg-deal-high",
  verify: "bg-deal-caution",
  lease: "bg-primary",
};

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

/** User-facing badge text. Never says "market value". */
export function dealBadgeLabel(badge: DealBadge, t: Translate): string | null {
  const gap = formatLkrShort(badge.gapLkr);
  switch (badge.kind) {
    case "below":
      return t("deal.belowTypical", "{gap} below typical", { gap });
    case "above":
      return t("deal.aboveTypical", "{gap} above typical", { gap });
    case "fair":
      return t("deal.nearTypical", "Near typical price");
    case "verify":
      return t("deal.unusuallyLow", "Unusually low — verify first");
    case "lease":
      return t("deal.leaseTakeover", "Lease takeover — price shown isn't full price");
    default:
      return null;
  }
}
