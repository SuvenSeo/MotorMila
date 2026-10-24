package lk.motormila.app.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import lk.motormila.app.BuildConfig
import lk.motormila.app.core.network.AuthInterceptor
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.SnapshotApiService
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Network graph. Base URL = BuildConfig.BASE_URL ("…/api/v1", no trailing slash).
 *
 * Timeouts are deliberately SHORT (8 s connect / 10 s read): the backend runs
 * on HuggingFace Spaces free tier, which sleeps when idle and takes 30-60 s
 * to cold-start. A hanging live call must fail fast so [withSnapshotFallback]
 * can serve the Cloudflare snapshot instead of blocking the UI until the
 * ViewModel's 20 s withTimeout fires. Logging: BODY in debug, NONE in
 * release. JSON: ignoreUnknownKeys + coerceInputValues + explicitNulls=false
 * so backend additions never crash decode.
 */
private const val SNAPSHOT_BASE_URL = "https://motormila.pages.dev/snapshots/latest/"

/** Live API: fail fast on cold/sleeping backend so snapshot fallback wins. */
private const val LIVE_CONNECT_TIMEOUT_S = 8L
private const val LIVE_READ_TIMEOUT_S = 10L
private const val SLOW_SEARCH_TIMEOUT_S = 35L

/** Snapshot CDN (Cloudflare): normally <2 s; fail fast if it's hanging too. */
private const val SNAPSHOT_CONNECT_TIMEOUT_S = 8L
private const val SNAPSHOT_READ_TIMEOUT_S = 10L

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        isLenient = true
    }

    @Provides
    @Singleton
    fun provideOkHttp(
        @ApplicationContext context: Context,
        authInterceptor: AuthInterceptor,
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
            else HttpLoggingInterceptor.Level.NONE
        }
        return OkHttpClient.Builder()
            .connectTimeout(LIVE_CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
            .readTimeout(LIVE_READ_TIMEOUT_S, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            // callTimeout covers the WHOLE call including DNS resolution and
            // TLS handshake, which connect/read timeouts do not. Without this,
            // a hanging DNS lookup on a flaky mobile network can stall a
            // request indefinitely past the ViewModel's withTimeout.
            .callTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit {
        val base = BuildConfig.BASE_URL.trim().trimEnd('/') + "/"
        // Filtered listing searches / counts take 10-30 s on the backend; the 15 s
        // callTimeout made them fall back to the (small) offline snapshot. Search
        // calls get a longer budget; everything else keeps the snappy client.
        val slow = client.newBuilder()
            .readTimeout(SLOW_SEARCH_TIMEOUT_S, TimeUnit.SECONDS)
            .callTimeout(SLOW_SEARCH_TIMEOUT_S + 5, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(base)
            .callFactory { request ->
                val path = request.url.encodedPath.trimEnd('/')
                if (path.endsWith("/listings") || path.endsWith("/listings/count")) {
                    slow.newCall(request)
                } else {
                    client.newCall(request)
                }
            }
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }

    @Provides
    @Singleton
    fun provideApi(retrofit: Retrofit): MotormilaApiService =
        retrofit.create(MotormilaApiService::class.java)

    /**
     * Static snapshot fallback (public Vercel JSON, rebuilt by the
     * restore-catalog workflow). Separate client WITHOUT the auth
     * interceptor — these files are public and must load logged-out.
     */
    @Provides
    @Singleton
    fun provideSnapshotApi(json: Json): SnapshotApiService {
        val client = OkHttpClient.Builder()
            .connectTimeout(SNAPSHOT_CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
            .readTimeout(SNAPSHOT_READ_TIMEOUT_S, TimeUnit.SECONDS)
            // Same DNS/TLS hang protection as the live client.
            .callTimeout(15, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(SNAPSHOT_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(SnapshotApiService::class.java)
    }
}