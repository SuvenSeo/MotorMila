package lk.motormila.app.ui.pulse

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import lk.motormila.app.domain.model.MarketSignal

/**
 * Human-readable text for Official Pulse market signals.
 *
 * The backend sends machine keys (metric `reference_page_available`, unit
 * `boolean`, category `import_cost`), which the cards used to print raw
 * ("import_cost · 1 boolean"). Pure JVM so it is unit-tested.
 */
object PulseLabels {

    private val metricLabels = mapOf(
        "reference_page_available" to "Import reference page",
        "vehicle_tender_count" to "Vehicles in customs tenders",
        "document_count" to "Documents published",
        "usd_lkr_spot" to "USD/LKR spot rate",
    )

    private val signalTypeLabels = mapOf(
        "registrations" to "Registrations",
        "transfers" to "Ownership transfers",
        "tender_sales" to "Tender sales",
        "landed_cost" to "Landed cost",
        "exchange_rate" to "Exchange rate",
    )

    /** `vehicle_tender_count` → "Vehicle tender count"; blank stays blank. */
    fun humanize(raw: String?): String {
        val words = raw.orEmpty().replace('_', ' ').replace('-', ' ').trim().split(Regex("\\s+"))
            .filter { it.isNotEmpty() }
        if (words.isEmpty()) return ""
        return words.joinToString(" ") { it.lowercase(Locale.ROOT) }
            .replaceFirstChar { it.titlecase(Locale.ROOT) }
            .replace(Regex("\\b(usd|lkr|dmt|cbsl|ev)\\b")) { it.value.uppercase(Locale.ROOT) }
    }

    fun metricLabel(metric: String?): String =
        metricLabels[metric.orEmpty().trim().lowercase(Locale.ROOT)] ?: humanize(metric)

    fun signalTypeLabel(signalType: String?): String =
        signalTypeLabels[signalType.orEmpty().trim().lowercase(Locale.ROOT)] ?: humanize(signalType)

    /** Card/detail headline: the metric in words; category/type only as fallbacks. */
    fun title(signal: MarketSignal): String =
        metricLabel(signal.metric).ifBlank { humanize(signal.category) }.ifBlank { signalTypeLabel(signal.signalType) }

    /**
     * Value in words: booleans → "Available"/"Not available", counts → grouped
     * number, LKR amounts → [lkrAmount], rates → "330.60 LKR/USD". Null when the
     * signal has no numeric value.
     */
    fun value(signal: MarketSignal, lkrAmount: (Double) -> String): String? {
        val v = signal.valueNumeric ?: return null
        val unit = signal.unit?.trim().orEmpty()
        val unitKey = unit.lowercase(Locale.ROOT)
        return when {
            unitKey == "boolean" || unitKey == "bool" -> if (v > 0.0) "Available" else "Not available"
            unitKey == "lkr" ||
                (unitKey.isEmpty() && signal.metric.lowercase(Locale.ROOT).endsWith("_lkr")) -> lkrAmount(v)
            unitKey == "count" || unitKey.isEmpty() -> number(v)
            unitKey.contains("_per_") -> "${number(v, decimals = 2)} ${unitLabel(unit)}"
            unitKey == "percent" || unitKey == "pct" || unit == "%" -> "${number(v)}%"
            else -> "${number(v)} ${unitLabel(unit)}"
        }
    }

    /** `LKR_per_USD` → "LKR/USD"; `vehicles` → "vehicles". */
    fun unitLabel(unit: String?): String {
        val raw = unit.orEmpty().trim()
        if (raw.isEmpty()) return ""
        val parts = raw.split(Regex("_per_", RegexOption.IGNORE_CASE))
        if (parts.size == 2) return "${parts[0].uppercase(Locale.ROOT)}/${parts[1].uppercase(Locale.ROOT)}"
        return raw.replace('_', ' ')
    }

    private fun number(v: Double, decimals: Int = 1): String {
        val symbols = DecimalFormatSymbols(Locale.US)
        val pattern = when {
            v % 1.0 == 0.0 && decimals < 2 -> "#,##0"
            decimals >= 2 -> "#,##0.00"
            else -> "#,##0.#"
        }
        return DecimalFormat(pattern, symbols).format(v)
    }
}
