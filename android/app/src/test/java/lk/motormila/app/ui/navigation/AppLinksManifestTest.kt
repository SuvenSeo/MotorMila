package lk.motormila.app.ui.navigation

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * App Links consistency: every https path / custom-scheme host the manifest
 * claims must resolve to an in-app destination (no link that opens the app
 * on a dead screen), and the verified host matches the resolver's host.
 */
class AppLinksManifestTest {

    private val manifest: String by lazy {
        listOf("src/main/AndroidManifest.xml", "app/src/main/AndroidManifest.xml", "android/app/src/main/AndroidManifest.xml")
            .map(::File).first { it.isFile }.readText()
    }

    /** Sample path per prefix (some need an id/slug segment). */
    private fun samplePath(prefix: String): String = when (prefix) {
        "/listing" -> "/listing/123"
        "/cars" -> "/cars/toyota/aqua"
        "/locations" -> "/locations/colombo"
        else -> prefix
    }

    @Test
    fun everyHttpsPathPrefixResolves() {
        val prefixes = Regex("""android:host="([^"]+)"\s+android:pathPrefix="([^"]+)"""")
            .findAll(manifest).map { it.groupValues[1] to it.groupValues[2] }.toList()
        assertTrue("manifest declares https app links", prefixes.isNotEmpty())
        prefixes.forEach { (host, prefix) ->
            assertEquals("single verified host", "motormila.pages.dev", host)
            val url = "https://$host${samplePath(prefix)}"
            assertNotNull("unresolved app link $url", resolveMotormilaDeepLink(url))
        }
    }

    @Test
    fun everyCustomSchemeHostResolves() {
        val hosts = Regex("""android:scheme="motormila"\s+android:host="([^"]+)"""")
            .findAll(manifest).map { it.groupValues[1] }.toList()
        assertTrue(hosts.isNotEmpty())
        hosts.forEach { host ->
            val url = when (host) {
                "listing" -> "motormila://listing/5"
                "make" -> "motormila://make/toyota"
                "cars" -> "motormila://cars/toyota"
                "locations" -> "motormila://locations/colombo"
                else -> "motormila://$host"
            }
            assertNotNull("unresolved deep link $url", resolveMotormilaDeepLink(url))
        }
    }

    @Test
    fun webAccountDeletionUrlOpensSettings() {
        assertEquals(Settings, resolveMotormilaDeepLink("https://motormila.pages.dev/delete-account"))
        assertEquals(Valuation(), resolveMotormilaDeepLink("https://motormila.pages.dev/valuation"))
    }
}
