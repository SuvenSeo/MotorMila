package lk.motormila.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType

/**
 * Price-history line chart (Canvas, no chart dependency).
 * - Draw-in: the line is revealed along its length (PathMeasure segment)
 *   over 900ms emphasized; the area fill fades in behind it.
 * - Scrub: touch/drag shows a cursor + the exact price/date above the chart
 *   with a light tick haptic per point.
 * - [typicalLkr] draws a dashed reference line (typical asking price).
 * Reduced motion: drawn complete, no animation.
 */
@Composable
fun MmPriceChart(
    points: List<PricePoint>,
    modifier: Modifier = Modifier,
    typicalLkr: Double? = null,
    height: Dp = 180.dp,
    emptyText: String = "",
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    if (points.size < 2) {
        if (emptyText.isNotEmpty()) Text(emptyText, style = MmType.current.bodyS, color = c.textSecondary, modifier = modifier)
        return
    }
    val progress = remember(points) { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(points) {
        if (!reduced) progress.animateTo(1f, MmMotion.emphasized(900))
    }
    var scrub by remember(points) { mutableIntStateOf(-1) }

    val values = points.map { it.priceLkr }
    val lo = (listOfNotNull(values.min(), typicalLkr).min())
    val hi = (listOfNotNull(values.max(), typicalLkr).max())
    val span = (hi - lo).takeIf { it > 0 } ?: 1.0
    val falling = values.last() < values.first()
    val lineColor = if (falling) c.dealGood else c.brand

    Column(modifier) {
        val shownIdx = if (scrub >= 0) scrub else points.lastIndex
        Row {
            Text(
                MmPriceFormat.full(points[shownIdx].priceLkr),
                style = MmType.current.priceS,
                color = c.textPrimary,
            )
            Spacer(Modifier.weight(1f))
            Text(
                points[shownIdx].scrapedAt.take(10),
                style = MmType.current.caption,
                color = c.textTertiary,
            )
        }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(height)
                .semantics {
                    contentDescription = "Price history, ${points.size} points, from " +
                        "${MmPriceFormat.full(values.first())} to ${MmPriceFormat.full(values.last())}"
                }
                .pointerInput(points) {
                    fun idx(x: Float) = ((x / size.width) * (points.size - 1)).let { Math.round(it) }
                        .coerceIn(0, points.lastIndex)
                    detectHorizontalDragGestures(
                        onDragStart = { scrub = idx(it.x) },
                        onDragEnd = { scrub = -1 },
                        onDragCancel = { scrub = -1 },
                    ) { change, _ ->
                        val i = idx(change.position.x)
                        if (i != scrub) haptics.toggle()
                        scrub = i
                        change.consume()
                    }
                }
                .pointerInput(points) {
                    detectTapGestures(
                        onPress = {
                            scrub = ((it.x / size.width) * (points.size - 1)).let { v -> Math.round(v) }
                                .coerceIn(0, points.lastIndex)
                            tryAwaitRelease()
                            scrub = -1
                        },
                    )
                },
        ) {
            Canvas(Modifier.matchParentSize()) {
                val w = size.width
                val h = size.height
                val padY = 8.dp.toPx()
                fun x(i: Int) = w * i / (points.size - 1).toFloat()
                fun y(v: Double) = (h - padY - (h - 2 * padY) * ((v - lo) / span)).toFloat()

                // Baseline grid (3 hairlines).
                repeat(3) { g ->
                    val gy = padY + (h - 2 * padY) * g / 2f
                    drawLine(c.outline, Offset(0f, gy), Offset(w, gy), 1f)
                }
                typicalLkr?.let { t ->
                    val ty = y(t)
                    drawLine(
                        c.textTertiary,
                        Offset(0f, ty),
                        Offset(w, ty),
                        strokeWidth = 1.5.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f)),
                    )
                }
                // Smooth-ish path (monotone cubic between points).
                val path = Path().apply {
                    moveTo(x(0), y(values[0]))
                    for (i in 1 until values.size) {
                        val px = x(i - 1); val py = y(values[i - 1])
                        val cx = x(i); val cy = y(values[i])
                        val mx = (px + cx) / 2f
                        cubicTo(mx, py, mx, cy, cx, cy)
                    }
                }
                val p = progress.value
                // Area fill (fades + reveals with the line).
                val area = Path().apply {
                    addPath(path)
                    lineTo(x(values.lastIndex), h)
                    lineTo(0f, h)
                    close()
                }
                clipRect(right = w * p) {
                    drawPath(
                        area,
                        Brush.verticalGradient(listOf(lineColor.copy(alpha = 0.22f * p), lineColor.copy(alpha = 0f))),
                    )
                }
                val measure = PathMeasure().apply { setPath(path, false) }
                val drawn = Path()
                measure.getSegment(0f, measure.length * p, drawn, true)
                drawPath(
                    drawn,
                    lineColor,
                    style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round),
                )
                if (p >= 0.999f) {
                    val end = Offset(x(values.lastIndex), y(values.last()))
                    drawCircle(lineColor.copy(alpha = 0.25f), 8.dp.toPx(), end)
                    drawCircle(lineColor, 4.dp.toPx(), end)
                }
                if (scrub >= 0) {
                    val sx = x(scrub)
                    val sy = y(values[scrub])
                    drawLine(c.outlineStrong, Offset(sx, 0f), Offset(sx, h), 1.dp.toPx())
                    drawCircle(c.background, 6.dp.toPx(), Offset(sx, sy))
                    drawCircle(lineColor, 4.dp.toPx(), Offset(sx, sy))
                }
            }
        }
    }
}
