package lk.motormila.app.fcm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import lk.motormila.app.core.notifications.NotificationHelper
import lk.motormila.app.data.local.datastore.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

const val LISTING_DEEP_LINK_PREFIX = "motormila://listing/"
const val WATCHLIST_DEEP_LINK = "motormila://watchlist"

/** Push kinds routed to NotificationHelper channels. Pure + unit-testable. */
fun fcmChannelFor(kind: String?): String = when (kind) {
    "price_drop", "alert_match" -> NotificationHelper.CHANNEL_PRICE_DROPS
    else -> NotificationHelper.CHANNEL_MARKET_NEWS
}

/** In-app listing deep link. Manifest + NavHost: motormila://listing/{id}. */
fun listingDeepLink(listingId: Int): String = "$LISTING_DEEP_LINK_PREFIX$listingId"

/** Fallback when a push/alert has no listing id. */
fun watchlistDeepLink(): String = WATCHLIST_DEEP_LINK

/**
 * Notification tap target: listing detail when [listingId] is present,
 * otherwise the watchlist shortcut URI.
 */
fun notificationTapUri(listingId: Int?): String =
    if (listingId != null) listingDeepLink(listingId) else watchlistDeepLink()

/** VIEW intent scoped to this app so the tap never leaks to a browser. */
fun listingTapIntent(context: Context, listingId: Int?): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(notificationTapUri(listingId))).apply {
        `package` = context.packageName
        setClassName(context.packageName, "lk.motormila.app.MainActivity")
    }

fun listingTapPendingIntent(
    context: Context,
    listingId: Int?,
    requestCode: Int,
): PendingIntent? = runCatching {
    PendingIntent.getActivity(
        context,
        requestCode,
        listingTapIntent(context, listingId),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}.getOrNull()

/**
 * Push handling behind the Firebase entry point [MotormilaMessagingService].
 *
 * - [onNewTokenAsync]: persist the rotated token and (re-)register it with
 *   the backend via [PushTokenRegistrar] (POST /notifications/devices).
 * - [onDataMessage]: backend data-only messages (type=price_drop, listing_id,
 *   deep_link, title, body) become a local notification on the price_drops
 *   channel whose tap opens motormila://listing/{id} inside this app.
 * - [subscribePostLogin] / [unsubscribeAll]: login/logout hooks.
 *
 * Every body is wrapped in runCatching so push handling can never crash the app.
 * POST_NOTIFICATIONS (API 33+): [NotificationHelper.hasPermission] gates
 * posts; the runtime request happens after alert creation and from
 * Settings → Notifications (NotificationPermission.kt).
 */
@Singleton
class MotormilaFcmService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settings: SettingsStore,
    private val notifications: NotificationHelper,
    private val registrar: PushTokenRegistrar,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        const val TOPIC_PRICE_DROPS = "motormila_price_drops"
        const val TOPIC_MARKET_NEWS = "motormila_market_news"

        private const val TAG = "MotormilaFcm"
    }

    /** After login / app start while signed in: register this device's token. */
    fun subscribePostLogin() {
        scope.launch { runCatching { registrar.sync() } }
    }

    /** Logout: unbind the token server-side and rotate it locally. */
    suspend fun unsubscribeAll() {
        runCatching { registrar.unregister() }
    }

    /** Persist the device token and register it with the backend. */
    suspend fun onNewToken(token: String) {
        runCatching {
            settings.setFcmToken(token)
            registrar.sync(newToken = token)
        }
    }

    fun onNewTokenAsync(token: String) {
        scope.launch { onNewToken(token) }
    }

    /** A data-only FCM message from the backend. */
    fun onDataMessage(data: Map<String, String>) {
        runCatching {
            val push = parseIncomingPush(data) ?: return
            Log.d(TAG, "push received: ${push.kind} listing=${push.listingId}")
            onMessageReceived(push.title, push.body, push.kind, push.notificationId, push.listingId)
        }
    }

    /** Route an incoming push to the matching local notification channel. */
    fun onMessageReceived(title: String, body: String, kind: String?, id: Int, listingId: Int? = null) {
        runCatching {
            val tap = listingTapPendingIntent(context, listingId, id)
            when (fcmChannelFor(kind)) {
                NotificationHelper.CHANNEL_PRICE_DROPS ->
                    notifications.notifyPriceDrop(id, title, body, contentIntent = tap)
                else -> notifications.notifyMarketNews(id, title, body, contentIntent = tap)
            }
        }
    }
}
