package lk.motormila.app.core.updates

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Direct-flavor updater policy: newer versionCode + https URL + published SHA-256. */
class AppUpdateDecisionTest {

    private val sha = "a".repeat(64)

    private fun release(code: Int?, url: String? = "https://cdn/app.apk", sha256: String? = sha, min: Int = 0) =
        AppUpdateChecker.LatestRelease(
            version = "1.7.0",
            version_code = code,
            apk_url = url,
            sha256 = sha256,
            min_supported_version_code = min,
        )

    @Test
    fun newerReleaseWithHashIsOffered() {
        val result = AppUpdateChecker.decide(release(18), currentVersionCode = 17)
        assertTrue(result is AppUpdateChecker.CheckResult.UpdateAvailable)
        assertEquals(sha, (result as AppUpdateChecker.CheckResult.UpdateAvailable).sha256)
    }

    @Test
    fun missingOrMalformedHashIsNeverOffered() {
        assertEquals(AppUpdateChecker.CheckResult.UpToDate, AppUpdateChecker.decide(release(18, sha256 = null), 17))
        assertEquals(AppUpdateChecker.CheckResult.UpToDate, AppUpdateChecker.decide(release(18, sha256 = "abc"), 17))
    }

    @Test
    fun sameOrOlderVersionIsUpToDate() {
        assertEquals(AppUpdateChecker.CheckResult.UpToDate, AppUpdateChecker.decide(release(17), 17))
        assertEquals(AppUpdateChecker.CheckResult.UpToDate, AppUpdateChecker.decide(release(null), 17))
        assertEquals(AppUpdateChecker.CheckResult.UpToDate, AppUpdateChecker.decide(release(18, url = " "), 17))
    }

    @Test
    fun belowMinSupportedIsMandatory() {
        val result = AppUpdateChecker.decide(release(20, min = 18), 17) as AppUpdateChecker.CheckResult.UpdateAvailable
        assertTrue(result.mandatory)
    }

    @Test
    fun hashNormalisation() {
        assertEquals(sha, AppUpdateChecker.normalizeSha256("sha256:" + "A".repeat(64)))
        assertNull(AppUpdateChecker.normalizeSha256("z".repeat(64)))
        assertNull(AppUpdateChecker.normalizeSha256(null))
    }
}
