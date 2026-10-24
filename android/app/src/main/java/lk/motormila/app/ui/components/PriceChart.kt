package lk.motormila.app.ui.components

import androidx.compose.animation.core.snap
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.ui.theme.MotormilaRadius

/**
 * Canvas-only price-history chart (no extra chart dep): path draw-in 700ms,
 * scrub tooltip on horizontal drag, optional dashed FMV line.
 */
@Composable
fun PriceChart(
    points: List<PricePoint>,
    fmvLkr: Double? = null,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(points) { started = true }
    val progress by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = if (reducedMotion) snap() else spring(dampingRatio = 1f, stiffness = Spring.StiffnessVeryLow, visibilityThreshold = 0.001f),
        label = "price-draw-in",
    )
    var scrub by remember { mutableFloatStateOf(-1f) }
    val line = MaterialTheme.colorScheme.primary
    val grid = MaterialTheme.colorScheme.outlineVariant
    val fmvColor = MaterialTheme.colorScheme.secondary

    if (points.size < 2) {
        Text(
            text = if (points.isEmpty()) "No price history yet" else "Only one price point so far",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = modifier.padding(8.dp),
        )
        return
    }
    val min = (points.minOf { it.priceLkr }.let { m -> listOfNotNull(m, fmvLkr).min() })
    val max = (points.maxOf { it.priceLkr }.let { m -> listOfNotNull(m, fmvLkr).max() })
    val span = (max - min).takeIf { it > 0 } ?: 1.0

    Column(modifier = modifier) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .clip(MotormilaRadius.lg)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
                .semantics {
                    contentDescription = "Price history, ${points.size} points, " +
                        "from ${LkrFormat.full(points.first().priceLkr)} " +
                        "to ${LkrFormat.full(points.last().priceLkr)}"
                }
                .pointerInput(points) {
                    detectHorizontalDragGestures(
                        onDragStart = { scrub = it.x / size.width },
                        onDragEnd = { scrub = -1f },
                        onDragCancel = { scrub = -1f },
                    ) { change, _ ->
                        scrub = (change.position.x / size.width).coerceIn(0f, 1f)
                        change.consume()
                    }
                },
        ) {
            Canvas(modifier = Modifier.matchParentSize()) {
                val w = size.width
                val h = size.height
                val padX = 12.dp.toPx()
                val padY = 14.dp.toPx()
                // Gridlines.
                repeat(4) { i ->
                    val y = padY + (h - 2 * padY) * i / 3f
                    drawLine(grid, Offset(padX, y), Offset(w - padX, y), strokeWidth = 1.dp.toPx())
                }
                fun xy(i: Int): Offset {
                    val x = padX + (w - 2 * padX) * i / (points.size - 1).toFloat()
                    val y = h - padY - (h - 2 * padY) * ((points[i].priceLkr - min) / span).toFloat()
                    return Offset(x, y)
                }
                // FMV dashed line.
                if (fmvLkr != null) {
                    val y = h - padY - (h - 2 * padY) * ((fmvLkr - min) / span).toFloat()
                    drawLine(
                        color = fmvColor,
                        start = Offset(padX, y),
                        end = Offset(w - padX, y),
                        strokeWidth = 1.5.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)),
                    )
                }
                // Price path (partial by progress).
                val path = Path()
                val upto = (1 + (progress * (points.size - 1)).toInt()).coerceIn(1, points.size)
                path.moveTo(xy(0).x, xy(0).y)
                for (i in 1 until upto) path.lineTo(xy(i).x, xy(i).y)
                drawPath(path, color = line, style = Stroke(width = 2.5.dp.toPx()))
                for (i in 0 until upto) {
                    drawCircle(line, radius = 3.dp.toPx(), center = xy(i))
                }
                // Scrub cursor.
                if (scrub >= 0f) {
                    val idx = (scrub * (points.size - 1)).toInt().coerceIn(0, points.size - 1)
                    val p = xy(idx)
                    drawLine(Color.Gray, Offset(p.x, padY), Offset(p.x, h - padY), strokeWidth = 1.dp.toPx())
                    drawCircle(line, radius = 5.dp.toPx(), center = p)
                    drawCircle(Color.White, radius = 2.dp.toPx(), center = p)
                }
            }
        }
        val scrubIdx = if (scrub >= 0f) (scrub * (points.size - 1)).toInt().coerceIn(0, points.size - 1) else null
        Text(
            text = if (scrubIdx != null) {
                "${LkrFormat.full(points[scrubIdx].priceLkr)} · ${points[scrubIdx].scrapedAt.take(10)}"
            } else {
                "${LkrFormat.full(points.first().priceLkr)} → ${LkrFormat.full(points.last().priceLkr)}"
            },
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, start = 4.dp),
        )
    }
}
