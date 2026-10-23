package lk.motormila.app.ui.share

import lk.motormila.app.domain.repository.ListingQuery

sealed interface ShareTarget {
    data class Search(val query: ListingQuery) : ShareTarget
    data class Compare(val ids: List<Int>) : ShareTarget
    data class Valuation(val make: String, val model: String, val year: Int? = null) : ShareTarget
    data class Unsupported(val url: String) : ShareTarget
}

private val SupportedHosts = listOf(
    "ikman.lk", "riyasewana.com", "patpat.lk",
    // Own FMV share cards: text share + https://motormila.pages.dev/listing/{id}
    // (DOMAIN_CONTRACT) and in-app motormila://listing/{id} deep links.
    // motormila.vercel.app + motormila.lk kept for back-compat with old shares.
    "motormila.pages.dev", "motormila.vercel.app", "motormila.lk",
)
private val IdInUrl = Regex("""(\d{5,})""")
// Web URLs are /listing/{id} (singular) — the old /listings/ regex never matched.
private val MotormilaListingId = Regex("""/listings?/(\d+)""")
/** Model year inside an ad slug ("…-superstation-1989-for-sale-…"). */
private val SlugYear = Regex("""-((?:19[5-9]|20[0-4])\d)(?:-|$)""")
private val SlugMakeModel = Regex("""/(?:en/)?ad/([a-z0-9]+)-([a-z0-9]+)""")

/**
 * Parse a shared marketplace URL into an in-app target.
 * Pure JVM (java.net.URI — no android.*) + unit-testable.
 * Unsupported hosts → [ShareTarget.Unsupported] (error state).
 */
fun parseSharedUrl(sharedUrl: String?): ShareTarget {
    if (sharedUrl.isNullOrBlank()) return ShareTarget.Unsupported("")
    val trimmed = sharedUrl.trim()
    // In-app deep link motormila://listing/{id} (widget/FCM/tile taps).
    if (trimmed.startsWith("motormila://listing/")) {
        val id = trimmed.removePrefix("motormila://listing/").substringBefore("?").substringBefore("/").toIntOrNull()
        // Single listing → detail view, not the Compare screen.
        if (id != null) return ShareTarget.Compare(listOf(id))
        return ShareTarget.Unsupported(sharedUrl)
    }
    val uri = runCatching { java.net.URI(trimmed) }.getOrNull()
        ?: return ShareTarget.Unsupported(sharedUrl)
    val host = (uri.host ?: "").lowercase().removePrefix("www.")
    if (SupportedHosts.none { host == it || host.endsWith(".$it") }) {
        return ShareTarget.Unsupported(sharedUrl)
    }
    val path = uri.path.orEmpty()
    // Own web FMV link https://motormila.vercel.app/listings/{id} → straight to compare/FMV.
    MotormilaListingId.find(path)?.groupValues?.get(1)?.toIntOrNull()?.let { id ->
        return ShareTarget.Compare(listOf(id))
    }
    val id = IdInUrl.find(sharedUrl)?.groupValues?.get(1)?.toIntOrNull()
    val slug = SlugMakeModel.find(path)
    val make = slug?.groupValues?.get(1)?.replaceFirstChar { it.uppercase() }
    val model = slug?.groupValues?.get(2)?.replaceFirstChar { it.uppercase() }
    return when {
        // Deep ad link with numeric id → jump straight to FMV/compare flow.
        id != null && make != null -> ShareTarget.Compare(listOf(id))
        id != null -> ShareTarget.Search(ListingQuery(keyword = id.toString(), make = make, model = model))
        make != null -> ShareTarget.Valuation(make, model.orEmpty(), SlugYear.find(path)?.groupValues?.get(1)?.toIntOrNull())
        else -> ShareTarget.Search(ListingQuery(keyword = sharedUrl))
    }
}
