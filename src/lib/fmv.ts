/**
 * Typical-price summary for the FMV card and listing cards — a view of the one
 * price verdict (src/lib/priceVerdict.ts). The label IS the shared verdict
 * headline ("Priced 12% below typical", "Near typical price"), so the card can
 * never word the same verdict differently from the deal badge or Trust Check.
 */
import { priceVerdict, verdictHeadline, verdictShortLabel, type PriceContext, type PriceVerdict } from "@/lib/priceVerdict";

export type FmvBand = "below" | "fair" | "above";

export interface FmvSummary {
  fmv_lkr: number;
  asking_lkr: number;
  delta_lkr: number;
  delta_pct: number;
  band: FmvBand;
  /** Whole percent from the verdict. */
  pct: number;
  verify_first: boolean;
  /** The shared verdict headline ("Priced 12% below typical") — the FMV card. */
  label: string;
  /** Compact form for the listing-card bar ("12% below typical"). */
  shortLabel: string;
}

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const plain: Translate = (_key, fallback = "", vars) => fallback.replace(/\{(\w+)\}/g, (_m, k) => String(vars?.[k] ?? ""));

/** Summary for an OK verdict; null when the verdict is withheld. */
export function fmvSummaryFromVerdict(asking: number, v: PriceVerdict, t?: Translate): FmvSummary | null {
  if (v.status !== "ok") return null;
  const label = verdictHeadline(v, t ?? plain);
  const shortLabel = verdictShortLabel(v, t ?? plain);
  return {
    fmv_lkr: v.referenceLkr,
    asking_lkr: asking,
    delta_lkr: asking - v.referenceLkr,
    delta_pct: v.gapPct,
    band: v.band,
    pct: v.pct,
    verify_first: v.verifyFirst,
    label,
    shortLabel,
  };
}

/**
 * `t` (from useAppPreferences) localises the label; without it the label is English.
 * Returns null whenever the one verdict is withheld (implausible gap, bad price…).
 */
export function summarizeFmv(asking: number, fmv: number, t?: Translate, ctx: PriceContext = {}): FmvSummary | null {
  return fmvSummaryFromVerdict(asking, priceVerdict({ asking, reference: fmv, ...ctx }), t);
}
