package lk.motormila.app.data.local.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import lk.motormila.app.di.SettingsDataStore

/** App settings (preferences DataStore "settings"). */
@Singleton
class SettingsStore @Inject constructor(
    @SettingsDataStore private val dataStore: DataStore<Preferences>,
) {
    private object Keys {
        val THEME = stringPreferencesKey("theme") // "system" | "light" | "dark"
        val LANGUAGE = stringPreferencesKey("language") // "en" | "si" | "ta"
        val SORT = stringPreferencesKey("sort")
        val DISTRICT = stringPreferencesKey("district")
        val BIOMETRIC = booleanPreferencesKey("biometricEnabled")
        val ANNOUNCEMENT_DISMISSED = booleanPreferencesKey("announcementDismissed")
        val BASE_URL = stringPreferencesKey("baseUrlOverride")
        val DEALER_TOKEN = stringPreferencesKey("dealerClaimToken")
        val FCM_TOKEN = stringPreferencesKey("fcmToken")
    }

    data class Settings(
        val theme: String = "system",
        val language: String = "en",
        val sort: String = "newest",
        val district: String? = null,
        val biometricEnabled: Boolean = false,
        val announcementDismissed: Boolean = false,
        val baseUrlOverride: String? = null,
        val dealerClaimToken: String? = null,
        val fcmToken: String? = null,
    )

    fun observe(): Flow<Settings> = dataStore.data.map { prefs ->
        Settings(
            theme = prefs[Keys.THEME] ?: "system",
            language = prefs[Keys.LANGUAGE]?.takeIf { it.isNotBlank() } ?: "en",
            sort = prefs[Keys.SORT] ?: "newest",
            district = prefs[Keys.DISTRICT],
            biometricEnabled = prefs[Keys.BIOMETRIC] == true,
            announcementDismissed = prefs[Keys.ANNOUNCEMENT_DISMISSED] == true,
            baseUrlOverride = prefs[Keys.BASE_URL],
            dealerClaimToken = prefs[Keys.DEALER_TOKEN],
            fcmToken = prefs[Keys.FCM_TOKEN],
        )
    }

    suspend fun setTheme(value: String) = edit(Keys.THEME, value)
    suspend fun setLanguage(value: String) = edit(Keys.LANGUAGE, value)
    suspend fun setSort(value: String) = edit(Keys.SORT, value)
    suspend fun setDistrict(value: String?) = editNullable(Keys.DISTRICT, value)
    suspend fun setBiometricEnabled(value: Boolean) {
        dataStore.edit { it[Keys.BIOMETRIC] = value }
    }
    suspend fun setAnnouncementDismissed(value: Boolean) {
        dataStore.edit { it[Keys.ANNOUNCEMENT_DISMISSED] = value }
    }
    suspend fun setBaseUrlOverride(value: String?) = editNullable(Keys.BASE_URL, value)
    suspend fun setDealerClaimToken(value: String?) = editNullable(Keys.DEALER_TOKEN, value)
    suspend fun setFcmToken(value: String?) = editNullable(Keys.FCM_TOKEN, value)

    private suspend fun edit(key: Preferences.Key<String>, value: String) {
        dataStore.edit { it[key] = value }
    }

    private suspend fun editNullable(key: Preferences.Key<String>, value: String?) {
        dataStore.edit { prefs ->
            if (value == null) prefs.remove(key) else prefs[key] = value
        }
    }
}
