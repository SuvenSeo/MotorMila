package lk.motormila.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
    val bg = color ?: when (style) {
        MmCardStyle.Filled -> c.surface
        MmCardStyle.Outlined -> Color.Transparent
        MmCardStyle.Elevated -> c.surfaceRaised
    }
    Column(
        modifier = modifier
            .then(if (onClick != null) Modifier.mmPress(interaction) else Modifier)
            .clip(shape)
            .background(bg)
            .border(1.dp, if (style == MmCardStyle.Outlined) c.outlineStrong else c.outline, shape)
            .then(
                if (onClick != null) {
                    Modifier.clickable(
                        interactionSource = interaction,
                        indication = ripple(),
                        role = Role.Button,
                        onClickLabel = onClickLabel,
                        onClick = onClick,
                    )
                } else {
                    Modifier
                },
            )
            .padding(contentPadding),
        content = content,
    )
}
