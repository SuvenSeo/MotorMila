package lk.motormila.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.mmPress

enum class MmCardStyle { Filled, Outlined, Elevated }

/**
 * Standard surface card: 20dp corners, hairline border, press-scale 0.97 on
 * the graphics layer when [onClick] is set. Content padding defaults to the
 * card padding token; pass PaddingValues(0.dp) for edge-to-edge imagery.
 */
@Composable
fun MmCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onClickLabel: String? = null,
    style: MmCardStyle = MmCardStyle.Filled,
    shape: Shape = MmShapes.lg,
    color: Color? = null,
    contentPadding: PaddingValues = PaddingValues(MmSpacing.cardPadding),
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = MmColors.current
    val interaction = remember { MutableInteractionSource() }
    val haptics = lk.motormila.app.ui.theme.MmHaptics.current
    val bg = color ?: when (style) {
        MmCardStyle.Filled -> c.surface
        MmCardStyle.Outlined -> Color.Transparent
        MmCardStyle.Elevated -> c.surfaceRaised
    }
    Column(
        modifier = modifier
            .then(if (onClick != null) Modifier.mmPress(interaction) else Modifier)
            // Light mode: depth from a soft, low-opacity shadow (Apple grouped
            // style), no hard outline. Dark mode keeps a hairline because
            // shadows vanish on near-black grounds.
            .then(
                if (!c.isDark && style != MmCardStyle.Outlined) {
                    Modifier.shadow(
                        elevation = if (style == MmCardStyle.Elevated) 14.dp else 8.dp,
                        shape = shape,
                        clip = false,
                        ambientColor = Color.Black.copy(alpha = 0.05f),
                        spotColor = Color.Black.copy(alpha = 0.10f),
                    )
                } else {
                    Modifier
                },
            )
            .clip(shape)
            .background(bg)
            .then(
                when {
                    style == MmCardStyle.Outlined -> Modifier.border(1.dp, c.outlineStrong, shape)
                    c.isDark -> Modifier.border(0.5.dp, c.outline, shape)
                    else -> Modifier
                },
            )
            .then(
                if (onClick != null) {
                    Modifier.clickable(
                        interactionSource = interaction,
                        indication = ripple(),
                        role = Role.Button,
                        onClickLabel = onClickLabel,
                    ) {
                        haptics.press()
                        onClick()
                    }
                } else {
                    Modifier
                },
            )
            .padding(contentPadding),
        content = content,
    )
}
