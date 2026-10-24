package lk.motormila.app.ui.theme

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/**
 * Staggered cascade entrance: fade + 18dp rise + 0.97 → 1 scale on a soft
 * spring, staggered by [delayMillis]. All reads happen in the graphics layer
 * (no per-frame recomposition, safe in long lists). Skips entirely when the
 * user has reduced motion enabled.
 */
fun Modifier.motormilaReveal(
    visible: Boolean = true,
    delayMillis: Int = 0,
    @Suppress("UNUSED_PARAMETER") durationMillis: Int = 420,
): Modifier = composed {
    val reduce = ReduceMotion.current
    val progress = remember { Animatable(if (reduce || visible.not()) 1f else 0f) }
    LaunchedEffect(visible, reduce) {
        if (reduce) {
            progress.snapTo(1f)
            return@LaunchedEffect
        }
        if (visible) {
            if (delayMillis > 0) kotlinx.coroutines.delay(delayMillis.toLong())
            progress.animateTo(1f, spring(dampingRatio = 0.82f, stiffness = 260f))
        } else {
            progress.snapTo(0f)
        }
    }
    this.graphicsLayer {
        val t = progress.value
        alpha = t.coerceIn(0f, 1f)
        translationY = (1f - t) * 18.dp.toPx()
        val s = 0.97f + 0.03f * t
        scaleX = s
        scaleY = s
    }
}
