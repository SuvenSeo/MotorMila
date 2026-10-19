package lk.motormila.app.core.network

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Guest browse must not treat anonymous 401s as a session expiry. */
class AuthInterceptorPolicyTest {

    @Test
    fun rejectedBearerForcesRelogin() {
        assertTrue(shouldForceReLogin(hadBearerToken = true, statusCode = 401))
    }

    @Test
    fun anonymousUnauthorizedDoesNotKickToLogin() {
        assertFalse(shouldForceReLogin(hadBearerToken = false, statusCode = 401))
    }

    @Test
    fun otherStatusCodesNeverForceRelogin() {
        assertFalse(shouldForceReLogin(hadBearerToken = true, statusCode = 403))
        assertFalse(shouldForceReLogin(hadBearerToken = true, statusCode = 200))
        assertFalse(shouldForceReLogin(hadBearerToken = false, statusCode = 200))
    }
}

/** The bearer must never leave for a third-party host (image CDNs, snapshots). */
class AuthInterceptorHostTest {
    private val api = "seo292-vehicle-platform-backend.hf.space"

    @Test
    fun onlyTheApiHostGetsTheBearer() {
        assertTrue(isApiHost(okhttp3.HttpUrl.Builder().scheme("https").host(api).build(), api))
        assertFalse(isApiHost(okhttp3.HttpUrl.Builder().scheme("https").host("ikman.lk").build(), api))
        assertFalse(isApiHost(okhttp3.HttpUrl.Builder().scheme("https").host("motormila.pages.dev").build(), api))
        assertFalse(isApiHost(okhttp3.HttpUrl.Builder().scheme("https").host("evil-$api.example").build(), api))
        assertFalse(isApiHost(okhttp3.HttpUrl.Builder().scheme("https").host(api).build(), null))
    }
}
