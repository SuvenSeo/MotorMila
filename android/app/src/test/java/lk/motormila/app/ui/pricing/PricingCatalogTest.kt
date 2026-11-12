package lk.motormila.app.ui.pricing

import lk.motormila.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PricingCatalogTest {
    @Test
    fun freeAndProComparisonIsComplete() {
        assertTrue(PricingCatalog.freeFeatures.isNotEmpty())
        assertTrue(PricingCatalog.proFeatures.isNotEmpty())
        assertTrue(PricingCatalog.rows.size >= 5)
    }

    @Test
    fun playChannelNeverMentionsExternalPayment() {
        val play = PricingCatalog.faqsFor(externalCheckout = false)
        assertFalse(play.any { it.externalPayment })
        assertTrue(play.any { it.answer == R.string.scr_price_faq_dealer_a_play })
    }

    @Test
    fun directChannelShowsOneDealerAnswer() {
        val direct = PricingCatalog.faqsFor(externalCheckout = true)
        assertEquals(1, direct.count { it.question == R.string.scr_price_faq_dealer_q })
    }
}
