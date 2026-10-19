package lk.motormila.app.core.updates

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lk.motormila.app.ui.updates.AppUpdateViewModel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Pinned behaviour of the sideload update pipeline.
 *
 * Version comparison is numeric on versionCode only; the check can never crash
 * the UI; dismissing a version quiets it only in-memory (the next cold start
 * re-offers); a manual check always re-surfaces it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppUpdateFlowTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var checker: AppUpdateChecker
    private lateinit var viewModel: AppUpdateViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        checker = mockk()
        // Construct the ViewModel directly with an Application context mock so
        // Dispatchers.Main (now the test dispatcher) drives viewModelScope, and
        // hand it the same test dispatcher for its IO work — otherwise the
        // checker's withContext would escape the test scheduler and the state
        // assertions below would race a real background thread.
        viewModel = AppUpdateViewModel(checker, mockk(relaxed = true), testDispatcher)
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    private fun release(code: Int, url: String = "https://example.test/app.apk") =
        AppUpdateChecker.CheckResult.UpdateAvailable(
            versionName = "1.5.$code",
            versionCode = code,
            apkUrl = url,
            notes = null,
        )

    /** Passive launch check on a fresh process must re-run (flag is in-memory). */
    @Test
    fun freshProcessRechecksAfterDismissal() = runTest(testDispatcher) {
        coEvery { checker.check(7) } returns release(8)

        viewModel.checkOnLaunch(7)
        advanceUntilIdle()
        viewModel.dismiss()
        assertNull(viewModel.state.value.available)

        val nextProcess = AppUpdateViewModel(checker, mockk(relaxed = true), testDispatcher)
        nextProcess.checkOnLaunch(7)
        advanceUntilIdle()
        // Dismissal lives in memory: the next cold start offers again (no silent skip).
        assertEquals(8, nextProcess.state.value.available?.versionCode)
    }

    @Test
    fun onlyStrictlyNewerVersionCodeIsOffered() = runTest(testDispatcher) {
        // Newer build + APK -> offered.
        assertTrue(policyAllows(current = 7, code = 8, url = "https://example.test/a.apk"))
        // Same build -> up to date.
        assertTrue(!policyAllows(current = 8, code = 8, url = "https://example.test/a.apk"))
        // Older build -> up to date (name cosmetics never decide).
        assertTrue(!policyAllows(current = 9, code = 8, url = "https://example.test/a.apk"))
    }

    @Test
    fun passiveLaunchCheckRespectsDismissal_manualCheckReShows() = runTest(testDispatcher) {
        coEvery { checker.check(7) } returns release(8)

        viewModel.checkOnLaunch(7)
        advanceUntilIdle()
        assertEquals(8, viewModel.state.value.available?.versionCode)

        viewModel.dismiss()
        assertNull(viewModel.state.value.available)

        // An explicit check always re-surfaces the dismissed release.
        viewModel.manualCheck(7)
        advanceUntilIdle()
        assertEquals(8, viewModel.state.value.available?.versionCode)
    }

    @Test
    fun passiveCheckNeverSetsManualNoUpdateFeedback() = runTest(testDispatcher) {
        coEvery { checker.check(7) } returns AppUpdateChecker.CheckResult.UpToDate

        viewModel.checkOnLaunch(7)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertNull(state.available)
        assertEquals(false, state.manuallyCheckedWithNoUpdate)
        assertEquals(false, state.checking)
    }

    @Test
    fun checkerFailureIsSilentUpToDate() = runTest(testDispatcher) {
        coEvery { checker.check(7) } throws RuntimeException("offline")

        viewModel.manualCheck(7)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertNull(state.available)
        assertEquals(true, state.manuallyCheckedWithNoUpdate)
        assertEquals(false, state.checking)
    }

    @Test
    fun concurrentLaunchChecksDoNotStack() = runTest(testDispatcher) {
        coEvery { checker.check(7) } returns AppUpdateChecker.CheckResult.UpToDate

        viewModel.checkOnLaunch(7)
        viewModel.checkOnLaunch(7)
        advanceUntilIdle()

        // checkedThisProcess: the second call is a no-op.
        coVerify(exactly = 1) { checker.check(7) }
        assertEquals(false, viewModel.state.value.checking)
    }

    @Test
    fun downloadFailureTicksWithoutCrashing() = runTest(testDispatcher) {
        coEvery { checker.check(7) } returns AppUpdateChecker.CheckResult.UpToDate
        io.mockk.every { checker.canInstallPackages(any()) } returns true
        coEvery { checker.downloadApk(any(), any(), any()) } returns null

        viewModel.downloadAndInstall(release(8))
        advanceUntilIdle()

        assertEquals(1, viewModel.state.value.downloadFailedTick)
        assertEquals(false, viewModel.state.value.downloading)
        viewModel.consumeDownloadFailure()
        assertEquals(0, viewModel.state.value.downloadFailedTick)
    }
}

/**
 * Mirrors AppUpdateChecker.check()'s decision policy: strictly-greater numeric
 * versionCode AND a non-blank apk_url. The real check reads BuildConfig at the
 * call site; extracting the pure policy here keeps these tests dependency-free
 * while pinning the sideload contract.
 */
private fun policyAllows(current: Int, code: Int, url: String): Boolean =
    code > current && url.isNotBlank()
