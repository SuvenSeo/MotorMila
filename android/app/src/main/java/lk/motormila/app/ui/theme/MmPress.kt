package lk.motormila.app.ui.theme

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Press-scale (0.97 by default) driven by an [InteractionSource]: snappy
 * spring down/up on the graphics layer only (no relayout). No-op when the
 * system "Remove animations" setting is on.
 */
fun Modifier.mmPress(
    interactionSource: InteractionSource,
    pressedScale: Float = MmMotion.PressScale,
): Modifier = composed {
    val pressed by interactionSource.collectIsPressedAsState()
    val reduced = MmMotion.reduced
    val scale by animateFloatAsState(
        targetValue = if (pressed && !reduced) pressedScale else 1f,
        animationSpec = MmMotion.snappy(),
        label = "mm-press",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
