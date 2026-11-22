package lk.motormila.app.ui.search

import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.repository.ListingQuery
import org.junit.Assert.*
import org.junit.Test

class SearchAlertReviewTest {
    @Test fun changedBudgetIsTheReviewedAndSubmittedBudget() {
        val applied = ListingQuery(make = "Toyota", model = "Aqua", district = "Kandy", priceMax = 8e6)
        val draft = applied.copy(priceMax = 6_450_001.0, yearMin = 2015)
        val review = SearchAlertReview(draft)
        assertEquals(draft, review.draft)
        assertEquals(AlertInput(make = "Toyota", model = "Aqua", district = "Kandy", maxPriceLkr = 6_450_001.0, notifyChannels = "inapp,push"), review.rule)
        assertNotNull(review.excluded[SearchCriterion.YEAR_MIN])
        assertNull(review.rule?.notifyEmail)
    }

    @Test fun allUnsupportedConstraintsAreDisclosedIncludingNonDefaultSort() {
        val review = SearchAlertReview(ListingQuery(keyword = "G grade", source = "ikman", make = "Toyota",
            vehicleCategory = "cars", yearMin = 2015, yearMax = 2018, priceMin = 5e6, mileageMax = 76543,
            fuelType = "hybrid", transmission = "cvt", condition = "used", bodyType = "hatchback",
            priceAvailability = "unavailable", includeArchive = true, sort = "price_asc"))
        assertEquals(SearchCriterion.entries.toSet(), review.excluded.keys)
        assertEquals("G grade", review.excluded[SearchCriterion.KEYWORD])
        assertEquals("unavailable", review.excluded[SearchCriterion.INVENTORY])
        assertEquals("cars", review.excluded[SearchCriterion.CATEGORY])
    }

    @Test fun noSupportedCriteriaNeverProducesACatchAllAlert() {
        val review = SearchAlertReview(ListingQuery(vehicleCategory = "cars", fuelType = "diesel"))
        assertNull(review.rule)
        assertEquals("priced", review.excluded[SearchCriterion.INVENTORY])
        assertFalse(SearchCriterion.SORT in review.excluded)
    }
}
