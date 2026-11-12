package lk.motormila.app.work

import android.app.PendingIntent
import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import lk.motormila.app.core.notifications.NotificationHelper
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.fcm.listingTapPendingIntent

/**
 * Periodic alert matcher: reads cached alerts from Room, calls
 * POST /alerts/match, and posts a local notification per alert with new
 * matches. Tap opens [motormila://listing/{id}] when a match listing is
 * present, otherwise [motormila://watchlist]. Package is always set so the
 * tap stays inside this app.
 *
 * Schedule with [enqueue] (12 h interval + immediate one-shot,
 * network-required, exponential backoff); [cancel] on logout.
 *
 * Dependencies come from a Hilt entry point (NOT @HiltWorker): the generated
 * worker factory binding proved unreliable on-device (reflection fallback →
 * NoSuchMethodException), while a plain (Context, WorkerParameters)
 * constructor instantiates under every factory.
 */
class PriceAlertSyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface AlertWorkerEntryPoint {
        fun api(): MotormilaApiService
        fun db(): MotormilaDatabase
        fun notifications(): NotificationHelper
        fun sessionStore(): lk.motormila.app.data.local.datastore.SessionStore
        fun pushRegistrar(): lk.motormila.app.fcm.PushTokenRegistrar
    }

    private val entryPoint: AlertWorkerEntryPoint by lazy {
        EntryPointAccessors.fromApplication(applicationContext, AlertWorkerEntryPoint::class.java)
    }

    companion object {
        const val UNIQUE_NAME = "price_alert_sync"
        const val UNIQUE_ONCE = "price_alert_sync_once"
        private const val NOTIF_ID_BASE = 10_000
        private const val MAX_ATTEMPTS = 5
        private const val SEEN_PREFS = "alert_seen_matches"

        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val wm = WorkManager.getInstance(context)
            val periodic = PeriodicWorkRequestBuilder<PriceAlertSyncWorker>(12, TimeUnit.HOURS)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .addTag(UNIQUE_NAME)
                .build()
            wm.enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, periodic)
            val once = OneTimeWorkRequestBuilder<PriceAlertSyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .addTag(UNIQUE_NAME)
                .build()
            wm.enqueueUniqueWork(UNIQUE_ONCE, ExistingWorkPolicy.KEEP, once)
        }

        fun cancel(context: Context) {
            val wm = WorkManager.getInstance(context)
            wm.cancelUniqueWork(UNIQUE_NAME)
            wm.cancelUniqueWork(UNIQUE_ONCE)
        }
    }

    override suspend fun doWork(): Result {
        // Signed out (or session expired): never call the API, and stop the
        // schedule so a stale periodic request cannot keep firing.
        val session = runCatching { entryPoint.sessionStore().rehydrate() }.getOrNull()
        if (session == null) {
            runCatching { cancel(applicationContext) }
            return Result.success()
        }
        // Twice-daily FCM registration refresh (keeps the server row fresh and
        // the watched-listing ids current). No-op without Firebase config.
        runCatching { entryPoint.pushRegistrar().sync(force = true) }
        val api = entryPoint.api()
        val db = entryPoint.db()
        val notifications = entryPoint.notifications()
        val alerts = runCatching { db.alertDao().getAll().filter { it.active } }.getOrElse { emptyList() }
        if (alerts.isEmpty()) return Result.success()
        val match = runCatching { api.matchAlerts() }.getOrElse { e ->
            if (e is kotlin.coroutines.cancellation.CancellationException) throw e
            return alertRetryDecision((e as? retrofit2.HttpException)?.code(), runAttemptCount, MAX_ATTEMPTS)
        }
        val seen = applicationContext.getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE)
        val seenEditor = seen.edit()
        val res = applicationContext.resources
        match.results.forEach { row ->
            if (row.matchingCount <= 0 || alerts.none { it.id == row.alertId }) return@forEach
            // Dedupe by listing id: notify only for listings this alert has
            // never notified about (a count change alone is not news).
            val key = "alert_ids_${row.alertId}"
            val seenIds = seen.getStringSet(key, emptySet()).orEmpty()
            val fresh = unseenListingIds(row.listings.map { it.id }, seenIds)
            if (fresh.isEmpty()) return@forEach
            seenEditor.putStringSet(key, rememberSeenIds(seenIds, fresh))
            val first = row.listings.firstOrNull { it.id == fresh.first() } ?: row.listings.firstOrNull()
            notifications.notifyPriceDrop(
                id = NOTIF_ID_BASE + row.alertId,
                title = res.getString(
                    lk.motormila.app.R.string.notif_alert_match_title,
                    listOfNotNull(row.make, row.model).joinToString(" ")
                        .ifBlank { res.getString(lk.motormila.app.R.string.notif_alert_your_alert) },
                ),
                body = res.getQuantityString(
                    lk.motormila.app.R.plurals.notif_alert_match_count,
                    row.matchingCount,
                    row.matchingCount,
                ) + (
                    first?.priceLkr?.let { price ->
                        " " + res.getString(lk.motormila.app.R.string.notif_alert_match_from, lk.motormila.app.core.format.LkrFormat.price(price))
                    } ?: ""
                    ),
                contentIntent = contentIntentOf(row.alertId, first?.id),
            )
        }
        seenEditor.apply()
        return Result.success()
    }

    private fun contentIntentOf(alertId: Int, listingId: Int?): PendingIntent? =
        listingTapPendingIntent(applicationContext, listingId, alertId)
}

/** Max listing ids remembered per alert (oldest dropped first). */
internal const val MAX_SEEN_IDS_PER_ALERT = 200

/** Listing ids (in match order) this alert has not notified about yet. */
internal fun unseenListingIds(matchIds: List<Int>, seenIds: Set<String>): List<Int> =
    matchIds.filter { it > 0 && it.toString() !in seenIds }.distinct()

/** Seen set after notifying [fresh]; bounded to [MAX_SEEN_IDS_PER_ALERT]. */
internal fun rememberSeenIds(seenIds: Set<String>, fresh: List<Int>): Set<String> {
    val merged = LinkedHashSet<String>(seenIds)
    fresh.forEach { merged.add(it.toString()) }
    return if (merged.size <= MAX_SEEN_IDS_PER_ALERT) merged
    else merged.toList().takeLast(MAX_SEEN_IDS_PER_ALERT).toSet()
}

/**
 * Bounded retry policy for POST /alerts/match failures:
 * 4xx (auth, plan, not found) will not fix itself -> stop (success);
 * 408/429 and network/5xx retry with backoff until [maxAttempts], then stop.
 */
internal fun alertRetryDecision(httpCode: Int?, runAttemptCount: Int, maxAttempts: Int): androidx.work.ListenableWorker.Result {
    val transient = httpCode == null || httpCode == 408 || httpCode == 429 || httpCode >= 500
    return if (transient && runAttemptCount < maxAttempts) androidx.work.ListenableWorker.Result.retry()
    else androidx.work.ListenableWorker.Result.success()
}
