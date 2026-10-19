package lk.motormila.app.core.network

import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton
import lk.motormila.app.BuildConfig
import lk.motormila.app.data.local.datastore.SessionStore
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds `Authorization: Bearer <token>` to MotorMila API requests only.
 *
 * - Single token source: [SessionStore.tokenForRequest], which restores the
 *   persisted session on first use (cold start) before the first request
 *   leaves the device.
 * - Host allow-list: the bearer is attached only when the request host is the
 *   configured API host ([BuildConfig.BASE_URL]). Image CDNs, the snapshot CDN
 *   and any other third party never see the JWT.
 * - On HTTP 401 **with a bearer token** the in-memory token is dropped at once
 *   and [AuthEventBus] is notified; [lk.motormila.app.MotormilaApp] clears the
 *   persisted session and the nav graph routes to Login. Anonymous 401s (gated
 *   product routes while browsing) do not force re-login.
 *
 * [Provider] indirection breaks the Hilt cycle:
 * OkHttp -> Interceptor -> SessionStore -/-> ApiService -> OkHttp.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionStore: Provider<SessionStore>,
    private val authEventBus: AuthEventBus,
) : Interceptor {

    private val apiHost: String? = BuildConfig.BASE_URL.toHttpUrlOrNull()?.host

    /**
     * Kept for call-site compatibility with AuthRepositoryImpl. The session
     * store is the single source of truth; a null clears the in-memory token.
     */
    fun updateToken(token: String?) {
        if (token == null) runCatching { sessionStore.get().invalidateCachedToken() }
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = if (isApiHost(original.url, apiHost)) {
            runCatching { sessionStore.get().tokenForRequest() }.getOrNull()
        } else {
            null
        }
        val request = if (!token.isNullOrBlank()) {
            original.newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            original
        }
        val response = chain.proceed(request)
        if (shouldForceReLogin(hadBearerToken = !token.isNullOrBlank(), statusCode = response.code)) {
            runCatching { sessionStore.get().invalidateCachedToken() }
            authEventBus.post(AuthEvent.Unauthorized(request.url.encodedPath))
        }
        return response
    }
}

/** Bearer only for the exact MotorMila API host over HTTPS (or debug cleartext to the same host). */
internal fun isApiHost(url: HttpUrl, apiHost: String?): Boolean =
    apiHost != null && url.host.equals(apiHost, ignoreCase = true)

/**
 * Only a rejected session token is a re-login event. Anonymous 401s are
 * expected on gated product routes (watchlist sync, makes, calculators)
 * while the visitor is still browsing the public market — same as web `/`.
 */
internal fun shouldForceReLogin(hadBearerToken: Boolean, statusCode: Int): Boolean =
    statusCode == 401 && hadBearerToken
