package lk.motormila.app.ui.common

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Screen-level LKR formatting, mirroring the web's canonical rules
 * (src/lib/price.ts, Oct 20 2026 — millions only):
 *  - compact: "Rs 0.35 Mn", "Rs 8.5 Mn", "Rs 12.5 Mn"; under Rs 10,000 stays full.
 *  - full (listing detail / receipts only): "Rs 7,250,000".
 *  - monthly: "Rs 85,400/mo".
 *  - axis: "8.5 Mn" (no "Rs").
 * Lakhs are never shown.
 */
object Mn {
    private const val MILLION = 1_000_000.0
    private const val MN_DISPLAY_MIN = 10_000.0
    const val FALLBACK = "—"

    fun group(value: Double): String {
        val rounded = value.roundToLong()
        val sign = if (rounded < 0) "-" else ""
        return sign + abs(rounded).toString().reversed().chunked(3).joinToString(",").reversed()
    }

    private fun trim(s: String): String =
        if (s.contains('.')) s.trimEnd('0').trimEnd('.') else s

    /** Millions as a trimmed decimal: 2 decimals; under 0.095 Mn, 2 significant digits. */
    fun number(absLkr: Double): String {
        val mn = absLkr / MILLION
        if (mn < 0.095) {
            val sig = BigDecimal(mn).round(MathContext(2, RoundingMode.HALF_UP))
            return trim(sig.setScale(3, RoundingMode.HALF_UP).toPlainString())
        }
        return trim(BigDecimal(mn).setScale(2, RoundingMode.HALF_UP).toPlainString())
    }

    fun amount(value: Double): String {
        val sign = if (value < 0) "-" else ""
        val a = abs(value)
        if (a < MN_DISPLAY_MIN) return sign + group(a)
        return "$sign${number(a)} Mn"
    }

    /** "Rs 8.5 Mn". Null/NaN/non-positive price → [fallback]. */
    fun compact(value: Double?, fallback: String = FALLBACK): String {
        if (value == null || value.isNaN() || value.isInfinite()) return fallback
        return "Rs ${amount(value)}"
    }

    fun compactPrice(value: Double?, fallback: String = FALLBACK): String =
        if (value == null || value <= 0) fallback else compact(value, fallback)

    fun full(value: Double?, fallback: String = FALLBACK): String {
        if (value == null || value.isNaN() || value.isInfinite()) return fallback
        return "Rs ${group(value)}"
    }

    fun monthly(value: Double?, fallback: String = FALLBACK): String {
        if (value == null || value.isNaN() || value.isInfinite()) return fallback
        return "Rs ${group(value)}/mo"
    }

    fun axis(value: Double): String {
        val a = abs(value)
        val sign = if (value < 0) "-" else ""
        if (a == 0.0) return "0"
        if (a < MN_DISPLAY_MIN) return sign + group(a)
        val mn = a / MILLION
        val num = if (mn < 10) number(a) else trim(
            BigDecimal(mn).setScale(if (mn < 100) 1 else 0, RoundingMode.HALF_UP).toPlainString(),
        )
        return "$sign$num Mn"
    }

    fun range(low: Double?, high: Double?): String = "${compact(low)} – ${compact(high)}"
}

/** Compact millions price for screen lists/cards ("Rs 8.5 Mn"); "—" when missing. */
fun mn(value: Number?): String = Mn.compactPrice(value?.toDouble())
