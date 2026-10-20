/**
 * Price slider scale: Rs 0.5 Mn steps up to 10 Mn, then coarser Mn steps
 * (labels are always shown in Mn). A slider over the step *index* keeps the
 * crowded 3–10 Mn band usable instead of
 * squeezing it into the left 10% of a linear 0.5–100 Mn track.
 */
import { LAKH, MILLION } from "@/lib/price";

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let v = start; v <= end + 1e-6; v += step) out.push(Math.round(v));
  return out;
}

export const PRICE_STEPS: readonly number[] = [
  ...range(5 * LAKH, 100 * LAKH, 5 * LAKH), // 0.5 … 10 Mn (20 steps)
  ...range(12 * MILLION, 20 * MILLION, 2 * MILLION), // 12 … 20 Mn
  25 * MILLION,
  30 * MILLION,
  40 * MILLION,
  50 * MILLION,
  75 * MILLION,
  100 * MILLION,
];

export const PRICE_STEP_MIN = PRICE_STEPS[0];
export const PRICE_STEP_MAX = PRICE_STEPS[PRICE_STEPS.length - 1];
export const PRICE_STEP_LAST_INDEX = PRICE_STEPS.length - 1;

/** Nearest step index for a rupee value (clamped). */
export function priceToStepIndex(value: number | null | undefined, fallback: "min" | "max"): number {
  if (value == null || !Number.isFinite(value)) return fallback === "min" ? 0 : PRICE_STEP_LAST_INDEX;
  if (value <= PRICE_STEP_MIN) return 0;
  if (value >= PRICE_STEP_MAX) return PRICE_STEP_LAST_INDEX;
  let best = 0;
  let bestDist = Infinity;
  PRICE_STEPS.forEach((step, i) => {
    const d = Math.abs(step - value);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

export function stepIndexToPrice(index: number): number {
  const i = Math.min(PRICE_STEP_LAST_INDEX, Math.max(0, Math.round(index)));
  return PRICE_STEPS[i];
}

/**
 * Histogram counts per slider segment: bucket i holds prices in
 * [PRICE_STEPS[i], PRICE_STEPS[i+1]); the last bucket also takes anything
 * at or above the top step, the first anything below the bottom.
 */
export function buildPriceHistogram(prices: readonly number[]): number[] {
  const buckets = new Array(PRICE_STEPS.length - 1).fill(0) as number[];
  for (const raw of prices) {
    if (!Number.isFinite(raw)) continue;
    let idx = 0;
    while (idx < buckets.length - 1 && raw >= PRICE_STEPS[idx + 1]) idx += 1;
    buckets[idx] += 1;
  }
  return buckets;
}
