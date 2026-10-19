package lk.motormila.app.data.repository

import lk.motormila.app.data.remote.dto.PriceSparklinesDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.domain.repository.ListingQuery
import kotlin.math.round

/**
 * Static-snapshot fallback kit (Neon-outage survival).
 *
 * [withSnapshotFallback] is the only suspend helper: live API first, public
 * Vercel snapshot second, original error only when both fail. Everything else
 * here is pure and JVM-tested ([SnapshotFallbackTest]).
 */
suspend fun <T> withSnapshotFallback(
    live: suspend () -> T,
    snapshot: suspend () -> T,
): T {
    try {
        return live()
    } catch (liveError: kotlin.coroutines.cancellation.CancellationException) {
        // Never swallow cooperative cancellation — the coroutine is done.
        throw liveError
    } catch (liveError: Exception) {
        try {
            return snapshot()
        } catch (snapshotError: kotlin.coroutines.cancellation.CancellationException) {
            throw snapshotError
        } catch (snapshotError: Exception) {
            snapshotError.addSuppressed(liveError)
            throw snapshotError
        }
    }
}

private fun matchesText(haystack: String?, needle: String): Boolean =
    haystack?.contains(needle, ignoreCase = true) == true

/**
 * Client-side [ListingQuery] filter over snapshot rows (mirrors the backend
 * search semantics loosely: keyword across title/make/model, exact
 * make/model/source/district/fuel matches, numeric ranges).
 */
fun filterSnapshotListings(rows: List<ListingDto>, query: ListingQuery): List<ListingDto> {
    val keyword = query.keyword?.trim().orEmpty()
    return rows.filter { row ->
        if (keyword.isNotEmpty()) {
            val hit = matchesText(row.title, keyword) ||
                matchesText(row.make, keyword) ||
                matchesText(row.model, keyword)
            if (!hit) return@filter false
        }
        if (!query.source.isNullOrBlank() && !row.source.equals(query.source, ignoreCase = true)) {
            return@filter false
        }
        if (!query.make.isNullOrBlank() && !row.make.equals(query.make, ignoreCase = true)) {
            return@filter false
        }
        if (!query.model.isNullOrBlank() && !row.model.equals(query.model, ignoreCase = true)) {
            return@filter false
        }
        if (!query.district.isNullOrBlank() &&
            !(row.district?.equals(query.district, ignoreCase = true) == true)
        ) {
            return@filter false
        }
        if (!query.fuelType.isNullOrBlank() &&
            !(row.fuelType?.equals(query.fuelType, ignoreCase = true) == true)
        ) {
            return@filter false
        }
        if (query.yearMin != null && (row.year ?: 0) < query.yearMin) return@filter false
        if (query.yearMax != null && (row.year ?: Int.MAX_VALUE) > query.yearMax) return@filter false
        if (query.priceMin != null && (row.priceLkr ?: 0.0) < query.priceMin) return@filter false
        if (query.priceMax != null && (row.priceLkr ?: Double.MAX_VALUE) > query.priceMax) {
            return@filter false
        }
        if (query.mileageMax != null && (row.mileage ?: Int.MAX_VALUE) > query.mileageMax) {
            return@filter false
        }
        true
    }
}

/**
 * Backend `get_similar_listings` parity: same make, price ±20% (or same
 * make+model when the base is unpriced), self excluded.
 */
fun similarFromSnapshot(
    rows: List<ListingDto>,
    id: Int,
    limit: Int,
): List<lk.motormila.app.domain.model.Listing> {
    val base = rows.firstOrNull { it.id == id } ?: return emptyList()
    val basePrice = base.priceLkr ?: 0.0
    return rows.asSequence()
        .filter { it.id != id }
        .filter { it.make.equals(base.make, ignoreCase = true) }
        .filter { row ->
            if (basePrice > 0) {
                val price = row.priceLkr ?: return@filter false
                price in basePrice * 0.8..basePrice * 1.2
            } else {
                row.model.equals(base.model, ignoreCase = true)
            }
        }
        .take(limit.coerceAtLeast(1))
        .map { it.toDomain() }
        .toList()
}

/** Backend `summarize_price_history` parity over sparkline pairs. */
fun priceHistoryFromSparklines(dto: PriceSparklinesDto, listingId: Int): PriceHistory? {
    val pairs = dto.pointsFor(listingId) ?: return null
    val points = pairs.map { (price, at) -> PricePoint(price, at) }
    val prices = pairs.map { it.first }
    var cuts = 0
    var raises = 0
    var lastChange: String? = null
    for (i in 1 until prices.size) {
        when {
            prices[i] < prices[i - 1] -> { cuts++; lastChange = pairs[i].second }
            prices[i] > prices[i - 1] -> { raises++; lastChange = pairs[i].second }
        }
    }
    val first = prices.firstOrNull()
    val current = prices.lastOrNull()
    val change = if (first != null && current != null && first > 0) {
        round((current - first) / first * 1000) / 10.0
    } else {
        null
    }
    return PriceHistory(
        listingId = listingId,
        points = points,
        firstPriceLkr = first,
        currentPriceLkr = current,
        changePct = change,
        cutCount = cuts,
        raiseCount = raises,
        highestPriceLkr = prices.maxOrNull(),
        lowestPriceLkr = prices.minOrNull(),
        lastChangeAt = lastChange,
        trackedPoints = prices.size,
    )
}
