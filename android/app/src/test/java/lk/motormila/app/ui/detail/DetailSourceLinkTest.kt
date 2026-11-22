package lk.motormila.app.ui.detail

import android.content.Context
import io.mockk.*
import lk.motormila.app.R
import lk.motormila.app.ui.share.OutboundLinks
import org.junit.Assert.*
import org.junit.Test

class DetailSourceLinkTest {
    private val saleMe = "https://saleme.lk/ad/123?lang=en"
    private val trusted = "https://ikman.lk/en/ad/456"
    private fun select(first: String?, second: String? = null, active: Boolean = true) =
        detailSourceLink(first, second, active) { it == trusted }

    @Test fun originalHttpsAdIsCopyableEvenWhenHostIsNotLaunchable() {
        val link = select("  $saleMe  ", trusted)!!
        assertEquals(saleMe, link.url)
        assertTrue(link.copyOnly)
        assertFalse(select(null, trusted)!!.copyOnly)
        assertTrue(select("https://ikman.lk.example.org/123")!!.copyOnly)
    }

    @Test fun onlyTrustedAdsArePassedToTheExistingLauncher() {
        val context = mockk<Context>()
        mockkObject(OutboundLinks)
        try {
            every { OutboundLinks.open(any(), any()) } just Runs
            every { OutboundLinks.copy(any(), any(), any()) } just Runs
            select(saleMe)!!.handOff(context)
            select(trusted)!!.handOff(context)
            verify(exactly = 1) { OutboundLinks.copy(context, saleMe, R.string.mm_link_copy_fallback) }
            verify(exactly = 1) { OutboundLinks.open(context, trusted) }
            confirmVerified(OutboundLinks)
        } finally { unmockkObject(OutboundLinks) }
    }

    @Test fun nonStandardHttpsOriginIsCopyOnlyEvenOnAnAllowedHost() {
        val link = detailSourceLink("https://ikman.lk:8443/ad", null, true) { true }
        assertTrue(link!!.copyOnly)
    }

    @Test fun unsafeOrAbsentAdsNeverBecomeActionsButAnIndependentValidFallbackCan() {
        for (bad in listOf(null, "", "/relative", "http://ikman.lk/ad", "javascript:alert(1)",
            "intent://ikman.lk", "https:///ad", "https://someone@ikman.lk/ad", "https://ikman.lk\\bad")) {
            assertNull(bad, select(bad))
            assertEquals(trusted, select(bad, trusted)?.url)
        }
        assertNull(select(saleMe, trusted, active = false))
    }
}
