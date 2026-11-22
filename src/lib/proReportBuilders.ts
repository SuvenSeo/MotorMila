/**
 * Report payload builders — pure functions from Pro data to the export shape.
 * Every export in the workspace (the drawer, the quick packs, a detail sheet)
 * is assembled here, so a report can never disagree with the desk above it.
 */

import { formatLkrCompact } from "@/lib/price";
import type {
  ProBreakdownPoint,
  ProDetailPayload,
  ProDistrictProfile,
  ProMarketSnapshot,
  ProReportPayload,
  ProTrendPoint,
  ProVehicleLane,
} from "@/types/pro";

const money = (value: number | null | undefined) => formatLkrCompact(value);
const count = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US");
const date = (value: string | null | undefined) => {
  if (!value) return "Pending";
  const at = new Date(value);
  return Number.isFinite(at.getTime()) ? at.toLocaleDateString("en-LK", { month: "short", day: "numeric", year: "numeric" }) : "Pending";
};

export function marketReport(
  snapshot: ProMarketSnapshot | null,
  lanes: ProVehicleLane[],
  districts: ProDistrictProfile[],
): ProReportPayload {
  return {
    title: "Motormila Pro Market Summary",
    subtitle: "Professional Sri Lanka vehicle market intelligence",
    scope: "market",
    generatedAt: new Date().toISOString(),
    metrics: snapshot
      ? [
          { label: "Priced listings", value: count(snapshot.total_listings), detail: "Non-outlier inventory" },
          { label: "Median price", value: money(snapshot.median_price_lkr) },
          { label: "New listings 7d", value: count(snapshot.new_listings_7d) },
          { label: "Hot deals", value: count(snapshot.hot_deal_count) },
        ]
      : [],
    breakdowns: snapshot ? [{ title: "Source Coverage", rows: snapshot.source_coverage }] : [],
    listings: snapshot?.top_opportunities || [],
    table: {
      title: "Top Vehicle Lanes",
      columns: ["Vehicle", "Listings", "Median", "Avg Deal", "Top District", "Top Source"],
      rows: lanes.slice(0, 20).map((lane) => [
        `${lane.make} ${lane.model}`,
        lane.listing_count,
        money(lane.median_price_lkr),
        lane.avg_deal_score?.toFixed(1) || "N/A",
        lane.top_district || "N/A",
        lane.top_source || "N/A",
      ]),
    },
    filters: {
      districts: districts.length,
      sources: snapshot?.source_count || 0,
    },
  };
}

export function detailReport(detail: ProDetailPayload): ProReportPayload {
  return {
    title: detail.title,
    subtitle: detail.summary,
    scope: detail.kind,
    generatedAt: new Date().toISOString(),
    metrics: detail.metrics,
    breakdowns: [
      { title: "Source Mix", rows: detail.source_mix },
      { title: "District Mix", rows: detail.district_mix },
    ].filter((item) => item.rows.length),
    trends: detail.trend_points,
    listings: detail.sample_listings,
  };
}

export function sourceReport(snapshot: ProMarketSnapshot, source: ProBreakdownPoint): ProReportPayload {
  return {
    title: `${source.label} Source Quality`,
    subtitle: `${source.count.toLocaleString()} listings, ${source.share_pct.toFixed(1)}% of tracked priced inventory`,
    scope: "source",
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: "Listings", value: count(source.count) },
      { label: "Share", value: `${source.share_pct.toFixed(1)}%` },
      { label: "Average price", value: money(source.avg_price_lkr) },
      { label: "Latest seen", value: date(source.latest_seen_at) },
    ],
    breakdowns: [{ title: "Full Source Coverage", rows: snapshot.source_coverage }],
    listings: snapshot.top_opportunities.filter((listing) => listing.source.toLowerCase() === source.label.toLowerCase()),
  };
}

export function lanesTableReport(lanes: ProVehicleLane[]): ProReportPayload {
  return {
    title: "Motormila Vehicle Lane Table",
    subtitle: "Grouped Pro vehicle intelligence rows",
    scope: "vehicle_lane",
    generatedAt: new Date().toISOString(),
    coverSummary: "Current make and model lanes ranked by market depth, price band, deal score, and source coverage.",
    metrics: [
      { label: "Vehicle lanes", value: count(lanes.length), detail: "Grouped make and model rows" },
      { label: "Total listings", value: count(lanes.reduce((sum, lane) => sum + lane.listing_count, 0)) },
      { label: "Sources", value: count(new Set(lanes.map((lane) => lane.top_source).filter(Boolean)).size) },
      { label: "District leaders", value: count(new Set(lanes.map((lane) => lane.top_district).filter(Boolean)).size) },
    ],
    table: {
      title: "Vehicle Lanes",
      columns: ["Vehicle", "Listings", "Median", "Min", "Max", "Avg Deal", "Top District", "Top Source"],
      rows: lanes.map((lane) => [
        `${lane.make} ${lane.model}`,
        lane.listing_count,
        money(lane.median_price_lkr),
        money(lane.min_price_lkr),
        money(lane.max_price_lkr),
        lane.avg_deal_score?.toFixed(1) || "N/A",
        lane.top_district || "N/A",
        lane.top_source || "N/A",
      ]),
    },
  };
}

export function districtsTableReport(districts: ProDistrictProfile[]): ProReportPayload {
  return {
    title: "Motormila District Opportunity Pack",
    subtitle: "District-level Pro intelligence rows",
    scope: "district",
    generatedAt: new Date().toISOString(),
    coverSummary: "Area profiles compare inventory depth, median price, source coverage, and leading models by district.",
    metrics: [
      { label: "District profiles", value: count(districts.length) },
      { label: "Total listings", value: count(districts.reduce((sum, district) => sum + district.listing_count, 0)) },
      { label: "Highest supply", value: districts[0]?.district || "N/A" },
      { label: "Source depth", value: count(Math.max(0, ...districts.map((district) => district.source_count))) },
    ],
    table: {
      title: "District Profiles",
      columns: ["District", "Listings", "Median", "Range", "Top Model", "Sources"],
      rows: districts.map((district) => [
        district.district,
        district.listing_count,
        money(district.median_price_lkr),
        `${money(district.min_price_lkr)} - ${money(district.max_price_lkr)}`,
        `${district.top_make || ""} ${district.top_model || ""}`.trim(),
        district.source_count,
      ]),
    },
  };
}

/** Monthly points in millions, the shape the legacy trend chart takes. */
export function trendRows(points: ProTrendPoint[]) {
  return points.map((point) => ({
    month: point.month,
    median: Number(point.median_price_lkr || point.avg_price_lkr || 0) / 1_000_000,
    avg: Number(point.avg_price_lkr || 0) / 1_000_000,
    samples: point.listing_count,
  }));
}

/** Monthly points in rupees, the shape the desk charts take. */
export function monthlyPoints(points: ProTrendPoint[]) {
  return points.map((point) => ({
    label: point.month,
    median: point.median_price_lkr ?? null,
    average: point.avg_price_lkr ?? null,
    count: point.listing_count,
  }));
}
