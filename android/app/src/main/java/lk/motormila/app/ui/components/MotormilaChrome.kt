package lk.motormila.app.ui.components

import lk.motormila.app.ui.theme.tabular
import androidx.compose.material3.LocalTextStyle
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import lk.motormila.app.ui.theme.MotormilaGlassBorder
import lk.motormila.app.ui.theme.MotormilaGlassFill
import lk.motormila.app.ui.theme.MotormilaGlassFillStrong
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPill
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBorder
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimarySoft
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface
import lk.motormila.app.ui.theme.applePress
import lk.motormila.app.ui.theme.appleTween
import lk.motormila.app.ui.theme.fluidSpring
import lk.motormila.app.ui.theme.liquidGlass
import lk.motormila.app.ui.theme.rememberHaptics

val MotormilaCardShape = MotormilaRadius.lg

/** Signature context capsule — `MARKET PULSE`, `BEST PICKS`. */
@Composable
fun MotormilaEyebrow(
    text: String,
    modifier: Modifier = Modifier,
    accent: Boolean = true,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(CircleShape)
            .background(MotormilaSurface)
            .border(
                1.dp,
                if (accent) Color(0x440A7AFF) else MotormilaGlassBorder,
                CircleShape,
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(if (accent) MotormilaPrimaryBright else Color(0xFF00C853)),
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = text.uppercase(),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
            color = if (accent) MotormilaPrimaryBright else MotormilaOnSurface,
        )
    }
}

@Composable
fun MotormilaHero(
    eyebrow: String,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    accentWord: String? = null,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        MotormilaEyebrow(eyebrow)
        Spacer(Modifier.height(14.dp))
        if (accentWord != null && title.contains(accentWord)) {
            val before = title.substringBefore(accentWord)
            val after = title.substringAfter(accentWord)
            Row {
                Text(
                    text = before,
                    color = MotormilaOnSurface,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                    letterSpacing = (-0.035).em,
                )
            }
            Text(
                text = buildString {
                    append(accentWord)
                    append(after)
                },
                color = MotormilaPrimaryBright,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 28.sp,
                lineHeight = 34.sp,
                letterSpacing = (-0.035).em,
            )
        } else {
            Text(
                text = title,
                color = MotormilaOnSurface,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 28.sp,
                lineHeight = 34.sp,
                letterSpacing = (-0.035).em,
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = subtitle,
            color = MotormilaSecondaryText,
            fontSize = 14.sp,
            lineHeight = 21.sp,
        )
    }
}

@Composable
fun MotormilaSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    action: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        if (!eyebrow.isNullOrBlank()) {
            Text(
                text = eyebrow.uppercase(),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.4.sp,
                color = MotormilaPrimaryBright,
            )
            Spacer(Modifier.height(6.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = title,
                fontWeight = FontWeight.SemiBold,
                fontSize = 18.sp,
                color = MotormilaOnSurface,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (action != null && onAction != null) {
                val actionPress = remember { MutableInteractionSource() }
                Text(
                    text = action,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MotormilaPrimaryBright,
                    modifier = Modifier
                        .applePress(actionPress)
                        .clip(CircleShape)
                        .clickable(interactionSource = actionPress, indication = null, onClick = onAction)
                        .padding(horizontal = 8.dp, vertical = 6.dp)
                        .semantics { contentDescription = action },
                )
            }
        }
    }
}

@Composable
fun MotormilaSurface(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    highlighted: Boolean = false,
    fillMaxWidth: Boolean = true,
    specular: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable ColumnScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val shape = MotormilaCardShape
    val fill = if (highlighted) MotormilaPrimarySoft else MotormilaGlassFillStrong
    val border = if (highlighted) MotormilaPrimaryBorder else MotormilaGlassBorder
    val clickMod = if (onClick != null) {
        Modifier
            .applePress(interaction)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
    } else {
        Modifier
    }
    Column(
        modifier = modifier
            .then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)
            .then(clickMod)
            .liquidGlass(shape, fill = fill, border = border, specular = specular)
            .padding(contentPadding),
        verticalArrangement = verticalArrangement,
        content = content,
    )
}

/** Flush glass plate for image-led cards (listing tiles, banners). No inner padding. */
@Composable
fun MotormilaGlass(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    highlighted: Boolean = false,
    specular: Boolean = false,
    content: @Composable BoxScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val shape = MotormilaCardShape
    val fill = if (highlighted) MotormilaPrimarySoft else MotormilaGlassFillStrong
    val border = if (highlighted) MotormilaPrimaryBorder else MotormilaGlassBorder
    val clickMod = if (onClick != null) {
        Modifier
            .applePress(interaction)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
    } else {
        Modifier
    }
    Box(
        modifier = modifier
            .then(clickMod)
            .liquidGlass(shape, fill = fill, border = border, specular = specular),
        content = content,
    )
}

@Composable
fun MotormilaTopBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .liquidGlass(CircleShape, fill = MotormilaGlassFill)
                .heightIn(min = 56.dp)
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier
                        .size(48.dp)
                        .semantics { contentDescription = "Back" },
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                        tint = MotormilaOnSurface,
                    )
                }
            } else {
                Spacer(Modifier.width(8.dp))
            }
            Text(
                text = title,
                fontWeight = FontWeight.SemiBold,
                fontSize = 17.sp,
                color = MotormilaOnSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            actions()
        }
    }
}

@Composable
fun MotormilaPillTabs(
    tabs: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val count = tabs.size.coerceAtLeast(1)
    val safeSelected = selected.coerceIn(0, count - 1)
    BoxWithConstraints(
        // Fixed height: the indicator/row use fillMaxHeight, so heightIn(min)
        // let them fill ALL remaining height inside a bounded Column — Official
        // Pulse rendered a full-screen pill and no content (QA 2026-10-21).
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .liquidGlass(MotormilaPill, fill = MotormilaGlassFill, specular = false)
            .padding(4.dp),
    ) {
        val gap = 4.dp
        val tabWidth = (maxWidth - gap * (count - 1)) / count
        val indicatorX by animateDpAsState(
            targetValue = (tabWidth + gap) * safeSelected,
            animationSpec = appleTween(280),
            label = "pill-x",
        )
        Box(
            modifier = Modifier
                .offset(x = indicatorX)
                .width(tabWidth)
                .fillMaxHeight()
                .clip(CircleShape)
                .background(MotormilaPrimary),
        )
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.spacedBy(gap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEachIndexed { index, label ->
                val isSelected = index == safeSelected
                val interaction = remember(label) { MutableInteractionSource() }
                val labelColor by animateColorAsState(
                    // White on the brand-blue indicator (was near-black on blue in light).
                    targetValue = if (isSelected) Color.White else MotormilaSecondaryText,
                    animationSpec = appleTween(220),
                    label = "pill-label",
                )
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .applePress(interaction, pressedScale = 0.96f)
                        .clickable(
                            interactionSource = interaction,
                            indication = null,
                            onClick = { onSelect(index) },
                        )
                        .semantics { contentDescription = label },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        color = labelColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** Horizontally scrolling capsules for five-plus destinations (Insights, Valuation). */
@Composable
fun MotormilaChipTabs(
    tabs: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEachIndexed { index, label ->
            val isSelected = index == selected
            val interaction = remember(label) { MutableInteractionSource() }
            val fill by animateColorAsState(
                targetValue = if (isSelected) MotormilaPrimary else MotormilaSurface,
                animationSpec = appleTween(220),
                label = "chip-fill",
            )
            val border by animateColorAsState(
                targetValue = if (isSelected) MotormilaPrimary else MotormilaGlassBorder,
                animationSpec = appleTween(220),
                label = "chip-border",
            )
            val scale by animateFloatAsState(
                targetValue = if (isSelected) 1f else 0.98f,
                animationSpec = fluidSpring(),
                label = "chip-scale",
            )
            Box(
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                    }
                    .applePress(interaction, pressedScale = 0.96f)
                    .clip(CircleShape)
                    .background(fill)
                    .border(1.dp, border, CircleShape)
                    .clickable(
                        interactionSource = interaction,
                        indication = null,
                        onClick = { onSelect(index) },
                    )
                    .padding(horizontal = 14.dp)
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (isSelected) MotormilaOnSurface else MotormilaOnSurface,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
fun MotormilaChoiceChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    compact: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val haptics = rememberHaptics()
    val interaction = remember(label) { MutableInteractionSource() }
    val fill by animateColorAsState(
        targetValue = when {
            selected -> MotormilaPrimary
            else -> lk.motormila.app.ui.theme.MotormilaSurfaceHigh
        },
        animationSpec = appleTween(200),
        label = "choice-fill",
    )
    val border by animateColorAsState(
        targetValue = if (selected) MotormilaPrimary else MotormilaGlassBorder,
        animationSpec = appleTween(200),
        label = "choice-border",
    )
    val labelColor by animateColorAsState(
        // White on the brand fill (was near-black on blue in light mode — low contrast).
        targetValue = if (selected) Color.White else if (enabled) MotormilaOnSurface else MotormilaSecondaryText,
        animationSpec = appleTween(200),
        label = "choice-label",
    )
    val scale by animateFloatAsState(
        targetValue = if (selected) 1f else 0.98f,
        animationSpec = fluidSpring(),
        label = "choice-scale",
    )
    // 48dp touch target, 36dp visible pill (was a 48dp blob that read as a
    // circle for short labels and touched the button below).
    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .applePress(interaction, pressedScale = 0.96f)
            .clickable(
                enabled = enabled,
                interactionSource = interaction,
                indication = null,
                onClick = { haptics.tick(); onClick() },
            )
            .semantics { contentDescription = label }
            .then(modifier),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier
                .heightIn(min = if (compact) 32.dp else 36.dp)
                .clip(CircleShape)
                .background(if (enabled) fill else fill.copy(alpha = 0.45f))
                .border(1.dp, border, CircleShape)
                .padding(horizontal = if (compact) 12.dp else 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leadingIcon != null) {
                Icon(
                    leadingIcon,
                    contentDescription = null,
                    tint = labelColor,
                    modifier = Modifier.size(if (compact) 14.dp else 16.dp),
                )
                Spacer(Modifier.width(6.dp))
            }
            Text(
                text = label,
                fontSize = if (compact) 12.sp else 13.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                color = labelColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun MotormilaPrimaryButton(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    fillMaxWidth: Boolean = true,
    leadingIcon: ImageVector? = null,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val canClick = enabled && !loading
    Box(
        modifier = modifier
            .then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)
            .heightIn(min = 48.dp)
            .applePress(interaction, pressedScale = 0.97f)
            .clip(CircleShape)
            .background(if (canClick) MotormilaPrimary else MotormilaPrimary.copy(alpha = 0.35f))
            .clickable(enabled = canClick, interactionSource = interaction, indication = null, onClick = onClick)
            // Inner padding: the label never touches the pill edge (was an outer
            // margin, so wrap-content buttons hugged their text — "Browse listings").
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (loading) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    color = Color.White,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(8.dp))
            } else if (leadingIcon != null) {
                Icon(
                    leadingIcon,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(
                text = label,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

@Composable
fun MotormilaGhostButton(
    label: String,
    modifier: Modifier = Modifier,
    fillMaxWidth: Boolean = true,
    leadingIcon: ImageVector? = null,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)
            .heightIn(min = 48.dp)
            .applePress(interaction, pressedScale = 0.97f)
            .clip(CircleShape)
            // Visible hairline in both themes (glass border vanished on light/dark grounds).
            .border(1.dp, lk.motormila.app.ui.theme.MmColors.current.outlineStrong, CircleShape)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (leadingIcon != null) {
                Icon(
                    leadingIcon,
                    contentDescription = null,
                    tint = MotormilaOnSurface,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(
                text = label,
                color = MotormilaOnSurface,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

@Composable
fun MotormilaListRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    trailing: String? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .applePress(interaction)
            .clip(MotormilaCardShape)
            .background(MotormilaSurface)
            .border(1.dp, MotormilaOutline, MotormilaCardShape)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics { contentDescription = "Open $title" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(MotormilaPrimarySoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = MotormilaPrimaryBright, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = MotormilaOnSurface)
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, fontSize = 12.sp, color = MotormilaSecondaryText, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (!trailing.isNullOrBlank()) {
            Text(trailing, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = MotormilaSecondaryText)
            Spacer(Modifier.width(6.dp))
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MotormilaSecondaryText)
    }
}

@Composable
fun MotormilaGroupRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    showDivider: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    Column(modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .applePress(interaction)
                .clickable(interactionSource = interaction, indication = null, onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .semantics { contentDescription = "Open $title" },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = MotormilaOnSurface)
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle,
                        fontSize = 12.sp,
                        color = MotormilaSecondaryText,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MotormilaSecondaryText)
        }
        if (showDivider) {
            MotormilaHairline(Modifier.padding(start = 16.dp))
        }
    }
}

@Composable
fun MotormilaMetricTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    note: String? = null,
) {
    Column(
        modifier = modifier
            .clip(MotormilaRadius.md)
            .background(MotormilaSurface)
            .border(1.dp, MotormilaOutline, MotormilaRadius.md)
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        // Overline label: one line, capped at 1.3x — at 200 % three-up tiles
        // broke it mid-word ("CURREN / T").
        lk.motormila.app.ui.theme.CappedFontScale(max = 1.3f) {
            Text(
                text = label.uppercase(),
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp,
                color = MotormilaSecondaryText,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = value,
            // Long values (e.g. "ENTERPRISE") shrink instead of truncating —
            // a metric tile must never ellipsis its headline value.
            fontSize = if (value.length > 8) 13.sp else 16.sp,
            fontWeight = FontWeight.Bold,
            style = LocalTextStyle.current.tabular(),
            color = MotormilaOnSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (!note.isNullOrBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(note, fontSize = 11.sp, lineHeight = 14.sp, color = MotormilaSecondaryText, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * [MotormilaMetricTile] variant whose value is a composable — used for animated
 * values such as the per-digit [NumberTicker].
 */
@Composable
fun MotormilaMetricTile(
    label: String,
    modifier: Modifier = Modifier,
    note: String? = null,
    valueContent: @Composable () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(MotormilaRadius.md)
            .background(MotormilaSurface)
            .border(1.dp, MotormilaOutline, MotormilaRadius.md)
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Text(
            text = label.uppercase(),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.8.sp,
            color = MotormilaSecondaryText,
        )
        Spacer(Modifier.height(4.dp))
        valueContent()
        if (!note.isNullOrBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(note, fontSize = 11.sp, lineHeight = 14.sp, color = MotormilaSecondaryText, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Hairline divider used inside grouped lists. */
@Composable
fun MotormilaHairline(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(MotormilaOutline),
    )
}

@Composable
fun MotormilaStatGlow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    footnote: String? = null,
) {
    MotormilaSurface(modifier = modifier) {
        Text(
            text = label.uppercase(),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.4.sp,
            color = MotormilaSecondaryText,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = value,
            fontSize = 36.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-0.03).em,
            color = MotormilaOnSurface,
        )
        if (!footnote.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(footnote, fontSize = 12.sp, color = MotormilaSecondaryText)
        }
    }
}

/** Inner sheen used on hero cards. */
fun motormilaHeroBrush(): Brush = Brush.verticalGradient(
    listOf(Color(0x220A7AFF), Color(0x000A7AFF)),
)

@Composable
fun MotormilaIconAction(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MotormilaOnSurface,
) {
    IconButton(
        onClick = onClick,
        modifier = modifier
            .size(48.dp)
            .semantics { this.contentDescription = contentDescription },
    ) {
        Icon(icon, contentDescription = null, tint = tint)
    }
}

/**
 * Shared push-screen chrome: floating title bar + overlay snackbar.
 * Parent [lk.motormila.app.ui.MotormilaScaffold] already owns system insets.
 */
@Composable
fun MotormilaPage(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    snackbarHostState: SnackbarHostState? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable () -> Unit,
) {
    Box(modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            MotormilaTopBar(title = title, onBack = onBack, actions = actions)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                content()
            }
        }
        if (snackbarHostState != null) {
            SnackbarHost(
                hostState = snackbarHostState,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}

@Composable
fun MotormilaGroup(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(MotormilaCardShape)
            .background(MotormilaSurface)
            .border(1.dp, MotormilaOutline, MotormilaCardShape),
        content = content,
    )
}
