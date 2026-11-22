export type ProExportFormat = "pdf" | "docx" | "csv" | "json" | "print";
export type ProDetailKind = "market" | "vehicle_lane" | "district" | "trend" | "source" | "listing";
export type ProReportTheme = "executive-dark" | "board-light" | "dealer-slate";
export type ProReportSectionId = "metrics" | "breakdowns" | "trends" | "listings" | "table" | "filters" | "disclaimer";

export interface ProListingSample {
  id: number;
  title: string;
  make: string;
  model: string;
  year?: number | null;
  price_lkr?: number | null;
  district?: string | null;
  source: string;
  deal_score?: number | null;
  thumbnail_url?: string | null;
  detail_url?: string | null;
  external_url?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

export interface ProBreakdownPoint {
  label: string;
  count: number;
  share_pct: number;
  avg_price_lkr?: number | null;
  latest_seen_at?: string | null;
}

export interface ProTrendPoint {
  month: string;
  avg_price_lkr?: number | null;
  median_price_lkr?: number | null;
  listing_count: number;
}

export interface ProMetric {
  label: string;
  value: string;
  detail?: string | null;
}

export interface ProMarketSnapshot {
  generated_at: string;
  total_listings: number;
  avg_price_lkr?: number | null;
  median_price_lkr?: number | null;
  min_price_lkr?: number | null;
  max_price_lkr?: number | null;
  new_listings_7d: number;
  districts_covered: number;
  source_count: number;
  hot_deal_count: number;
  last_updated?: string | null;
  source_coverage: ProBreakdownPoint[];
  top_opportunities: ProListingSample[];
}

export interface ProVehicleLane {
  make: string;
  model: string;
  listing_count: number;
  avg_price_lkr?: number | null;
  median_price_lkr?: number | null;
  min_price_lkr?: number | null;
  max_price_lkr?: number | null;
  avg_deal_score?: number | null;
  district_count: number;
  source_count: number;
  top_district?: string | null;
  top_source?: string | null;
  latest_seen_at?: string | null;
  /** Trailing six monthly medians, oldest first. Present once the link is on the extended Pro API. */
  spark_6m?: ProLaneSparkPoint[];
  /** Median change across the lane's monthly series; null when the series is too short. */
  change_90d_pct?: number | null;
  /** Fresh supply: listings first seen in the last seven days. */
  new_7d_count?: number;
}

export interface ProDistrictProfile {
  district: string;
  listing_count: number;
  avg_price_lkr?: number | null;
  median_price_lkr?: number | null;
  min_price_lkr?: number | null;
  max_price_lkr?: number | null;
  source_count: number;
  top_make?: string | null;
  top_model?: string | null;
  latest_seen_at?: string | null;
  top_models: Array<{
    make: string;
    model: string;
    listing_count: number;
    avg_price_lkr: number;
  }>;
  source_mix: ProBreakdownPoint[];
  sample_listings: ProListingSample[];
}

export interface ProDetailPayload {
  kind: ProDetailKind;
  title: string;
  summary: string;
  generated_at: string;
  metrics: ProMetric[];
  source_mix: ProBreakdownPoint[];
  district_mix: ProBreakdownPoint[];
  trend_points: ProTrendPoint[];
  sample_listings: ProListingSample[];
}

export interface ProVehicleLaneFilters {
  make?: string;
  model?: string;
  district?: string;
  condition?: string;
  limit?: number;
}

export interface ProReportPayload {
  title: string;
  subtitle?: string;
  scope: ProDetailKind;
  generatedAt: string;
  preparedFor?: string;
  notes?: string;
  coverSummary?: string;
  theme?: ProReportTheme;
  sections?: ProReportSectionId[];
  includeDisclaimer?: boolean;
  filters?: Record<string, string | number | null | undefined>;
  metrics?: ProMetric[];
  breakdowns?: Array<{
    title: string;
    rows: ProBreakdownPoint[];
  }>;
  trends?: ProTrendPoint[];
  listings?: ProListingSample[];
  table?: {
    title: string;
    columns: string[];
    rows: Array<Array<string | number | null | undefined>>;
  };
}

export interface ProArbitrageGap {
  /** Populated in market-wide scans, null when the scan was scoped to one lane. */
  make?: string | null;
  model?: string | null;
  buy_district: string;
  sell_district: string;
  buy_median_lkr: number;
  sell_median_lkr: number;
  gap_pct: number;
  buy_listing_count: number;
  sell_listing_count: number;
}

export interface ProArbitrageGapsParams {
  make: string;
  model: string;
  limit?: number;
}

export interface ProReportOptions {
  title?: string;
  subtitle?: string;
  preparedFor?: string;
  notes?: string;
  coverSummary?: string;
  theme?: ProReportTheme;
  sections?: ProReportSectionId[];
  listingLimit?: number;
  includeFilters?: boolean;
  includeDisclaimer?: boolean;
}

/** One month of a lane's own price series, for the in-table sparkline. */
export interface ProLaneSparkPoint {
  month: string;
  median_price_lkr: number | null;
  listing_count: number;
}

/** Daily count of newly first-seen listings. */
export interface ProDailySupplyPoint {
  date: string;
  count: number;
}

export interface ProPriceBand {
  label: string;
  low_lkr: number;
  high_lkr: number;
  count: number;
}

export interface ProScoreBand {
  label: string;
  count: number;
  share_pct: number;
}

export interface ProDaysToClear {
  median_days: number | null;
  p25_days: number | null;
  p75_days: number | null;
  sample_size: number;
}

export interface ProPriceCutShare {
  cut_count: number;
  tracked_count: number;
  share_pct: number;
}

/** `/pro/market-pulse` — the desk's supply, spread and velocity evidence. */
export interface ProMarketPulse {
  generated_at: string;
  new_24h: number;
  new_7d: number;
  daily_supply: ProDailySupplyPoint[];
  price_deciles: ProPriceBand[];
  deal_score_bands: ProScoreBand[];
  days_to_clear: ProDaysToClear;
  price_cut_share: ProPriceCutShare;
}
