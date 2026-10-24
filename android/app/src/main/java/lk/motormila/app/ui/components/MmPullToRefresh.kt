package lk.motormila.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshState
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import lk.motormila.app.ui.theme.GlassWeight
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.liquidGlass
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmShapes

/**
 * Pull-to-refresh with the signature **wheel** indicator: a liquid-glass disc
 * holding a drawn alloy wheel (tyre, rim, five spokes) that *rolls* with the
 * pull distance, stretches past the threshold (rubber-band scale) and ticks a
 * haptic when it arms; while refreshing the wheel spins up like a car
 * pulling away. [indicatorTop] places it below an overlaid glass header.
 * All per-frame values are read in draw/graphics-layer lambdas only.
 * Reduced motion: no roll/spin — a static wheel with a brand ring.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MmPullToRefresh(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    state: PullToRefreshState = rememberPullToRefreshState(),
    indicatorTop: Dp = 0.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    val haptics = MmHaptics.current
    var armed by remember { mutableStateOf(false) }
    LaunchedEffect(state) {
        snapshotFlow { state.distanceFraction >= 1f }.collect { now ->
            if (now && !armed) haptics.toggle()
            armed = now
        }
    }
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = modifier,
        state = state,
        indicator = {
            MmWheelIndicator(
                state,
                isRefreshing,
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = indicatorTop),
            )
        },
        content = content,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MmWheelIndicator(state: PullToRefreshState, refreshing: Boolean, modifier: Modifier) {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    val spin = remember { Animatable(0f) }
    LaunchedEffect(refreshing, reduced) {
        if (refreshing && !reduced) {
            // Spin up (ease-in), then cruise.
            spin.animateTo(spin.value + 360f, tween(520, easing = MmMotion.Exit))
            while (true) {
                spin.animateTo(spin.value + 360f, tween(620, easing = LinearEasing))
            }
        }
    }
    val tyre = if (c.isDark) Color(0xFFE6E6EA) else Color(0xFF1D1D22)
    val rim = c.brand
    Box(
        modifier
            .graphicsLayer {
                val f = if (refreshing) 1f else state.distanceFraction.coerceIn(0f, 2f)
                val shown = f > 0f || refreshing
                alpha = if (shown) f.coerceIn(0f, 1f) else 0f
                translationY = f.coerceAtMost(1f) * 64.dp.toPx() - 24.dp.toPx() +
                    // rubber band past the threshold
                    (f - 1f).coerceAtLeast(0f) * 18.dp.toPx()
                val over = (f - 1f).coerceAtLeast(0f)
                val s = (0.6f + 0.4f * f.coerceIn(0f, 1f)) * (1f + over * 0.12f)
                scaleX = s
                scaleY = s
            }
            .padding(top = 8.dp)
            .size(44.dp)
            .liquidGlass(MmShapes.pill, GlassWeight.Thick, elevation = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(28.dp)) {
            val f = if (refreshing) 1f else state.distanceFraction.coerceIn(0f, 2f)
            val angle = if (reduced) 0f else if (refreshing) spin.value else f * 300f
            val r = size.minDimension / 2f
            val ctr = center
            // Tyre
            drawCircle(tyre, radius = r, center = ctr)
            // Rim
            drawCircle(Color.White.copy(alpha = if (c.isDark) 0.9f else 1f), radius = r * 0.66f, center = ctr)
            drawCircle(rim, radius = r * 0.66f, center = ctr, style = Stroke(width = r * 0.12f))
            rotate(angle, ctr) {
                for (k in 0 until 5) {
                    rotate(k * 72f, ctr) {
                        drawLine(
                            rim,
                            start = ctr,
                            end = androidx.compose.ui.geometry.Offset(ctr.x, ctr.y - r * 0.6f),
                            strokeWidth = r * 0.16f,
                            cap = StrokeCap.Round,
                        )
                    }
                }
                // Valve dot so the roll reads even with symmetric spokes.
                drawCircle(tyre.copy(alpha = 0.55f), radius = r * 0.07f, center = androidx.compose.ui.geometry.Offset(ctr.x + r * 0.5f, ctr.y))
            }
            drawCircle(rim, radius = r * 0.16f, center = ctr)
            // Arming ring (how far to pull)
            if (!refreshing && f < 1f) {
                drawArc(
                    color = rim.copy(alpha = 0.35f),
                    startAngle = -90f,
                    sweepAngle = 360f * f,
                    useCenter = false,
                    topLeft = androidx.compose.ui.geometry.Offset(ctr.x - r - 3.dp.toPx(), ctr.y - r - 3.dp.toPx()),
                    size = androidx.compose.ui.geometry.Size((r + 3.dp.toPx()) * 2, (r + 3.dp.toPx()) * 2),
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
    }
}
