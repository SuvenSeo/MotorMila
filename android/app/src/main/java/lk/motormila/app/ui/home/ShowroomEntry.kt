package lk.motormila.app.ui.home

import lk.motormila.app.domain.model.VehicleCategory
import lk.motormila.app.ui.navigation.Search
import lk.motormila.app.ui.navigation.encodeWebFilters
import java.util.Locale

internal enum class ShowroomBody(val filter: String?, val category: VehicleCategory = VehicleCategory.CARS) {
    HATCHBACK("hatchback"), SEDAN("sedan"), SUV("suv"), VAN(null, VehicleCategory.VANS),
}

/** A blank entry opens the catalog; otherwise retain the keyword or a clearly explicit budget. */
internal fun showroomSearch(draft: String, body: ShowroomBody? = null): Search {
    val term = draft.trim().takeIf(String::isNotEmpty)
    val amount = term?.let(::explicitBudget)
    val filters = buildMap {
        body?.category?.apiValue?.let { put("vehicle_category", it) }
        body?.filter?.let { put("body_type", it) }
        if (amount != null) put("price_max", amount.toString())
    }
    return Search(q = if (amount == null) term else null, filters = encodeWebFilters(filters))
}

private val budgetSyntax = Regex(
    "(?i)(?:(under|up to|<=|≤)\\s*)?(?:(rs\\.?|lkr|රු\\.?|ரூ\\.?)\\s*)?([0-9][0-9,.]*)(?:\\s*(million|mn|m|lakhs?|lacs?|lakh|ලක්ෂ|லட்சம்))?",
)
private val groupedNumber = Regex("(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,2}(?:,[0-9]{2})+,[0-9]{3})(?:\\.[0-9]+)?")
private val plainNumber = Regex("[0-9]+(?:\\.[0-9]+)?")

private fun explicitBudget(term: String): Long? {
    val normalized = term.map { ch -> ch.digitToIntOrNull()?.digitToChar() ?: ch }.joinToString("")
    val match = budgetSyntax.matchEntire(normalized) ?: return null
    val (bound, currency, numeric, magnitude) = match.destructured
    if (bound.isEmpty() && currency.isEmpty() && magnitude.isEmpty()) return null // A year, not a budget.
    if (!plainNumber.matches(numeric) && !groupedNumber.matches(numeric)) return null
    val decimal = numeric.replace(",", "").toBigDecimalOrNull() ?: return null
    val units = when (magnitude.lowercase(Locale.ROOT)) {
        "" -> 1
        "mn", "m", "million" -> 1_000_000
        else -> 100_000
    }
    return runCatching { decimal.multiply(units.toBigDecimal()).longValueExact() }.getOrNull()
        ?.takeIf { it in 1..9_007_199_254_740_991L }
}
