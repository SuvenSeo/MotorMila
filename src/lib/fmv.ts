/** Fair Market Value helpers — cohort median vs asking price. */

export type FmvBand = "below" | "fair" | "above";

export interface FmvSummary {
  fmv_lkr: number;
  asking_lkr: number;
  delta_lkr: number;
  delta_pct: number;
  band: FmvBand;
  label: string;
}

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

/** `t` (from useAppPreferences) localises the label; without it the label is English. */
export function summarizeFmv(asking: number, fmv: number, t?: Translate): FmvSummary | null {
  if (!Number.isFinite(asking) || !Number.isFinite(fmv) || asking <= 0 || fmv <= 0) {
    return null;
  }
  const delta_lkr = asking - fmv;
  const delta_pct = (delta_lkr / fmv) * 100;
  let band: FmvBand = "fair";
  if (delta_pct <= -5) band = "below";
  else if (delta_pct >= 8) band = "above";

  const pct = Math.abs(delta_pct).toFixed(0);
  const tr: Translate = t ?? ((_key, fallback = "", vars) => fallback.replace(/\{(\w+)\}/g, (_m, k) => String(vars?.[k] ?? "")));
  const label =
    band === "below"
      ? tr("fmv.band.below", "Priced {pct}% below FMV", { pct })
      : band === "above"
        ? tr("fmv.band.above", "Overpriced {pct}% vs FMV", { pct })
        : tr("fmv.band.near", "Near fair market value");

  return { fmv_lkr: fmv, asking_lkr: asking, delta_lkr, delta_pct, band, label };
}
