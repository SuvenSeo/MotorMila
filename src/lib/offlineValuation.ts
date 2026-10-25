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
import type { ListingFmvDetail } from "@/types/fmv";
import { askingPriceIssue, isGenericModel, MIN_COMPS, priceVerdict, type PriceVerdict } from "@/lib/priceVerdict";

/** Bump when fmv.py / price_history.py change and this file is re-synced. */
export const OFFLINE_VALUATION_VERSION = "2026-10-25";

const MIN_ML_COMPS = 8;
const MAX_COMPS = 80;
const FETCH_LIMIT = 160;
const YEAR_WINDOW = 2;
const WIDE_YEAR_WINDOW = 4;
const OLS_MAX_DRIFT = 0.15;
const AGREE_RATIO = 1.25;

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

function compIsUsable(row: CarListing): boolean {
  return askingPriceIssue(row.price_lkr, { category: row.vehicle_category, title: row.title }) === null;
}

/** Tukey fences on log price after a 0.4×–2.5× band around the median (fmv.py _trim_outliers). */
function trimOutliers(rows: CarListing[]): CarListing[] {
  const priced = rows.filter((r) => (listingPrice(r) ?? 0) > 0);
  if (priced.length < 4) return priced;
  const med = median(priced.map((r) => listingPrice(r) as number)) ?? 0;
  const banded = priced.filter((r) => {
    const p = listingPrice(r) as number;
    return p >= med * 0.4 && p <= med * 2.5;
  });
  if (banded.length < 4) return banded;
  const logs = banded.map((r) => Math.log(listingPrice(r) as number)).sort((x, y) => x - y);
  const q1 = logs[Math.floor(logs.length / 4)];
  const q3 = logs[Math.floor((3 * logs.length) / 4)];
  const iqr = q3 - q1;
  return banded.filter((r) => {
    const l = Math.log(listingPrice(r) as number);
    return l >= q1 - 1.5 * iqr && l <= q3 + 1.5 * iqr;
  });
}

function seenTs(row: CarListing): number {
  const t = Date.parse(String(row.last_seen_at || row.scraped_at || ""));
  return Number.isFinite(t) ? t : 0;
}

/** Same make + model + vehicle category, nearest model years first (fmv.py _fetch_comps). */
function fetchComps(catalog: CarListing[], listing: CarListing): CarListing[] {
  const make = String(listing.make || "").trim();
  const model = String(listing.model || "").trim();
  if (!make || !model) return [];
  const category = String(listing.vehicle_category || "").trim();
  const year = numOrNull(listing.year) || null;
  const base = catalog.filter(
    (row) =>
      row.id !== listing.id &&
      sameText(row.make, make) &&
      sameText(row.model, model) &&
      (!category || sameText(row.vehicle_category, category)) &&
      listingPrice(row) !== null,
  );
  const byRecency = (a: CarListing, b: CarListing) => seenTs(b) - seenTs(a) || Number(b.id) - Number(a.id);
  let rows: CarListing[] = [];
  if (year !== null) {
    for (const window of [YEAR_WINDOW, WIDE_YEAR_WINDOW]) {
      const inWindow = base
        .filter((row) => {
          const y = numOrNull(row.year);
          return y !== null && y > 0 && Math.abs(y - year) <= window;
        })
        .sort((a, b) => Math.abs(Number(a.year) - year) - Math.abs(Number(b.year) - year) || byRecency(a, b))
        .slice(0, FETCH_LIMIT);
      rows = trimOutliers(inWindow.filter(compIsUsable));
      if (rows.length >= MIN_ML_COMPS) break;
    }
  } else {
    rows = trimOutliers([...base].sort(byRecency).slice(0, FETCH_LIMIT).filter(compIsUsable));
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

/** Centred OLS (fmv.py _ml_predict); the caller accepts it only near the robust median. */
function mlPredict(listing: CarListing, comps: CarListing[]): number | null {
  if (comps.length < MIN_ML_COMPS) return null;
  const district = String(listing.district || "").trim().toLowerCase();
  const years = comps.map((r) => numOrNull(r.year)).filter((y): y is number => y !== null && y > 0);
  const kms = comps.map(listingMileage).filter((k): k is number => k !== null).map((k) => k / 1000);
  const meanYear = years.length ? years.reduce((a, b) => a + b, 0) / years.length : numOrNull(listing.year) || 2015;
  const meanKm = kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : 50;
  const feats = (year: number | null, km: number | null, same: number, cond: number) => [
    1.0,
    (year ?? meanYear) - meanYear,
    ((km !== null ? km / 1000 : meanKm) - meanKm) / 10,
    same,
    cond,
  ];
  const features: number[][] = [];
  const targets: number[] = [];
  for (const row of comps) {
    const price = listingPrice(row);
    if (price === null) continue;
    const y = numOrNull(row.year);
    const sameDistrict = district && String(row.district || "").trim().toLowerCase() === district ? 1.0 : 0.0;
    features.push(feats(y && y > 0 ? y : null, listingMileage(row), sameDistrict, conditionCode(row.condition)));
    targets.push(price);
  }
  if (features.length < MIN_ML_COMPS) return null;
  const beta = solveOls(features, targets);
  if (!beta) return null;
  const ly = numOrNull(listing.year);
  const x = feats(ly && ly > 0 ? ly : null, listingMileage(listing), 1.0, conditionCode(listing.condition));
  const predicted = beta.reduce((acc, b, i) => acc + b * x[i], 0);
  if (!Number.isFinite(predicted) || predicted <= 0) return null;
  return Math.round(predicted * 100) / 100;
}

const CONF_ORDER = ["none", "low", "medium", "high"] as const;
type Conf = (typeof CONF_ORDER)[number];
function capConf(level: Conf, ceiling: Conf): Conf {
  return CONF_ORDER.indexOf(level) <= CONF_ORDER.indexOf(ceiling) ? level : ceiling;
}
function dispersion(sorted: number[]): number | null {
  if (sorted.length < 4) return null;
  const med = median(sorted);
  if (!med) return null;
  return (sorted[Math.floor((3 * sorted.length) / 4)] - sorted[Math.floor(sorted.length / 4)]) / med;
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
  let storedMedian = numOrNull((listing as { market_median_lkr?: unknown }).market_median_lkr);
  const ctx = { category: listing.vehicle_category, model: listing.model, title: listing.title };
  if (storedMedian !== null && priceVerdict({ asking, reference: storedMedian, ...ctx }).status !== "ok") storedMedian = null;

  const comps = fetchComps(catalog, listing);
  let method = "insufficient_data";
  let fmv: number | null = null;
  const compPrices = comps
    .map(listingPrice)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);
  const compsMedian = median(compPrices);

  const adjusted = adjustedMedianFmv(listing, comps);
  const mlValue = mlPredict(listing, comps);
  let compsEstimate: number | null = null;
  let compsMethod = "insufficient_data";
  if (mlValue !== null && adjusted && Math.abs(mlValue / adjusted - 1) <= OLS_MAX_DRIFT) {
    compsEstimate = mlValue;
    compsMethod = "ols_comps";
  } else if (adjusted !== null) {
    compsEstimate = adjusted;
    compsMethod = "adjusted_median";
  }
  let confidence: Conf = confidenceFromSample(comps.length, compsMethod);
  const spread = dispersion(compPrices);
  if (spread !== null && spread > 0.8) confidence = capConf(confidence, "low");
  else if (spread !== null && spread > 0.5) confidence = capConf(confidence, "medium");

  let corroborated = false;
  let disagree = false;
  if (storedMedian !== null && compsEstimate !== null) {
    const ratio = Math.max(storedMedian, compsEstimate) / Math.min(storedMedian, compsEstimate);
    if (ratio <= AGREE_RATIO) {
      fmv = storedMedian;
      method = "cohort_median";
      corroborated = true;
      if (comps.length >= 3 && CONF_ORDER.indexOf(confidence) < 2) confidence = "medium";
    } else {
      fmv = compsEstimate;
      method = compsMethod;
      disagree = true;
      confidence = capConf(confidence, "low");
    }
  } else if (compsEstimate !== null) {
    fmv = compsEstimate;
    method = compsMethod;
  } else if (storedMedian !== null) {
    fmv = storedMedian;
    method = "cohort_median";
    confidence = "low";
  }
  if (isGenericModel(listing.model)) confidence = capConf(confidence, "low");

  let verdict: PriceVerdict = priceVerdict({
    asking,
    reference: fmv,
    comps: corroborated ? Math.max(comps.length, MIN_COMPS) : comps.length,
    confidence,
    ...ctx,
  });
  if (disagree && (verdict.status === "ok" || verdict.reason === "low_confidence")) {
    verdict = { status: "withheld", reason: "estimates_disagree", group: "inconsistent_data", referenceLkr: fmv };
  }
  const okV = verdict.status === "ok" ? verdict : null;
  const ok = okV !== null;
  const deltaPct = okV ? okV.gapPct : null;
  const band: ListingFmvDetail["band"] = okV ? okV.band : null;
  const label = okV
    ? okV.band === "below"
      ? `Priced ${okV.pct}% below typical`
      : okV.band === "above"
        ? `Priced ${okV.pct}% above typical`
        : "Near the typical price"
    : null;
  const dealScore = okV ? Math.round(-okV.gapPct * 10) / 10 : null;

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
    fmv_lkr: ok ? fmv : null,
    estimate_lkr: fmv,
    verdict: ok ? { status: "ok", reason: null } : { status: "withheld", reason: verdict.status === "withheld" ? verdict.reason : null },
    corroborated_by_comps: corroborated,
    deal_score: dealScore,
    delta_pct: deltaPct,
    band,
    label,
    method,
    sample_count: comps.length,
    sample_size: comps.length,
    confidence,
    comps_median_lkr: compsMedian,
    km_adjustment_lkr: kmAdj,
    district_adjustment_lkr: districtAdj,
    method_breakdown: {
      base_median_lkr: compsMedian,
      km_adjustment_lkr: kmAdj,
      district_adjustment_lkr: districtAdj,
      final_fmv_lkr: ok ? fmv : null,
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
