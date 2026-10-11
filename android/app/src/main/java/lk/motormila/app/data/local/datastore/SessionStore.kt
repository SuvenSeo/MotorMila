package lk.motormila.app.data.local.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import lk.motormila.app.di.SessionDataStore
import lk.motormila.app.domain.model.UserSession

/**
 * Auth session persistence (preferences DataStore "session").
 * Keys: jwt, userJson (email|name|plan|role|subscriptionStatus, `||`-joined),
 * plan (denormalised for fast plan checks), expiresAt (ISO string).
 *
 * [cachedToken] is a synchronous in-memory snapshot re-hydrated at startup
 * (see [rehydrate]) so [lk.motormila.app.core.network.AuthInterceptor] never
 * blocks on DataStore. AuthRepository keeps it fresh on save/clear.
 */
@Singleton
class SessionStore @Inject constructor(
    @SessionDataStore private val dataStore: DataStore<Preferences>,
) {
    private object Keys {
        val JWT = stringPreferencesKey("jwt")
        val USER = stringPreferencesKey("userJson")
        val PLAN = stringPreferencesKey("plan")
        val EXPIRES_AT = stringPreferencesKey("expiresAt")
        val PLAY_PRO = booleanPreferencesKey("playProEntitled")
    }

    @Volatile
    var cachedToken: String? = null
        private set

    fun observe(): Flow<UserSession?> = dataStore.data.map { prefs ->
        val token = prefs[Keys.JWT] ?: return@map null
        decode(
            token,
            prefs[Keys.USER],
            prefs[Keys.PLAN],
            prefs[Keys.EXPIRES_AT],
            playPro = prefs[Keys.PLAY_PRO] == true,
        )
    }

    /** Local Google Play Pro entitlement (device Google account's subscription state). */
    fun observePlayPro(): Flow<Boolean> = dataStore.data.map { prefs -> prefs[Keys.PLAY_PRO] == true }

    suspend fun setPlayProEntitled(entitled: Boolean) {
        dataStore.edit { prefs -> prefs[Keys.PLAY_PRO] = entitled }
    }

    suspend fun snapshot(): UserSession? = observe().first()

    /** Re-hydrate [cachedToken] on cold start; returns the restored session. */
    suspend fun rehydrate(): UserSession? {
        val session = snapshot()
        cachedToken = session?.token
        return session
    }

    suspend fun save(token: String, email: String, name: String, plan: String, role: String, subscriptionStatus: String?, expiresAtIso: String?) {
        cachedToken = token
        dataStore.edit { prefs ->
            prefs[Keys.JWT] = token
            prefs[Keys.USER] = listOf(email, name, plan, role, subscriptionStatus ?: "").joinToString("||")
            prefs[Keys.PLAN] = plan
            if (expiresAtIso != null) prefs[Keys.EXPIRES_AT] = expiresAtIso
            else prefs.remove(Keys.EXPIRES_AT)
        }
    }

    suspend fun saveSession(session: UserSession) {
        save(session.token, session.email, session.name ?: "", session.plan, session.role, session.subscriptionStatus, session.expiresAt)
    }

    suspend fun clear() {
        cachedToken = null
        dataStore.edit { prefs ->
            prefs.remove(Keys.JWT)
            prefs.remove(Keys.USER)
            prefs.remove(Keys.PLAN)
            prefs.remove(Keys.EXPIRES_AT)
            // Play entitlement belongs to the device's Google account, but a
            // fresh login starts clean; the launch-time Play re-check restores
            // it when the subscription is still active.
            prefs.remove(Keys.PLAY_PRO)
        }
    }

    companion object {
        fun decode(
            token: String,
            userRaw: String?,
            plan: String?,
            expiresAt: String?,
            playPro: Boolean = false,
        ): UserSession? {
            if (token.isBlank()) return null
            val parts = (userRaw ?: "").split("||")
            val email = parts.getOrNull(0).orEmpty()
            if (email.isBlank()) return null
            return UserSession(
                email = email,
                name = parts.getOrNull(1)?.ifBlank { null },
                plan = parts.getOrNull(2)?.ifBlank { null } ?: plan ?: "free",
                role = parts.getOrNull(3)?.ifBlank { null } ?: "user",
                subscriptionStatus = parts.getOrNull(4)?.ifBlank { null },
                token = token,
                expiresAt = expiresAt,
                playProEntitled = playPro,
            )
        }

        /** Backend `expires_at` is epoch seconds; domain carries ISO strings. */
        fun epochToIso(epochSeconds: Long?): String? =
            epochSeconds?.let { Instant.ofEpochSecond(it).toString() }
    }
}
