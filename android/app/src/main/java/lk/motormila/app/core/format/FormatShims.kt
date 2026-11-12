package lk.motormila.app.core.format

/**
 * Top-level shims over [LkrFormat] for call sites that import plain
 * `formatLkr` / `formatPct` / `parseLkrShorthand` functions.
 */
/** Compact asking price ("Rs 8.5 Mn"), or "Price on request". See [LkrFormat]. */
fun formatLkr(value: Double?): String = LkrFormat.price(value)

fun formatLkr(value: Long?): String = LkrFormat.price(value?.toDouble())

fun formatLkr(value: Int?): String = LkrFormat.price(value?.toDouble())

/** Compact millions ("Rs 0.35 Mn", "Rs 12.5 Mn"); "Price on request" for null/<= 0. */
fun formatLkrCompact(value: Double?): String = LkrFormat.price(value)

/** Compact millions ("Rs 0.35 Mn", "Rs 12.5 Mn"); "Price on request" for null/<= 0. */
fun formatLkrCompact(value: Long?): String = LkrFormat.price(value?.toDouble())

/** Full rupees ("Rs 7,250,000") — listing detail only. */
fun formatLkrFull(value: Double?): String = LkrFormat.full(value)

/** Monthly full rupees ("Rs 85,400/mo"). */
fun formatLkrMonthly(value: Double?): String = LkrFormat.monthly(value)

/** Signed compact delta, e.g. "−Rs 0.25 Mn". Blank when null/zero. */
fun formatLkrDelta(value: Double?): String = LkrFormat.deltaLkr(value)

/** Signed compact delta, e.g. "−Rs 0.25 Mn". Blank when null/zero. */
fun formatLkrDelta(value: Long?): String = LkrFormat.deltaLkr(value?.toDouble())

/** Signed percent with [digits] decimals, e.g. "+2.5%". Null renders as "—". */
fun formatPct(value: Double?, digits: Int = 1): String {
    if (value == null) return "—"
    val sign = if (value > 0) "+" else ""
    return "$sign${"%.${digits}f".format(value)}%"
}

private val ShorthandNumber = Regex("""^([0-9]*\.?[0-9]+)([a-z]*)$""")

/**
 * Parse LKR shorthand into rupees: "8m", "8.5M", "12,450,000", "850k",
 * "85L", "85 lakhs", "1.2cr", "1.2 crore", "3 million".
 * Units: k=1e3, m/mn/million=1e6, l/lakh(s)=1e5, cr/crore=1e7, b=1e9.
 * Returns null when unparseable.
 */
fun parseLkrShorthand(raw: String): Double? {
    var s = raw.trim().lowercase()
    if (s.isEmpty()) return null
    s = s.removePrefix("lkr").removePrefix("rs").trim().trimStart('.').trim()
    if (s.isEmpty()) return null
    s = s.replace(",", "").replace(" ", "")
    if (s.isEmpty()) return null
    val match = ShorthandNumber.matchEntire(s) ?: return null
    val number = match.groupValues[1].toDoubleOrNull() ?: return null
    val multiplier = when (match.groupValues[2]) {
        "" -> 1.0
        "k" -> 1e3
        "m", "mn", "million", "millions" -> 1e6
        "l", "lakh", "lakhs" -> 1e5
        "cr", "crore", "crores" -> 1e7
        "b", "bn", "billion", "billions" -> 1e9
        else -> return null
    }
    return number * multiplier
}
