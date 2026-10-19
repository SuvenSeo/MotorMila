export type Condition = "brand_new" | "reconditioned" | "used";
export type Transmission = "automatic" | "manual" | "cvt" | "tiptronic";
export type FuelType = "petrol" | "diesel" | "hybrid" | "electric" | "plugin_hybrid";
export type BodyType =
  | "sedan"
  | "suv"
  | "hatchback"
  | "crossover"
  | "mpv"
  | "van"
  | "truck"
  | "motorcycle"
  | "pickup"
  | "wagon"
  | "coupe"
  | "convertible"
  | "jeep"
  | "mini"
  | "luxury";
export type VehicleCategory =
  | "cars"
  | "motorbikes"
  | "three-wheelers"
  | "vans"
  | "buses"
  | "lorries"
  | "heavy-duty"
  | "tractors"
  | "bicycles"
  | "boats"
  | "others";
export type SortOption = "newest" | "deal_score" | "price_asc" | "price_desc" | "mileage_asc";
export type PriceAvailability = "priced" | "unavailable";

export interface CarListing {
  id: number;
  source: string;
  source_id: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  condition: Condition;
  mileage_km: number;
  transmission: Transmission;
  fuel_type: FuelType;
  engine_cc?: number;
  body_type: BodyType;
  vehicle_category?: VehicleCategory | string;
  color?: string;
  price_lkr: number | null;
  deal_score: number;
  market_median_lkr?: number;
  price_drop_pct?: number;
  district: string;
  province: string;
  city?: string;
  lat?: number;
  lng?: number;
  is_dealer: boolean;
  seller_name?: string;
  title: string;
  description?: string;
  url?: string;
  detail_url: string;
  external_url?: string;
  thumbnail_url?: string;
  images?: string[];
  scraped_at: string;
  first_seen_at: string;
  last_seen_at?: string;
  /** False once the lifecycle pass stops seeing the ad at its source (likely sold/delisted). */
  is_active?: boolean;
}

export interface PriceDropItem {
  listing: CarListing;
  previous_price_lkr: number;
  new_price_lkr: number;
  drop_pct: number;
  dropped_at: string;
}

export interface PriceHistoryPoint {
  price_lkr: number;
  scraped_at: string;
}

// ── History report (used by ListingHistoryReport on listing detail) ──
export interface HistoryReportFlag {
  kind: string;
  severity: "high" | "medium" | "info" | string;
  detail: string;
}

export interface HistoryReportRelatedListing {
  id: number;
  source: string;
  title: string;
  price_lkr: number | null;
  mileage: number | null;
  first_seen_at: string | null;
  is_active: boolean;
  confidence: "confirmed" | "likely" | string;
}

export interface HistoryReport {
  listing_id: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  days_on_market: number | null;
  is_active: boolean;
  price_points: PriceHistoryPoint[];
  price_cuts: number;
  total_change_pct: number | null;
  related_listings: HistoryReportRelatedListing[];
  flags: HistoryReportFlag[];
  disclaimer: string;
}

// ── Price index (additive — supports the in-progress market index page) ──
export interface PriceIndexPoint {
  period: string;
  index_value: number;
  mom_change_pct: number | null;
  median_price_lkr?: number | null;
  sample_size?: number | null;
}

export interface PriceIndex {
  base_period: string;
  points: PriceIndexPoint[];
  segments: Record<string, PriceIndexPoint[]>;
  methodology?: string | null;
  last_updated?: string | null;
}

export interface PriceHistoryInfo {
  listing_id: number;
  points: PriceHistoryPoint[];
  first_price_lkr: number | null;
  current_price_lkr: number | null;
  change_pct: number | null;
  /** Number of downward price moves between successive points. */
  cut_count: number;
  /** Number of upward price moves between successive points. */
  raise_count: number;
  highest_price_lkr?: number | null;
  lowest_price_lkr?: number | null;
  last_change_at?: string | null;
  tracked_points?: number;
}

export interface SellerTrustProfile {
  source: string;
  source_url: string;
  seller_name?: string;
  seller_type: "dealer" | "private" | "unknown";
  member_since?: string;
  listing_count?: number;
  review_count?: number;
  rating?: number;
  phone_numbers: string[];
  whatsapp_numbers: string[];
  verified_badges: string[];
  fetched_at?: string;
}

export interface StatsOverview {
  total_listings: number;
  avg_price_lkr: number;
  listings_this_week: number;
  price_change_mom: number | null;
  top_makes: { make: string; count: number }[];
  district_count: number;
  good_deals_count: number;
  source_count: number;
  last_updated: string | null;
}

export interface PriceEstimate {
  low: number;
  median: number;
  high: number;
  currency: string;
  confidence: "high" | "medium" | "low";
  comparable_count: number;
  methodology: string;
  mileage_adjusted: boolean;
}

export interface PriceTrendPoint {
  month: string;
  median_price: number;
  avg_price: number;
  sample_count: number;
}

export type PriceTrendCoverageScope =
  | "exact"
  | "condition_fallback"
  | "district_fallback"
  | "national_fallback"
  | "partial"
  | "current_snapshot"
  | "current_snapshot_fallback"
  | "none";

export interface PriceTrendSeries {
  points: PriceTrendPoint[];
  coverage_scope: PriceTrendCoverageScope;
  coverage_note: string | null;
}

export interface DistrictPrice {
  district: string;
  avg_price: number;
  median_price?: number;
  listing_count: number;
  lat: number;
  lng: number;
  top_make?: string;
  top_model?: string;
  top_model_count?: number;
}

export interface DistrictVelocityPoint {
  district: string;
  lat: number;
  lng: number;
  listing_count: number;
  new_7d_count: number;
  velocity_score: number;
}

export interface DistrictVelocityData {
  points: DistrictVelocityPoint[];
  generated_at: string;
}

export interface SegmentPerformance {
  segment: string;
  listing_count: number;
  avg_price_lkr: number;
  change_pct_30d: number | null;
}

export interface TrendingModelInsight {
  make: string;
  model: string;
  listing_count: number;
  avg_price_lkr: number;
  movement_pct: number | null;
  thumbnail_url: string | null;
}

export interface HotDealInsight {
  id: number;
  make: string;
  model: string;
  year: number;
  district: string | null;
  source: string;
  price_lkr: number;
  deal_score: number;
  thumbnail_url: string | null;
}

export interface DashboardInsights {
  new_listings_24h: number;
  segment_performance: SegmentPerformance[];
  trending_models: TrendingModelInsight[];
  hot_deals: HotDealInsight[];
}

export interface MarketSignal {
  id: number;
  source: string;
  signal_type: string;
  period_year: number | null;
  period_month: number | null;
  metric: string;
  category: string | null;
  value_numeric: number | null;
  unit: string | null;
  source_url: string;
  observed_at: string;
}

export interface DistrictTopModel {
  make: string;
  model: string;
  listing_count: number;
  avg_price_lkr: number;
}

export interface DistrictQuickInsight {
  district: string;
  listing_count: number;
  avg_price_lkr: number | null;
  median_price_lkr: number | null;
  change_pct_30d: number | null;
  top_models: DistrictTopModel[];
}

export interface PipelineJobStatus {
  name: string;
  status: "ok" | "running" | "delayed";
  last_status?: string | null;
  last_success: string | null;
  last_run: string | null;
  last_finished?: string | null;
  last_error?: string | null;
  expected_hours: number;
}

export interface PipelineStatusResponse {
  generated_at: string;
  overall_status: "ok" | "running" | "delayed";
  jobs: PipelineJobStatus[];
}

export type PipelineTriggerJob = "sync" | "alt_sync";

export interface PipelineRunRecord {
  id: number;
  source: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  listings_found: number;
  listings_new: number;
  error_message: string | null;
}

export interface PipelineRunsResponse {
  count: number;
  runs: PipelineRunRecord[];
}

export interface LiveMarketRun {
  source: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  listings_found: number;
  listings_new: number;
  error_message?: string | null;
}

export interface LiveMarketSnapshot {
  generated_at: string;
  total_listings: number;
  priced_listings: number;
  unavailable_price_listings: number;
  avg_price_lkr: number | null;
  latest_listing_at: string | null;
  active_scrape_sources: string[];
  latest_run: LiveMarketRun | null;
  source_status: LiveMarketRun[];
  /** Newest ads by first_seen_at; rebuilt on daily/midday stats-only exports. */
  latest_listings: CarListing[];
}

export interface PipelineTriggerResponse {
  accepted: boolean;
  job: PipelineTriggerJob;
  pid: number;
  command: string;
  started_at: string;
}

export interface MakeModelDistrictEntry {
  district: string;
  count: number;
  avg_price_lkr: number | null;
}

export interface MakeModelInsight {
  make: string;
  model: string;
  total: number;
  avg_price_lkr: number | null;
  median_price_lkr: number | null;
  top_districts: MakeModelDistrictEntry[];
}

export interface ModelPriceHistoryPoint {
  period: string;
  period_year: number;
  period_month: number;
  median_price_lkr: number | null;
  listing_count: number;
  origin: "live_aggregates" | "archive_observations" | string;
}

export interface ModelPriceYomBucket {
  yom: number;
  listing_count: number;
  avg_price_lkr: number | null;
  median_price_lkr: number | null;
  note?: string;
}

export interface ModelPriceHistory {
  make: string;
  model: string;
  from_year: number;
  to_year: number;
  calendar_series: {
    live_aggregates: ModelPriceHistoryPoint[];
    archive_observations: ModelPriceHistoryPoint[];
  };
  cross_section_by_yom: ModelPriceYomBucket[];
  counts: {
    aggregate_points: number;
    archive_points: number;
    archive_listings: number;
    yom_buckets: number;
  };
  interpretation: {
    calendar_series: string;
    cross_section_by_yom: string;
  };
}

export interface MakeInsightModelEntry {
  model: string;
  count: number;
  avg_price_lkr: number | null;
}

export interface MakeInsight {
  make: string;
  total: number;
  avg_price_lkr: number | null;
  median_price_lkr: number | null;
  top_models: MakeInsightModelEntry[];
  /** Full cleaned model list for the make (may be absent on older backends). */
  all_models?: MakeInsightModelEntry[];
  top_districts: MakeModelDistrictEntry[];
}

export interface FuelMixBucket {
  fuel_type: string;
  count: number;
  pct: number;
}

export interface FuelMixData {
  total: number;
  buckets: FuelMixBucket[];
  generated_at: string;
}

export interface HybridBand {
  label: string;
  cc_max: number | null;
  count: number;
  median_price_lkr: number | null;
}

export interface HybridBandsData {
  total_hybrids: number;
  bands: HybridBand[];
  generated_at: string;
}

export interface EvModelEntry {
  make: string;
  model: string;
  listing_count: number;
  median_price_lkr: number | null;
}

export interface EvHybridBenchmark {
  make: string;
  model: string;
  median_price_lkr: number | null;
  listing_count: number;
}

export interface EvInsightData {
  ev_count: number;
  ev_pct: number;
  median_ev_price_lkr: number | null;
  top_ev_models: EvModelEntry[];
  hybrid_benchmark: EvHybridBenchmark;
  generated_at: string;
}

export interface SourceQualityRow {
  source: string;
  listing_count: number;
  price_fill_rate: number;
  fresh_24h_pct: number;
  outlier_rate: number;
  duplicate_rate: number;
}

export interface SourceQualityResponse {
  generated_at: string;
  sources: SourceQualityRow[];
}

export type ImportEra = "pre_freeze" | "post_freeze";

export interface ImportEraEntry {
  era: ImportEra;
  label: string;
  count: number;
  median_price_lkr: number | null;
}

export interface ImportEraMakeRow {
  make: string;
  pre_freeze: ImportEraEntry;
  post_freeze: ImportEraEntry;
}

export interface ImportEraSplitData {
  makes: ImportEraMakeRow[];
  freeze_boundary_year: number;
  generated_at: string;
}

export interface FilterState {
  q?: string;
  source?: string;
  make?: string;
  model?: string;
  year_min?: number;
  year_max?: number;
  condition?: Condition;
  body_type?: BodyType;
  mileage_max?: number;
  price_min?: number;
  price_max?: number;
  transmission?: Transmission;
  fuel_type?: FuelType;
  district?: string;
  /** Browse category — defaults to cars on the homepage. */
  vehicle_category?: VehicleCategory;
  price_availability?: PriceAvailability;
  /** Only listings first seen in the last 24h (the "New in 24h" hero chip). */
  fresh_24h?: boolean;
  sort: SortOption;
  page: number;
}
