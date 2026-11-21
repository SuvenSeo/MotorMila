package lk.motormila.app.ui.home

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import kotlin.math.roundToLong
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.WatchItem

internal fun Double?.realAsk(): Double? = this?.takeIf { it.isFinite() && it >= 1.0 }

// Compare in display units (rupees); never show two identical prices as a decrease.
private fun lowerAsk(before: Double?, after: Double?): Boolean {
    val old = before.realAsk() ?: return false
    val new = after.realAsk() ?: return false
    return new.roundToLong() < old.roundToLong()
}

/** The baseline is the asking price when saved, not an appraisal or the previous ad edit. */
internal fun WatchItem.savedDropBaseline(): Double? = previousPriceLkr.takeIf { lowerAsk(it, priceLkr) }

internal fun List<WatchItem>.resumeVehicle(): WatchItem? = asSequence()
    .filter { it.listingId > 0 }
    .maxWithOrNull(compareBy<WatchItem> { it.savedDropBaseline() != null }
        .thenBy { it.addedAtEpochMs }.thenBy { it.listingId })

internal fun PriceDrop.recordedDate(): LocalDate? = try {
    // Offset-stamped observations belong on their Sri Lankan calendar day. Date-only
    // and unzoned source dates are preserved rather than silently assigned a device zone.
    OffsetDateTime.parse(droppedAt).atZoneSameInstant(ZoneId.of("Asia/Colombo")).toLocalDate()
} catch (_: DateTimeParseException) {
    try {
        LocalDate.parse(droppedAt)
    } catch (_: DateTimeParseException) {
        try { LocalDateTime.parse(droppedAt).toLocalDate() } catch (_: DateTimeParseException) { null }
    }
}

internal fun PriceDrop.isDocumentedDrop(): Boolean = listing.id > 0 && listing.isActive &&
    listing.displayName.isNotBlank() && lowerAsk(previousPriceLkr, newPriceLkr) && recordedDate() != null
