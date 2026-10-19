/**
 * Deal badge logic for listing cards and detail — one rule set, one palette.
 *
 * Compares the asking price with the FMV (cohort/model estimate of typical
 * *asking* prices — never "market value" or a sale price) and turns the gap
 * into a rupee figure buyers read in lakhs ("Rs 4.2 L below typical").
 *
 * Honesty rules:
 * - Lease takeovers get no deal call at all (the price isn't the full price).
 * - Very cheap outliers (> VERIFY_BELOW_PCT below FMV) and below-FMV calls on
 *   low-confidence estimates are amber "Unusually low — verify first", never
 *   green: these are the classic bait-price / advance-fee scam shape.
 * - Bands match `summarizeFmv` (−5% / +8%) so card, detail and FMV text agree.
 */

export type DealBadgeKind = "below" | "fair" | "above" | "verify" | "lease" | "none";
export type DealConfidence = "high" | "medium" | "low" | "none";

export const DEAL_BELOW_PCT = 5;
export const DEAL_ABOVE_PCT = 8;
export const VERIFY_BELOW_PCT = 35;

export interface DealBadgeInput {
  askingLkr: number | null | undefined;
  fmvLkr: number | null | undefined;
  /** FMV confidence when known (detail page). Unknown (card) is not penalised. */
  confidence?: DealConfidence | null;
  /** Number of comparable listings behind the FMV, when known. */
  compsCount?: number | null;
  isLeaseTakeover?: boolean;
  /**
   * False when the server suppressed the rating (thin cohort, extreme price)
   * or the plan doesn't include deal calls. Only safety labels
   * (verify / lease) are shown then.
   */
  ratingAllowed?: boolean;
}

export interface DealBadge {
  kind: DealBadgeKind;
  /** Absolute rupee gap between asking and FMV (0 for lease/none). */
  gapLkr: number;
  /** Positive = asking is below FMV. */
  gapPctBelow: number;
}

const NONE: DealBadge = { kind: "none", gapLkr: 0, gapPctBelow: 0 };

/** Minimum comps for a confident below-FMV (green) call when comps are known. */
export const MIN_COMPS_FOR_GREEN = 5;

export function computeDealBadge(input: DealBadgeInput): DealBadge {
  if (input.isLeaseTakeover) return { kind: "lease", gapLkr: 0, gapPctBelow: 0 };

  const asking = Number(input.askingLkr);
  const fmv = Number(input.fmvLkr);
  if (!Number.isFinite(asking) || !Number.isFinite(fmv) || asking <= 0 || fmv <= 0) return NONE;

  const gapPctBelow = ((fmv - asking) / fmv) * 100;
  const gapLkr = Math.abs(fmv - asking);
  const confidence = input.confidence ?? null;
  const comps = input.compsCount;
  const weakEstimate =
    confidence === "low" ||
    confidence === "none" ||
    (comps != null && Number.isFinite(Number(comps)) && Number(comps) < MIN_COMPS_FOR_GREEN);

  // Safety first: shown regardless of plan / suppression.
  if (gapPctBelow > VERIFY_BELOW_PCT) return { kind: "verify", gapLkr, gapPctBelow };
  if (gapPctBelow >= DEAL_BELOW_PCT && weakEstimate) return { kind: "verify", gapLkr, gapPctBelow };

  if (input.ratingAllowed === false) return NONE;

  if (gapPctBelow >= DEAL_BELOW_PCT) return { kind: "below", gapLkr, gapPctBelow };
  if (-gapPctBelow >= DEAL_ABOVE_PCT) return { kind: "above", gapLkr, gapPctBelow };
  return { kind: "fair", gapLkr, gapPctBelow };
}

/**
 * Compact LKR in the units Sri Lankans quote: lakhs below 1 crore-ish
 * ("Rs 4.2 L"), millions above ("Rs 12.5 Mn"). Thousands for tiny gaps.
 */
export function formatLkrShort(value: number): string {
  const v = Math.abs(Number(value));
  if (!Number.isFinite(v)) return "Rs —";
  if (v >= 10_000_000) return `Rs ${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")} Mn`;
  if (v >= 100_000) return `Rs ${(v / 100_000).toFixed(1).replace(/\.0$/, "")} L`;
  if (v >= 1_000) return `Rs ${Math.round(v / 1_000)}k`;
  return `Rs ${Math.round(v)}`;
}

/**
 * The single deal palette. Solid-ish fills so the 11–12px text keeps contrast
 * on photo overlays as well as on cards (WCAG 1.4.3).
 */
export const DEAL_BADGE_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "border-emerald-500/40 bg-emerald-950/85 text-emerald-200 dark:bg-emerald-950/85",
  fair: "border-white/15 bg-zinc-900/85 text-zinc-100",
  above: "border-rose-500/40 bg-rose-950/85 text-rose-200",
  verify: "border-amber-400/50 bg-amber-950/90 text-amber-200",
  lease: "border-sky-400/40 bg-sky-950/90 text-sky-100",
};

/** Same kinds as soft pills on plain (non-photo) surfaces, theme-aware. */
export const DEAL_SOFT_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fair: "border-border bg-surface text-foreground",
  above: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  verify: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  lease: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
};

/** Text tones for the same kinds on plain card surfaces (theme-aware). */
export const DEAL_TEXT_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "text-emerald-700 dark:text-emerald-400",
  fair: "text-foreground",
  above: "text-rose-700 dark:text-rose-400",
  verify: "text-amber-700 dark:text-amber-400",
  lease: "text-sky-700 dark:text-sky-300",
};

export const DEAL_BAR_CLASSES: Record<Exclude<DealBadgeKind, "none">, string> = {
  below: "bg-emerald-500",
  fair: "bg-primary",
  above: "bg-rose-500",
  verify: "bg-amber-500",
  lease: "bg-sky-500",
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
