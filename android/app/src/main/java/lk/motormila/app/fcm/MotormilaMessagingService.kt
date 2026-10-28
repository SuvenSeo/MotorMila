package lk.motormila.app.fcm

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

/**
 * The Firebase entry point (declared in AndroidManifest.xml). Thin: forwards
 * token rotations and data messages into the Hilt-managed
 * [MotormilaFcmService]. Uses a Hilt entry point rather than
 * @AndroidEntryPoint, matching PriceAlertSyncWorker (plain constructor, so
 * instantiation never depends on generated Hilt bindings).
 */
class MotormilaMessagingService : FirebaseMessagingService() {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface FcmEntryPoint {
        fun fcm(): MotormilaFcmService
    }

    private val fcm: MotormilaFcmService by lazy {
        EntryPointAccessors.fromApplication(applicationContext, FcmEntryPoint::class.java).fcm()
    }

    /** Registration runs on the singleton's scope so it outlives this service. */
    override fun onNewToken(token: String) {
        runCatching { fcm.onNewTokenAsync(token) }
    }

    /** Runs on a Firebase worker thread; posting a notification is synchronous. */
    override fun onMessageReceived(message: RemoteMessage) {
        runCatching { fcm.onDataMessage(message.data) }
    }
}
