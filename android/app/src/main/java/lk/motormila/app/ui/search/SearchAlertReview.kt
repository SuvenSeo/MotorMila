package lk.motormila.app.ui.search

import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingSorts

internal enum class SearchCriterion {
    KEYWORD, CATEGORY, YEAR_MIN, YEAR_MAX, PRICE_MIN, MILEAGE, FUEL, TRANSMISSION,
    CONDITION, BODY, SOURCE, INVENTORY, ARCHIVE, SORT,
}

/** Snapshot of the sheet's preview, not a reference to the currently applied search. */
internal data class SearchAlertReview(val draft: ListingQuery) {
    // MarketAlertCreate and /alerts/match implement just these four criteria. Never
    // send a catch-all rule (e.g. a draft with only year/fuel/keyword constraints).
    val rule: AlertInput? = with(draft) {
        val max = priceMax
        if ((max != null && (!max.isFinite() || max <= 0)) ||
            (make.isNullOrBlank() && model.isNullOrBlank() && district.isNullOrBlank() && max == null)
        ) null else AlertInput(make = make, model = model, district = district, maxPriceLkr = max,
            // The account repository alone handles older servers' equivalent null-channel default.
            notifyChannels = "inapp,push")
    }

    val excluded: Map<SearchCriterion, String> = with(draft) {
        buildMap {
            keyword?.let { put(SearchCriterion.KEYWORD, it) }
            vehicleCategory?.let { put(SearchCriterion.CATEGORY, it) }
            yearMin?.let { put(SearchCriterion.YEAR_MIN, it.toString()) }
            yearMax?.let { put(SearchCriterion.YEAR_MAX, it.toString()) }
            priceMin?.let { put(SearchCriterion.PRICE_MIN, it.toString()) }
            mileageMax?.let { put(SearchCriterion.MILEAGE, it.toString()) }
            fuelType?.let { put(SearchCriterion.FUEL, it) }
            transmission?.let { put(SearchCriterion.TRANSMISSION, it) }
            condition?.let { put(SearchCriterion.CONDITION, it) }
            bodyType?.let { put(SearchCriterion.BODY, it) }
            source?.let { put(SearchCriterion.SOURCE, it) }
            // Search defaults to positive asking prices; alerts have no inventory switch.
            put(SearchCriterion.INVENTORY, priceAvailability ?: "priced")
            if (includeArchive) put(SearchCriterion.ARCHIVE, "true")
            if (sort != ListingSorts.NEWEST) put(SearchCriterion.SORT, sort)
        }
    }
}
