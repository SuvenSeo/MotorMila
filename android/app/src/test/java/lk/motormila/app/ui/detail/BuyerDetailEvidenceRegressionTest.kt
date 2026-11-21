package lk.motormila.app.ui.detail

import lk.motormila.app.core.price.PriceVerdict
import lk.motormila.app.core.price.WithheldReason
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.PricePoint
import org.junit.Assert.*
import org.junit.Test

class BuyerDetailEvidenceRegressionTest {
    private val listing = ListingDto(id = 759703, make = "Mitsubishi", model = "Minicab", priceLkr = 5_150_000.0,
        dealScore = 59.9, marketMedianLkr = 7_000_000.0).toDomain()
    private val estimate = Fmv(listing.priceLkr!!, 7_000_000.0, null, null, DealBand.FAIR, "", "adjusted_median", 12, "high")

    @Test fun `row score cannot publish before detailed evidence or override a withheld comparison`() {
        assertNull(buyerVerdict(listing, null))
        val withheld = buyerVerdict(listing, estimate.copy(withheldReason = "estimates_disagree", confidence = "low")) as PriceVerdict.Withheld
        assertEquals(WithheldReason.ESTIMATES_DISAGREE, withheld.reason)
        assertTrue(buyerVerdict(listing, estimate) is PriceVerdict.Ok)
        assertTrue((buyerVerdict(listing.copy(priceLkr = 4_400_000.0), estimate.copy(askingLkr = 4_400_000.0)) as PriceVerdict.Ok).verifyFirst)
        assertTrue(buyerVerdict(listing, estimate.copy(askingLkr = 8_000_000.0)) !is PriceVerdict.Ok)
    }

    @Test fun `recent change uses latest distinct pair not net change or a different vehicle`() {
        val history = PriceHistory(766358, listOf(8_500_000.0, 4_000_000.0, 4_500_000.0, 4_500_000.0)
            .mapIndexed { i, price -> PricePoint(price, "2026-11-0${i + 1}") })
        assertEquals(RecordedAskChange(4_000_000.0, 4_500_000.0, "2026-11-03"), recentAskChange(766358, history))
        assertNull(recentAskChange(759703, history))
        assertNull(recentAskChange(766358, history.copy(points = listOf(PricePoint(0.0, "a"), PricePoint(4_500_000.0, "b")))))
    }

    @Test fun `lease example requires a usable full vehicle price`() {
        assertEquals(listing.priceLkr, leaseExamplePrice(listing))
        for (price in listOf(null, 0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY, 111111.0)) {
            assertNull(leaseExamplePrice(listing.copy(priceLkr = price)))
        }
        assertNull(leaseExamplePrice(listing.copy(title = "Minicab for rent")))
    }
}
