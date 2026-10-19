package lk.motormila.app.core.locale

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

/**
 * Per-app language via AppCompat (en / si / ta), matching the web LocaleSwitcher.
 *
 * [apply] / [applyFromStore] call
 * `AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))`.
 * - API 33+: the platform LocaleManager applies it (manifest `android:localeConfig`
 *   = res/xml/locales_config.xml also lists the app in system per-app language settings).
 * - API 26-32: MainActivity is an AppCompatActivity, so AppCompat recreates it with
 *   the new locale; AppLocalesMetadataHolderService (autoStoreLocales) persists it.
 *
 * Call [applyFromStore] from Application.onCreate so a persisted code is active
 * before the first frame. Settings applies immediately on change.
 */
object LocaleHelper {

    const val DEFAULT = "en"

    val SUPPORTED = setOf("en", "si", "ta")

    fun normalize(code: String?): String {
        val tag = code?.trim()?.lowercase().orEmpty()
        return if (tag in SUPPORTED) tag else DEFAULT
    }

    fun apply(code: String) {
        val tag = normalize(code)
        val requested = LocaleListCompat.forLanguageTags(tag)
        val current = AppCompatDelegate.getApplicationLocales()
        if (!current.isEmpty && current.toLanguageTags().equals(tag, ignoreCase = true)) {
            return
        }
        AppCompatDelegate.setApplicationLocales(requested)
    }

    /** Re-apply a code loaded from [lk.motormila.app.data.local.datastore.SettingsStore]. */
    fun applyFromStore(code: String) = apply(code)
}
