package lk.motormila.app.ui.theme

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Spring press-scale driven by an [InteractionSource] (buttons, cards, FABs).
 * Uses [graphicsLayer] so the scale never triggers a layout pass. Reduced
 * motion skips the scale entirely.
 */
fun Modifier.applePress(
    interactionSource: InteractionSource,
    pressedScale: Float = 0.97f,
): Modifier = composed {
    val pressed by interactionSource.collectIsPressedAsState()
    applePressScale(pressed = pressed, pressedScale = pressedScale)
}

/** Same spring scale when the caller already owns a pressed boolean. */
fun Modifier.applePressScale(
    pressed: Boolean,
    pressedScale: Float = 0.97f,
): Modifier = composed {
    val reduce = ReduceMotion.current
    val scale by animateFloatAsState(
        targetValue = if (pressed && !reduce) pressedScale else 1f,
        animationSpec = MmMotion.orSnap(reduce, pressSpring()),
        label = "apple-press",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
