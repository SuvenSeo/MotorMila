package lk.motormila.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import lk.motormila.app.core.locale.LocaleHelper
import lk.motormila.app.data.auth.SessionGuard
import lk.motormila.app.data.local.datastore.SettingsStore
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.ui.widget.enqueueDealWidgetRefresh
import lk.motormila.app.work.PriceAlertSyncWorker
import lk.motormila.app.work.SnapshotRefreshWorker
import okhttp3.OkHttpClient

@HiltAndroidApp
class MotormilaApp : Application(), SingletonImageLoader.Factory, Configuration.Provider {

    @Inject
    lateinit var okHttpClient: OkHttpClient

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var settingsStore: SettingsStore

    @Inject
    lateinit var authRepository: AuthRepository

    @Inject
    lateinit var sessionGuard: SessionGuard

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        // Restore the persisted session immediately (the interceptor also
        // restores lazily on its first request, so no request can ever leave
        // without the bearer even if this hasn't finished yet).
        appScope.launch { runCatching { authRepository.restore() } }
        // A rejected bearer (HTTP 401) is a real logout: SessionGuard clears
        // the persisted session + token, then posts SessionEnded so the nav
        // graph routes to Login.
        sessionGuard.start(appScope)
        // Alert matching only runs while signed in.
        appScope.launch {
            runCatching {
                authRepository.session()
                    .map { it != null }
                    .distinctUntilChanged()
                    .collect { signedIn ->
                        if (signedIn) runCatching { PriceAlertSyncWorker.enqueue(this@MotormilaApp) }
                        else runCatching { PriceAlertSyncWorker.cancel(this@MotormilaApp) }
                    }
            }
        }
        // AppCompat persists the per-app locale itself (autoStoreLocales);
        // re-apply from settings for installs that predate that.
        appScope.launch {
            runCatching {
                LocaleHelper.applyFromStore(settingsStore.observe().first().language)
            }
        }
        // Periodic + one-shot WorkManager (KEEP unique names, network-required).
        runCatching { SnapshotRefreshWorker.enqueue(this) }
        runCatching { enqueueDealWidgetRefresh(this) }
    }

    /**
     * Images use a client derived from the shared one (same connection pool)
     * but with NO interceptors (no bearer to third-party CDNs) and no 15 s
     * whole-call timeout (large photos on slow 3G).
     */
    private val imageClient: OkHttpClient by lazy {
        okHttpClient.newBuilder()
            .apply { interceptors().clear() }
            .callTimeout(0, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    override fun newImageLoader(context: coil3.PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components {
                add(OkHttpNetworkFetcherFactory(callFactory = { imageClient }))
            }
            .memoryCache {
                MemoryCache.Builder()
                    .maxSizePercent(context, 0.28)
                    .build()
            }
            .crossfade(160)
            .build()

    private fun createNotificationChannels() {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val channels = listOf(
            NotificationChannel(
                CHANNEL_PRICE_DROPS,
                getString(R.string.channel_price_drops),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = getString(R.string.channel_price_drops_desc) },
            NotificationChannel(
                CHANNEL_MARKET_NEWS,
                getString(R.string.channel_market_news),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = getString(R.string.channel_market_news_desc) },
            NotificationChannel(
                CHANNEL_SYNC,
                getString(R.string.channel_sync),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = getString(R.string.channel_sync_desc) },
        )
        nm.createNotificationChannels(channels)
    }

    companion object {
        const val CHANNEL_PRICE_DROPS = "price_drops"
        const val CHANNEL_MARKET_NEWS = "market_news"
        const val CHANNEL_SYNC = "sync"
    }
}
