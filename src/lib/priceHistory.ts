/**
 * Small helpers for per-listing price history (snapshot `price-sparklines.json`:
 * `{ sparklines: { [listingId]: [[price, timestamp], ...] } }`).
 */
import { parseFlexibleTime } from "@/lib/parseTime";

export interface PricePoint {
  price: number;
  at: number;
}

export type SparklineIndex = Record<string, Array<[number, string]>>;

export function toPricePoints(raw: Array<[number, string]> | null | undefined): PricePoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => (Array.isArray(row) ? { price: Number(row[0]), at: parseFlexibleTime(row[1]) } : null))
    .filter((p): p is PricePoint => !!p && Number.isFinite(p.price) && p.price > 0 && p.at !== null)
    .sort((a, b) => a.at - b.at);
}

export interface PriceDropSummary {
  /** Most recent downward move, if any. */
  dropped: boolean;
  /** Total change from first to last observation (negative = cheaper). */
  totalChangeLkr: number;
  totalChangePct: number;
  cuts: number;
  lastDropAt: number | null;
}

export function summarizePricePoints(points: PricePoint[]): PriceDropSummary | null {
  if (points.length < 2) return null;
  let cuts = 0;
  let lastDropAt: number | null = null;
  for (let i = 1; i < points.length; i++) {
    if (points[i].price < points[i - 1].price) {
      cuts++;
      lastDropAt = points[i].at;
    }
  }
  const first = points[0].price;
  const last = points[points.length - 1].price;
  return {
    dropped: last < first,
    totalChangeLkr: last - first,
    totalChangePct: first > 0 ? ((last - first) / first) * 100 : 0,
    cuts,
    lastDropAt,
  };
}

/**
 * Card badge rule: show "Price dropped" only for a meaningful net cut
 * (≥ 1% and ≥ Rs 25,000) so rounding edits don't light up every card.
 */
export function isMeaningfulDrop(summary: PriceDropSummary | null): boolean {
  if (!summary || !summary.dropped) return false;
  return summary.totalChangePct <= -1 && Math.abs(summary.totalChangeLkr) >= 25_000;
}
