package lk.motormila.app.data.local

import java.time.Instant
import lk.motormila.app.data.local.datastore.SessionStore
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Expired JWTs are dropped on restore instead of being sent. */
class SessionExpiryTest {
    private val now = Instant.parse("2026-10-19T12:00:00Z")

    @Test
    fun pastExpiryIsExpired() {
        assertTrue(SessionStore.isExpired("2026-10-19T11:59:59Z", now))
        assertTrue(SessionStore.isExpired("2026-10-19T12:00:00Z", now))
    }

    @Test
    fun futureOrUnknownExpiryIsNotExpired() {
        assertFalse(SessionStore.isExpired("2026-10-20T00:00:00Z", now))
        assertFalse(SessionStore.isExpired(null, now))
        assertFalse(SessionStore.isExpired("not-a-date", now))
    }
}
