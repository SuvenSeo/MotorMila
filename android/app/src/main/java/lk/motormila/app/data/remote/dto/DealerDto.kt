package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Dealer DTOs. Backend: endpoints/dealer.py.
 * - POST /dealer/benchmark-urls {urls[]} -> [UrlBenchmarkResult]
 * - POST /dealer/claim {display_name,...} -> DealerClaimResponse
 * - GET /dealer/me?claim_token= -> DealerClaimResponse
 * - POST /dealer/verify -> DealerClaimResponse
 */
@Serializable
data class BenchmarkUrlsRequestDto(val urls: List<String> = emptyList())

@Serializable
data class UrlBenchmarkResultDto(
    val url: String = "",
    val make: String? = null,
    val model: String? = null,
    val year: Int? = null,
    @SerialName("listing_price") val listingPrice: Double? = null,
    @SerialName("market_median") val marketMedian: Double? = null,
    @SerialName("price_gap_pct") val priceGapPct: Double? = null,
    @SerialName("comparable_count") val comparableCount: Int = 0,
    val error: String? = null,
)

@Serializable
data class DealerClaimRequestDto(
    @SerialName("display_name") val displayName: String,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("seller_name_pattern") val sellerNamePattern: String? = null,
    @SerialName("claimed_url") val claimedUrl: String? = null,
    @SerialName("claim_token") val claimToken: String? = null,
)

@Serializable
data class DealerClaimResponseDto(
    val id: Int? = null,
    @SerialName("claim_id") val claimId: String? = null,
    val status: String = "pending",
    val message: String = "",
    @SerialName("claim_token") val claimToken: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("seller_name_pattern") val sellerNamePattern: String? = null,
    @SerialName("claimed_url") val claimedUrl: String? = null,
    @SerialName("matched_listings") val matchedListings: Int? = null,
)

/**
 * POST /dealer/verify body — mirrors backend `DealerVerifyRequest`
 * (backend/app/api/v1/endpoints/dealer.py): claim_token + optional billing
 * fields, gated by the ops-only `admin_token` (DEALER_ADMIN_TOKEN). There is
 * no dealer-side verification code; dealers never call this.
 */
@Serializable
data class DealerVerifyRequestDto(
    @SerialName("claim_token") val claimToken: String,
    val plan: String? = null,
    @SerialName("subscription_status") val subscriptionStatus: String? = null,
    @SerialName("billing_email") val billingEmail: String? = null,
    @SerialName("admin_token") val adminToken: String? = null,
)
