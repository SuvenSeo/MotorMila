package lk.motormila.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import kotlinx.coroutines.flow.map
import lk.motormila.app.data.local.datastore.SettingsStore
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import lk.motormila.app.billing.PlayBillingDataSource
import lk.motormila.app.core.locale.LocaleHelper
import lk.motormila.app.ui.navigation.MotormilaNavGraph
import lk.motormila.app.ui.theme.MotormilaTheme
import lk.motormila.app.ui.theme.ThemeCrossfadeHost
import androidx.compose.foundation.isSystemInDarkTheme

/**
 * Launcher activity. Forwards share intents and VIEW deep links into the nav graph.
 *
 * AppCompatActivity (not ComponentActivity) so AppCompat per-app language
 * switching applies on Android 8-12 (API 26-32) without a restart.
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private var sharedUrl by mutableStateOf<String?>(null)
    private var startDeepLink by mutableStateOf<Uri?>(null)
    private var navigationEventId by mutableIntStateOf(0)

    @Inject
    lateinit var billing: PlayBillingDataSource

    @Inject
    lateinit var settingsStore: SettingsStore

    override fun onCreate(savedInstanceState: Bundle?) {
        // Light-first: dark icons on the light window until the persisted
        // theme is read (a dark-theme user flips to light icons on frame 1).
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        // Only consume the launch intent on a fresh start: on recreation
        // (rotation, locale switch, process restore) the nav back stack is
        // already restored and replaying the deep link/share would duplicate it.
        if (savedInstanceState == null) {
            applyQaOverrides(intent)
            applyIncomingIntent(intent)
        } else {
            // Recreated (the stored app language / theme is applied a few seconds after
            // a cold start and relaunches the activity). Splash may still be running and
            // reads startDeepLink when it finishes, so restore the launch link (L3 on
            // API 36: a cold-start link landed on Home). The launch intent counts as
            // consumed, so the next onNewIntent is a new event (> 1); without this the
            // first link after the relaunch was dropped (S7: the 2nd filter link kept
            // the 1st one's results).
            startDeepLink = savedInstanceState.getString(STATE_START_LINK)?.let(Uri::parse)
            sharedUrl = savedInstanceState.getString(STATE_SHARED_URL)
            navigationEventId = 1
        }
        // Reconcile the local Play Pro entitlement with Play's purchase cache
        // (best-effort, off the main thread — never blocks startup).
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching { billing.syncPlayEntitlement() }
        }
        setContent {
            // Settings → Appearance: Light is the default for everyone with no
            // explicit choice; "dark" forces dark; "system" follows the device.
            // null until DataStore answers (a few ms): the first real value is
            // applied instantly; only later user changes crossfade.
            val themePref by remember { settingsStore.observe().map<SettingsStore.Settings, String?> { it.theme } }
                .collectAsState(initial = null)
            val reducePref by remember { settingsStore.observe().map { it.reduceTransparency } }
                .collectAsState(initial = false)
            val dark = when (themePref) {
                "dark" -> true
                "system" -> isSystemInDarkTheme()
                else -> false
            }

            ThemeCrossfadeHost(dark = dark, settled = themePref != null) { shownDark ->
                LaunchedEffect(shownDark) {
                    // Translucent system bars: transparent scrim, icon colour
                    // follows the theme. Content draws edge-to-edge underneath.
                    val style = if (shownDark) {
                        SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                    } else {
                        SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                    }
                    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                }
                MotormilaTheme(darkTheme = shownDark) {
                    // Liquid glass → opaque chrome when the user asks for it
                    // (Settings → Appearance) or has system high-contrast text on.
                    val systemHighContrast = lk.motormila.app.ui.theme.rememberSystemHighContrastText()
                    androidx.compose.runtime.CompositionLocalProvider(
                        lk.motormila.app.ui.theme.LocalReduceTransparency provides (reducePref || systemHighContrast),
                    ) {
                        MotormilaNavGraph(
                            sharedUrl = sharedUrl,
                            startDeepLink = startDeepLink,
                            navigationEventId = navigationEventId,
                        )
                    }
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(STATE_START_LINK, startDeepLink?.toString())
        outState.putString(STATE_SHARED_URL, sharedUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyQaOverrides(intent)
        applyIncomingIntent(intent)
    }

    /**
     * DEBUG builds only (QA screenshot crawl): `am start --es mm_qa_theme
     * light|dark|system --es mm_qa_lang en|si|ta` persists the same settings
     * the Settings screen writes. Release builds ignore the extras.
     */
    private fun applyQaOverrides(intent: Intent?) {
        if (!BuildConfig.QA_HOOKS || intent == null) return
        val theme = intent.getStringExtra(QA_THEME_EXTRA)?.takeIf { it in setOf("light", "dark", "system") }
        val lang = intent.getStringExtra(QA_LANG_EXTRA)?.let { LocaleHelper.normalize(it) }
        if (theme == null && lang == null) return
        lifecycleScope.launch {
            theme?.let { settingsStore.setTheme(it) }
            lang?.let {
                settingsStore.setLanguage(it)
                LocaleHelper.apply(it)
            }
        }
    }

    private fun applyIncomingIntent(intent: Intent?) {
        sharedUrl = extractSharedUrl(intent)
        startDeepLink = extractViewUri(intent)
        navigationEventId += 1
    }

    private fun extractSharedUrl(intent: Intent?): String? {
        if (intent == null) return null
        // Trampoline path (ShareImportActivity) always sets SHARED_URL_KEY —
        // check it FIRST: the forwarded intent keeps ACTION_SEND but drops type.
        intent.getStringExtra(SHARED_URL_KEY)?.takeIf { it.isNotBlank() }?.let { return it }
        if (intent.action == Intent.ACTION_VIEW) return null
        if (intent.action != Intent.ACTION_SEND) {
            return intent.getStringExtra(SHARED_URL_KEY)
        }
        if (intent.type?.startsWith("text/") != true) return null
        // Senders put the URL in EXTRA_TEXT; fall back to first URL-like token.
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
            ?: return null
        return URL_REGEX.find(text)?.value ?: text.takeIf { it.isNotBlank() }
    }

    companion object {
        const val SHARED_URL_KEY = "shared_url"
        private const val QA_THEME_EXTRA = "mm_qa_theme"
        private const val QA_LANG_EXTRA = "mm_qa_lang"
        private const val STATE_START_LINK = "mm_start_deep_link"
        private const val STATE_SHARED_URL = "mm_shared_url"
        private val URL_REGEX = Regex("https?://[^\\s]+")

        fun extractViewUri(intent: Intent?): Uri? {
            if (intent?.action != Intent.ACTION_VIEW) return null
            return intent.data
        }
    }
}
