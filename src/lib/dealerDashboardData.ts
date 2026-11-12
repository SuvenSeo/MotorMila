import { formatPrice } from "@/services/api";
import type { DashboardInsights, DistrictPrice, StatsOverview } from "@/types/car";
import { englishT, type TranslateFn } from "@/lib/translate";

export type TurnoverPoint = { week: string; sellThrough: number; leads: number };
export type PriceGapPoint = { district: string; gapPct: number };
export type DistrictDemandPoint = { district: string; demandScore: number; topModel: string; avgPrice: number };

const FALLBACK_NOTIFICATIONS = [
  ["dealerDash.notifFallback", "Market intelligence syncs from live listing data when available."],
  ["dealerDash.notifConnect", "Connect dealer inventory to unlock lead notifications."],
] as const;

function median(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function buildTurnoverSeries(insights: DashboardInsights | null | undefined): TurnoverPoint[] {
  const models = insights?.trending_models?.slice(0, 6) ?? [];
  if (!models.length) return [];

  const maxCount = Math.max(...models.map((m) => m.listing_count), 1);
  return models.map((model, index) => ({
    week: model.model.slice(0, 8) || `M${index + 1}`,
    sellThrough:
      model.movement_pct != null
        ? Math.min(100, Math.max(0, 50 + model.movement_pct * 5))
        : Math.round((model.listing_count / maxCount) * 100),
    leads: model.listing_count,
  }));
}

export function buildDistrictPriceGaps(districts: DistrictPrice[]): PriceGapPoint[] {
  const medianPrice = median(districts.map((row) => row.avg_price));
  if (!medianPrice) return [];

  return [...districts]
    .filter((row) => row.avg_price > 0)
    .sort((a, b) => b.listing_count - a.listing_count)
    .slice(0, 5)
    .map((row) => ({
      district: row.district,
      gapPct: Math.abs(((row.avg_price - medianPrice) / medianPrice) * 100),
    }));
}

export function buildDistrictDemandRows(districts: DistrictPrice[]): DistrictDemandPoint[] {
  const top = [...districts].sort((a, b) => b.listing_count - a.listing_count).slice(0, 4);
  if (!top.length) return [];

  const maxCount = Math.max(...top.map((row) => row.listing_count), 1);
  return top.map((row) => ({
    district: row.district,
    demandScore: Math.round((row.listing_count / maxCount) * 100),
    topModel:
      row.top_make && row.top_model
        ? `${row.top_make} ${row.top_model}`
        : row.top_model || row.top_make || "—",
    avgPrice: row.avg_price,
  }));
}

export function buildDealerNotifications(
  insights: DashboardInsights | null | undefined,
  stats: StatsOverview | null | undefined,
  t: TranslateFn = englishT,
): string[] {
  const notes: string[] = [];

  for (const deal of insights?.hot_deals?.slice(0, 4) ?? []) {
    if (deal.price_lkr <= 0) continue;
    notes.push(
      t("dealerDash.notifHotDeal", "Hot deal: {vehicle} in {district} ({price})", {
        vehicle: `${deal.make} ${deal.model} ${deal.year}`,
        district: deal.district || t("common.sriLanka", "Sri Lanka"),
        price: formatPrice(deal.price_lkr),
      }),
    );
  }

  if (stats?.listings_this_week) {
    notes.push(
      stats.district_count
        ? t("dealerDash.notifWeek", "{n} new listings this week across {districts} districts", {
            n: stats.listings_this_week.toLocaleString(),
            districts: stats.district_count,
          })
        : t("dealerDash.notifWeekMulti", "{n} new listings this week across multiple districts", {
            n: stats.listings_this_week.toLocaleString(),
          }),
    );
  }

  if (insights?.new_listings_24h) {
    notes.push(t("dealerDash.notif24h", "{n} listings added in the last 24 hours", { n: insights.new_listings_24h.toLocaleString() }));
  }

  return notes.length ? notes : FALLBACK_NOTIFICATIONS.map(([key, fallback]) => t(key, fallback));
}
