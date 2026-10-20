/**
 * "Likely to sell fast" — a per-MODEL liquidity signal (ui/features).
 *
 * Kept separate from the deal score on purpose: a car can be a great deal on
 * a slow-moving model, or overpriced on a fast one. Inputs are the snapshot
 * comps for one make/model (each live ad's first_seen_at). The measure is
 * the median age of the model's live ads — the same days-on-market proxy
 * the backend uses for collateral liquidity (b2b.py). Asking-price ads only
 * disappear when sold or withdrawn, so a model whose live ads are mostly
 * young is turning over quickly.
 *
 * Shown only with enough dated ads (MIN_SAMPLE) and only for the fast band;
 * we never label a model "slow" from this proxy.
 */

export const SELL_FAST_MAX_MEDIAN_DAYS = 21; // matches FAST_DOM_DAYS in velocity.ts
export const SELL_FAST_MIN_SAMPLE = 20;

export interface ModelSellSpeedRow {
  first_seen_at?: string | null;
  is_active?: boolean | null;
}

export interface ModelSellSpeed {
  fast: boolean;
  medianAgeDays: number;
  sample: number;
}

const DAY_MS = 86_400_000;

export function computeModelSellSpeed(
  rows: ModelSellSpeedRow[],
  opts: { nowMs?: number; minSample?: number; maxMedianDays?: number } = {},
): ModelSellSpeed | null {
  const now = opts.nowMs ?? Date.now();
  const minSample = opts.minSample ?? SELL_FAST_MIN_SAMPLE;
  const maxMedian = opts.maxMedianDays ?? SELL_FAST_MAX_MEDIAN_DAYS;
  const ages: number[] = [];
  for (const row of rows) {
    if (row.is_active === false) continue;
    if (!row.first_seen_at) continue;
    const t = Date.parse(row.first_seen_at);
    if (!Number.isFinite(t) || t > now + DAY_MS) continue;
    ages.push(Math.max(0, (now - t) / DAY_MS));
  }
  if (ages.length < minSample) return null;
  ages.sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const median = ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2;
  const medianAgeDays = Math.round(median);
  return { fast: medianAgeDays <= maxMedian, medianAgeDays, sample: ages.length };
}

/** Same rule when a backend/stat already provides median days-on-market + sample size. */
export function sellSpeedFromStats(medianDomDays: number | null | undefined, sample: number | null | undefined): ModelSellSpeed | null {
  const m = Number(medianDomDays);
  const n = Number(sample);
  if (!Number.isFinite(m) || m < 0 || !Number.isFinite(n) || n < SELL_FAST_MIN_SAMPLE) return null;
  return { fast: m <= SELL_FAST_MAX_MEDIAN_DAYS, medianAgeDays: Math.round(m), sample: n };
}
