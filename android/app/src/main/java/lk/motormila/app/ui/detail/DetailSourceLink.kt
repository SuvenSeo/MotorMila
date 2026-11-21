package lk.motormila.app.ui.detail

import android.content.Context
import java.net.URI
import java.net.URISyntaxException
import lk.motormila.app.R
import lk.motormila.app.ui.share.OutboundLinks

internal data class DetailSourceLink(val url: String, val copyOnly: Boolean) {
    fun handOff(context: Context) {
        if (copyOnly) OutboundLinks.copy(context, url, R.string.mm_link_copy_fallback)
        else OutboundLinks.open(context, url)
    }
}

/** A valid original ad can be handed to the buyer even when it cannot be launched. */
internal fun detailSourceLink(
    externalUrl: String?,
    detailUrl: String?,
    active: Boolean,
    isAllowed: (String) -> Boolean = OutboundLinks::isAllowed,
): DetailSourceLink? {
    if (!active) return null
    for (candidate in listOfNotNull(externalUrl, detailUrl)) {
        val url = candidate.trim()
        val uri = try { URI(url) } catch (_: URISyntaxException) { continue }
        if (!uri.scheme.equals("https", ignoreCase = true) || uri.host.isNullOrEmpty() ||
            uri.rawUserInfo != null || uri.port !in -1..65535) continue
        return DetailSourceLink(url, copyOnly = (uri.port != -1 && uri.port != 443) || !isAllowed(url))
    }
    return null
}
