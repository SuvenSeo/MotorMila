package lk.motormila.app.ui.detail

import lk.motormila.app.core.price.PriceVerdict
import lk.motormila.app.core.price.PriceVerdicts
import lk.motormila.app.core.price.WithheldReason
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceHistory

/** A row median cannot authorize a comparison while the detailed result is pending or unavailable. */
internal fun buyerVerdict(listing: Listing, estimate: Fmv?): PriceVerdict? {
    if (estimate == null) return null
    val resolved = PriceVerdicts.resolve(listing.priceLkr, listing.marketMedianLkr, listing.priceContext, estimate.toReference())
    if (resolved !is PriceVerdict.Ok) return resolved
    return when {
        estimate.askingLkr != listing.priceLkr -> PriceVerdict.Withheld(WithheldReason.ESTIMATES_DISAGREE, null)
        estimate.confidence.lowercase() !in setOf("medium", "high") -> PriceVerdict.Withheld(WithheldReason.LOW_CONFIDENCE, null)
        else -> resolved
    }
}

internal fun leaseExamplePrice(listing: Listing): Double? = listing.priceLkr?.takeIf {
    PriceVerdicts.askingPriceIssue(it, listing.priceContext) == null
}

internal data class RecordedAskChange(val from: Double, val to: Double, val at: String)

/** History points arrive oldest first. Repeated checks are not changes; never bridge a missing ask. */
internal fun recentAskChange(id: Int, history: PriceHistory?): RecordedAskChange? {
    if (history == null || history.listingId != id) return null
    for (i in history.points.lastIndex downTo 1) {
        val old = history.points[i - 1].priceLkr
        val next = history.points[i]
        if (!old.isFinite() || old <= 0 || !next.priceLkr.isFinite() || next.priceLkr <= 0) return null
        if (old != next.priceLkr) return RecordedAskChange(old, next.priceLkr, next.scrapedAt)
    }
    return null
}
