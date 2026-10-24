package lk.motormila.app.domain.model

/** Dealer benchmark payload (endpoints/dealer.py). */
data class DealerBenchmark(
    val dealerName: String,
    val listingCount: Int,
    val avgPriceLkr: Double?,
    val medianPriceLkr: Double?,
    val avgDealScore: Double?,
    val district: String?,
    val urlResults: List<UrlBenchmarkResult> = emptyList(),
)

/** Per-URL market benchmark row from POST /dealer/benchmark-urls. */
data class UrlBenchmarkResult(
    val url: String,
    val listingPrice: Double?,
    val marketMedian: Double?,
    val priceGapPct: Double?,
    val error: String? = null,
)

/** Result of a dealer claim request. */
data class DealerClaim(
    val claimId: String,
    val status: String,
    val message: String,
    val displayName: String? = null,
    val matchedListings: Int? = null,
    val claimedUrl: String? = null,
    val sellerNamePattern: String? = null,
)
