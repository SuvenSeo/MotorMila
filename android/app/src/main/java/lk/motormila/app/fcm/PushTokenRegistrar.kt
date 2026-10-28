package lk.motormila.app.fcm

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Task
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import lk.motormila.app.BuildConfig
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.local.datastore.SettingsStore
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.DeviceRegisterRequestDto
import lk.motormila.app.data.remote.dto.DeviceUnregisterRequestDto

/**
 * Keeps this device's FCM token registered with the backend
 * (POST /notifications/devices) while signed in, and unbinds it on logout.
 *
 * Registration carries the Settings price-drop opt-in and the local
 * watchlist ids, so the server can push "Price drop" for watched listings.
 * Every call is fail-safe (never throws); with no Firebase config in the
 * build ([FirebaseBootstrap]) everything is a no-op.
 */
@Singleton
class PushTokenRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: MotormilaApiService,
    private val settings: SettingsStore,
    private val sessionStore: SessionStore,
    private val database: MotormilaDatabase,
) {
    private val mutex = Mutex()

    /** Last payload the server accepted for [lastSessionToken]; skips identical re-posts. */
    private var lastRegistered: DeviceRegisterRequestDto? = null
    private var lastSessionToken: String? = null

    /**
     * Register (or refresh) the token. [newToken] comes from onNewToken;
     * otherwise the current token is fetched from Firebase. [force] re-posts
     * even when nothing changed (periodic freshness from the alert worker).
     */
    suspend fun sync(newToken: String? = null, force: Boolean = false): Boolean = mutex.withLock {
        runCatching {
            if (newToken != null) settings.setFcmToken(newToken)
            if (!FirebaseBootstrap.isAvailable(context)) return@runCatching false
            val session = sessionStore.rehydrate() ?: return@runCatching false
            val token = newToken ?: fetchToken()?.also { settings.setFcmToken(it) }
                ?: return@runCatching false
            val prefs = settings.observe().first()
            val watched = runCatching { database.watchlistDao().getAll().map { it.listingId } }
                .getOrDefault(emptyList())
            val request = buildDeviceRegistration(
                token = token,
                appVersion = BuildConfig.VERSION_NAME,
                priceDropsEnabled = prefs.priceDropPushEnabled,
                watchedListingIds = watched,
            )
            if (!force && request == lastRegistered && session.token == lastSessionToken) {
                return@runCatching true
            }
            // A rotated token: drop the stale server row first (best-effort).
            val previous = prefs.fcmRegisteredToken
            if (previous != null && previous != token) {
                runCatching { api.unregisterPushDevice(DeviceUnregisterRequestDto(previous)) }
            }
            api.registerPushDevice(request)
            settings.setFcmRegisteredToken(token)
            lastRegistered = request
            lastSessionToken = session.token
            true
        }.onFailure { Log.w(TAG, "push registration failed", it) }.getOrDefault(false)
    }

    /**
     * Logout / account deletion. Call BEFORE the session is cleared so the
     * DELETE still carries the bearer. Then rotates the local FCM token so a
     * server row that could not be removed (offline, expired session) dies
     * with UNREGISTERED on the next send and is pruned server-side.
     */
    suspend fun unregister() = mutex.withLock {
        runCatching {
            val prefs = settings.observe().first()
            val token = prefs.fcmRegisteredToken ?: prefs.fcmToken
            if (token != null && sessionStore.cachedToken != null) {
                runCatching { api.unregisterPushDevice(DeviceUnregisterRequestDto(token)) }
            }
            settings.setFcmRegisteredToken(null)
            lastRegistered = null
            lastSessionToken = null
            if (FirebaseBootstrap.isAvailable(context)) {
                withTimeoutOrNull(TIMEOUT_MS) { FirebaseMessaging.getInstance().deleteToken().awaitOrNull() }
                settings.setFcmToken(null)
            }
        }.onFailure { Log.w(TAG, "push unregister failed", it) }
        Unit
    }

    private suspend fun fetchToken(): String? =
        withTimeoutOrNull(TIMEOUT_MS) { FirebaseMessaging.getInstance().token.awaitOrNull() }
            ?.takeIf { it.isNotBlank() }

    private companion object {
        const val TAG = "MotormilaFcm"
        const val TIMEOUT_MS = 10_000L
    }
}

/** Await a Play-services Task without kotlinx-coroutines-play-services. Null on failure. */
private suspend fun <T> Task<T>.awaitOrNull(): T? = suspendCancellableCoroutine { cont ->
    addOnCompleteListener { task ->
        val value = if (task.isSuccessful) task.result else null
        if (cont.isActive) cont.resume(value)
    }
}
