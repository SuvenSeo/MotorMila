/** Fair-market-value payload types (shared by services/api and lib/offlineValuation without an import cycle). */
export interface FmvMethodBreakdown {
  base_median_lkr: number | null;
  km_adjustment_lkr: number | null;
  district_adjustment_lkr: number | null;
  final_fmv_lkr: number | null;
}

export interface ListingFmvDetail {
  listing_id: number | null;
  asking_lkr: number | null;
  fmv_lkr: number | null;
  deal_score: number | null;
  delta_pct: number | null;
  band: "below" | "fair" | "above" | null;
  label: string | null;
  method: string;
  sample_count: number;
  sample_size: number;
  confidence: "high" | "medium" | "low" | "none";
  comps_median_lkr: number | null;
  km_adjustment_lkr?: number | null;
  district_adjustment_lkr?: number | null;
  method_breakdown?: FmvMethodBreakdown | null;
  updated_at: string;
}
