package lk.motormila.app.ui.common

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType

/** Pure helpers for chart axes (unit-tested). */
object ChartMath {
    /** Three "nice" ticks (min, mid, max) padded 6% so the line never touches the frame. */
    fun ticks(values: List<Double>): List<Double> {
        if (values.isEmpty()) return emptyList()
        val lo = values.min()
        val hi = values.max()
        val span = (hi - lo).takeIf { it > 0 } ?: (if (hi == 0.0) 1.0 else kotlin.math.abs(hi) * 0.1)
        val pad = span * 0.06
        val a = lo - pad
        val b = hi + pad
        return listOf(a, (a + b) / 2, b)
    }

    /** Direction of a series: last vs first, as percent change. */
    fun changePct(values: List<Double>): Double? {
        val first = values.firstOrNull() ?: return null
        val last = values.lastOrNull() ?: return null
        if (first == 0.0) return null
        return (last - first) / kotlin.math.abs(first) * 100.0
    }
}

/**
 * Smooth line chart with a soft area fill and readable axes.
 *  - Colour follows the market direction: up = amber, down = green, flat = grey.
 *  - Draws in once (path reveal, MmMotion.Slow); skipped under reduced motion
 *    and in low-data mode.
 *  - Y axis: 3 labels via [yLabel] (e.g. Mn); X axis: first / middle / last label.
 */
@Composable
fun TrendLineChart(
    values: List<Double>,
    xLabels: List<String>,
    yLabel: (Double) -> String,
    contentDescription: String,
    modifier: Modifier = Modifier,
    height: Dp = 200.dp,
    trend: Trend = trendOf(ChartMath.changePct(values)),
) {
    val c = MmColors.current
    val type = MmType.current
    val color = trendColor(trend)
    val reduced = MmMotion.reduced || LowDataMode.current()
    val progress = remember(values) { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(values, reduced) {
        if (!reduced) progress.animateTo(1f, MmMotion.emphasized(MmMotion.Slow * 2))
        else progress.snapTo(1f)
    }
    val ticks = ChartMath.ticks(values)
    Column(modifier.fillMaxWidth().semantics { this.contentDescription = contentDescription }) {
        Row(Modifier.fillMaxWidth().height(height)) {
            Box(Modifier.weight(1f).height(height)) {
                Canvas(Modifier.fillMaxWidth().height(height)) {
                    if (values.size < 2 || ticks.size < 3) return@Canvas
                    val lo = ticks.first()
                    val hi = ticks.last()
                    val span = (hi - lo).takeIf { it > 0 } ?: 1.0
                    fun x(i: Int) = size.width * i / (values.size - 1).toFloat()
                    fun y(v: Double) = (size.height * (1 - (v - lo) / span)).toFloat()
                    // Grid lines at each tick
                    ticks.forEach { t ->
                        drawLine(c.outline, Offset(0f, y(t)), Offset(size.width, y(t)), strokeWidth = 1f)
                    }
                    // Smooth path (monotone-ish cubic through midpoints)
                    val line = Path().apply {
                        moveTo(x(0), y(values[0]))
                        for (i in 1 until values.size) {
                            val px = x(i - 1); val py = y(values[i - 1])
                            val cx = x(i); val cy = y(values[i])
                            val mx = (px + cx) / 2
                            cubicTo(mx, py, mx, cy, cx, cy)
                        }
                    }
                    val reveal = progress.value
                    clipRect(right = size.width * reveal) {
                        val area = Path().apply {
                            addPath(line)
                            lineTo(size.width, size.height)
                            lineTo(0f, size.height)
                            close()
                        }
                        drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = 0.22f), color.copy(alpha = 0f))))
                    }
                    val measure = PathMeasure().apply { setPath(line, false) }
                    val partial = Path()
                    measure.getSegment(0f, measure.length * reveal, partial, true)
                    drawPath(partial, color, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                    if (reveal >= 0.999f) {
                        val end = Offset(x(values.lastIndex), y(values.last()))
                        drawCircle(color.copy(alpha = 0.25f), radius = 7.dp.toPx(), center = end)
                        drawCircle(color, radius = 3.5.dp.toPx(), center = end)
                    }
                }
            }
            // Y axis labels (right side, like most market charts)
            // Axis labels are chart chrome: capped at 1.15x and single-line so
            // "100.0" never wraps to "100 / .0" at 200 %.
            lk.motormila.app.ui.theme.CappedFontScale(max = 1.15f) {
            Box(Modifier.width(56.dp).height(height)) {
                if (ticks.size == 3) {
                    Text(yLabel(ticks[2]), style = type.caption, color = c.textTertiary, maxLines = 1, softWrap = false, modifier = Modifier.padding(start = 6.dp))
                    Text(
                        yLabel(ticks[1]),
                        style = type.caption,
                        color = c.textTertiary,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier.padding(start = 6.dp, top = height / 2 - 8.dp),
                    )
                    Text(
                        yLabel(ticks[0]),
                        style = type.caption,
                        color = c.textTertiary,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier.padding(start = 6.dp, top = height - 16.dp),
                    )
                }
            }
            }
        }
        if (xLabels.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp, end = 56.dp)) {
                val first = xLabels.first()
                val mid = xLabels[xLabels.size / 2]
                val last = xLabels.last()
                Text(first, style = type.caption, color = c.textTertiary, modifier = Modifier.weight(1f))
                if (xLabels.size > 2) Text(mid, style = type.caption, color = c.textTertiary, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                Text(last, style = type.caption, color = c.textTertiary, modifier = Modifier.weight(1f), textAlign = TextAlign.End)
            }
        }
    }
}

/** Short month label for chart axes: "Oct 26". */
fun monthLabel(year: Int, month: Int): String {
    val names = java.text.DateFormatSymbols.getInstance().shortMonths
    val m = names.getOrNull(month - 1)?.takeIf { it.isNotBlank() } ?: month.toString()
    return "$m ${(year % 100).toString().padStart(2, '0')}"
}
