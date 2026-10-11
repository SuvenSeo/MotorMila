package lk.motormila.app.ui.components

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
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.ui.theme.applePress

/**
 * 120dp semicircular FMV gauge. Needle position = asking vs FMV band.
 * [onExplainClick] opens the explain sheet (owned by DetailScreen).
 */
@Composable
fun FmvGauge(
    fmv: Fmv,
    onExplainClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(fmv) { started = true }
    val fraction = when {
        fmv.fmvLkr == null || fmv.fmvLkr <= 0 -> 0.5f
        else -> (((fmv.askingLkr / fmv.fmvLkr) - 0.7) / 0.6).toFloat()
    }.coerceIn(0f, 1f)
    val animated by animateFloatAsState(
        targetValue = if (started) fraction else 0.5f,
        animationSpec = tween(if (reducedMotion) 1 else 700),
        label = "fmv-needle",
    )
    val track = MaterialTheme.colorScheme.surfaceVariant
    val good = MaterialTheme.colorScheme.primary
    val warn = MaterialTheme.colorScheme.secondary
    val bad = MaterialTheme.colorScheme.error
    val gaugePress = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .applePress(gaugePress)
            .semantics {
                contentDescription = "Fair market value ${LkrFormat.full(fmv.fmvLkr)}, " +
                    "asking ${LkrFormat.full(fmv.askingLkr)}, ${fmv.label}"
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
            // Background semicircle + colored thirds.
            drawArc(
                color = track,
                startAngle = 180f,
                sweepAngle = 180f,
                useCenter = false,
                style = Stroke(width = stroke, cap = StrokeCap.Butt),
            )
            val thirds = listOf(good, good, warn, warn, bad, bad)
            thirds.forEachIndexed { i, c ->
                drawArc(
                    color = c,
                    startAngle = 180f + i * 30f,
                    sweepAngle = 30f,
                    useCenter = false,
                    style = Stroke(width = stroke, cap = StrokeCap.Butt),
                )
            }
            // Needle.
            val cx = size.width / 2f
            val cy = size.height - stroke / 2f
            val r = size.width / 2f - stroke
            val angle = Math.PI * (1.0 - animated)
            val tip = Offset(
                cx + (r * Math.cos(angle)).toFloat(),
                cy - (r * Math.sin(angle)).toFloat(),
            )
            drawLine(Color.Black.copy(alpha = 0.75f), Offset(cx, cy), tip, strokeWidth = 4.dp.toPx(), cap = StrokeCap.Round)
            drawCircle(Color.Black.copy(alpha = 0.75f), radius = 5.dp.toPx(), center = Offset(cx, cy))
            drawCircle(Color.White, radius = 2.dp.toPx(), center = Offset(cx, cy))
        }
        Text(
            text = LkrFormat.full(fmv.fmvLkr),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "FMV · ${fmv.confidence} confidence · tap to explain",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
