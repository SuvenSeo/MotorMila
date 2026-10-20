package lk.motormila.app.core.format

import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.domain.model.Listing
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** Mirrors web src/lib/price.ts (millions only, Oct 2026). */
class LkrFormatTest {

    @Test
    fun compact_isMillionsOnly() {
        assertEquals("Rs 8.5 Mn", LkrFormat.compact(8_500_000.0))
        assertEquals("Rs 0.35 Mn", LkrFormat.compact(350_000.0))
        assertEquals("Rs 7.25 Mn", LkrFormat.compact(7_250_000.0))
        assertEquals("Rs 12.5 Mn", LkrFormat.compact(12_500_000.0))
        assertEquals("Rs 12.45 Mn", LkrFormat.compact(12_450_000.0))
        assertEquals("Rs 125 Mn", LkrFormat.compact(125_000_000.0))
        assertEquals("Rs 1 Mn", LkrFormat.compact(1_000_000.0))
    }

    @Test
    fun compact_smallAmounts() {
        // Under 0.095 Mn: 2 significant digits.
        assertEquals("Rs 0.085 Mn", LkrFormat.compact(85_400.0))
        assertEquals("Rs 0.01 Mn", LkrFormat.compact(10_000.0))
        // Under Rs 10,000 stays full rupees (would round to 0 Mn).
        assertEquals("Rs 5,000", LkrFormat.compact(5_000.0))
        assertEquals("Rs 0", LkrFormat.compact(0.0))
        assertEquals("Rs -2.5 Mn", LkrFormat.compact(-2_500_000.0))
    }

    @Test
    fun compact_neverShowsLakhs() {
        listOf(150_000.0, 850_000.0, 4_200_000.0, 9_999_999.0, 25_000_000.0).forEach {
            val s = LkrFormat.compact(it)
            assertFalse(s, s.contains("L") || s.contains("lakh", ignoreCase = true))
            assertFalse(s, s.contains("M") && !s.endsWith(" Mn"))
        }
    }

    @Test
    fun fullAndMonthly() {
        assertEquals("Rs 7,250,000", LkrFormat.full(7_250_000.0))
        assertEquals("Rs 85,400/mo", LkrFormat.monthly(85_400.0))
        assertEquals("Rs 85,400/mo", LkrFormat.monthly(85_399.6))
        assertEquals("—", LkrFormat.full(null))
        assertEquals("—", LkrFormat.monthly(Double.NaN))
        assertEquals("—", LkrFormat.compact(Double.POSITIVE_INFINITY))
    }

    @Test
    fun askingPrice_onRequestWhenUnknown() {
        assertEquals("Rs 8.5 Mn", LkrFormat.price(8_500_000.0))
        assertEquals("Rs 8,500,000", LkrFormat.priceFull(8_500_000.0))
        assertEquals(LkrFormat.PRICE_ON_REQUEST, LkrFormat.price(null))
        assertEquals(LkrFormat.PRICE_ON_REQUEST, LkrFormat.priceFull(0.0))
    }

    @Test
    fun axisRangeAndDelta() {
        assertEquals("8.5 Mn", LkrFormat.axis(8_500_000.0))
        assertEquals("12.5 Mn", LkrFormat.axis(12_480_000.0))
        assertEquals("125 Mn", LkrFormat.axis(125_400_000.0))
        assertEquals("0", LkrFormat.axis(0.0))
        assertEquals("Rs 3 Mn – Rs 5 Mn", LkrFormat.range(3_000_000.0, 5_000_000.0))
        assertEquals("Under Rs 3 Mn", LkrFormat.range(null, 3_000_000.0))
        assertEquals("Rs 10 Mn+", LkrFormat.range(10_000_000.0, null))
        assertEquals("Any price", LkrFormat.range(null, null))
        assertEquals("−Rs 0.25 Mn", LkrFormat.deltaLkr(-250_000.0))
        assertEquals("+Rs 250,000", LkrFormat.deltaLkrFull(250_000.0))
        assertEquals("", LkrFormat.deltaLkr(0.0))
    }

    @Test
    fun domainListingUsesSameFormatter() {
        val listing: Listing = ListingDto(id = 1, make = "Toyota", model = "Aqua", priceLkr = 8_450_000.0).toDomain()
        assertEquals("Rs 8.45 Mn", listing.formattedPrice())
        val onRequest: Listing = ListingDto(id = 2, make = "Toyota", model = "Aqua", priceLkr = null).toDomain()
        assertEquals(LkrFormat.PRICE_ON_REQUEST, onRequest.formattedPrice())
    }
}
