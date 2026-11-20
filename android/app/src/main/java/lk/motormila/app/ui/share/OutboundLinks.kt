package lk.motormila.app.ui.share

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.annotation.StringRes
import androidx.core.net.toUri
import lk.motormila.app.R

/**
 * Outbound link gate for scraped listing URLs (audit P1-E).
 *
 * ACTION_VIEW is only fired for https links on known source hosts
 * (ikman.lk, riyasewana.com, patpat.lk) and the OpenStreetMap map link.
 * Anything else — unknown hosts, non-https schemes, javascript:/intent:
 * payloads — never leaves the app: the URL is copied to the clipboard
 * with a localized toast so the user can paste it where they trust.
 */
object OutboundLinks {

    private val AllowedHosts = listOf(
        "ikman.lk",
        "riyasewana.com",
        "patpat.lk",
        "openstreetmap.org",
    )

    /** True only for https URLs on an allowlisted source host (subdomains included). */
    fun isAllowed(url: String): Boolean {
        // android.net.Uri is lenient (scraped URLs carry unencoded spaces/braces);
        // java.net.URI would throw and misclassify a legitimate map link.
        val uri = runCatching { Uri.parse(url.trim()) }.getOrNull() ?: return false
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        val host = uri.host?.lowercase()?.removePrefix("www.") ?: return false
        return AllowedHosts.any { host == it || host.endsWith(".$it") }
    }

    /**
     * Open [url] in a browser when it passes the allowlist; otherwise (or when
     * no handler exists) fall back to copy-to-clipboard with a localized toast.
     */
    fun open(context: Context, url: String) {
        if (isAllowed(url)) {
            val opened = runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, url.toUri())
                        .addCategory(Intent.CATEGORY_BROWSABLE)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }.isSuccess
            if (opened) return
            // Allowlisted but no browser/handler: say so, and still hand over the link.
            copy(context, url, R.string.mm_link_no_app)
            return
        }
        copy(context, url, R.string.mm_link_copy_fallback)
    }

    /** Copy [url] to the clipboard and confirm with a localized toast. */
    fun copy(context: Context, url: String, @StringRes messageRes: Int = R.string.mm_link_copied) {
        runCatching {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("link", url))
        }
        Toast.makeText(context, messageRes, Toast.LENGTH_SHORT).show()
    }
}
