package lk.motormila.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.mmPress
import lk.motormila.app.ui.components.mmWobbleOnSelect

/**
 * Filter / choice chip. 36dp visual height inside a 48dp touch row when used
 * in a FlowRow with vertical spacing. Selected = brand container + brand text;
 * colour change is a tween (never a bouncing colour). Toggle haptic on tap.
 */
@Composable
fun MmChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val interaction = remember { MutableInteractionSource() }
    val dur = if (MmMotion.reduced) 0 else MmMotion.Fast
    val bg by animateColorAsState(if (selected) c.brandContainer else c.surfaceRaised, tween(dur), label = "chip-bg")
    val fg by animateColorAsState(if (selected) c.onBrandContainer else c.textPrimary, tween(dur), label = "chip-fg")
    val bd by animateColorAsState(if (selected) c.brand.copy(alpha = 0.45f) else c.outline, tween(dur), label = "chip-bd")
    Box(
        modifier = modifier
            .heightIn(min = 36.dp)
            .mmWobbleOnSelect(selected)
            .mmPress(interaction, 0.95f)
            .clip(MmShapes.pill)
            .background(bg)
            .border(1.dp, bd, MmShapes.pill)
            .semantics { this.selected = selected }
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Checkbox,
            ) {
                haptics.toggle()
                onClick()
            }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leadingIcon != null) Icon(leadingIcon, null, tint = fg, modifier = Modifier.size(16.dp))
            Text(label, style = MmType.current.labelS, color = fg, maxLines = 1)
            if (trailingIcon != null) Icon(trailingIcon, null, tint = fg, modifier = Modifier.size(16.dp))
        }
    }
}
