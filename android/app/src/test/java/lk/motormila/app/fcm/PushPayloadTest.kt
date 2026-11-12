package lk.motormila.app.fcm

import lk.motormila.app.core.notifications.NotificationHelper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Backend data payload parsing + device registration body. Pure JVM. */
class PushPayloadTest {

    private val priceDrop = mapOf(
        "type" to "price_drop",
        "listing_id" to "42",
        "deep_link" to "https://motormila.pages.dev/listing/42",
        "title" to "Price drop: Toyota Aqua 2017",
        "body" to "Rs 6.2M → Rs 5.9M (−4.8%)",
        "old_price_lkr" to "6200000",
        "new_price_lkr" to "5900000",
    )

    @Test
    fun priceDrop_parsesAndRoutesToListing() {
        val push = parseIncomingPush(priceDrop)!!
        assertEquals("price_drop", push.kind)
        assertEquals("Price drop: Toyota Aqua 2017", push.title)
        assertEquals("Rs 6.2M → Rs 5.9M (−4.8%)", push.body)
        assertEquals(42, push.listingId)
        assertEquals(IncomingPush.PUSH_NOTIF_ID_BASE + 42, push.notificationId)
        assertEquals(NotificationHelper.CHANNEL_PRICE_DROPS, fcmChannelFor(push.kind))
        assertEquals("motormila://listing/42", notificationTapUri(push.listingId))
    }

    @Test
    fun listingId_fallsBackToDeepLinkPath() {
        val push = parseIncomingPush(priceDrop - "listing_id")!!
        assertEquals(42, push.listingId)
        val bad = parseIncomingPush(priceDrop + ("listing_id" to "x") + ("deep_link" to "https://motormila.pages.dev/"))!!
        assertNull(bad.listingId)
        assertEquals("motormila://watchlist", notificationTapUri(bad.listingId))
    }

    @Test
    fun emptyMessage_isIgnored() {
        assertNull(parseIncomingPush(emptyMap()))
        assertNull(parseIncomingPush(mapOf("type" to "price_drop", "listing_id" to "1")))
    }

    @Test
    fun missingTitle_usesAppName() {
        val push = parseIncomingPush(mapOf("body" to "Cheaper now"))!!
        assertEquals("MotorMila", push.title)
        assertNull(push.kind)
        assertEquals(NotificationHelper.CHANNEL_MARKET_NEWS, fcmChannelFor(push.kind))
    }

    @Test
    fun registration_dedupesSortsAndCapsWatchIds() {
        val body = buildDeviceRegistration(
            token = "tok",
            appVersion = "1.7.2",
            priceDropsEnabled = false,
            watchedListingIds = listOf(9, 3, 9, 0, -1) + (1000..1600),
        )
        assertEquals("tok", body.token)
        assertEquals("android", body.platform)
        assertEquals("1.7.2", body.appVersion)
        assertFalse(body.priceDropsEnabled)
        assertEquals(MAX_REGISTERED_WATCH_IDS, body.watchedListingIds.size)
        assertEquals(listOf(3, 9, 1000), body.watchedListingIds.take(3))
    }

    @Test
    fun firebaseConfig_requiresAllFourValues() {
        assertTrue(FirebaseClientConfig("1:2:android:3", "key", "proj", "2").isComplete)
        assertFalse(FirebaseClientConfig("", "key", "proj", "2").isComplete)
        assertFalse(FirebaseClientConfig("1:2:android:3", "key", "proj", " ").isComplete)
    }
}
