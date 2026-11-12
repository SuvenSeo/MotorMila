package lk.motormila.app.ui.components

import androidx.compose.animation.core.snap
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.core.format.LkrFormat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.ui.text.style.TextAlign
import lk.motormila.app.core.price.PriceContext
import lk.motormila.app.core.price.PriceVerdict
import lk.motormila.app.core.price.PriceVerdicts
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.deal
import lk.motormila.app.ui.theme.applePress

/**
 * Legacy entry (previews / tests that only hold an [Fmv]): resolves the one
 * verdict from the estimate alone, then draws [FmvGauge].
 */
@Composable
fun FmvGauge(
    fmv: Fmv,
    onExplainClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val verdict = remember(fmv) {
        PriceVerdicts.resolve(fmv.askingLkr, null, PriceContext(), fmv.toReference())
    }
    FmvGauge(verdict = verdict, askingLkr = fmv.askingLkr, confidence = fmv.confidence, onExplainClick = onExplainClick, modifier = modifier)
}

/**
 * 120dp semicircular price gauge driven by THE price verdict (the same one the
 * deal badge, ladder and share card read). Arc segments sit on the verdict
 * bands (−5 % / +8 %), so the needle can never point at a colour the badge
 * contradicts. A withheld verdict draws no gauge: [WithheldPriceCard] says why.
 * [onExplainClick] opens the explain sheet (owned by DetailScreen).
 */
@Composable
fun FmvGauge(
    verdict: PriceVerdict,
    askingLkr: Double?,
    confidence: String?,
    onExplainClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (verdict !is PriceVerdict.Ok || askingLkr == null) {
        WithheldPriceCard(verdict as? PriceVerdict.Withheld ?: PriceVerdict.Withheld(lk.motormila.app.core.price.WithheldReason.NO_PRICE, null), modifier)
        return
    }
    val reducedMotion = rememberReducedMotion()
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(verdict) { started = true }
    val fraction = gaugeFraction(askingLkr / verdict.referenceLkr)
    val animated by animateFloatAsState(
        // Signature needle: sweeps in from the left stop, overshoots past the
        // reading and settles with a damped wobble (under-damped spring).
        targetValue = if (started) fraction else 0f,
        animationSpec = if (reducedMotion) snap() else spring(dampingRatio = 0.42f, stiffness = 110f),
        label = "fmv-needle",
    )
    val c = MmColors.current
    val track = c.surfaceHigh
    val good = c.dealGood
    val fair = c.dealFair
    val high = c.dealHigh
    // Needle follows the text colour so it reads on light and dark cards.
    val needle = MaterialTheme.colorScheme.onSurface
    val hub = MaterialTheme.colorScheme.surface
    val gaugePress = remember { MutableInteractionSource() }
    val headline = verdict.headline()
    val toneColors = c.deal(verdict.tone)
    val typicalLabel = androidx.compose.ui.res.stringResource(lk.motormila.app.R.string.mm_why_typical)
    Column(
        modifier = modifier
            .applePress(gaugePress)
            .semantics {
                contentDescription = "$headline. $typicalLabel ${LkrFormat.full(verdict.referenceLkr)}, " +
                    "${LkrFormat.full(askingLkr)}"
            }
            .clickable(
                role = Role.Button,
                onClickLabel = "Explain valuation",
                interactionSource = gaugePress,
                indication = null,
                onClick = onExplainClick,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Canvas(modifier = Modifier.width(120.dp).height(68.dp)) {
            val stroke = 10.dp.toPx()
            // A true semicircle whose centre is the needle pivot.
            val cx = size.width / 2f
            val cy = size.height - stroke / 2f
            val arcR = minOf(size.width / 2f - stroke / 2f, cy - stroke / 2f)
            val arcTopLeft = Offset(cx - arcR, cy - arcR)
            val arcSize = Size(arcR * 2f, arcR * 2f)
            drawArc(
                color = track,
                startAngle = 180f,
                sweepAngle = 180f,
                useCenter = false,
                topLeft = arcTopLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Butt),
            )
            // Segments on the verdict bands: below | near typical | above.
            val belowEnd = gaugeFraction(1 - PriceVerdicts.BELOW_PCT / 100.0) * 180f
            val aboveStart = gaugeFraction(1 + PriceVerdicts.ABOVE_PCT / 100.0) * 180f
            listOf(
                Triple(0f, belowEnd, good),
                Triple(belowEnd, aboveStart - belowEnd, fair),
                Triple(aboveStart, 180f - aboveStart, high),
            ).forEach { (start, sweep, color) ->
                drawArc(
                    color = color,
                    startAngle = 180f + start,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = arcTopLeft,
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Butt),
                )
            }
            // Needle.
            val r = arcR - stroke
            val angle = Math.PI * (1.0 - animated)
            val tip = Offset(
                cx + (r * Math.cos(angle)).toFloat(),
                cy - (r * Math.sin(angle)).toFloat(),
            )
            drawLine(needle.copy(alpha = 0.85f), Offset(cx, cy), tip, strokeWidth = 4.dp.toPx(), cap = StrokeCap.Round)
            drawCircle(needle, radius = 5.dp.toPx(), center = Offset(cx, cy))
            drawCircle(hub, radius = 2.dp.toPx(), center = Offset(cx, cy))
        }
        Text(
            text = headline,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            color = if (verdict.tone == MmDealTone.FAIR) c.textPrimary else toneColors.solid,
            textAlign = TextAlign.Center,
        )
        Text(
            text = LkrFormat.full(verdict.referenceLkr),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = androidx.compose.ui.res.stringResource(lk.motormila.app.R.string.mm_fmv_hint, confidenceWord(confidence)),
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/** Asking / typical ratio 0.7…1.3 → 0…1 along the arc. */
private fun gaugeFraction(ratio: Double): Float = ((ratio - 0.7) / 0.6).toFloat().coerceIn(0f, 1f)

/**
 * No rating, said plainly: why we don't compare this price (unusable price,
 * lease / rent, parts, inconsistent or too little data). Never a fake number.
 */
@Composable
fun WithheldPriceCard(verdict: PriceVerdict.Withheld, modifier: Modifier = Modifier) {
    val c = MmColors.current
    val t = MmType.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            androidx.compose.ui.res.stringResource(lk.motormila.app.R.string.mm_price_check_title),
            style = t.labelS,
            color = c.textSecondary,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Info, contentDescription = null, tint = c.textSecondary, modifier = Modifier.size(18.dp))
            Text(verdict.headline(), style = t.titleS, color = c.textPrimary)
        }
        Text(verdict.detail(), style = t.bodyS, color = c.textSecondary)
    }
}
