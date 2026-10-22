package lk.motormila.app.ui.theme

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.material3.ripple

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

/**
 * One-stop tappable for cards, rows and tiles: ripple + spring press-scale
 * (graphics layer only) + key-press haptic, with the same semantics as
 * [androidx.compose.foundation.clickable]. Reduced motion keeps the ripple
 * and haptic but drops the scale.
 */
fun Modifier.mmTappable(
    enabled: Boolean = true,
    onClickLabel: String? = null,
    role: androidx.compose.ui.semantics.Role? = null,
    pressedScale: Float = MmMotion.PressScale,
    haptic: Boolean = true,
    shape: androidx.compose.ui.graphics.Shape? = null,
    onClick: () -> Unit,
): Modifier = composed {
    val interaction = androidx.compose.runtime.remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val haptics = MmHaptics.current
    this
        .mmPress(interaction, pressedScale)
        .then(if (shape != null) Modifier.clip(shape) else Modifier)
        .then(
            Modifier.clickable(
                interactionSource = interaction,
                indication = ripple(),
                enabled = enabled,
                onClickLabel = onClickLabel,
                role = role,
            ) {
                if (haptic) haptics.press()
                onClick()
            },
        )
}
