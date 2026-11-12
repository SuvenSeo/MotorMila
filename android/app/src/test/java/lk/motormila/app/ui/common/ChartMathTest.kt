package lk.motormila.app.ui.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChartMathTest {
    @Test fun ticksBracketTheData() {
        val t = ChartMath.ticks(listOf(5.0, 7.0, 9.0))
        assertEquals(3, t.size)
        assertTrue(t[0] < 5.0 && t[2] > 9.0)
        assertEquals(7.0, t[1], 1e-9)
    }

    @Test fun flatSeriesStillHasSpan() {
        val t = ChartMath.ticks(listOf(100.0, 100.0))
        assertTrue(t[2] > t[0])
    }

    @Test fun trendDirection() {
        assertEquals(Trend.UP, trendOf(ChartMath.changePct(listOf(100.0, 110.0))))
        assertEquals(Trend.DOWN, trendOf(ChartMath.changePct(listOf(100.0, 90.0))))
        assertEquals(Trend.STABLE, trendOf(ChartMath.changePct(listOf(100.0, 100.2))))
        assertNull(ChartMath.changePct(emptyList()))
    }
}
