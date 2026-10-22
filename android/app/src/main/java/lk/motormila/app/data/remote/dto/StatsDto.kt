package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Stats DTOs. Backend: backend/app/api/v1/endpoints/stats.py.
 * Shapes vary (some endpoints return raw dicts); every field is optional with
 * a default so unknown/missing keys never crash decoding (ignoreUnknownKeys).
 */
@Serializable
data class StatsSummaryDto(
    @SerialName("total_listings") val totalListings: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("price_change_mom") val priceChangeMom: Double? = null,
    @SerialName("good_deals_count") val goodDealsCount: Int = 0,
    @SerialName("listings_this_week") val listingsThisWeek: Int = 0,
    @SerialName("districts_covered") val districtsCovered: Int = 0,
    @SerialName("district_count") val districtCount: Int? = null,
    @SerialName("source_count") val sourceCount: Int = 0,
    @SerialName("last_updated") val lastUpdated: String? = null,
)

@Serializable
data class LiveMarketDto(
    @SerialName("generated_at") val generatedAt: String? = null,
    @SerialName("total_listings") val totalListings: Int = 0,
    @SerialName("priced_listings") val pricedListings: Int = 0,
    @SerialName("unavailable_price_listings") val unavailablePriceListings: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("latest_listing_at") val latestListingAt: String? = null,
    @SerialName("latest_listings") val latestListings: List<ListingDto> = emptyList(),
)

@Serializable
data class DistrictPriceDto(
    val district: String = "",
    val count: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("median_price_lkr") val medianPriceLkr: Double? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("top_make") val topMake: String? = null,
    @SerialName("top_model") val topModel: String? = null,
    @SerialName("top_model_count") val topModelCount: Int? = null,
)

@Serializable
data class DistrictPricesDto(
    val points: List<DistrictPriceDto> = emptyList(),
)

@Serializable
data class DistrictVelocityPointDto(
    val district: String = "",
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("new_7d_count") val new7dCount: Int = 0,
    @SerialName("velocity_score") val velocityScore: Double = 0.0,
)

@Serializable
data class DistrictVelocityDto(
    val points: List<DistrictVelocityPointDto> = emptyList(),
    @SerialName("generated_at") val generatedAt: String? = null,
)

@Serializable
data class TrendPointDto(
    val year: Int? = null,
    val month: Int? = null,
    val period: String? = null,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("median_price_lkr") val medianPriceLkr: Double? = null,
    @SerialName("listing_count") val listingCount: Int = 0,
)

@Serializable
data class TrendSeriesDto(
    val points: List<TrendPointDto> = emptyList(),
    @SerialName("coverage_scope") val coverageScope: String = "exact",
    @SerialName("coverage_note") val coverageNote: String? = null,
)

@Serializable
data class PriceIndexPointDto(
    val period: String = "",
    @SerialName("index_value") val indexValue: Double = 0.0,
    @SerialName("median_price_lkr") val medianPriceLkr: Double = 0.0,
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("mom_change_pct") val momChangePct: Double? = null,
)

@Serializable
data class PriceIndexDto(
    @SerialName("base_period") val basePeriod: String? = null,
    @SerialName("latest_period") val latestPeriod: String? = null,
    val points: List<PriceIndexPointDto> = emptyList(),
    val segments: Map<String, JsonElement> = emptyMap(),
    val methodology: String = "",
)

@Serializable
data class SegmentPerformanceDto(
    val segment: String = "",
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double = 0.0,
    @SerialName("change_pct_30d") val changePct30d: Double? = null,
)

@Serializable
data class TrendingModelDto(
    val make: String = "",
    val model: String = "",
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double = 0.0,
    @SerialName("movement_pct") val movementPct: Double? = null,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
)

@Serializable
data class HotDealDto(
    val id: Int = 0,
    val make: String = "",
    val model: String = "",
    val year: Int? = null,
    val district: String? = null,
    val source: String = "",
    @SerialName("price_lkr") val priceLkr: Double = 0.0,
    @SerialName("deal_score") val dealScore: Double = 0.0,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
)

@Serializable
data class InsightsDto(
    @SerialName("new_listings_24h") val newListings24h: Int = 0,
    @SerialName("segment_performance") val segmentPerformance: List<SegmentPerformanceDto> = emptyList(),
    @SerialName("trending_models") val trendingModels: List<TrendingModelDto> = emptyList(),
    @SerialName("hot_deals") val hotDeals: List<HotDealDto> = emptyList(),
)

@Serializable
data class DistrictTopModelDto(
    val make: String = "",
    val model: String = "",
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double = 0.0,
)

@Serializable
data class DistrictInsightDto(
    val district: String = "",
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("median_price_lkr") val medianPriceLkr: Double? = null,
    @SerialName("change_pct_30d") val changePct30d: Double? = null,
    @SerialName("top_models") val topModels: List<DistrictTopModelDto> = emptyList(),
)

@Serializable
data class MakeModelInsightDto(
    val make: String? = null,
    val model: String? = null,
    @SerialName("listing_count") val listingCount: Int = 0,
    /** Backend sends the count as `total` (listing_count kept for older builds). */
    val total: Int? = null,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("median_price_lkr") val medianPriceLkr: Double? = null,
    @SerialName("min_price_lkr") val minPriceLkr: Double? = null,
    @SerialName("max_price_lkr") val maxPriceLkr: Double? = null,
    @SerialName("trend_points") val trendPoints: List<TrendPointDto> = emptyList(),
    @SerialName("coverage_scope") val coverageScope: String = "exact",
    @SerialName("coverage_note") val coverageNote: String? = null,
)

@Serializable
data class MakeInsightDto(
    val make: String = "",
    @SerialName("listing_count") val listingCount: Int = 0,
    /** Backend sends the count as `total` (listing_count kept for older builds). */
    val total: Int? = null,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("median_price_lkr") val medianPriceLkr: Double? = null,
    @SerialName("top_models") val topModels: List<DistrictTopModelDto> = emptyList(),
    @SerialName("trend_points") val trendPoints: List<TrendPointDto> = emptyList(),
)

@Serializable
data class FuelMixBucketDto(
    @SerialName("fuel_type") val fuelType: String = "",
    val count: Int = 0,
    val pct: Double = 0.0,
    val share: Double? = null,
)

@Serializable
data class FuelMixDto(
    val total: Int = 0,
    val buckets: List<FuelMixBucketDto> = emptyList(),
    @SerialName("generated_at") val generatedAt: String? = null,
)

@Serializable
data class HybridBandDto(
    val band: String = "",
    val label: String? = null,
    val count: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
)

@Serializable
data class HybridBandsDto(
    @SerialName("total_hybrids") val totalHybrids: Int = 0,
    val bands: List<HybridBandDto> = emptyList(),
    @SerialName("generated_at") val generatedAt: String? = null,
)

@Serializable
data class SourceQualityRowDto(
    val source: String = "",
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("priced_share") val pricedShare: Double? = null,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
)

@Serializable
data class SourceQualityDto(
    @SerialName("generated_at") val generatedAt: String? = null,
    val sources: List<SourceQualityRowDto> = emptyList(),
    val rows: List<SourceQualityRowDto> = emptyList(),
) {
    val allSources: List<SourceQualityRowDto> get() = sources.ifEmpty { rows }
}

@Serializable
data class EvInsightDto(
    @SerialName("top_models") val topModels: List<TrendingModelDto> = emptyList(),
    @SerialName("trend_points") val trendPoints: List<TrendPointDto> = emptyList(),
    @SerialName("listing_count") val listingCount: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
    // Current backend shape (stats/ev-insight): ev_count, median_ev_price_lkr, top_ev_models.
    @SerialName("ev_count") val evCount: Int? = null,
    @SerialName("median_ev_price_lkr") val medianEvPriceLkr: Double? = null,
    @SerialName("top_ev_models") val topEvModels: List<TrendingModelDto> = emptyList(),
)

@Serializable
data class ImportEraSliceDto(
    val era: String = "",
    val label: String? = null,
    val count: Int = 0,
    @SerialName("avg_price_lkr") val avgPriceLkr: Double? = null,
)

@Serializable
data class ImportEraSplitDto(val slices: List<ImportEraSliceDto> = emptyList())
