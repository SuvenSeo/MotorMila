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
    /** Backend `vehicle_category` (cars, suvs, motorbikes, three-wheelers…); null on cached/legacy rows. */
    val vehicleCategory: String? = null,
) {
    /** Compact LKR display ("Rs 12.45 Mn"), or "Price on request". */
    fun formattedPrice(): String = lk.motormila.app.core.format.LkrFormat.price(priceLkr)

    /** Ad text + category/model the one price verdict reads. */
    val priceContext: lk.motormila.app.core.price.PriceContext
        get() = lk.motormila.app.core.price.PriceContext(category = vehicleCategory, model = model, title = title)

    /**
     * The one price verdict from this row alone (cards, lists, compare): the
     * stored cohort median is the reference. Same rules as the detail screen.
     */
    fun rowVerdict(): lk.motormila.app.core.price.PriceVerdict =
        lk.motormila.app.core.price.PriceVerdicts.forListingRow(priceLkr, marketMedianLkr, priceContext)

    /**
     * Deal band for badges/rings, on the verdict thresholds: below typical at
     * −5 % or more (GREAT), above at +8 % or more (HIGH), otherwise FAIR.
     * LOCKED = no rating: free-tier rows (backend nulls deal_score/market_median)
     * or a comparison the verdict withholds. Whether LOCKED shows a Pro lock is
     * the caller's call (only for non-Pro users).
     */
    fun dealBand(): DealBand {
        if (marketMedianLkr != null) {
            val v = rowVerdict() as? lk.motormila.app.core.price.PriceVerdict.Ok ?: return DealBand.LOCKED
            return v.band.toDealBand()
        }
        val score = dealScore?.takeIf { kotlin.math.abs(it) <= lk.motormila.app.core.price.PriceVerdicts.MAX_PLAUSIBLE_GAP_PCT }
            ?: return DealBand.LOCKED
        return when {
            score >= lk.motormila.app.core.price.PriceVerdicts.BELOW_PCT -> DealBand.GREAT
            score <= -lk.motormila.app.core.price.PriceVerdicts.ABOVE_PCT -> DealBand.HIGH
            else -> DealBand.FAIR
        }
    }

    /**
     * Signed delta vs the stored cohort median in percent (the verdict's gap);
     * null when either side is missing or the verdict withholds the comparison.
     */
    fun deltaVsMedianPct(): Double? =
        (rowVerdict() as? lk.motormila.app.core.price.PriceVerdict.Ok)?.gapPct

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

fun lk.motormila.app.core.price.VerdictBand.toDealBand(): DealBand = when (this) {
    lk.motormila.app.core.price.VerdictBand.BELOW -> DealBand.GREAT
    lk.motormila.app.core.price.VerdictBand.FAIR -> DealBand.FAIR
    lk.motormila.app.core.price.VerdictBand.ABOVE -> DealBand.HIGH
}
