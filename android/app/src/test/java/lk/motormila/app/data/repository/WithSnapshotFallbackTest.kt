package lk.motormila.app.data.repository

import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Unit tests for [withSnapshotFallback] — the network-fail → public-snapshot
 * fallback used by every stats read. Pure coroutine logic; hermetic.
 */
class WithSnapshotFallbackTest {

    @Test
    fun liveSuccess_neverTouchesSnapshot() = runTest {
        var snapshotCalls = 0
        val result = withSnapshotFallback(
            live = { "live-data" },
            snapshot = { snapshotCalls++; "snapshot-data" },
        )
        assertEquals("live-data", result)
        assertEquals(0, snapshotCalls)
    }

    @Test
    fun liveFailure_fallsBackToSnapshot() = runTest {
        val result = withSnapshotFallback<String>(
            live = { throw IOException("Neon outage") },
            snapshot = { "snapshot-data" },
        )
        assertEquals("snapshot-data", result)
    }

    @Test
    fun bothFail_throwsSnapshotErrorWithLiveSuppressed() = runTest {
        val liveError = IOException("live down")
        val snapshotError = IOException("snapshot down")
        try {
            withSnapshotFallback<String>(
                live = { throw liveError },
                snapshot = { throw snapshotError },
            )
            fail("expected the snapshot error to propagate")
        } catch (e: IOException) {
            assertSame(snapshotError, e)
            assertTrue(e.suppressed.contains(liveError))
        }
    }

    @Test
    fun liveCancellation_isNeverSwallowed() = runTest {
        val cancelled = kotlinx.coroutines.CancellationException("scope torn down")
        try {
            withSnapshotFallback<String>(
                live = { throw cancelled },
                snapshot = { "snapshot-data" },
            )
            fail("cancellation must propagate, not fall back")
        } catch (e: kotlinx.coroutines.CancellationException) {
            assertSame(cancelled, e)
        }
    }
}
