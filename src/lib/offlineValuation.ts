/**
 * Offline valuation engine — a faithful client-side port of
 * `backend/app/utils/fmv.py` (OLS fair-market predictor) plus
 * `backend/app/utils/price_history.py` (history summarizer).
 *
 * The catalog snapshot already carries every input the model needs
 * (make/model/year/mileage/district/condition/price), so detail pages can
 * value a listing with zero database reads. Live API stays first choice;
 * these are the fallback (see the resilient wrappers in `@/services/api`).
 *
 * Rule: any change to fmv.py / price_history.py MUST be mirrored here.
 */
import type { CarListing, PriceHistoryInfo } from "@/types/car";
import type { ListingFmvDetail } from "@/services/api";

/** Bump when fmv.py / price_history.py change and this file is re-synced. */
export const OFFLINE_VALUATION_VERSION = "2026-09-21";

const MIN_ML_COMPS = 8;
const MAX_COMPS = 80;
const YEAR_WINDOW = 2;

function conditionCode(value: unknown): number {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "brand_new" || raw === "new" || raw === "unregistered") return 2.0;
  if (raw === "reconditioned" || raw === "import") return 1.0;
  if (raw === "used" || raw === "registered") return 0.0;
  return 0.5;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[mid];
  return (ordered[mid - 1] + ordered[mid]) / 2.0;
}

function numOrNull(value: unknown): number | null {
  // Number(null) === 0 — treat null/undefined/"" as missing, not zero.
  // A 0-LKR comp would collapse the offline FMV/IQR clamp.
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function adjustForMileage(
  priceLkr: number,
  targetMileageKm: number | null,
  comparableMileageKm: number | null,
): number {
  const base = Math.max(priceLkr, 0);
  if (targetMileageKm === null || comparableMileageKm === null) {
    return Math.round(base * 100) / 100;
  }
  const delta = targetMileageKm - comparableMileageKm;
  const ratio = Math.max(Math.min(((delta / 100000) * 0.06), 0.2), -0.2);
  return Math.round(Math.max(base * (1 - ratio), 0) * 100) / 100;
}

function solveOls(rows: number[][], targets: number[]): number[] | null {
  const n = rows.length;
  if (n === 0) return null;
  const p = rows[0].length;
  const xtx: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = rows[i];
    const yi = targets[i];
    for (let a = 0; a < p; a++) {
      xty[a] += xi[a] * yi;
      for (let b = 0; b < p; b++) xtx[a][b] += xi[a] * xi[b];
    }
  }
  for (let a = 1; a < p; a++) xtx[a][a] += 1e-3;

  const mat = xtx.map((row, r) => [...row, xty[r]]);
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col; r < p; r++) {
      if (Math.abs(mat[r][col]) > Math.abs(mat[pivot][col])) pivot = r;
    }
    if (Math.abs(mat[pivot][col]) < 1e-12) return null;
    [mat[col], mat[pivot]] = [mat[pivot], mat[col]];
    const div = mat[col][col];
    for (let j = col; j <= p; j++) mat[col][j] /= div;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const factor = mat[r][col];
      for (let j = col; j <= p; j++) mat[r][j] -= factor * mat[col][j];
    }
  }
  return mat.map((row) => row[p]);
}

function sameText(a: unknown, b: unknown): boolean {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function listingPrice(row: CarListing): number | null {
  return numOrNull(row.price_lkr);
}

function listingMileage(row: CarListing): number | null {
  const n = numOrNull((row as { mileage_km?: unknown }).mileage_km);
  return n !== null && n > 0 ? n : null;
}

function fetchComps(catalog: CarListing[], listing: CarListing): CarListing[] {
  const make = String(listing.make || "").trim();
  const model = String(listing.model || "").trim();
  if (!make || !model) return [];
  const year = numOrNull(listing.year);
  let rows = catalog.filter(
    (row) =>
      row.id !== listing.id &&
      sameText(row.make, make) &&
      sameText(row.model, model) &&
      listingPrice(row) !== null,
  );
  if (year !== null) {
    const tight = rows.filter((row) => {
      const y = numOrNull(row.year);
      return y !== null && Math.abs(y - year) <= YEAR_WINDOW;
    });
    if (tight.length >= MIN_ML_COMPS) rows = tight;
  }
  return rows.slice(0, MAX_COMPS);
}

function adjustedMedianFmv(listing: CarListing, comps: CarListing[]): number | null {
  const targetMileage = listingMileage(listing);
  const prices = comps.flatMap((row) => {
    const price = listingPrice(row);
    if (price === null) return [];
    return [adjustForMileage(price, targetMileage, listingMileage(row))];
  });
  return median(prices);
}

function mlPredict(listing: CarListing, comps: CarListing[]): number | null {
  if (comps.length < MIN_ML_COMPS) return null;
  const district = String(listing.district || "").trim().toLowerCase();
  const listingYear = numOrNull(listing.year);
  const features: number[][] = [];
  const targets: number[] = [];
  for (const row of comps) {
    const price = listingPrice(row);
    if (price === null) continue;
    const year = numOrNull(row.year) ?? listingYear ?? 2015;
    const mileage = listingMileage(row) !== null ? (listingMileage(row) as number) / 1000 : 50.0;
    const sameDistrict =
      district && String(row.district || "").trim().toLowerCase() === district ? 1.0 : 0.0;
    features.push([1.0, year, mileage, sameDistrict, conditionCode(row.condition)]);
    targets.push(price);
  }
  if (features.length < MIN_ML_COMPS) return null;
  const beta = solveOls(features, targets);
  if (!beta) return null;

  const years = comps.map((r) => numOrNull(r.year)).filter((y): y is number => y !== null);
  const targetYear = listingYear ?? (years.length > 0 ? years.reduce((a, b) => a + b, 0) / years.length : 2015);
  const lm = listingMileage(listing);
  const targetMileage = lm !== null ? lm / 1000 : 50.0;
  const x = [1.0, targetYear, targetMileage, 1.0, conditionCode(listing.condition)];
  let predicted = beta.reduce((acc, b, i) => acc + b * x[i], 0);
  if (predicted <= 0) return null;

  const prices = comps
    .map(listingPrice)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);
  if (prices.length >= 4) {
    const q1 = prices[Math.floor(prices.length / 4)];
    const q3 = prices[Math.floor((3 * prices.length) / 4)];
    predicted = Math.min(Math.max(predicted, q1 * 0.75), q3 * 1.25);
  }
  return Math.round(predicted * 100) / 100;
}

function confidenceFromSample(sampleCount: number, method: string): ListingFmvDetail["confidence"] {
  if (method === "insufficient_data") return "none";
  if (method === "cohort_median") return "low";
  if (sampleCount >= 15) return "high";
  if (sampleCount >= MIN_ML_COMPS) return "medium";
  return "low";
}

export interface OfflineFmvResult extends ListingFmvDetail {
  offline?: boolean;
}

/** Mirrors `predict_listing_fmv` — comp set comes from the snapshot catalog. */
export function predictFmvOffline(catalog: CarListing[], listing: CarListing): OfflineFmvResult {
  const asking = listingPrice(listing);
  const storedMedian = numOrNull(
    (listing as { market_median_lkr?: unknown }).market_median_lkr,
  );
  const dealScore = numOrNull((listing as { deal_score?: unknown }).deal_score);

  const comps = fetchComps(catalog, listing);
  let method = "insufficient_data";
  let fmv: number | null = null;

  const mlValue = mlPredict(listing, comps);
  if (mlValue !== null) {
    fmv = mlValue;
    method = "ols_comps";
  } else {
    const adjusted = adjustedMedianFmv(listing, comps);
    if (adjusted !== null) {
      fmv = adjusted;
      method = "adjusted_median";
    } else if (storedMedian !== null) {
      fmv = storedMedian;
      method = "cohort_median";
    }
  }

  const compPrices = comps
    .map(listingPrice)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);
  const compsMedian = median(compPrices);

  let band: ListingFmvDetail["band"] = null;
  let deltaPct: number | null = null;
  let label: string | null = null;
  if (asking !== null && fmv !== null && asking > 0 && fmv > 0) {
    deltaPct = Math.round(((asking - fmv) / fmv) * 100 * 100) / 100;
    if (deltaPct <= -5) {
      band = "below";
      label = `Priced ${Math.abs(Math.round(deltaPct))}% below FMV`;
    } else if (deltaPct >= 8) {
      band = "above";
      label = `Overpriced ${Math.abs(Math.round(deltaPct))}% vs FMV`;
    } else {
      band = "fair";
      label = "Near fair market value";
    }
  }

  let kmAdj: number | null = null;
  let districtAdj: number | null = null;
  if (fmv !== null && compsMedian !== null && comps.length > 0) {
    if (method === "ols_comps" || method === "adjusted_median") {
      const adjusted = adjustedMedianFmv(listing, comps);
      if (adjusted !== null) {
        kmAdj = Math.round((adjusted - compsMedian) * 100) / 100;
        districtAdj = method === "ols_comps" ? Math.round((fmv - adjusted) * 100) / 100 : 0.0;
      }
    }
  }

  return {
    listing_id: Number(listing.id) || null,
    asking_lkr: asking,
    fmv_lkr: fmv,
    deal_score: dealScore,
    delta_pct: deltaPct,
    band,
    label,
    method,
    sample_count: comps.length,
    sample_size: comps.length,
    confidence: confidenceFromSample(comps.length, method),
    comps_median_lkr: compsMedian,
    km_adjustment_lkr: kmAdj,
    district_adjustment_lkr: districtAdj,
    method_breakdown: {
      base_median_lkr: compsMedian,
      km_adjustment_lkr: kmAdj,
      district_adjustment_lkr: districtAdj,
      final_fmv_lkr: fmv,
    },
    updated_at: new Date().toISOString(),
    offline: true,
  };
}

// ── Price-history summary (mirrors price_history.py) ─────────────────────────

export interface SparklinePoint {
  price_lkr: number;
  scraped_at: string;
}

export function summarizeSparkline(
  listingId: number | string,
  points: SparklinePoint[],
): PriceHistoryInfo {
  const prices = points
    .map((p) => numOrNull(p.price_lkr))
    .filter((p): p is number => p !== null);
  const times = points
    .map((p) => (p.scraped_at ? String(p.scraped_at) : null))
    .filter((t): t is string => t !== null);

  let cutCount = 0;
  let raiseCount = 0;
  let lastChangeAt: string | null = null;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] < prices[i - 1]) {
      cutCount++;
      lastChangeAt = times[i] ?? lastChangeAt;
    } else if (prices[i] > prices[i - 1]) {
      raiseCount++;
      lastChangeAt = times[i] ?? lastChangeAt;
    }
  }

  const first = prices.length > 0 ? prices[0] : null;
  const current = prices.length > 0 ? prices[prices.length - 1] : null;
  const changePct =
    first !== null && current !== null && first > 0
      ? Math.round(((current - first) / first) * 100 * 10) / 10
      : null;

  return {
    listing_id: Number(listingId) || 0,
    points: points
      .filter((p) => numOrNull(p.price_lkr) !== null && (numOrNull(p.price_lkr) as number) > 0)
      .map((p) => ({ price_lkr: Number(p.price_lkr), scraped_at: String(p.scraped_at || "") })),
    first_price_lkr: first,
    current_price_lkr: current,
    change_pct: changePct,
    cut_count: cutCount,
    raise_count: raiseCount,
    highest_price_lkr: prices.length > 0 ? Math.max(...prices) : null,
    lowest_price_lkr: prices.length > 0 ? Math.min(...prices) : null,
    last_change_at: lastChangeAt,
    tracked_points: prices.length,
  };
}
