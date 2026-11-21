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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.DateFormat
import java.util.Calendar
import java.util.Locale
import lk.motormila.app.R
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType

/**
 * Price-history line chart (Canvas, no chart dependency).
 * - Optional localized [title] ("Price history") above the scrub header.
 * - Draw-in: the line is revealed along its length (PathMeasure segment)
 *   over 900ms emphasized; the area fill fades in behind it.
 * - Scrub: touch/drag shows a cursor + the exact price/date above the chart
 *   with a light tick haptic per point. Dates render in the app locale,
 *   never as raw scraped ISO strings.
 * - X positions follow time (first → last tracked date) whenever every
 *   point's date parses, so a cut after two quiet months doesn't look like
 *   the day after; index spacing is the fallback. Start / end dates sit
 *   under the plot.
 * - [typicalLkr] draws a dashed reference line labelled "Typical" whenever a
 *   reference exists (the range always includes it).
 * - Min/max price labels anchor the range at the plot's top / bottom.
 * - Fewer than 2 points: a real message (localized default when [emptyText]
 *   is blank) instead of a silent blank.
 * Reduced motion: drawn complete, no animation.
 */
@Composable
fun MmPriceChart(
    points: List<PricePoint>,
    modifier: Modifier = Modifier,
    typicalLkr: Double? = null,
    height: Dp = 180.dp,
    emptyText: String = "",
    /** Optional section title; null keeps the legacy chrome-less look. */
    title: String? = null,
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    if (points.size < 2) {
        // Never a silent blank: insufficient data says so (localized default).
        val message = emptyText.ifBlank { stringResource(R.string.mm_chart_empty) }
        Column(modifier) {
            if (title != null) {
                Text(title, style = MmType.current.titleS, color = c.textPrimary)
                Spacer(Modifier.height(8.dp))
            }
            Text(message, style = MmType.current.bodyS, color = c.textSecondary)
        }
        return
    }
    val progress = remember(points) { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(points) {
        if (!reduced) progress.animateTo(1f, MmMotion.emphasized(900))
    }
    var scrub by remember(points) { mutableIntStateOf(-1) }

    val values = points.map { it.priceLkr }
    // 0…1 x position per point: by time when every date parses and they span
    // more than a moment, otherwise evenly spaced by index.
    val xFractions = remember(points) { chartXFractions(points) }
    val minPrice = values.min()
    val maxPrice = values.max()
    val lo = (listOfNotNull(minPrice, typicalLkr).min())
    val hi = (listOfNotNull(maxPrice, typicalLkr).max())
    val span = (hi - lo).takeIf { it > 0 } ?: 1.0
    val falling = values.last() < values.first()
    val lineColor = if (falling) c.dealGood else c.brand

    // Localized dates for the scrub/header (never raw scrapedAt ISO).
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val shownIdx = if (scrub >= 0) scrub else points.lastIndex
    val shownDate = remember(points, shownIdx, locale) {
        formatChartDate(points[shownIdx].scrapedAt, locale)
    }
    val startDate = remember(points, locale) { formatChartDate(points.first().scrapedAt, locale) }
    val endDate = remember(points, locale) { formatChartDate(points.last().scrapedAt, locale) }
    val axisMeasurer = rememberTextMeasurer()
    val axisStyle = MmType.current.caption.copy(color = c.textTertiary, fontFeatureSettings = "tnum")
    val maxLabel = MmPriceFormat.compact(maxPrice)
    val minLabel = MmPriceFormat.compact(minPrice)
    val chartCd = stringResource(
        R.string.mm_chart_cd,
        points.size,
        MmPriceFormat.full(values.first()),
        MmPriceFormat.full(values.last()),
    )

    // Reference legend (localized): typical asking price + the plotted range.
    val typicalLabel = stringResource(R.string.mm_chart_typical)

    Column(modifier) {
        if (title != null) {
            Text(title, style = MmType.current.titleS, color = c.textPrimary)
            Spacer(Modifier.height(8.dp))
        }
        Row {
            Text(
                MmPriceFormat.full(points[shownIdx].priceLkr),
                style = MmType.current.priceS,
                color = c.textPrimary,
            )
            Spacer(Modifier.weight(1f))
            Text(
                shownDate,
                style = MmType.current.caption,
                color = c.textTertiary,
            )
        }
        if (typicalLkr != null) {
            Text(
                "$typicalLabel: ${MmPriceFormat.compact(typicalLkr)}  ·  ${MmPriceFormat.compact(lo)} – ${MmPriceFormat.compact(hi)}",
                style = MmType.current.caption,
                color = c.textTertiary,
            )
            Spacer(Modifier.height(4.dp))
        }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(height)
                .semantics { contentDescription = chartCd }
                .pointerInput(points) {
                    fun idx(x: Float) = nearestIndex(xFractions, x / size.width)
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
                            scrub = nearestIndex(xFractions, it.x / size.width)
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
                fun x(i: Int) = w * xFractions[i]
                fun y(v: Double) = (h - padY - (h - 2 * padY) * ((v - lo) / span)).toFloat()

                // Baseline grid (3 hairlines).
                repeat(3) { g ->
                    val gy = padY + (h - 2 * padY) * g / 2f
                    drawLine(c.outline, Offset(0f, gy), Offset(w, gy), 1f)
                }
                typicalLkr?.let { t: Double ->
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
                // Max / min price labels at the line's own extremes (right edge).
                if (maxPrice > minPrice) {
                    val maxText = axisMeasurer.measure(maxLabel, axisStyle)
                    val minText = axisMeasurer.measure(minLabel, axisStyle)
                    val labelX = (w - maxOf(maxText.size.width, minText.size.width)).coerceAtLeast(0f)
                    drawText(
                        maxText,
                        topLeft = Offset(labelX, (y(maxPrice) - maxText.size.height - 2.dp.toPx()).coerceAtLeast(0f)),
                    )
                    drawText(
                        minText,
                        topLeft = Offset(labelX, (y(minPrice) + 2.dp.toPx()).coerceAtMost(h - minText.size.height)),
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        // Start / end of the tracked window.
        Row(Modifier.fillMaxWidth()) {
            Text(startDate, style = MmType.current.caption, color = c.textTertiary)
            Spacer(Modifier.weight(1f))
            Text(endDate, style = MmType.current.caption, color = c.textTertiary)
        }
    }
}

/**
 * 0…1 x position per point. By time when every date parses and the window
 * spans at least an hour; evenly spaced by index otherwise.
 */
private fun chartXFractions(points: List<PricePoint>): List<Float> {
    val byIndex = List(points.size) { i -> i / (points.size - 1).coerceAtLeast(1).toFloat() }
    val times = points.map { parseChartMillis(it.scrapedAt) ?: return byIndex }
    val t0 = times.min()
    val span = times.max() - t0
    if (span < 3_600_000L) return byIndex
    return times.map { ((it - t0).toDouble() / span).toFloat().coerceIn(0f, 1f) }
}

/** Index of the point whose x fraction is closest to [fraction]. */
private fun nearestIndex(xFractions: List<Float>, fraction: Float): Int {
    var best = 0
    var bestDist = Float.MAX_VALUE
    xFractions.forEachIndexed { i, fx ->
        val d = kotlin.math.abs(fx - fraction)
        if (d < bestDist) {
            bestDist = d
            best = i
        }
    }
    return best
}

/** ISO date / datetime (with or without offset) → epoch millis; null when unparseable. */
private fun parseChartMillis(iso: String): Long? {
    val s = iso.trim()
    if (s.isEmpty()) return null
    return runCatching { java.time.OffsetDateTime.parse(s).toInstant().toEpochMilli() }.getOrNull()
        ?: runCatching { java.time.Instant.parse(s).toEpochMilli() }.getOrNull()
        ?: runCatching {
            java.time.LocalDateTime.parse(s.replace(' ', 'T')).toInstant(java.time.ZoneOffset.UTC).toEpochMilli()
        }.getOrNull()
        ?: runCatching {
            java.time.LocalDate.parse(s.take(10)).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
        }.getOrNull()
}

/**
 * "2026-11-19T08:30:00" (or plain "2026-11-19") → a MEDIUM date in the app
 * locale ("Nov 19, 2026" / "2026 නොවැ 19" / "19 நவ., 2026"). Unparseable
 * input falls back to the raw date part rather than crashing the chart.
 */
private fun formatChartDate(iso: String, locale: Locale): String {
    val datePart = iso.take(10)
    val parts = datePart.split("-")
    if (parts.size == 3) {
        val y = parts[0].toIntOrNull()
        val m = parts[1].toIntOrNull()
        val d = parts[2].toIntOrNull()
        if (y != null && m != null && d != null && m in 1..12 && d in 1..31) {
            return runCatching {
                val cal = Calendar.getInstance(locale)
                cal.clear()
                cal.set(y, m - 1, d)
                DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(cal.time)
            }.getOrDefault(datePart)
        }
    }
    return datePart
}
