package lk.motormila.app.ui.common

import lk.motormila.app.ui.theme.mmTappable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.ui.components.MmEmptyState
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmSheet
import lk.motormila.app.ui.components.MmSkeleton
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

/** Market direction → colour: up = amber (prices rising is bad for buyers), down = green, flat = grey. */
enum class Trend { UP, DOWN, STABLE }

fun trendOf(changePct: Double?, flatBand: Double = 0.5): Trend = when {
    changePct == null -> Trend.STABLE
    changePct > flatBand -> Trend.UP
    changePct < -flatBand -> Trend.DOWN
    else -> Trend.STABLE
}

@Composable
fun trendColor(trend: Trend): Color {
    val c = MmColors.current
    return when (trend) {
        Trend.UP -> c.caution
        Trend.DOWN -> c.dealGreat
        Trend.STABLE -> c.dealFair
    }
}

/**
 * Standard content padding for screen lists. Inside an edge-to-edge
 * [MmScreen] it also clears the glass header and the floating tab bar.
 */
val ScreenPadding: PaddingValues
    @Composable get() {
        val i = LocalMmScreenInsets.current
        return PaddingValues(
            start = MmSpacing.lg,
            end = MmSpacing.lg,
            top = MmSpacing.sm + i.top,
            bottom = MmSpacing.xxxl + i.bottom,
        )
    }

/** Skeleton placeholder for a card list (loading state). */
@Composable
fun ScreenSkeleton(modifier: Modifier = Modifier, rows: Int = 4) {
    Column(
        modifier.fillMaxWidth().padding(ScreenPadding),
        verticalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
    ) {
        MmSkeleton(width = 160.dp, height = 22.dp)
        repeat(rows) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(MmShapes.lg)
                    .background(MmColors.current.surface)
                    .padding(MmSpacing.cardPadding),
                verticalArrangement = Arrangement.spacedBy(MmSpacing.sm),
            ) {
                MmSkeleton(width = 120.dp, height = 12.dp)
                MmSkeleton(Modifier.fillMaxWidth(), height = 18.dp)
                MmSkeleton(width = 200.dp, height = 12.dp)
            }
        }
    }
}

/** Error with retry (centred). */
@Composable
fun ScreenError(
    message: String?,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier.fillMaxSize().mmScreenSafe().padding(MmSpacing.xxl), contentAlignment = Alignment.Center) {
        MmEmptyState(
            icon = Icons.Filled.CloudOff,
            title = stringResource(R.string.scr_error_title),
            message = message ?: stringResource(R.string.scr_error_body),
            primaryAction = stringResource(R.string.scr_retry) to onRetry,
        )
    }
}

/** Section title inside a screen list. */
@Composable
fun ScreenSectionTitle(text: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(top = MmSpacing.md, bottom = MmSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = MmType.current.titleM, color = MmColors.current.textPrimary, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

/** Stepper: [−] value [+], clamps to [range]; haptic on each step. */
@Composable
fun MmStepper(
    label: String,
    value: Int,
    onValueChange: (Int) -> Unit,
    range: IntRange,
    modifier: Modifier = Modifier,
    step: Int = 1,
    format: (Int) -> String = { it.toString() },
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    // Large Dynamic Type (> 1.3x): the label no longer fits beside − value + and broke
    // mid-word ("manufactur / e"), so it moves onto its own line above the controls.
    val largeText = androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.3f
    val controls: @Composable () -> Unit = {
        MmIconButton(
            icon = Icons.Filled.Remove,
            contentDescription = stringResource(R.string.scr_decrease, label),
            enabled = value - step >= range.first,
            onClick = { haptics.press(); onValueChange((value - step).coerceIn(range)) },
        )
        Text(
            format(value),
            style = MmType.current.numeric,
            color = c.textPrimary,
            modifier = Modifier.width(72.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        MmIconButton(
            icon = Icons.Filled.Add,
            contentDescription = stringResource(R.string.scr_increase, label),
            enabled = value + step <= range.last,
            onClick = { haptics.press(); onValueChange((value + step).coerceIn(range)) },
        )
    }
    val container = modifier
        .fillMaxWidth()
        .clip(MmShapes.sm)
        .background(c.surfaceRaised)
        .border(1.dp, c.outline, MmShapes.sm)
        .padding(horizontal = MmSpacing.xs)
    if (largeText) {
        androidx.compose.foundation.layout.Column(container.padding(top = MmSpacing.sm)) {
            Text(
                label,
                style = MmType.current.bodyM,
                color = c.textSecondary,
                modifier = Modifier.padding(start = MmSpacing.md),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) { controls() }
        }
    } else {
        Row(container, verticalAlignment = Alignment.CenterVertically) {
            Text(
                label,
                style = MmType.current.bodyM,
                color = c.textSecondary,
                modifier = Modifier.weight(1f).padding(start = MmSpacing.md),
            )
            controls()
        }
    }
}

/** Field-looking button that opens a picker. */
@Composable
fun MmSelectField(
    label: String,
    value: String?,
    placeholder: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val c = MmColors.current
    Column(modifier.fillMaxWidth()) {
        Text(label, style = MmType.current.label, color = c.textSecondary, modifier = Modifier.padding(bottom = MmSpacing.xs))
        Row(
            Modifier
                .mmTappable(enabled = enabled, role = Role.Button, shape = MmShapes.sm, onClick = onClick)
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .clip(MmShapes.sm)
                .background(c.surfaceRaised)
                .border(1.dp, c.outline, MmShapes.sm)
                .padding(horizontal = MmSpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                value?.takeIf { it.isNotBlank() } ?: placeholder,
                style = MmType.current.bodyL,
                color = if (value.isNullOrBlank() || !enabled) c.textTertiary else c.textPrimary,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(Icons.Filled.ExpandMore, contentDescription = null, tint = c.textSecondary)
        }
    }
}

/** Text input in the house style (numeric keyboard when [numeric]). */
@Composable
fun MmTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    numeric: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: KeyboardType = if (numeric) KeyboardType.Number else KeyboardType.Text,
    supporting: String? = null,
) {
    val c = MmColors.current
    Column(modifier.fillMaxWidth()) {
        Text(label, style = MmType.current.label, color = c.textSecondary, modifier = Modifier.padding(bottom = MmSpacing.xs))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            minLines = minLines,
            placeholder = placeholder?.let { { Text(it, color = c.textTertiary) } },
            textStyle = if (numeric) MmType.current.numeric.copy(color = c.textPrimary) else MmType.current.bodyL.copy(color = c.textPrimary),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            shape = MmShapes.sm,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = c.surfaceRaised,
                unfocusedContainerColor = c.surfaceRaised,
                focusedBorderColor = c.brand,
                unfocusedBorderColor = c.outline,
                cursorColor = c.brand,
            ),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
        )
        if (supporting != null) {
            Text(supporting, style = MmType.current.caption, color = c.textTertiary, modifier = Modifier.padding(top = MmSpacing.xs))
        }
    }
}

/** Searchable single-choice list in a bottom sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MmPickerSheet(
    title: String,
    options: List<String>,
    selected: String?,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
    loading: Boolean = false,
    searchable: Boolean = options.size > 12,
) {
    val c = MmColors.current
    var query by rememberSaveable { mutableStateOf("") }
    val shown = remember(options, query) {
        if (query.isBlank()) options else options.filter { it.contains(query.trim(), ignoreCase = true) }
    }
    MmSheet(onDismissRequest = onDismiss, title = title) {
        if (searchable) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = c.textSecondary) },
                placeholder = { Text(stringResource(R.string.scr_search_hint), color = c.textTertiary) },
                shape = MmShapes.sm,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = c.surfaceHigh,
                    unfocusedContainerColor = c.surfaceHigh,
                    focusedBorderColor = c.brand,
                    unfocusedBorderColor = c.outline,
                ),
                modifier = Modifier.fillMaxWidth().padding(horizontal = MmSpacing.lg, vertical = MmSpacing.sm),
            )
        }
        when {
            loading -> Column(Modifier.padding(MmSpacing.lg), verticalArrangement = Arrangement.spacedBy(MmSpacing.md)) {
                repeat(6) { MmSkeleton(Modifier.fillMaxWidth(), height = 20.dp) }
            }
            shown.isEmpty() -> Text(
                stringResource(R.string.scr_no_matches),
                style = MmType.current.bodyM,
                color = c.textSecondary,
                modifier = Modifier.padding(MmSpacing.xxl),
            )
            else -> LazyColumn(Modifier.fillMaxWidth().heightIn(max = 480.dp)) {
                items(shown, key = { it }) { option ->
                    val isSel = option == selected
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .clickable(role = Role.RadioButton) { onSelect(option); onDismiss() }
                            .padding(horizontal = MmSpacing.xl),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            option,
                            style = MmType.current.bodyL,
                            color = if (isSel) c.brandText else c.textPrimary,
                            modifier = Modifier.weight(1f),
                        )
                        if (isSel) Icon(Icons.Filled.Check, contentDescription = null, tint = c.brandText)
                    }
                }
            }
        }
        Spacer(Modifier.height(MmSpacing.xxl))
    }
}

/** Thin animated progress bar (track + brand fill). */
@Composable
fun MmProgressBar(progress: Float, modifier: Modifier = Modifier, height: Dp = 6.dp) {
    val c = MmColors.current
    val reduced = MmMotion.reduced
    val p by animateFloatAsState(
        progress.coerceIn(0f, 1f),
        animationSpec = MmMotion.orSnap(reduced, MmMotion.standard()),
        label = "progress",
    )
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(MmShapes.pill)
            .background(c.surfaceHigh),
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(p)
                .clip(MmShapes.pill)
                .background(c.brand),
        )
    }
}

/** Small pill tag. */
@Composable
fun MmTag(text: String, color: Color, container: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .clip(MmShapes.pill)
            .background(container)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(text, style = MmType.current.labelS, color = color, maxLines = 1)
    }
}

/** Square icon disc used in hero rows. */
@Composable
fun MmIconDisc(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, size: Dp = 40.dp) {
    Box(
        Modifier.size(size).clip(MmShapes.sm).background(tint.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(size * 0.5f))
    }
}
