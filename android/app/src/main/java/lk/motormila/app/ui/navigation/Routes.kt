package lk.motormila.app.ui.navigation

import android.net.Uri
import kotlinx.serialization.Serializable

/** Type-safe destinations. Bottom-bar tabs: Home, Search, Watchlist, Insights, Profile. */
@Serializable
data object Splash

@Serializable
data class Login(
    val token: String? = null,
    val signup: Boolean = false,
)

@Serializable
data object Home

@Serializable
data class Search(
    val q: String? = null,
    val district: String? = null,
    val make: String? = null,
    val model: String? = null,
    val sort: String? = null,
    val voice: Boolean = false,
    val plate: String? = null,
    /** Extra web-format filters (year/price/mileage/fuel/…), see SearchArgs.WEB_FILTER_KEYS. */
    val filters: String? = null,
)

@Serializable
data object Watchlist

@Serializable
data object Insights

@Serializable
data object Profile

@Serializable
data class ListingDetail(
    val id: Int,
    /** Opened from a listing card: Detail is a container transform of that card (see NavMotion). */
    val fromCard: Boolean = false,
)

@Serializable
data class Compare(val ids: List<Int>)

@Serializable
data class Valuation(val make: String? = null, val model: String? = null, val year: Int? = null)

@Serializable
data class Alerts(val listingId: Int = 0)

@Serializable
data object Notifications

@Serializable
data object Pro

@Serializable
data object Dealer

@Serializable
data object Settings

@Serializable
data object PlateScan

@Serializable
data class ShareImport(val url: String? = null)

@Serializable
data object EvHub

@Serializable
data object OfficialPulse

@Serializable
data class OfficialPulseDetail(val id: Int)

@Serializable
data object BestPicks

@Serializable
data class MakeHub(val make: String)

@Serializable
data class MakeModelHub(val make: String, val model: String)

@Serializable
data class DistrictHub(val district: String)

@Serializable
data object Calculator

@Serializable
data object Pricing

@Serializable
data object Docs

@Serializable
data class PulseGuide(val key: String)

@Serializable
data object Admin

@Serializable
data object EvChargers

@Serializable
data object Privacy

@Serializable
data object Terms

@Serializable
data object Permits

@Serializable
data object PriceIndex

@Serializable
data object Sell

/** Tools tab (design v2): index of utilities — valuation, scan, calculators, permits, account. */
@Serializable
data object Tools

/** Routes that show the bottom NavigationBar. */
val BOTTOM_BAR_ROUTES: Set<String> = setOf(
    Home::class.qualifiedName!!,
    Search::class.qualifiedName!!,
    Watchlist::class.qualifiedName!!,
    Insights::class.qualifiedName!!,
    Profile::class.qualifiedName!!,
    Tools::class.qualifiedName!!,
    Sell::class.qualifiedName!!,
)

/** Returns true if the given destination route (qualified class name) shows the bottom bar. */
fun isBottomBarRoute(route: String?): Boolean = route in BOTTOM_BAR_ROUTES

private const val HTTPS_APP_HOST = "motormila.pages.dev"

internal data class ParsedDeepLink(
    val scheme: String,
    val host: String,
    val pathSegments: List<String>,
    val query: Map<String, String>,
)

/** JVM-safe parser so unit tests do not need `android.net.Uri`. */
internal fun parseDeepLink(raw: String): ParsedDeepLink? {
    val schemeSep = raw.indexOf("://")
    if (schemeSep <= 0) return null
    val scheme = raw.substring(0, schemeSep)
    val rest = raw.substring(schemeSep + 3)
    val querySep = rest.indexOf('?')
    val beforeQuery = if (querySep >= 0) rest.substring(0, querySep) else rest
    val queryRaw = if (querySep >= 0) rest.substring(querySep + 1) else ""
    val slash = beforeQuery.indexOf('/')
    val host = if (slash >= 0) beforeQuery.substring(0, slash) else beforeQuery
    val path = if (slash >= 0) beforeQuery.substring(slash + 1) else ""
    val pathSegments = path.split('/').map { it.trim() }.filter { it.isNotEmpty() }
    val query = linkedMapOf<String, String>()
    if (queryRaw.isNotBlank()) {
        queryRaw.split('&').forEach { part ->
            if (part.isBlank()) return@forEach
            val eq = part.indexOf('=')
            val key = if (eq >= 0) part.substring(0, eq) else part
            val value = if (eq >= 0) decodeQuery(part.substring(eq + 1)) else "true"
            if (key.isNotBlank()) query[key] = value
        }
    }
    return ParsedDeepLink(scheme, host, pathSegments, query)
}

/**
 * Maps a `motormila://` or `https://motormila.pages.dev/…` VIEW URI to a
 * type-safe destination. Used after splash and on ACTION_VIEW so query params
 * still land even when NavHost deep-link matching is picky.
 */
fun resolveMotormilaDeepLink(uri: Uri): Any? = resolveMotormilaDeepLink(uri.toString())

fun resolveMotormilaDeepLink(uriString: String): Any? {
    val parsed = parseDeepLink(uriString) ?: return null
    return resolveParsedDeepLink(parsed)
}

internal fun resolveParsedDeepLink(parsed: ParsedDeepLink): Any? {
    val scheme = parsed.scheme
    val host = parsed.host
    val segments = parsed.pathSegments
    if (scheme == "https" && host == HTTPS_APP_HOST) {
        // A shared web search ("/?make=Toyota&year_min=2015…" or /search?…)
        // opens Search with the same filters.
        if ((segments.isEmpty() || segments == listOf("search")) && parsed.query.keys.any { it in WEB_SEARCH_KEYS }) {
            return Search(
                q = parsed.queryOrNull("q"),
                district = parsed.queryOrNull("district"),
                make = parsed.queryOrNull("make"),
                model = parsed.queryOrNull("model"),
                sort = parsed.queryOrNull("sort"),
                filters = encodeWebFilters(parsed.query),
            )
        }
        if (segments.isEmpty()) return Home
        // Bare /search (no filters) opens Search.
        if (segments == listOf("search")) return Search()
        if (segments.size >= 2 && segments[0] == "listing") {
            return segments[1].toIntOrNull()?.let { ListingDetail(it) }
        }
        if (segments.size >= 2 && segments[0] == "cars") {
            val make = segments[1]
            val model = segments.getOrNull(2)?.takeIf { it.isNotBlank() }
            return if (model == null) MakeHub(make) else MakeModelHub(make, model)
        }
        if (segments.firstOrNull() == "locations") {
            // Bare /locations → the districts list (Insights), same as Home's "See all districts".
            return segments.getOrNull(1)?.takeIf { it.isNotBlank() }?.let { DistrictHub(it) } ?: Insights
        }
        if (segments.firstOrNull() == "official-pulse") {
            if (segments.size == 1) return OfficialPulse
            if (segments[1] == "guide") {
                val key = segments.getOrNull(2)?.takeIf { it.isNotBlank() } ?: return OfficialPulse
                return PulseGuide(key)
            }
            return segments[1].toIntOrNull()?.let { OfficialPulseDetail(it) }
        }
        if (segments.firstOrNull() == "compare") {
            return Compare(compareIds(parsed, slugSegment = segments.getOrNull(1)))
        }
        return when (segments.firstOrNull()) {
            "calculator" -> Calculator
            "pricing" -> Pricing
            "docs" -> Docs
            "admin" -> Admin
            "privacy" -> Privacy
            "terms" -> Terms
            "permits" -> Permits
            "price-index" -> PriceIndex
            "trends" -> Insights
            "ev-chargers" -> EvChargers
            "ev-hub" -> EvHub
            "estimate", "valuation" -> Valuation(
                make = parsed.queryOrNull("make"),
                model = parsed.queryOrNull("model"),
            )
            "profile" -> Profile
            // Web /delete-account (Play's account-deletion URL) → Settings,
            // where "Delete account" calls DELETE /api/v1/auth/me.
            "delete-account" -> Settings
            "best-picks" -> BestPicks
            "dealer" -> Dealer
            "settings" -> Settings
            "alerts" -> Alerts(listingId = parsed.query["listingId"]?.toIntOrNull() ?: 0)
            "sign-in" -> loginDestination(parsed, signup = false)
            "sign-up" -> loginDestination(parsed, signup = true)
            "pro", "pro-preview" -> Pro
            "sell" -> Sell
            "notifications" -> Notifications
            else -> null
        }
    }
    if (scheme != "motormila") return null
    return when (host) {
        "search" -> Search(
            q = parsed.queryOrNull("q"),
            district = parsed.queryOrNull("district"),
            make = parsed.queryOrNull("make"),
            model = parsed.queryOrNull("model"),
            sort = parsed.queryOrNull("sort"),
            voice = parsed.flagQuery("voice"),
            plate = parsed.queryOrNull("plate"),
            filters = encodeWebFilters(parsed.query),
        )
        "watchlist" -> Watchlist
        "picks" -> BestPicks
        "home" -> if (parsed.flagQuery("dealOfDay")) BestPicks else Home
        "ev" -> EvHub
        "pulse" -> {
            val id = segments.firstOrNull()?.toIntOrNull()
            if (id != null) OfficialPulseDetail(id) else OfficialPulse
        }
        "guide" -> segments.firstOrNull()?.takeIf { it.isNotBlank() }?.let { PulseGuide(it) } ?: OfficialPulse
        "scan" -> PlateScan
        "listing" -> segments.firstOrNull()?.toIntOrNull()?.let { ListingDetail(it) }
        "pro" -> if (parsed.queryOrNull("deal") == "day") BestPicks else Pro
        "calculator" -> Calculator
        "pricing" -> Pricing
        "docs" -> Docs
        "admin" -> Admin
        "chargers", "ev-chargers" -> EvChargers
        "privacy" -> Privacy
        "terms" -> Terms
        "permits" -> Permits
        "price-index" -> PriceIndex
        "trends" -> Insights
        "make" -> segments.firstOrNull()?.takeIf { it.isNotBlank() }?.let { MakeHub(it) }
        "cars" -> {
            val make = segments.getOrNull(0)?.takeIf { it.isNotBlank() } ?: return null
            val model = segments.getOrNull(1)?.takeIf { it.isNotBlank() }
            if (model == null) MakeHub(make) else MakeModelHub(make, model)
        }
        // Bare motormila://locations (declared in the manifest) → districts list (Insights).
        "locations" -> segments.firstOrNull()?.takeIf { it.isNotBlank() }?.let { DistrictHub(it) } ?: Insights
        "estimate" -> Valuation(
            make = parsed.queryOrNull("make"),
            model = parsed.queryOrNull("model"),
        )
        "compare" -> Compare(compareIds(parsed, slugSegment = segments.firstOrNull()))
        "dealer" -> Dealer
        "settings" -> Settings
        "alerts" -> Alerts(listingId = parsed.query["listingId"]?.toIntOrNull() ?: 0)
        "login", "sign-in" -> loginDestination(parsed, signup = parsed.flagQuery("signup"))
        "sign-up" -> loginDestination(parsed, signup = true)
        "best-picks" -> BestPicks
        "sell" -> Sell
        "notifications" -> Notifications
        else -> null
    }
}

private fun loginDestination(parsed: ParsedDeepLink, signup: Boolean): Login {
    val token = parsed.queryOrNull("token")
    return Login(
        token = token,
        signup = signup || !token.isNullOrBlank(),
    )
}

private fun compareIds(parsed: ParsedDeepLink, slugSegment: String?): List<Int> {
    val fromQuery = parsed.query["ids"]
        ?.split(',')
        ?.mapNotNull { it.trim().toIntOrNull()?.takeIf { id -> id > 0 } }
        .orEmpty()
    val fromSlug = slugSegment
        ?.split("-vs-")
        ?.mapNotNull { it.trim().toIntOrNull()?.takeIf { id -> id > 0 } }
        .orEmpty()
    return (fromQuery + fromSlug).distinct()
}

private fun ParsedDeepLink.queryOrNull(key: String): String? =
    query[key]?.takeIf { it.isNotBlank() }

private fun ParsedDeepLink.flagQuery(key: String): Boolean {
    val value = query[key] ?: return false
    return value.equals("true", ignoreCase = true) ||
        value == "1" ||
        value.equals("yes", ignoreCase = true)
}

private fun decodeQuery(value: String): String =
    value.replace("+", " ").replace("%20", " ")

/**
 * Web `/` is public browse. Native splash therefore always lands on [Home]
 * (or a deep-link target). [isLoggedIn] is kept so tests can prove we ignore it;
 * login stays opt-in from Profile / 401-with-token.
 */
internal fun destinationAfterSplash(isLoggedIn: Boolean, deepLinkTarget: Any? = null): Any {
    if (deepLinkTarget != null) return deepLinkTarget
    return Home
}
