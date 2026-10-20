package lk.motormila.app.ui.common

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import coil3.intercept.Interceptor
import coil3.request.CachePolicy
import coil3.request.ImageResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Low-data mode (Settings → Data). When on:
 *  - photos load only from the on-device cache (no new image downloads) via
 *    [LowDataImageInterceptor], registered on the app ImageLoader;
 *  - my screens skip decorative chart draw-in and auto price refreshes.
 * Stored in plain SharedPreferences so it can be read synchronously by the
 * Coil interceptor without touching the settings DataStore.
 */
object LowDataMode {
    private const val PREFS = "motormila_screens"
    private const val KEY = "low_data_mode"
    private val state = MutableStateFlow<Boolean?>(null)

    fun enabled(context: Context): Boolean {
        state.value?.let { return it }
        val v = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY, false)
        state.value = v
        return v
    }

    fun flow(context: Context): StateFlow<Boolean?> {
        enabled(context)
        return state.asStateFlow()
    }

    fun set(context: Context, value: Boolean) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY, value).apply()
        state.value = value
    }

    /** Current value for composables (recomposes when toggled). */
    @Composable
    fun current(): Boolean {
        val context = LocalContext.current
        val v by flow(context).collectAsState()
        return v ?: false
    }
}

/** Coil interceptor: in low-data mode, never hit the network for images. */
class LowDataImageInterceptor(private val context: Context) : Interceptor {
    override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
        if (!LowDataMode.enabled(context)) return chain.proceed()
        val request = chain.request.newBuilder()
            .networkCachePolicy(CachePolicy.DISABLED)
            .build()
        return chain.withRequest(request).proceed()
    }
}
