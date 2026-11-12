package lk.motormila.app.data.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import io.mockk.coEvery
import io.mockk.mockk
import java.io.File
import java.nio.file.Files
import java.time.Instant
import javax.inject.Provider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import lk.motormila.app.BuildConfig
import lk.motormila.app.core.network.AuthEvent
import lk.motormila.app.core.network.AuthEventBus
import lk.motormila.app.core.network.AuthInterceptor
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.domain.repository.AuthRepository
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Session restore + 401 handling end to end (JVM, no network):
 * cold-start token restore, 401 → real logout (persisted + in-memory token
 * cleared, SessionEnded posted), stale 401 for an old token ignored, and the
 * bearer never sent to a non-API host.
 */
class SessionUnauthorizedTest {

    private lateinit var dir: File
    private lateinit var scope: CoroutineScope
    private lateinit var file: File

    @Before
    fun setUp() {
        dir = Files.createTempDirectory("session-test").toFile()
        file = File(dir, "session.preferences_pb")
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }

    @After
    fun tearDown() {
        scope.cancel()
        dir.deleteRecursively()
    }

    private fun dataStore(s: CoroutineScope = scope): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = s) { file }

    private suspend fun SessionStore.saveToken(token: String, expiresAtIso: String? = null) =
        save(token, "user@example.com", "User", "free", "user", null, expiresAtIso)

    private val apiUrl = BuildConfig.BASE_URL.toHttpUrl()

    /** Terminal interceptor standing in for the server: 401 for [rejected] bearer, else 200. */
    private class FakeServer(var rejected: String?) : Interceptor {
        val seenAuth = mutableListOf<String?>()
        override fun intercept(chain: Interceptor.Chain): Response {
            val auth = chain.request().header("Authorization")
            seenAuth += auth
            val code = if (rejected != null && auth == "Bearer $rejected") 401 else 200
            return Response.Builder()
                .request(chain.request())
                .protocol(Protocol.HTTP_1_1)
                .code(code)
                .message(if (code == 401) "Unauthorized" else "OK")
                .body("{}".toResponseBody())
                .build()
        }
    }

    private fun client(store: SessionStore, bus: AuthEventBus, server: FakeServer) =
        OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(Provider { store }, bus))
            .addInterceptor(server)
            .build()

    private fun guard(store: SessionStore, bus: AuthEventBus): SessionGuard {
        val repo = mockk<AuthRepository>()
        coEvery { repo.clearRejectedSession(any()) } coAnswers { store.clearIfRejected(firstArg()) }
        return SessionGuard(bus, repo)
    }

    @Test
    fun coldStart_firstRequestCarriesPersistedBearer() = runBlocking {
        val ds = dataStore()
        SessionStore(ds).saveToken("tok-A")
        // Cold start: a fresh SessionStore (empty in-memory cache) over the persisted file.
        val restored = SessionStore(ds)
        assertNull(restored.cachedToken)
        val server = FakeServer(rejected = null)
        client(restored, AuthEventBus(), server)
            .newCall(Request.Builder().url(apiUrl.resolve("listings")!!).build()).execute().close()
        assertEquals("Bearer tok-A", server.seenAuth.single())
    }

    @Test
    fun expiredSession_isNotRestoredOrSent() = runBlocking {
        val store = SessionStore(dataStore())
        store.saveToken("tok-old", expiresAtIso = Instant.now().minusSeconds(60).toString())
        assertNull(store.rehydrate())
        assertNull(store.cachedToken)
        assertNull(store.snapshot())
    }

    @Test
    fun unauthorized_clearsSessionAndPostsSessionEnded() = runBlocking {
        val store = SessionStore(dataStore())
        store.saveToken("tok-A")
        val bus = AuthEventBus()
        val events = mutableListOf<AuthEvent>()
        val collector = CoroutineScope(Dispatchers.Unconfined).launch(start = CoroutineStart.UNDISPATCHED) {
            bus.events.collect { events += it }
        }
        val server = FakeServer(rejected = "tok-A")
        val http = client(store, bus, server)

        http.newCall(Request.Builder().url(apiUrl.resolve("auth/me")!!).build()).execute().use {
            assertEquals(401, it.code)
        }
        // In-memory token dropped synchronously: no resurrection on the next call.
        assertNull(store.cachedToken)
        val unauthorized = events.filterIsInstance<AuthEvent.Unauthorized>().single()
        assertEquals("tok-A", unauthorized.rejectedToken)
        assertFalse("token must not leak via toString", unauthorized.toString().contains("tok-A"))

        assertTrue(guard(store, bus).onUnauthorized(unauthorized))
        assertNull("persisted session cleared", store.snapshot())
        assertTrue(events.contains(AuthEvent.SessionEnded))

        http.newCall(Request.Builder().url(apiUrl.resolve("listings")!!).build()).execute().close()
        assertNull("no bearer after 401 logout", server.seenAuth.last())
        collector.cancel()
    }

    @Test
    fun staleUnauthorized_forOldToken_keepsNewSession() = runBlocking {
        val store = SessionStore(dataStore())
        store.saveToken("tok-B") // user signed in again
        store.invalidateCachedToken(rejectedToken = "tok-A") // late 401 for the old token
        assertEquals("tok-B", store.cachedToken)

        val bus = AuthEventBus()
        val cleared = guard(store, bus).onUnauthorized(AuthEvent.Unauthorized("/x", rejectedToken = "tok-A"))
        assertFalse(cleared)
        assertEquals("tok-B", store.snapshot()?.token)
        assertEquals("tok-B", store.tokenForRequest())
    }

    @Test
    fun anonymous401_doesNotLogOut() = runBlocking {
        val store = SessionStore(dataStore()) // nothing saved: guest
        val bus = AuthEventBus()
        val events = mutableListOf<AuthEvent>()
        val collector = CoroutineScope(Dispatchers.Unconfined).launch(start = CoroutineStart.UNDISPATCHED) {
            bus.events.collect { events += it }
        }
        val server = object : Interceptor {
            override fun intercept(chain: Interceptor.Chain): Response = Response.Builder()
                .request(chain.request()).protocol(Protocol.HTTP_1_1).code(401).message("x")
                .body("{}".toResponseBody()).build()
        }
        OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(Provider { store }, bus))
            .addInterceptor(server)
            .build()
            .newCall(Request.Builder().url(apiUrl.resolve("calculators/x")!!).build()).execute().close()
        assertTrue(events.isEmpty())
        collector.cancel()
    }

    @Test
    fun bearerNeverSentToImageOrSnapshotHosts() = runBlocking {
        val store = SessionStore(dataStore())
        store.saveToken("tok-A")
        val server = FakeServer(rejected = null)
        val http = client(store, AuthEventBus(), server)
        http.newCall(Request.Builder().url("https://images.ikman-st.com/a.jpg").build()).execute().close()
        http.newCall(Request.Builder().url("https://motormila.pages.dev/snapshots/latest/live-market.json").build()).execute().close()
        http.newCall(Request.Builder().url(apiUrl.resolve("listings")!!).build()).execute().close()
        assertEquals(listOf(null, null, "Bearer tok-A"), server.seenAuth)
    }
}
