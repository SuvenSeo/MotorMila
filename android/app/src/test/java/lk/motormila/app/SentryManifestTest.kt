package lk.motormila.app

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * sentry-android's SentryInitProvider auto-inits before Application.onCreate
 * and throws "DSN is required" when the manifest carries no DSN. MotormilaApp
 * initialises Sentry manually, so auto-init must stay off or every launch
 * crashes (the 1.9.0/1.9.1 launch crash).
 */
class SentryManifestTest {

    private val manifest: String by lazy {
        listOf("src/main/AndroidManifest.xml", "app/src/main/AndroidManifest.xml", "android/app/src/main/AndroidManifest.xml")
            .map(::File).first { it.isFile }.readText()
    }

    @Test
    fun sentryAutoInitIsDisabled() {
        assertTrue(
            "AndroidManifest must declare io.sentry.auto-init=false",
            Regex("""android:name="io\.sentry\.auto-init"\s+android:value="false"""").containsMatchIn(manifest),
        )
    }
}
