package lk.motormila.app.ui.insights

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import lk.motormila.app.domain.model.PriceIndex
import lk.motormila.app.domain.model.PriceIndexPoint
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaGoodText
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PriceIndexPane(
    index: PriceIndex,
    modifier: Modifier = Modifier,
    onOpenPro: () -> Unit = {},
) {
    var segment by rememberSaveable { mutableStateOf("overall") }
    val keys = PriceIndexFormat.segmentKeys(index)
    val points = PriceIndexFormat.pointsFor(index, segment)
    val latest = points.lastOrNull()
    val change = PriceIndexFormat.totalChangePct(points)
    val up = (change ?: 0.0) >= 0.0

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = lk.motormila.app.ui.common.mmScreenPadding(bottom = 12.dp),
    ) {
        item {
            Column(Modifier.motormilaReveal()) {
                MotormilaEyebrow("MARKET BENCHMARK")
                Spacer(Modifier.height(12.dp))
                Text(
                    "SL Used Vehicle Price Index.",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                    color = MotormilaOnSurface,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "One number for the whole used-car market, mix-adjusted so it tracks real price movement — not whichever cars happened to list that month.",
                    fontSize = 14.sp,
                    lineHeight = 21.sp,
                    color = MotormilaSecondaryText,
                )
            }
        }
        if (points.isEmpty()) {
            item {
                MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 60)) {
                    Text(
                        "The index needs a few months of accumulated market aggregates before it can plot a like-for-like trend.",
                        fontSize = 14.sp,
                        color = MotormilaSecondaryText,
                    )
                }
            }
        } else {
            item {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .height(androidx.compose.foundation.layout.IntrinsicSize.Min)
                        .motormilaReveal(delayMillis = 40),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    MotormilaMetricTile(
                        label = "Current",
                        value = latest?.indexValue?.let { formatIndexValue(it) } ?: "—",
                        note = index.basePeriod?.let { "base ${PriceIndexFormat.periodLabel(it)} = 100" },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                    MotormilaMetricTile(
                        label = "Since base",
                        value = PriceIndexFormat.pct(change),
                        note = "whole tracked window",
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                    MotormilaMetricTile(
                        label = "MoM",
                        value = PriceIndexFormat.pct(latest?.momChangePct),
                        note = latest?.period?.let { PriceIndexFormat.periodLabel(it) },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
            if (keys.size > 1) {
                item {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.motormilaReveal(delayMillis = 70),
                    ) {
                        keys.forEach { key ->
                            MotormilaChoiceChip(
                                label = PriceIndexFormat.segmentLabel(key),
                                selected = segment == key,
                                compact = true,
                                onClick = { segment = key },
                            )
                        }
                    }
                }
            }
            item {
                MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 90)) {
                    val trend = lk.motormila.app.ui.common.trendOf(change)
                    Text(
                        stringResource(
                            when (trend) {
                                lk.motormila.app.ui.common.Trend.UP -> R.string.scr_trend_rising
                                lk.motormila.app.ui.common.Trend.DOWN -> R.string.scr_trend_easing
                                lk.motormila.app.ui.common.Trend.STABLE -> R.string.scr_trend_stable
                            },
                        ),
                        style = lk.motormila.app.ui.theme.MmType.current.label,
                        color = lk.motormila.app.ui.common.trendColor(trend),
                    )
                    Spacer(Modifier.height(10.dp))
                    lk.motormila.app.ui.common.TrendLineChart(
                        values = points.map { it.indexValue },
                        xLabels = points.map { PriceIndexFormat.periodLabel(it.period) },
                        yLabel = { formatIndexValue(it) },
                        contentDescription = "Price index chart, ${points.size} months, currently ${latest?.indexValue?.let { formatIndexValue(it) }}",
                        trend = trend,
                    )
                }
            }
            item {
                MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 110)) {
                    Text(stringResource(R.string.ui_insights_month_on_month), fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                    Spacer(Modifier.height(10.dp))
                    points.takeLast(6).reversed().forEach { point ->
                        val t = lk.motormila.app.ui.common.trendOf(point.momChangePct)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                PriceIndexFormat.periodLabel(point.period),
                                style = lk.motormila.app.ui.theme.MmType.current.bodyM,
                                color = MotormilaSecondaryText,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                PriceIndexFormat.pct(point.momChangePct),
                                style = lk.motormila.app.ui.theme.MmType.current.numeric,
                                color = lk.motormila.app.ui.common.trendColor(t),
                            )
                        }
                    }
                }
            }
        }
        if (index.methodology.isNotBlank()) {
            item {
                MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 130)) {
                    Text(stringResource(R.string.ui_insights_methodology), fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                    Spacer(Modifier.height(8.dp))
                    Text(index.methodology, fontSize = 13.sp, lineHeight = 20.sp, color = MotormilaSecondaryText)
                }
            }
        }
        item {
            // Longer history is a Pro feature; Pro isn't on sale yet, so no upsell button here.
        }
    }
}

private fun formatIndexValue(value: Double): String {
    val rounded = kotlin.math.round(value * 10.0) / 10.0
    return if (rounded == rounded.toLong().toDouble()) "${rounded.toLong()}.0" else rounded.toString()
}

@Composable
internal fun PriceIndexAreaChart(
    points: List<PriceIndexPoint>,
    modifier: Modifier = Modifier,
) {
    val line = MotormilaPrimary
    val fill = MotormilaPrimary.copy(alpha = 0.22f)
    Canvas(modifier) {
        if (points.size < 2) return@Canvas
        val vals = points.map { it.indexValue.toFloat() }
        val min = vals.minOrNull() ?: 0f
        val max = vals.maxOrNull() ?: 1f
        val span = (max - min).takeIf { it > 0 } ?: 1f
        val padY = size.height * 0.08f
        fun x(i: Int) = size.width * i / (points.size - 1).coerceAtLeast(1)
        fun y(v: Float) = padY + (size.height - padY * 2) * (1f - ((v - min) / span))
        val fillPath = Path().apply {
            moveTo(0f, y(vals.first()))
            vals.forEachIndexed { i, v -> lineTo(x(i), y(v)) }
            lineTo(size.width, size.height)
            lineTo(0f, size.height)
            close()
        }
        drawPath(fillPath, fill)
        vals.forEachIndexed { i, v ->
            if (i > 0) {
                drawLine(
                    color = line,
                    start = Offset(x(i - 1), y(vals[i - 1])),
                    end = Offset(x(i), y(v)),
                    strokeWidth = 4.5f,
                    cap = StrokeCap.Round,
                )
            }
        }
        val last = vals.last()
        drawCircle(MotormilaPrimaryBright, radius = 7f, center = Offset(x(vals.lastIndex), y(last)))
        drawCircle(MotormilaOnSurface, radius = 3f, center = Offset(x(vals.lastIndex), y(last)))
    }
}
