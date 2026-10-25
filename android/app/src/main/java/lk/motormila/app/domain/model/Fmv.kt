package lk.motormila.app.domain.model

/**
 * Fair-market-value verdict for a listing.
 * Derived from backend FMV util (app/utils/fmv.py) + estimate endpoints.
 */
data class Fmv(
    val askingLkr: Double,
    val fmvLkr: Double?,
    val dealScore: Double?,
    val deltaPct: Double?,
    val band: DealBand,
    /** Short machine key, e.g. "great_deal" / "fair" / "overpriced" / "locked". */
    val label: String,
    val method: String?,
    val sampleCount: Int,
    /** Backend confidence token: "high" | "medium" | "low" | "none". */
    val confidence: String,
    /** Backend `verdict.reason` when the backend withheld the price verdict (fmv_lkr is null then). */
    val withheldReason: String? = null,
    /** Raw estimate even when the verdict is withheld (`estimate_lkr`); never shown as a verdict. */
    val estimateLkr: Double? = null,
) {
    val hasSignal: Boolean get() = fmvLkr != null && band != DealBand.LOCKED && withheldReason == null

    /** What the one price verdict (core/price/PriceVerdict.kt) reads from this estimate. */
    fun toReference(): lk.motormila.app.core.price.FmvReference = lk.motormila.app.core.price.FmvReference(
        fmvLkr = fmvLkr,
        sampleSize = sampleCount,
        confidence = confidence,
        method = method,
        withheldReason = withheldReason,
    )
}
