package lk.motormila.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.motormila.app.core.motion.motionSpec
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.ui.theme.rememberHaptics
import lk.motormila.app.ui.theme.ringSpring

/**
 * 36dp animated sweep ring for deal scores (theme [ringSpring]; snaps
 * instantly when reduced motion is on). Fires a haptic tick when score >= 8.
 */
@Composable
fun DealRing(
    score: Double?,
    band: DealBand,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    /** Ring text, e.g. "−12%" / "+6%" vs typical (the verdict's percent). Default: the raw score. */
    label: String? = null,
    /** Spoken description (the verdict headline). Default: "Deal score …". */
    description: String? = null,
) {
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(score) {
        started = true
        if (!reducedMotion && (score ?: 0.0) >= 8.0) {
            haptics.tick()
        }
    }
    val sweepTarget = when {
        score == null -> 0f
        score <= 0 -> 0.12f
        else -> (score / 10.0).toFloat().coerceIn(0.12f, 1f)
    }
    val sweep by animateFloatAsState(
        targetValue = if (started) sweepTarget else 0f,
        animationSpec = if (reducedMotion) motionSpec(reducedMotion) else ringSpring(),
        label = "deal-ring-sweep",
    )
    val track = MaterialTheme.colorScheme.surfaceVariant
    val bar = when (band) {
        DealBand.GREAT -> lk.motormila.app.ui.theme.MotormilaGood
        DealBand.FAIR -> lk.motormila.app.ui.theme.MotormilaPrimary
        DealBand.HIGH -> lk.motormila.app.ui.theme.MotormilaBad
        DealBand.LOCKED -> lk.motormila.app.ui.theme.MotormilaOutline
    }
    Box(
        modifier = modifier
            .size(size)
            .semantics {
                contentDescription = description
                    ?: if (score == null) "Deal score locked" else "Deal score %.1f".format(score)
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(size)) {
            drawArc(
                color = track,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round),
            )
            if (sweep > 0.001f) {
                drawArc(
                    color = bar,
                    startAngle = -90f,
                    sweepAngle = 360f * sweep,
                    useCenter = false,
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
        Text(
            text = label ?: if (score == null) "–" else "%.0f".format(score),
            // A percent label ("−12%") is fixed-size so it stays inside the 36dp ring at
            // 200 % font scale; the same figure is spoken via [description] and shown
            // full-size in the badge next to it.
            fontSize = if (label != null) with(androidx.compose.ui.platform.LocalDensity.current) { 10.dp.toSp() } else 11.sp,
            maxLines = 1,
            softWrap = false,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
