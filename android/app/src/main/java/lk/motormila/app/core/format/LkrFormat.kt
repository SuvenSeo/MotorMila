package lk.motormila.app.core.format

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * THE LKR formatter for the whole app. Mirrors the web's canonical rules
 * (src/lib/price.ts, Oct 20 2026 — millions only, lakhs are never shown):
 *
 *  - [compact] (cards, chips, lists, charts, badges): always millions, up to
 *    2 decimals, trailing zeros trimmed — "Rs 0.35 Mn", "Rs 8.5 Mn",
 *    "Rs 7.25 Mn", "Rs 12.5 Mn". Under 0.095 Mn: 2 significant digits
 *    ("Rs 0.085 Mn"). Under Rs 10,000 stays full ("Rs 5,000").
 *  - [full] (listing detail page, receipts only): "Rs 7,250,000".
 *  - [monthly] (instalments / running costs): "Rs 85,400/mo".
 *  - [axis] (chart ticks): "8.5 Mn" (no "Rs").
 *
 * Inputs may still be typed in lakhs ("85L") — see [parseLkrShorthand].
 * Missing/non-positive asking prices render [PRICE_ON_REQUEST] via [price];
 * the numeric helpers render [FALLBACK] for null/NaN/Infinity.
 */
object LkrFormat {
    const val MILLION = 1_000_000.0
    /** Below this, millions would round to "0 Mn": show full rupees instead. */
    const val MN_DISPLAY_MIN = 10_000.0
    const val FALLBACK = "—"
    const val PRICE_ON_REQUEST = "Price on request"

    private val grouped: NumberFormat
        get() = NumberFormat.getIntegerInstance(Locale.US).apply { isGroupingUsed = true }

    private fun finite(value: Double?): Double? = value?.takeIf { it.isFinite() }

    /** "7250000" → "7,250,000" (whole rupees, 3-digit grouping as LK ads use). */
    fun group(value: Double): String {
        val rounded = value.roundToLong()
        val sign = if (rounded < 0) "-" else ""
        return sign + grouped.format(abs(rounded))
    }

    private fun trim(s: String): String = if (s.contains('.')) s.trimEnd('0').trimEnd('.') else s

    /** Millions as a trimmed decimal: 2 decimals; under 0.095 Mn 2 significant digits. */
    fun mnNumber(absLkr: Double): String {
        val mn = absLkr / MILLION
        if (mn < 0.095) {
            val sig = BigDecimal(mn).round(MathContext(2, RoundingMode.HALF_UP))
            return trim(sig.setScale(3, RoundingMode.HALF_UP).toPlainString())
        }
        return trim(BigDecimal(mn).setScale(2, RoundingMode.HALF_UP).toPlainString())
    }

    /** "0.35 Mn" / "8.5 Mn" / "5,000" — compact amount without the "Rs " prefix. */
    fun compactAmount(value: Double): String {
        val sign = if (value < 0) "-" else ""
        val a = abs(value)
        if (a < MN_DISPLAY_MIN) return sign + group(a)
        return "$sign${mnNumber(a)} Mn"
    }

    /** Compact price: "Rs 8.5 Mn". Null/NaN → [fallback]. */
    fun compact(value: Double?, fallback: String = FALLBACK): String {
        val n = finite(value) ?: return fallback
        return "Rs ${compactAmount(n)}"
    }

    /** Full rupees (listing detail only): "Rs 7,250,000". */
    fun full(value: Double?, fallback: String = FALLBACK): String {
        val n = finite(value) ?: return fallback
        return "Rs ${group(n)}"
    }

    /** Monthly: "Rs 85,400/mo". Never millions. */
    fun monthly(value: Double?, fallback: String = FALLBACK): String {
        val n = finite(value) ?: return fallback
        return "Rs ${group(n)}/mo"
    }

    /** Chart tick: "0.35 Mn", "8.5 Mn", "12 Mn"; short, no "Rs". */
    fun axis(value: Double?, fallback: String = ""): String {
        val n = finite(value) ?: return fallback
        val a = abs(n)
        val sign = if (n < 0) "-" else ""
        if (a == 0.0) return "0"
        if (a < MN_DISPLAY_MIN) return sign + group(a)
        val mn = a / MILLION
        val num = if (mn < 10) mnNumber(a)
        else trim(BigDecimal(mn).setScale(if (mn < 100) 1 else 0, RoundingMode.HALF_UP).toPlainString())
        return "$sign$num Mn"
    }

    /** Range label for chips: "Rs 3 Mn – Rs 5 Mn", "Under Rs 3 Mn", "Rs 10 Mn+". */
    fun range(min: Double?, max: Double?, fallback: String = "Any price"): String {
        val lo = finite(min)
        val hi = finite(max)
        return when {
            lo == null && hi == null -> fallback
            lo == null -> "Under ${compact(hi)}"
            hi == null -> "${compact(lo)}+"
            else -> "${compact(lo)} – ${compact(hi)}"
        }
    }

    /** Asking price for cards: compact, or "Price on request" when unknown/non-positive. */
    fun price(value: Double?): String {
        val n = finite(value)
        if (n == null || n <= 0) return PRICE_ON_REQUEST
        return compact(n)
    }

    /** Asking price on the listing detail page: full rupees, or "Price on request". */
    fun priceFull(value: Double?): String {
        val n = finite(value)
        if (n == null || n <= 0) return PRICE_ON_REQUEST
        return full(n)
    }

    fun deltaPct(value: Double?): String {
        if (value == null) return ""
        val sign = if (value > 0) "+" else ""
        return "$sign${"%.1f".format(Locale.US, value)}%"
    }

    /** Signed compact delta: "+Rs 0.25 Mn" / "−Rs 1.2 Mn". Blank for null/zero. */
    fun deltaLkr(value: Double?): String {
        val n = finite(value) ?: return ""
        if (n == 0.0) return ""
        val sign = if (n > 0) "+" else "−"
        return "${sign}Rs ${compactAmount(abs(n))}"
    }

    /** Signed full-rupee delta (detail page): "+Rs 250,000". Blank for null/zero. */
    fun deltaLkrFull(value: Double?): String {
        val n = finite(value) ?: return ""
        if (n == 0.0) return ""
        val sign = if (n > 0) "+" else "−"
        return "${sign}Rs ${group(abs(n))}"
    }

    fun km(value: Double?): String {
        if (value == null || !value.isFinite() || value <= 0) return FALLBACK
        return "${group(value)} km"
    }

    fun count(value: Int): String = grouped.format(value.toLong())
}
