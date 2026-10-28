package lk.motormila.app.fcm

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import lk.motormila.app.BuildConfig

/** Firebase client values baked in at build time (see app/build.gradle.kts). */
data class FirebaseClientConfig(
    val appId: String,
    val apiKey: String,
    val projectId: String,
    val senderId: String,
) {
    /** All four present -> FCM can be initialised. */
    val isComplete: Boolean
        get() = listOf(appId, apiKey, projectId, senderId).all { it.isNotBlank() }

    companion object {
        fun fromBuildConfig() = FirebaseClientConfig(
            appId = BuildConfig.FIREBASE_APP_ID,
            apiKey = BuildConfig.FIREBASE_API_KEY,
            projectId = BuildConfig.FIREBASE_PROJECT_ID,
            senderId = BuildConfig.FIREBASE_SENDER_ID,
        )
    }
}

/**
 * Initialises the default FirebaseApp WITHOUT the google-services plugin.
 *
 * FirebaseInitProvider still runs at process start; with no google-services
 * resources it only logs and leaves Firebase uninitialised. We then init from
 * [FirebaseClientConfig] when every value is present. With no config the app
 * runs push-less: [isAvailable] stays false and every FCM call is skipped.
 */
object FirebaseBootstrap {
    private const val TAG = "MotormilaFcm"

    @Volatile
    private var available: Boolean? = null

    fun ensureInitialized(
        context: Context,
        config: FirebaseClientConfig = FirebaseClientConfig.fromBuildConfig(),
    ): Boolean {
        available?.let { return it }
        val ok = runCatching {
            if (FirebaseApp.getApps(context).isNotEmpty()) return@runCatching true
            if (!config.isComplete) return@runCatching false
            val options = FirebaseOptions.Builder()
                .setApplicationId(config.appId)
                .setApiKey(config.apiKey)
                .setProjectId(config.projectId)
                .setGcmSenderId(config.senderId)
                .build()
            FirebaseApp.initializeApp(context.applicationContext, options)
            true
        }.onFailure { Log.w(TAG, "Firebase init failed", it) }.getOrDefault(false)
        if (!ok) Log.i(TAG, "FCM disabled (no Firebase client config in this build)")
        available = ok
        return ok
    }

    fun isAvailable(context: Context): Boolean = ensureInitialized(context)
}
