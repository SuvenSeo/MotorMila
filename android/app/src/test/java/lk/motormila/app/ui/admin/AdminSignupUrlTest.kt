package lk.motormila.app.ui.admin

import org.junit.Assert.assertEquals
import org.junit.Test

class AdminSignupUrlTest {

    @Test
    fun signupPath_isPrefixedWithPublicOrigin() {
        assertEquals(
            "https://motormila.pages.dev/sign-up?token=abc",
            adminSignupUrl("/sign-up?token=abc"),
        )
    }

    @Test
    fun missingPath_fallsBackToTokenQuery() {
        assertEquals(
            "https://motormila.pages.dev/sign-up?token=xyz",
            adminSignupUrl(null, "xyz"),
        )
    }

    @Test
    fun absolutePath_isReturnedUnchanged() {
        assertEquals(
            "https://example.com/join?token=1",
            adminSignupUrl("https://example.com/join?token=1"),
        )
    }

    @Test
    fun providerStatus_coversFlaggedNeedsKeyAndReady() {
        assertEquals("flagged off", adminProviderStatus(enabled = false, configured = true, lastRun = null))
        assertEquals("needs key", adminProviderStatus(enabled = true, configured = false, lastRun = null))
        assertEquals("ready · no runs yet", adminProviderStatus(enabled = true, configured = true, lastRun = "  "))
        assertEquals("success", adminProviderStatus(enabled = true, configured = true, lastRun = "success"))
    }
}
