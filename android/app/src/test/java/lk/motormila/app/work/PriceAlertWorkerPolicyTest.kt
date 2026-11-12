package lk.motormila.app.work

import androidx.work.ListenableWorker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PriceAlertWorkerPolicyTest {

    @Test
    fun only_never_seen_listing_ids_notify() {
        assertEquals(listOf(3), unseenListingIds(listOf(1, 2, 3, 3, 0), setOf("1", "2")))
        assertTrue(unseenListingIds(listOf(1, 2), setOf("1", "2")).isEmpty())
    }

    @Test
    fun count_change_without_new_ids_is_not_news() {
        // Listing 2 sold: same remaining ids, smaller count -> nothing to notify.
        assertTrue(unseenListingIds(listOf(1), setOf("1", "2")).isEmpty())
    }

    @Test
    fun seen_set_is_bounded_and_keeps_newest() {
        val seen = (1..MAX_SEEN_IDS_PER_ALERT).map { it.toString() }.toSet()
        val next = rememberSeenIds(seen, listOf(9_999))
        assertEquals(MAX_SEEN_IDS_PER_ALERT, next.size)
        assertTrue("9999" in next)
        assertTrue("1" !in next)
    }

    @Test
    fun retries_are_bounded_and_skip_permanent_errors() {
        assertTrue(alertRetryDecision(null, 0, 5) is ListenableWorker.Result.Retry)
        assertTrue(alertRetryDecision(503, 4, 5) is ListenableWorker.Result.Retry)
        assertTrue(alertRetryDecision(429, 1, 5) is ListenableWorker.Result.Retry)
        assertTrue(alertRetryDecision(503, 5, 5) is ListenableWorker.Result.Success)
        assertTrue(alertRetryDecision(401, 0, 5) is ListenableWorker.Result.Success)
        assertTrue(alertRetryDecision(403, 0, 5) is ListenableWorker.Result.Success)
    }
}
