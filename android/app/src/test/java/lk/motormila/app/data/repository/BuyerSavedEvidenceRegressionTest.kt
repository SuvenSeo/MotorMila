package lk.motormila.app.data.repository

import lk.motormila.app.data.local.db.entity.WatchlistEntity
import org.junit.Assert.*
import org.junit.Test

class BuyerSavedEvidenceRegressionTest {
    @Test fun `legacy discount never reaches buyers but original baseline survives refresh and undo`() {
        val row = WatchlistEntity(759703, "Minicab", priceAtAddLkr = 8_500_000.0, lastKnownPriceLkr = 4_500_000.0,
            addedAtMs = 42L, underFmv = 0.599, fmvLkr = 11_220_000.0)
        val saved = row.savedItem()
        assertNull(saved.underFmvFraction)
        assertNull(saved.fmvLkr)
        assertEquals(4_000_000.0, saved.dropAmount()!!, 0.0)
        assertEquals(row.copy(underFmv = null, fmvLkr = null), saved.restoredRow())
    }

    @Test fun `unpriced active ad is not a drop but a removed ad retains its last observation`() {
        val saved = WatchlistEntity(766358, priceAtAddLkr = 8_500_000.0, lastKnownPriceLkr = 4_500_000.0)
        assertNull(saved.withObservedAsk(price = null, district = null, gone = false).lastKnownPriceLkr)
        val removed = saved.withObservedAsk(price = null, district = null, gone = true)
        assertEquals(saved, removed)
        assertEquals(saved.priceAtAddLkr, saved.withObservedAsk(3_000_000.0, "Kandy", false).priceAtAddLkr)
    }

    @Test fun `missing asks are not a drop to zero`() {
        val row = WatchlistEntity(4, priceAtAddLkr = 1_000_000.0)
        for (price in listOf(null, 0.0, -5.0, Double.NaN)) {
            val saved = row.copy(lastKnownPriceLkr = price).savedItem()
            assertNull(saved.priceLkr)
            assertFalse(saved.hasPriceDrop)
        }
    }
}
