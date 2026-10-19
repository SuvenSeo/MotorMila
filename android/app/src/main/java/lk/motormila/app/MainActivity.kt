package lk.motormila.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import lk.motormila.app.ui.navigation.MotormilaNavGraph
import lk.motormila.app.ui.theme.MotormilaTheme

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

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Only consume the launch intent on a fresh start: on recreation
        // (rotation, locale switch, process restore) the nav back stack is
        // already restored and replaying the deep link/share would duplicate it.
        if (savedInstanceState == null) applyIncomingIntent(intent)
        // Reconcile the local Play Pro entitlement with Play's purchase cache
        // (best-effort, off the main thread — never blocks startup).
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching { billing.syncPlayEntitlement() }
        }
        setContent {
            MotormilaTheme {
                MotormilaNavGraph(
                    sharedUrl = sharedUrl,
                    startDeepLink = startDeepLink,
                    navigationEventId = navigationEventId,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyIncomingIntent(intent)
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
        private val URL_REGEX = Regex("https?://[^\\s]+")

        fun extractViewUri(intent: Intent?): Uri? {
            if (intent?.action != Intent.ACTION_VIEW) return null
            return intent.data
        }
    }
}
