package lk.motormila.app.ui.common

import org.junit.Assert.assertEquals
import org.junit.Test

class MnFormatTest {
    @Test fun compactMatchesWebRules() {
        assertEquals("Rs 0.35 Mn", Mn.compact(350_000.0))
        assertEquals("Rs 8.5 Mn", Mn.compact(8_500_000.0))
        assertEquals("Rs 7.25 Mn", Mn.compact(7_250_000.0))
        assertEquals("Rs 12.5 Mn", Mn.compact(12_500_000.0))
        assertEquals("Rs 0.085 Mn", Mn.compact(85_400.0))
        assertEquals("Rs 5,000", Mn.compact(5_000.0))
        assertEquals("—", Mn.compact(null))
    }

    @Test fun fullMonthlyAxis() {
        assertEquals("Rs 7,250,000", Mn.full(7_250_000.0))
        assertEquals("Rs 85,400/mo", Mn.monthly(85_400.0))
        assertEquals("8.5 Mn", Mn.axis(8_500_000.0))
        assertEquals("15 Mn", Mn.axis(15_000_000.0))
        assertEquals("0", Mn.axis(0.0))
    }
}
