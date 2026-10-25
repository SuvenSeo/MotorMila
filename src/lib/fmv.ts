/** Fair Market Value summary — a view of the one price verdict (src/lib/priceVerdict.ts). */
import { priceVerdict, type PriceContext, type PriceVerdict } from "@/lib/priceVerdict";

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
  label: string;
}

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const plain: Translate = (_key, fallback = "", vars) => fallback.replace(/\{(\w+)\}/g, (_m, k) => String(vars?.[k] ?? ""));

/** Summary for an OK verdict; null when the verdict is withheld. */
export function fmvSummaryFromVerdict(asking: number, v: PriceVerdict, t?: Translate): FmvSummary | null {
  if (v.status !== "ok") return null;
  const tr = t ?? plain;
  const pct = String(v.pct);
  const label =
    v.band === "below"
      ? tr("fmv.band.below", "Priced {pct}% below FMV", { pct })
      : v.band === "above"
        ? tr("fmv.band.above", "Overpriced {pct}% vs FMV", { pct })
        : tr("fmv.band.near", "Near fair market value");
  return {
    fmv_lkr: v.referenceLkr,
    asking_lkr: asking,
    delta_lkr: asking - v.referenceLkr,
    delta_pct: v.gapPct,
    band: v.band,
    pct: v.pct,
    verify_first: v.verifyFirst,
    label,
  };
}

/**
 * `t` (from useAppPreferences) localises the label; without it the label is English.
 * Returns null whenever the one verdict is withheld (implausible gap, bad price…).
 */
export function summarizeFmv(asking: number, fmv: number, t?: Translate, ctx: PriceContext = {}): FmvSummary | null {
  return fmvSummaryFromVerdict(asking, priceVerdict({ asking, reference: fmv, ...ctx }), t);
}
