package lk.motormila.app.ui.compare

import lk.motormila.app.domain.model.Listing

/** Pure helpers for the compare matrix (unit-tested). */
object CompareLogic {
    /** Same cap as the Search compare tray (MAX_COMPARE_IDS): up to 3 cars side by side. */
    const val MAX = 3

    /**
     * Merge the cars already in the tray with ids arriving from navigation.
     * Newly arriving ids win; when over [MAX], the oldest tray entries drop.
     */
    fun merge(tray: List<Int>, incoming: List<Int>): List<Int> {
        val merged = (tray.filterNot { it in incoming } + incoming).distinct()
        return merged.takeLast(MAX)
    }

    enum class Best { LOW, HIGH }

    /** Index of the best value in [values] (null entries ignored); null when <2 values or all equal. */
    fun bestIndex(values: List<Double?>, best: Best): Int? {
        val present = values.withIndex().filter { it.value != null }
        if (present.size < 2) return null
        val distinct = present.map { it.value }.toSet()
        if (distinct.size < 2) return null
        val pick = when (best) {
            Best.LOW -> present.minByOrNull { it.value!! }
            Best.HIGH -> present.maxByOrNull { it.value!! }
        }
        return pick?.index
    }

    /** True when at least two cars have different (non-blank) values for a row. */
    fun differs(values: List<String?>): Boolean =
        values.map { it?.trim()?.lowercase().orEmpty() }.filter { it.isNotEmpty() && it != "—" }.toSet().size > 1

    data class Row(
        val key: String,
        val values: List<String>,
        val best: Int?,
        val differs: Boolean,
    )

    fun rows(items: List<Listing>, format: CompareFormat): List<Row> {
        fun row(key: String, raw: List<String?>, numeric: List<Double?>? = null, best: Best? = null): Row {
            val shown = raw.map { it?.takeIf { s -> s.isNotBlank() } ?: "—" }
            val bestIdx = if (numeric != null && best != null) bestIndex(numeric, best) else null
            return Row(key, shown, bestIdx, differs(raw))
        }
        return listOf(
            row("price", items.map { format.price(it.priceLkr) }, items.map { it.priceLkr?.takeIf { p -> p > 0 } }, Best.LOW),
            row("vsMarket", items.map { format.vsMarket(it.deltaVsMedianPct()) }, items.map { it.deltaVsMedianPct() }, Best.LOW),
            row("year", items.map { it.year?.toString() }, items.map { it.year?.toDouble() }, Best.HIGH),
            row("mileage", items.map { format.km(it.mileageKm) }, items.map { it.mileageKm?.takeIf { m -> m > 0 } }, Best.LOW),
            row("fuel", items.map { it.fuelType }),
            row("transmission", items.map { it.transmission }),
            row("engine", items.map { it.engineCc?.takeIf { cc -> cc > 0 }?.let { cc -> "${cc.toInt()} cc" } }),
            row("body", items.map { it.bodyType }),
            row("condition", items.map { it.condition }),
            row("district", items.map { it.district }),
            row("source", items.map { it.source }),
        )
    }
}

/** Formatting seam so the logic stays testable without Android resources. */
interface CompareFormat {
    fun price(lkr: Double?): String?
    fun km(km: Double?): String?
    fun vsMarket(pct: Double?): String?
}
