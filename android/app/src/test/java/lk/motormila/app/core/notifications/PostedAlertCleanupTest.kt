package lk.motormila.app.core.notifications

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.service.notification.StatusBarNotification
import io.mockk.*
import org.junit.Test

class PostedAlertCleanupTest {
    @Test fun cancelsLegacyAndTaggedAlertsButNotUnrelatedPostsWithOverlappingIds() {
        val manager = mockk<NotificationManager>(relaxUnitFun = true)
        val context = mockk<Context> { every { getSystemService(NotificationManager::class.java) } returns manager }
        fun posted(channel: String, tag: String?, id: Int): StatusBarNotification {
            val payload = mockk<Notification> { every { channelId } returns channel }
            return mockk {
                every { notification } returns payload
                every { this@mockk.tag } returns tag
                every { this@mockk.id } returns id
            }
        }
        every { manager.activeNotifications } returns arrayOf(
            posted("price_drops", null, 11), posted("price_drops", "market_alert", 12),
            posted("market_news", null, 21), posted("sync", null, 31), posted("price_drops", "other", 11),
        )
        NotificationHelper(context).clearPostedAlerts()
        verify { manager.activeNotifications; manager.cancel(null, 11); manager.cancel("market_alert", 12) }
        confirmVerified(manager)
    }
}
