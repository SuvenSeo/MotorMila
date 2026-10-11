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
 * Timeouts: 25 s connect/read, 60 s write (image-heavy thumbnail proxy reads).
 * Logging: BODY in debug, NONE in release. JSON: ignoreUnknownKeys +
 * coerceInputValues + explicitNulls=false so backend additions never crash decode.
 */
private const val SNAPSHOT_BASE_URL = "https://motormila.pages.dev/snapshots/latest/"

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
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit {
        val base = BuildConfig.BASE_URL.trim().trimEnd('/') + "/"
        return Retrofit.Builder()
            .baseUrl(base)
            .client(client)
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
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(SNAPSHOT_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(SnapshotApiService::class.java)
    }
}