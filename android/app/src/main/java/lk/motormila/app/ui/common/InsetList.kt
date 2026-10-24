package lk.motormila.app.ui.common

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.MmHaptics

/** Corner radius of grouped inset sections (iOS Settings-like). */
val InsetShape = RoundedCornerShape(24.dp)

/**
 * A grouped inset section: optional small header above, rounded surface
 * holding [InsetRow]s separated by inset hairlines, optional footer note.
 */
@Composable
fun InsetGroup(
    modifier: Modifier = Modifier,
    header: String? = null,
    footer: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth()) {
        if (header != null) {
            Text(
                header.uppercase(),
                style = MmType.current.overline,
                fontWeight = FontWeight.SemiBold,
                color = MmColors.current.textSecondary,
                modifier = Modifier.padding(start = 16.dp, bottom = 6.dp),
            )
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(InsetShape)
                .background(MmColors.current.surface),
            content = content,
        )
        if (footer != null) {
            Text(
                footer,
                style = MmType.current.bodyS,
                color = MmColors.current.textSecondary,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp),
            )
        }
    }
}

/** Rounded square icon tile used at the start of inset rows. */
@Composable
fun InsetIcon(icon: ImageVector, tint: Color = MmColors.current.brand) {
    Box(
        Modifier
            .size(30.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(tint.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
    }
}

/** Press feedback: scale 0.98 + dim, skipped when animations are off. */
@Composable
private fun Modifier.rowPress(interaction: MutableInteractionSource): Modifier {
    val reduced = MmMotion.reduced
    val pressed by interaction.collectIsPressedAsState()
    val bg by animateColorAsState(
        if (pressed && !reduced) MmColors.current.textPrimary.copy(alpha = 0.06f) else Color.Transparent,
        label = "row-press-bg",
    )
    return this.background(bg)
}

/**
 * One row in an [InsetGroup]. Trailing: [value] text, a [trailing] slot, or a
 * chevron when [onClick] is set and no trailing slot is given.
 */
@Composable
fun InsetRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    iconTint: Color = MmColors.current.brand,
    value: String? = null,
    titleColor: Color = MmColors.current.textPrimary,
    showDivider: Boolean = true,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .then(
                    if (onClick != null) {
                        Modifier
                            .rowPress(interaction)
                            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick)
                    } else {
                        Modifier
                    },
                )
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                InsetIcon(icon, iconTint)
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MmType.current.bodyL, color = titleColor, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle,
                        style = MmType.current.bodyS,
                        color = MmColors.current.textSecondary,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (value != null) {
                Spacer(Modifier.width(8.dp))
                Text(value, style = MmType.current.bodyM, color = MmColors.current.textSecondary, maxLines = 1)
            }
            if (trailing != null) {
                Spacer(Modifier.width(8.dp))
                trailing()
            } else if (onClick != null) {
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MmColors.current.textSecondary)
            }
        }
        if (showDivider) InsetDivider(indent = if (icon != null) 58.dp else 16.dp)
    }
}

@Composable
fun InsetDivider(indent: androidx.compose.ui.unit.Dp = 16.dp) {
    Box(
        Modifier
            .padding(start = indent)
            .fillMaxWidth()
            .height(0.5.dp)
            .background(MmColors.current.outline),
    )
}

/** Switch row; whole row toggles, with a haptic tick (skipped with animations off). */
@Composable
fun InsetSwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    iconTint: Color = MmColors.current.brand,
    showDivider: Boolean = true,
    enabled: Boolean = true,
) {
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    val toggle: (Boolean) -> Unit = {
        if (!reduced) haptics.toggle()
        onCheckedChange(it)
    }
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = toggle)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                InsetIcon(icon, iconTint)
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MmType.current.bodyL, color = MmColors.current.textPrimary)
                if (!subtitle.isNullOrBlank()) {
                    Text(subtitle, style = MmType.current.bodyS, color = MmColors.current.textSecondary)
                }
            }
            Switch(checked = checked, onCheckedChange = null, enabled = enabled)
        }
        if (showDivider) InsetDivider(indent = if (icon != null) 58.dp else 16.dp)
    }
}

/** Segmented control (theme picker etc.) with a sliding selected pill. */
@Composable
fun MmSegmented(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MmColors.current.surfaceHigh)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEachIndexed { i, label ->
            val selected = i == selectedIndex
            val bg by animateColorAsState(
                if (selected) MmColors.current.brand else Color.Transparent,
                label = "seg-bg",
            )
            val scale by animateFloatAsState(if (selected && !reduced) 1f else 0.98f, label = "seg-scale")
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 36.dp)
                    .graphicsLayer { scaleX = scale; scaleY = scale }
                    .clip(RoundedCornerShape(10.dp))
                    .background(bg)
                    .clickable(role = Role.RadioButton) {
                        if (!selected) {
                            if (!reduced) haptics.toggle()
                            onSelect(i)
                        }
                    }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                CompositionLocalProvider(
                    LocalContentColor provides if (selected) MmColors.current.textOnBrand else MmColors.current.textPrimary,
                ) {
                    Text(label, style = MmType.current.label, color = LocalContentColor.current, maxLines = 1)
                }
            }
        }
    }
}
