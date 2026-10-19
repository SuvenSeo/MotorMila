/**
 * Buy-now-or-wait: an indicative, transparent read of a model's recent price
 * trend. Not a forecast: it describes the direction of the last few months of
 * median asking prices and says how much data it rests on.
 */
export interface OutlookPoint {
  month: string; // YYYY-MM
  median_price: number;
  sample_count: number;
}

export type OutlookStance = "easing" | "firming" | "steady" | "insufficient";

export interface PriceOutlook {
  stance: OutlookStance;
  /** Average % change per month over the window (least squares). */
  monthlyChangePct: number | null;
  windowMonths: number;
  totalSamples: number;
  confidence: "low" | "medium";
  headline: string;
  advice: string;
}

/** Months with fewer ads than this are ignored (too noisy). */
export const MIN_SAMPLES_PER_MONTH = 5;
/** |slope| below this %/month counts as steady. */
export const STEADY_BAND_PCT = 1;

export function computePriceOutlook(points: OutlookPoint[], windowMonths = 6): PriceOutlook {
  const usable = points
    .filter((p) => Number.isFinite(p.median_price) && p.median_price > 0 && (p.sample_count ?? 0) >= MIN_SAMPLES_PER_MONTH)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-windowMonths);
  const totalSamples = usable.reduce((n, p) => n + (p.sample_count || 0), 0);

  if (usable.length < 3) {
    return {
      stance: "insufficient",
      monthlyChangePct: null,
      windowMonths: usable.length,
      totalSamples,
      confidence: "low",
      headline: "Not enough price history yet",
      advice: "We need at least three months of comparable ads to read a trend. Judge each car on its own price against similar ads.",
    };
  }

  // Least-squares slope on log prices → average % change per month.
  const ys = usable.map((p) => Math.log(p.median_price));
  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - xMean) * (y - yMean);
    den += (i - xMean) ** 2;
  });
  const slope = den > 0 ? num / den : 0;
  const pct = (Math.exp(slope) - 1) * 100;
  const confidence: PriceOutlook["confidence"] = n >= 5 && totalSamples >= 100 ? "medium" : "low";

  if (pct <= -STEADY_BAND_PCT) {
    return {
      stance: "easing",
      monthlyChangePct: pct,
      windowMonths: n,
      totalSamples,
      confidence,
      headline: "Prices have been easing",
      advice: "Median asking prices fell over recent months. If you're not in a hurry, waiting and watching for price drops may pay off. Trends can reverse with duty or policy changes.",
    };
  }
  if (pct >= STEADY_BAND_PCT) {
    return {
      stance: "firming",
      monthlyChangePct: pct,
      windowMonths: n,
      totalSamples,
      confidence,
      headline: "Prices have been rising",
      advice: "Median asking prices rose over recent months. If you've found a fairly priced car, waiting may cost more. A rising trend isn't guaranteed to continue.",
    };
  }
  return {
    stance: "steady",
    monthlyChangePct: pct,
    windowMonths: n,
    totalSamples,
    confidence,
    headline: "Prices have been steady",
    advice: "No clear direction in recent months. Buy when you find the right car at a fair price, and don't wait for the market.",
  };
}
