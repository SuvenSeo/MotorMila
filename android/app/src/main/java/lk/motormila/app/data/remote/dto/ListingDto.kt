package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * Listing DTOs. Backend: backend/app/models/schemas.py + endpoints/listings.py.
 * All numeric/optional fields are nullable-safe: free-plan responses null out
 * deal_score/market_median, and unpriced listings carry price_lkr=null.
 */
@Serializable
data class ListingDto(
    val id: Int = 0,
    val source: String = "",
    @SerialName("source_id") val sourceId: String? = null,
    val url: String? = null,
    val title: String? = null,
    val make: String = "",
    val model: String = "",
    val year: Int? = null,
    @SerialName("price_lkr") val priceLkr: Double? = null,
    val mileage: Int? = null,
    @SerialName("fuel_type") val fuelType: String? = null,
    val transmission: String? = null,
    @SerialName("engine_capacity") val engineCapacity: Int? = null,
    val condition: String? = null,
    @SerialName("body_type") val bodyType: String? = null,
    @SerialName("vehicle_category") val vehicleCategory: String? = null,
    val district: String? = null,
    val city: String? = null,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    val images: List<String>? = null,
    @SerialName("scraped_at") val scrapedAt: String? = null,
    @SerialName("first_seen_at") val firstSeenAt: String? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("deal_score") val dealScore: Double? = null,
    @SerialName("market_median_lkr") val marketMedianLkr: Double? = null,
    @SerialName("is_outlier") val isOutlier: Boolean = false,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("detail_url") val detailUrl: String? = null,
    @SerialName("external_url") val externalUrl: String? = null,
)

@Serializable
data class PagedListingsDto(
    val items: List<ListingDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val size: Int = 10,
    val pages: Int = 0,
)

@Serializable
data class ListingSearchSuggestionDto(
    val id: Int = 0,
    val make: String = "",
    val model: String = "",
    val year: Int? = null,
    val district: String? = null,
    @SerialName("price_lkr") val priceLkr: Double? = null,
    val source: String = "",
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    val url: String? = null,
)

@Serializable
data class PriceHistoryPointDto(
    @SerialName("price_lkr") val priceLkr: Double = 0.0,
    @SerialName("scraped_at") val scrapedAt: String = "",
)

@Serializable
data class PriceHistoryDto(
    @SerialName("listing_id") val listingId: Int = 0,
    val points: List<PriceHistoryPointDto> = emptyList(),
    @SerialName("first_price_lkr") val firstPriceLkr: Double? = null,
    @SerialName("current_price_lkr") val currentPriceLkr: Double? = null,
    @SerialName("change_pct") val changePct: Double? = null,
    @SerialName("cut_count") val cutCount: Int = 0,
    @SerialName("raise_count") val raiseCount: Int = 0,
    @SerialName("highest_price_lkr") val highestPriceLkr: Double? = null,
    @SerialName("lowest_price_lkr") val lowestPriceLkr: Double? = null,
    @SerialName("last_change_at") val lastChangeAt: String? = null,
    @SerialName("tracked_points") val trackedPoints: Int = 0,
)

@Serializable
data class HistoryReportFlagDto(
    val kind: String = "",
    val severity: String = "info",
    val detail: String = "",
)

@Serializable
data class HistoryReportRelatedDto(
    val id: Int = 0,
    val source: String = "",
    val title: String = "",
    @SerialName("price_lkr") val priceLkr: Double? = null,
    val mileage: Int? = null,
    @SerialName("first_seen_at") val firstSeenAt: String? = null,
    @SerialName("is_active") val isActive: Boolean = true,
    val confidence: String = "",
)

@Serializable
data class HistoryReportDto(
    @SerialName("listing_id") val listingId: Int = 0,
    @SerialName("first_seen_at") val firstSeenAt: String? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("days_on_market") val daysOnMarket: Int? = null,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("price_points") val pricePoints: List<PriceHistoryPointDto> = emptyList(),
    @SerialName("price_cuts") val priceCuts: Int = 0,
    @SerialName("total_change_pct") val totalChangePct: Double? = null,
    @SerialName("related_listings") val relatedListings: List<HistoryReportRelatedDto> = emptyList(),
    val flags: List<HistoryReportFlagDto> = emptyList(),
    val disclaimer: String = "",
)

/** GET /listings/{id}/fmv -> predict_listing_fmv dict. Lenient: keys vary by method. */
@Serializable
data class FmvDto(
    @SerialName("asking_lkr") val askingLkr: Double? = null,
    @SerialName("asking_price_lkr") val askingPriceLkr: Double? = null,
    @SerialName("fmv_lkr") val fmvLkr: Double? = null,
    @SerialName("predicted_price_lkr") val predictedPriceLkr: Double? = null,
    @SerialName("deal_score") val dealScore: Double? = null,
    @SerialName("delta_pct") val deltaPct: Double? = null,
    @SerialName("price_gap_pct") val priceGapPct: Double? = null,
    val label: String? = null,
    val verdict: String? = null,
    val method: String? = null,
    val methodology: String? = null,
    @SerialName("sample_count") val sampleCount: Int? = null,
    @SerialName("comparable_count") val comparableCount: Int? = null,
    val confidence: String? = null,
)

@Serializable
data class SellerProfileDto(
    val source: String = "",
    @SerialName("source_url") val sourceUrl: String = "",
    @SerialName("seller_name") val sellerName: String? = null,
    @SerialName("seller_type") val sellerType: String = "unknown",
    @SerialName("member_since") val memberSince: String? = null,
    @SerialName("listing_count") val listingCount: Int? = null,
    @SerialName("review_count") val reviewCount: Int? = null,
    val rating: Double? = null,
    @SerialName("phone_numbers") val phoneNumbers: List<String> = emptyList(),
    @SerialName("whatsapp_numbers") val whatsappNumbers: List<String> = emptyList(),
    @SerialName("verified_badges") val verifiedBadges: List<String> = emptyList(),
    @SerialName("fetched_at") val fetchedAt: String? = null,
)

/** GET /listings/{id}/safety-research and GET /vehicles/safety-research. */
@Serializable
data class SafetyResearchDto(
    val make: String? = null,
    val model: String? = null,
    val year: Int? = null,
    val rating: String? = null,
    @SerialName("overall_rating") val overallRating: String? = null,
    val summary: String? = null,
    val recalls: List<SafetyRecallDto> = emptyList(),
    val complaints: List<SafetyComplaintDto> = emptyList(),
    val sources: List<String> = emptyList(),
)

@Serializable
data class SafetyRecallDto(
    @SerialName("component") val component: String? = null,
    val summary: String? = null,
    val date: String? = null,
)

@Serializable
data class SafetyComplaintDto(
    val component: String? = null,
    val summary: String? = null,
    val date: String? = null,
)

/** GET /listings/{id}/geo -> enrich_listing dict. */
@Serializable
data class GeoDto(
    val lat: Double? = null,
    val lng: Double? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    @SerialName("display_name") val displayName: String? = null,
    val district: String? = null,
    val city: String? = null,
    val confidence: Double? = null,
    val unavailable: Boolean = false,
    val reason: String? = null,
)

@Serializable
data class PriceDropItemDto(
    val listing: ListingDto = ListingDto(),
    @SerialName("previous_price_lkr") val previousPriceLkr: Double = 0.0,
    @SerialName("new_price_lkr") val newPriceLkr: Double = 0.0,
    @SerialName("drop_pct") val dropPct: Double = 0.0,
    @SerialName("dropped_at") val droppedAt: String = "",
)

@Serializable
data class PriceDropsDto(
    val items: List<PriceDropItemDto> = emptyList(),
    @SerialName("window_days") val windowDays: Int = 7,
)

/**
 * Static export shape: backend/export_public_snapshots.py price-sparklines.json.
 * Each entry is the last ≤8 [price_lkr, scraped_at] pairs, oldest first.
 */
@Serializable
data class PriceSparklinesDto(
    val sparklines: Map<String, List<List<JsonElement>>> = emptyMap(),
    @SerialName("generated_at") val generatedAt: String? = null,
    val unavailable: Boolean = false,
) {
    /** Chronological (price, iso-timestamp) pairs for a listing, or null. */
    fun pointsFor(listingId: Int): List<Pair<Double, String>>? {
        val raw = sparklines[listingId.toString()] ?: return null
        if (raw.isEmpty()) return null
        return raw.mapNotNull { pair ->
            if (pair.size < 2) return@mapNotNull null
            val price = (pair[0] as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
            val at = (pair[1] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            price to at
        }.takeIf { it.isNotEmpty() }
    }
}

@Serializable
data class SourcesDto(val sources: List<String> = emptyList())

/** GET /listings/sources -> [{source,label,count}]. */
@Serializable
data class SourceRowDto(
    val source: String = "",
    val label: String? = null,
    val count: Int = 0,
)

/** GET /listings/makes -> [{make,count}]. */
@Serializable
data class MakeRowDto(
    val make: String = "",
    val count: Int = 0,
)

/** GET /listings/models?make= -> [{model,count}]. */
@Serializable
data class ModelRowDto(
    val model: String = "",
    val count: Int = 0,
)

@Serializable
data class MakesDto(val makes: List<String> = emptyList())

@Serializable
data class ModelsDto(val models: List<String> = emptyList())

/**
 * GET /listings/estimate?make=&model=&year=... returns a mean ±15% band.
 * Backend keys (listings.py:1831-1841):
 * {make,model,year,estimated_price_lkr,price_range_low,price_range_high,
 *  min_seen_lkr,max_seen_lkr,comparable_listings}.
 */
@Serializable
data class EstimateDto(
    val make: String? = null,
    val model: String? = null,
    val year: Int? = null,
    @SerialName("estimated_price_lkr") val estimatedPriceLkr: Double? = null,
    @SerialName("price_range_low") val priceRangeLow: Double? = null,
    @SerialName("price_range_high") val priceRangeHigh: Double? = null,
    @SerialName("min_seen_lkr") val minSeenLkr: Double? = null,
    @SerialName("max_seen_lkr") val maxSeenLkr: Double? = null,
    @SerialName("comparable_listings") val comparableListings: Int = 0,
)

@Serializable
data class CustomEstimateInputDto(
    val make: String,
    val model: String,
    val year: Int,
    @SerialName("mileage_km") val mileageKm: Int? = null,
    val condition: String? = null,
    val transmission: String? = null,
    @SerialName("fuel_type") val fuelType: String? = null,
    @SerialName("body_type") val bodyType: String? = null,
    val district: String? = null,
    @SerialName("asking_price_lkr") val askingPriceLkr: Double? = null,
)

@Serializable
data class ComparableVehicleDto(
    val id: Int = 0,
    val title: String = "",
    @SerialName("price_lkr") val priceLkr: Double? = null,
    val district: String? = null,
    @SerialName("deal_score") val dealScore: Double? = null,
    @SerialName("detail_url") val detailUrl: String? = null,
    @SerialName("external_url") val externalUrl: String? = null,
)

@Serializable
data class CustomEstimateDto(
    @SerialName("vehicle_label") val vehicleLabel: String = "",
    @SerialName("estimated_low_lkr") val estimatedLowLkr: Double = 0.0,
    @SerialName("estimated_median_lkr") val estimatedMedianLkr: Double = 0.0,
    @SerialName("estimated_high_lkr") val estimatedHighLkr: Double = 0.0,
    @SerialName("comparable_count") val comparableCount: Int = 0,
    val confidence: String = "low",
    val verdict: String = "unknown",
    @SerialName("verdict_label") val verdictLabel: String = "",
    @SerialName("delta_pct") val deltaPct: Double? = null,
    val methodology: String = "",
    val comparables: List<ComparableVehicleDto> = emptyList(),
)
