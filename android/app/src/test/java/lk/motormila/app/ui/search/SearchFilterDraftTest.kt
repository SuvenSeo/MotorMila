package lk.motormila.app.ui.search

import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.ui.components.FilterDraft
import org.junit.Assert.*
import org.junit.Test

class SearchFilterDraftTest {
    @Test fun partialInputIsNotAValidUnboundedFilter() {
        assertFalse(FilterDraft(make = "Toyota", numberText = mapOf("yMin" to "201")).validNumbers)
        assertFalse(FilterDraft(priceMin = 8e6, priceMax = 7e6).validNumbers)
        assertTrue(FilterDraft(yearMin = 2016, numberText = mapOf("yMin" to "2016")).validNumbers)
    }

    @Test fun previewPreservesKeywordAndUnsetBoundsInsteadOfInventingDefaults() {
        val applied = ListingQuery(keyword = "G grade", make = "Toyota", priceMax = 8e6)
        val edited = FilterDraft.from(applied).copy(priceMax = 6_450_001.0, yearMin = 2017)
        assertEquals(applied.copy(priceMax = 6_450_001.0, yearMin = 2017), edited.toQuery(applied))
    }
}
