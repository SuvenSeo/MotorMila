package lk.motormila.app.domain.model

/**
 * Core vehicle listing. Mirrors backend `CarListingRead` (see
 * backend/app/models/schemas.py + endpoints/listings.py).
 * Pure Kotlin — no android.* imports.
 */
data class Listing(
    val id: Int,
    val title: String,
    val make: String,
    val model: String,
    val year: Int?,
    val priceLkr: Double?,
    val mileageKm: Double?,
    val fuelType: String?,
    val transmission: String?,
    val condition: String?,
    val bodyType: String?,
    val district: String?,
    val city: String?,
    val source: String?,
    val thumbnailUrl: String?,
    val images: List<String> = emptyList(),
    val dealScore: Double?,
    val marketMedianLkr: Double?,
    val isActive: Boolean = true,
    val scrapedAt: String?,
    val firstSeenAt: String?,
    val lastSeenAt: String?,
    val detailUrl: String?,
    val externalUrl: String?,
    val engineCc: Double?,
) {
    /** Compact LKR display ("Rs 12.45 Mn"), or "Price on request". */
    fun formattedPrice(): String = lk.motormila.app.core.format.LkrFormat.price(priceLkr)

    /**
     * Deal band for badges/rings.
     * Backend: free-tier responses null out deal_score/market_median -> LOCKED.
     * Thresholds mirror web client: >= 8 GREAT, >= 0 FAIR, < 0 HIGH (overpriced).
     */
    fun dealBand(): DealBand {
        val score = dealScore ?: return DealBand.LOCKED
        return when {
            score >= 8 -> DealBand.GREAT
            score >= 0 -> DealBand.FAIR
            else -> DealBand.HIGH
        }
    }

    /** Signed delta vs market median in percent; null when either side missing. */
    fun deltaVsMedianPct(): Double? {
        val price = priceLkr
        val median = marketMedianLkr
        if (price == null || median == null || median <= 0) return null
        return ((price - median) / median) * 100.0
    }

    val displayName: String
        get() = title.ifBlank { listOfNotNull(make, model, year?.toString()).joinToString(" ") }

    val heroImageUrl: String?
        get() = thumbnailUrl ?: images.firstOrNull()
}

enum class DealBand {
    GREAT,
    FAIR,
    HIGH,
    LOCKED,
}
