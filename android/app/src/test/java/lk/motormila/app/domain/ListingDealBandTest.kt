package lk.motormila.app.domain

import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.domain.model.Listing
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * [Listing.dealBand] on the one price verdict's thresholds (web + backend
 * parity): 5 % or more below typical GREAT, 8 % or more above HIGH, otherwise
 * FAIR; no rating (free tier or withheld comparison) LOCKED. DataMappersTest
 * covers DTO mapping; this hits the domain boundaries plus [Listing.deltaVsMedianPct].
 */
class ListingDealBandTest {

    @Test
    fun dealBand_thresholdsFromPriceVsMedian() {
        val m = 10_000_000.0
        assertEquals(DealBand.GREAT, listing(score = null, price = 9_500_000.0, median = m).dealBand())
        assertEquals(DealBand.FAIR, listing(score = null, price = 9_510_000.0, median = m).dealBand())
        assertEquals(DealBand.FAIR, listing(score = null, price = m, median = m).dealBand())
        assertEquals(DealBand.FAIR, listing(score = null, price = 10_790_000.0, median = m).dealBand())
        assertEquals(DealBand.HIGH, listing(score = null, price = 10_800_000.0, median = m).dealBand())
    }

    @Test
    fun dealBand_scoreOnlyRows() {
        assertEquals(DealBand.GREAT, listing(score = 5.0, median = null).dealBand())
        assertEquals(DealBand.FAIR, listing(score = 4.99, median = null).dealBand())
        assertEquals(DealBand.FAIR, listing(score = -7.99, median = null).dealBand())
        assertEquals(DealBand.HIGH, listing(score = -8.0, median = null).dealBand())
        assertEquals(DealBand.LOCKED, listing(score = null, median = null).dealBand())
        // > ±60 % is never a rating.
        assertEquals(DealBand.LOCKED, listing(score = 90.0, median = null).dealBand())
    }

    @Test
    fun dealBand_withheldComparisonIsLocked() {
        // 680073 shape: Rs 735,000 bike against a Rs 7.2 Mn mixed cohort (≈ ×10 apart).
        assertEquals(DealBand.LOCKED, listing(score = 89.8, price = 735_000.0, median = 7_201_142.86).dealBand())
        assertEquals(DealBand.LOCKED, listing(score = 70.0, price = 3_000_000.0, median = 10_000_000.0).dealBand())
    }

    @Test
    fun deltaVsMedianPct_requiresPriceAndPositiveMedian() {
        assertEquals(-20.0, listing(score = 1.0, price = 8_000_000.0, median = 10_000_000.0).deltaVsMedianPct()!!, 0.001)
        assertNull(listing(score = 1.0, price = 8_000_000.0, median = null).deltaVsMedianPct())
        assertNull(listing(score = 1.0, price = null, median = 10_000_000.0).deltaVsMedianPct())
        assertNull(listing(score = 1.0, price = 8_000_000.0, median = 0.0).deltaVsMedianPct())
    }

    private fun listing(
        score: Double?,
        price: Double? = 5_000_000.0,
        median: Double? = 5_000_000.0,
    ): Listing = Listing(
        id = 1,
        title = "Toyota Aqua",
        make = "Toyota",
        model = "Aqua",
        year = 2017,
        priceLkr = price,
        mileageKm = null,
        fuelType = null,
        transmission = null,
        condition = null,
        bodyType = null,
        district = null,
        city = null,
        source = null,
        thumbnailUrl = null,
        dealScore = score,
        marketMedianLkr = median,
        scrapedAt = null,
        firstSeenAt = null,
        lastSeenAt = null,
        detailUrl = null,
        externalUrl = null,
        engineCc = null,
    )
}
