package lk.motormila.app.ui.home

import lk.motormila.app.domain.model.HotDeal
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.WatchItem
import org.junit.Assert.*
import org.junit.Test

internal fun saved(id: Int = 766358, added: Long = 1L) = WatchItem(
    id = id, title = "Micro Tourer", thumbnailUrl = null, district = "Kalutara",
    priceLkr = 4_500_000.0, previousPriceLkr = null, fmvLkr = 8_500_000.0,
    underFmvFraction = 0.47, addedAtEpochMs = added,
)

internal fun recordedDrop() = PriceDrop(
    Listing(
        id = 766358, title = "Micro Tourer", make = "Micro", model = "Tourer", year = 2013,
        priceLkr = 4_500_000.0, mileageKm = null, fuelType = null, transmission = null,
        condition = null, bodyType = null, district = "Kalutara", city = "Panadura",
        source = "Riyasewana", thumbnailUrl = null, dealScore = null, marketMedianLkr = null,
        scrapedAt = null, firstSeenAt = null, lastSeenAt = null, detailUrl = null,
        externalUrl = null, engineCc = null,
    ),
    previousPriceLkr = 8_500_000.0, newPriceLkr = 4_500_000.0, dropPct = 47.06,
    droppedAt = "2026-11-20T03:30:00Z",
)

class BuyerHomeEvidenceTest {
    @Test fun aggregateScoreAloneCannotSupplyEitherHomeCard() {
        val minicab = HotDeal(759703, "Mitsubishi", "Minicab", null, null, "ikman", 5_150_000.0, 59.9, null)
        val state = HomeUiState(insights = Insights(hotDeals = listOf(minicab)))
        assertNull(state.savedVehicle)
        assertNull(state.recordedDrop)
    }

    @Test fun savedDropNeedsTwoRealAsks_notAnFmvOrAnUnknownCurrentPrice() {
        val row = saved()
        assertNull(row.savedDropBaseline())
        for (bad in listOf(null, 0.0, -3.0, Double.NaN, Double.POSITIVE_INFINITY, 4_500_000.0, 6_000_000.0)) {
            assertNull(row.copy(previousPriceLkr = 4_500_000.0, priceLkr = bad).savedDropBaseline())
        }
        assertEquals(8_500_000.0, row.copy(previousPriceLkr = 8_500_000.0).savedDropBaseline()!!, 0.0)
    }

    @Test fun onlyDatedDecreasesWithARealListingQualifyAndTheResumeIsNotRepeated() {
        val cut = recordedDrop()
        val invalid = listOf(cut.copy(newPriceLkr = 0.0), cut.copy(previousPriceLkr = Double.NaN),
            cut.copy(previousPriceLkr = 4_500_000.0), cut.copy(newPriceLkr = 9_000_000.0),
            cut.copy(droppedAt = ""), cut.copy(droppedAt = "not a date"), cut.copy(listing = cut.listing.copy(id = 0)))
        val state = HomeUiState(priceDrops = invalid + cut)
        assertEquals(cut, state.recordedDrop)
        assertNull(state.copy(savedVehicle = saved()).recordedDrop)
    }
}
