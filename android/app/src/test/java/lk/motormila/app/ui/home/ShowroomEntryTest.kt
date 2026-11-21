package lk.motormila.app.ui.home

import lk.motormila.app.ui.navigation.searchArgsToQuery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShowroomEntryTest {
    @Test fun `a model starts the existing keyword search without changing its text`() {
        val query = searchArgsToQuery(showroomSearch(" Toyota Aqua 2018 "))
        assertEquals("Toyota Aqua 2018", query.keyword)
        assertNull(query.priceMax)
    }

    @Test fun `a body type opens Search with a real visible filter`() {
        val query = searchArgsToQuery(showroomSearch("", ShowroomBody.HATCHBACK))
        assertEquals("hatchback", query.bodyType)
        assertEquals("cars", query.vehicleCategory)
        assertNull(query.keyword)
    }

    @Test fun `a bare year is not a price`() {
        val query = searchArgsToQuery(showroomSearch("2018"))
        assertEquals("2018", query.keyword)
        assertNull(query.priceMax)
    }

    @Test fun `vans are their own inventory category and keep the submitted budget`() {
        val query = searchArgsToQuery(showroomSearch("6.5m", ShowroomBody.VAN))
        assertEquals("vans", query.vehicleCategory)
        assertNull(query.bodyType)
        assertEquals(6_500_000.0, query.priceMax ?: -1.0, 0.0)
    }

    @Test fun `explicit millions and lakh turn into an exact upper ask`() {
        for (text in listOf("under Rs 6.5 Mn", "65 lakh", "LKR 6,500,000", "≤ 65,00,000")) {
            val query = searchArgsToQuery(showroomSearch(text, ShowroomBody.SEDAN))
            assertEquals(text, 6_500_000.0, query.priceMax ?: -1.0, 0.0)
            assertEquals("sedan", query.bodyType)
            assertNull(query.keyword)
        }
    }

    @Test fun `invalid or mixed budgets do not silently widen the search`() {
        for (text in listOf("Rs 0", "under -1m", "6,5,000 Rs", "Aqua 7m", "Rs 999999999999999999999999")) {
            val query = searchArgsToQuery(showroomSearch(text))
            assertEquals(text, text, query.keyword)
            assertNull(query.priceMax)
        }
    }
}
