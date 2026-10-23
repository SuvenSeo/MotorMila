package lk.motormila.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmPress

enum class MmButtonStyle { Primary, Secondary, Tonal, Ghost, Destructive }
enum class MmButtonSize(val height: Dp, val hPad: Dp, val icon: Dp) {
    Small(36.dp, 14.dp, 16.dp),
    Medium(48.dp, 20.dp, 18.dp),
    Large(56.dp, 24.dp, 20.dp),
}

/**
 * Pill button. Press-scale 0.97 with a snappy spring, key-press haptic,
 * 48dp minimum touch target. [loading] swaps the label for a spinner while
 * keeping width stable.
 */
@Composable
fun MmButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: MmButtonStyle = MmButtonStyle.Primary,
    size: MmButtonSize = MmButtonSize.Medium,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    haptic: Boolean = true,
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val (bg, fg, border) = when (style) {
        MmButtonStyle.Primary -> Triple(c.brand, c.textOnBrand, null)
        MmButtonStyle.Secondary -> Triple(c.surfaceRaised, c.textPrimary, c.outlineStrong)
        MmButtonStyle.Tonal -> Triple(c.brandContainer, c.onBrandContainer, null)
        MmButtonStyle.Ghost -> Triple(Color.Transparent, c.brandText, null)
        MmButtonStyle.Destructive -> Triple(c.dealHighContainer, c.onDealHigh, null)
    }
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = maxOf(size.height, 48.dp))
            .mmPress(interaction)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(MmShapes.pill)
            .background(bg)
            .then(if (border != null) Modifier.border(BorderStroke(1.dp, border), MmShapes.pill) else Modifier)
            .clickable(
                interactionSource = interaction,
                indication = ripple(color = fg),
                enabled = enabled && !loading,
                role = Role.Button,
            ) {
                if (haptic) haptics.press()
                onClick()
            }
            .padding(PaddingValues(horizontal = size.hPad, vertical = 6.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.alpha(if (loading) 0f else 1f),
        ) {
            if (leadingIcon != null) Icon(leadingIcon, null, tint = fg, modifier = Modifier.size(size.icon))
            Text(
                text = text,
                style = if (size == MmButtonSize.Small) MmType.current.labelS else MmType.current.label,
                color = fg,
                // Two centred lines before ellipsis: long labels at 200 % / in
                // si-ta ("Sign in or create acco…") stay whole.
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            if (trailingIcon != null) Icon(trailingIcon, null, tint = fg, modifier = Modifier.size(size.icon))
        }
        if (loading) {
            CircularProgressIndicator(
                color = fg,
                strokeWidth = 2.dp,
                modifier = Modifier.size(size.icon),
            )
        }
    }
}

enum class MmIconButtonStyle { Plain, Filled, Glass }

/**
 * 48dp round icon button (visual 40dp). [Glass] sits on imagery: dark
 * translucent disc with white glyph. [selected] tints the glyph [selectedTint].
 */
@Composable
fun MmIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: MmIconButtonStyle = MmIconButtonStyle.Plain,
    tint: Color? = null,
    enabled: Boolean = true,
    visualSize: Dp = 40.dp,
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val interaction = remember { MutableInteractionSource() }
    val (bg, fg) = when (style) {
        MmIconButtonStyle.Plain -> Color.Transparent to c.textPrimary
        MmIconButtonStyle.Filled -> c.surfaceHigh to c.textPrimary
        MmIconButtonStyle.Glass -> Color(0x8C000000) to Color.White
    }
    Box(
        modifier = modifier
            .size(48.dp)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
            ) {
                haptics.press()
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(visualSize)
                .mmPress(interaction, 0.92f)
                .clip(MmShapes.pill)
                .background(bg)
                .alpha(if (enabled) 1f else 0.4f),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription, tint = tint ?: fg, modifier = Modifier.size(20.dp))
        }
    }
}
