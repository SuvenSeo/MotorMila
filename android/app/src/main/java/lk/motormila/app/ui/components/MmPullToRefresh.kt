package lk.motormila.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshState
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmShapes

/**
 * Pull-to-refresh with the house indicator: a small raised disc that
 * follows the pull, drawing a brand arc as the pull approaches the threshold
 * (with a tick haptic when it arms), then a spinner while refreshing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MmPullToRefresh(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    state: PullToRefreshState = rememberPullToRefreshState(),
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
        indicator = { MmRefreshIndicator(state, isRefreshing, Modifier.align(Alignment.TopCenter)) },
        content = content,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MmRefreshIndicator(state: PullToRefreshState, refreshing: Boolean, modifier: Modifier) {
    val c = MmColors.current
    val fraction = if (refreshing) 1f else state.distanceFraction.coerceIn(0f, 1.5f)
    if (fraction <= 0f && !refreshing) return
    Box(
        modifier
            .graphicsLayer {
                translationY = (fraction.coerceAtMost(1f) * 64.dp.toPx()) - 20.dp.toPx()
                alpha = fraction.coerceIn(0f, 1f)
                val s = 0.7f + 0.3f * fraction.coerceIn(0f, 1f)
                scaleX = s
                scaleY = s
            }
            .padding(top = 8.dp)
            .size(40.dp)
            .shadow(8.dp, MmShapes.pill)
            .clip(MmShapes.pill)
            .background(c.surfaceHigh)
            .border(1.dp, c.outline, MmShapes.pill),
        contentAlignment = Alignment.Center,
    ) {
        if (refreshing) {
            CircularProgressIndicator(
                color = c.brand,
                strokeWidth = 2.dp,
                trackColor = c.outline,
                modifier = Modifier.size(20.dp),
            )
        } else {
            Canvas(Modifier.size(20.dp)) {
                drawArc(
                    color = c.brand,
                    startAngle = -90f,
                    sweepAngle = 360f * fraction.coerceAtMost(1f),
                    useCenter = false,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
    }
}
