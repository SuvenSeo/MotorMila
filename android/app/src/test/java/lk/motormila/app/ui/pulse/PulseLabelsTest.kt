package lk.motormila.app.ui.pulse

import lk.motormila.app.domain.model.MarketSignal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Live /market/signals shapes (2026-10) → readable Official Pulse text. Pure JVM. */
class PulseLabelsTest {

    private fun signal(
        source: String,
        type: String,
        metric: String,
        value: Double?,
        unit: String?,
        category: String? = null,
    ) = MarketSignal(
        id = 1,
        source = source,
        signalType = type,
        metric = metric,
        valueNumeric = value,
        unit = unit,
        observedAt = "2026-10-20T00:00:00Z",
        category = category,
        periodYear = 2026,
        periodMonth = 10,
    )

    private val lkr: (Double) -> String = { "Rs ${it.toLong()}" }

    @Test
    fun booleanImportReference_isReadable() {
        val s = signal("import_parity", "landed_cost", "reference_page_available", 1.0, "boolean", "import_cost")
        assertEquals("Import reference page", PulseLabels.title(s))
        assertEquals("Available", PulseLabels.value(s, lkr))
        assertEquals("Not available", PulseLabels.value(s.copy(valueNumeric = 0.0), lkr))
        assertEquals("Landed cost", PulseLabels.signalTypeLabel(s.signalType))
    }

    @Test
    fun countSignals_dropRawUnitAndCategory() {
        val tender = signal("customs", "tender_sales", "vehicle_tender_count", 63.0, "count", "official")
        assertEquals("Vehicles in customs tenders", PulseLabels.title(tender))
        assertEquals("63", PulseLabels.value(tender, lkr))
        val big = signal("dmt", "registrations", "document_count", 12500.0, "count", "official")
        assertEquals("Documents published", PulseLabels.title(big))
        assertEquals("12,500", PulseLabels.value(big, lkr))
    }

    @Test
    fun exchangeRate_isNotTreatedAsLkrAmount() {
        val fx = signal("cbsl", "exchange_rate", "usd_lkr_spot", 330.6, "LKR_per_USD", "macro")
        assertEquals("USD/LKR spot rate", PulseLabels.title(fx))
        assertEquals("330.60 LKR/USD", PulseLabels.value(fx, lkr))
    }

    @Test
    fun lkrAndFallbacks() {
        val price = signal("x", "landed_cost", "median_price_lkr", 8_000_000.0, "LKR")
        assertEquals("Rs 8000000", PulseLabels.value(price, lkr))
        assertEquals("Median price LKR", PulseLabels.title(price))
        assertNull(PulseLabels.value(price.copy(valueNumeric = null), lkr))
        assertEquals("New signal kind", PulseLabels.signalTypeLabel("new_signal_kind"))
        assertEquals("Official", PulseLabels.title(signal("x", "", "", 1.0, null, "official")))
        assertEquals("", PulseLabels.humanize("  "))
    }
}
