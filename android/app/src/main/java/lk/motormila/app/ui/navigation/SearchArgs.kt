package lk.motormila.app.ui.navigation

import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingSorts

/**
 * Maps Search destination primitive args (deep-link extras / SavedStateHandle)
 * into a [ListingQuery]. Pure JVM — no Android types.
 *
 * Blank strings are treated as absent. [q] wins over [plate] for the keyword
 * (same order as SearchViewModel.applyRouteArgs).
 */
fun searchArgsToQuery(
    q: String? = null,
    district: String? = null,
    make: String? = null,
    model: String? = null,
    sort: String? = null,
    plate: String? = null,
): ListingQuery {
    return ListingQuery(
        keyword = q.blankToNull() ?: plate.blankToNull(),
        make = make.blankToNull(),
        model = model.blankToNull(),
        district = district.blankToNull(),
        sort = sort.blankToNull() ?: ListingSorts.NEWEST,
    )
}

fun searchArgsToQuery(route: Search): ListingQuery = searchArgsToQuery(
    q = route.q,
    district = route.district,
    make = route.make,
    model = route.model,
    sort = route.sort,
    plate = route.plate,
).withWebFilters(route.filters)

private fun String?.blankToNull(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

/**
 * Web parity (src/lib/searchUrlState.ts): the extra filter keys the web keeps
 * in its URL, carried by the Search route as one encoded query string
 * ([Search.filters]) so deep links, shared web URLs and saved state restore
 * the full filter set. Keys and values are exactly the web's / API's.
 */
val WEB_FILTER_KEYS: List<String> = listOf(
    "source", "year_min", "year_max", "price_min", "price_max", "mileage_max",
    "fuel_type", "transmission", "condition", "body_type", "vehicle_category",
    "price_availability", "include_archive",
)

/** Every key the web search URL owns (used to recognise a shared web search link). */
val WEB_SEARCH_KEYS: Set<String> = (WEB_FILTER_KEYS + listOf("q", "make", "model", "district", "sort")).toSet()

/** Picks the web filter keys out of a parsed query map; null when none are present. */
fun encodeWebFilters(query: Map<String, String>): String? {
    val parts = WEB_FILTER_KEYS.mapNotNull { k ->
        query[k]?.trim()?.takeIf { it.isNotEmpty() }?.let { v -> "$k=${java.net.URLEncoder.encode(v, "UTF-8")}" }
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString("&")
}

private fun decodeWebFilters(encoded: String?): Map<String, String> {
    if (encoded.isNullOrBlank()) return emptyMap()
    return encoded.split('&').mapNotNull { part ->
        val i = part.indexOf('=')
        if (i <= 0) return@mapNotNull null
        val k = part.substring(0, i)
        val v = runCatching { java.net.URLDecoder.decode(part.substring(i + 1), "UTF-8") }.getOrNull()
        if (k in WEB_FILTER_KEYS && !v.isNullOrBlank()) k to v.trim() else null
    }.toMap()
}

private fun String.toPositiveDouble(): Double? = toDoubleOrNull()?.takeIf { it > 0 && it.isFinite() }

/** Applies an encoded web filter string onto this query (unknown / invalid values ignored). */
fun ListingQuery.withWebFilters(encoded: String?): ListingQuery {
    val m = decodeWebFilters(encoded)
    if (m.isEmpty()) return this
    return copy(
        source = m["source"] ?: source,
        yearMin = m["year_min"]?.toIntOrNull() ?: yearMin,
        yearMax = m["year_max"]?.toIntOrNull() ?: yearMax,
        priceMin = m["price_min"]?.toPositiveDouble() ?: priceMin,
        priceMax = m["price_max"]?.toPositiveDouble() ?: priceMax,
        mileageMax = m["mileage_max"]?.toIntOrNull() ?: mileageMax,
        fuelType = m["fuel_type"] ?: fuelType,
        transmission = m["transmission"] ?: transmission,
        condition = m["condition"] ?: condition,
        bodyType = m["body_type"] ?: bodyType,
        vehicleCategory = m["vehicle_category"] ?: vehicleCategory,
        priceAvailability = m["price_availability"]?.takeIf { it == "unavailable" } ?: priceAvailability,
        includeArchive = m["include_archive"]?.let { it == "1" || it.equals("true", true) } ?: includeArchive,
    )
}

/** The web filter keys of this query, encoded (inverse of [withWebFilters]); null when none set. */
fun ListingQuery.toWebFilters(): String? {
    val m = buildMap {
        source?.let { put("source", it) }
        yearMin?.let { put("year_min", it.toString()) }
        yearMax?.let { put("year_max", it.toString()) }
        priceMin?.let { put("price_min", it.toLong().toString()) }
        priceMax?.let { put("price_max", it.toLong().toString()) }
        mileageMax?.let { put("mileage_max", it.toString()) }
        fuelType?.let { put("fuel_type", it) }
        transmission?.let { put("transmission", it) }
        condition?.let { put("condition", it) }
        bodyType?.let { put("body_type", it) }
        vehicleCategory?.let { put("vehicle_category", it) }
        priceAvailability?.let { put("price_availability", it) }
        if (includeArchive) put("include_archive", "1")
    }
    return encodeWebFilters(m)
}
