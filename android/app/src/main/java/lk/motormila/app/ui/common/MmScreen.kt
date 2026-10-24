package lk.motormila.app.ui.common

import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import lk.motormila.app.R
import lk.motormila.app.ui.LocalBottomChrome
import lk.motormila.app.ui.components.MmGlassSnackbarHost
import lk.motormila.app.ui.theme.CappedFontScale
import lk.motormila.app.ui.theme.GlassWeight
import lk.motormila.app.ui.theme.LiquidGlass
import lk.motormila.app.ui.theme.LocalGlassEnv
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.glassBackdrop
import lk.motormila.app.ui.theme.liquidGlass
import lk.motormila.app.ui.theme.mmPress
import kotlin.math.roundToInt

/**
 * Padding an edge-to-edge [MmScreen] hands its scrolling content: [top] clears
 * the (expanded) glass header incl. the status bar, [bottom] clears the
 * floating tab bar / gesture bar. Read with [mmScreenPadding].
 */
@Immutable
data class MmScreenInsets(val top: Dp = 0.dp, val bottom: Dp = 16.dp)

val LocalMmScreenInsets = compositionLocalOf { MmScreenInsets() }

/**
 * Content padding for the main scroll container of an edge-to-edge
 * [MmScreen] (lists: `contentPadding = mmScreenPadding(...)`; scrolling
 * columns: apply inside the scroll). Outside an edge-to-edge screen it is
 * just the extras plus the bottom chrome.
 */
@Composable
fun mmScreenPadding(
    horizontal: Dp = 0.dp,
    top: Dp = 0.dp,
    bottom: Dp = 0.dp,
): PaddingValues {
    val i = LocalMmScreenInsets.current
    return PaddingValues(start = horizontal, end = horizontal, top = i.top + top, bottom = i.bottom + bottom)
}

/** Same as [mmScreenPadding] but adds the insets to an existing padding. */
@Composable
fun PaddingValues.plusScreenInsets(): PaddingValues {
    val i = LocalMmScreenInsets.current
    val ld = LocalLayoutDirection.current
    return PaddingValues(
        start = calculateStartPadding(ld),
        end = calculateEndPadding(ld),
        top = calculateTopPadding() + i.top,
        bottom = calculateBottomPadding() + i.bottom,
    )
}

private val CompactBarHeight = 56.dp
private val LargeTitleHeight = 52.dp

/**
 * Screen chrome for every pushed/tab page, iOS 26 style:
 *
 *  - **Large title** (Cal Sans display) under a compact glass bar. As content
 *    scrolls, the large title slides up, shrinks toward the leading edge and
 *    fades while the small centred title fades in — one consistent collapsing
 *    pattern for the whole app. Pass [largeTitle] = false on screens whose
 *    hero already shows the title (hubs) so it is never duplicated (audit
 *    B10): they get the compact bar only.
 *  - **Liquid-glass header**: transparent at rest; once content passes under
 *    it, a real backdrop blur (screen-local Haze source) fades in, extended
 *    under the status bar, with a hairline. Reduce transparency → opaque.
 *  - **Back**: a round glass chevron button (system back when [onBack] is
 *    null and [showBack] is true). Pass showBack = false on tab roots.
 *  - **Edge-to-edge** ([edgeToEdge] = true): content fills the screen and
 *    scrolls under the header and the floating tab bar. The screen MUST pad
 *    its scroll container with [mmScreenPadding]. The content is translated
 *    with the header collapse (graphics layer, no recomposition) so there is
 *    never a gap while the title collapses.
 *  - Glass snackbars above the tab bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MmScreen(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    showBack: Boolean = true,
    snackbarHostState: SnackbarHostState? = null,
    edgeToEdge: Boolean = false,
    largeTitle: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable () -> Unit,
) {
    val dispatcher = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    val back: (() -> Unit)? = onBack ?: if (showBack && dispatcher != null) {
        { dispatcher.onBackPressed() }
    } else {
        null
    }
    val reduced = MmMotion.reduced
    val chrome = LocalBottomChrome.current
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val largeH = if (largeTitle) LargeTitleHeight else 0.dp

    val barState = rememberTopAppBarState()
    val scrollBehavior: TopAppBarScrollBehavior = if (largeTitle) {
        TopAppBarDefaults.exitUntilCollapsedScrollBehavior(
            state = barState,
            snapAnimationSpec = if (reduced) null else MmMotion.gentle(),
            flingAnimationSpec = rememberSplineBasedDecay(),
        )
    } else {
        TopAppBarDefaults.pinnedScrollBehavior(barState)
    }
    val density = androidx.compose.ui.platform.LocalDensity.current
    val limitPx = with(density) { -largeH.toPx() }
    SideEffect {
        if (barState.heightOffsetLimit != limitPx) barState.heightOffsetLimit = limitPx
    }
    // Glass fades in as content passes under the header.
    val glassAlpha: () -> Float = {
        if (largeTitle) {
            val f = barState.collapsedFraction
            val under = if (barState.contentOffset < -1f) 1f else 0f
            maxOf(((f - 0.55f) / 0.45f).coerceIn(0f, 1f), under)
        } else {
            barState.overlappedFraction.coerceIn(0f, 1f)
        }
    }
    val localBackdrop = remember { HazeState() }
    val bottomPad = chrome.contentPadding

    Box(
        modifier
            .fillMaxSize()
            .nestedScroll(scrollBehavior.nestedScrollConnection),
    ) {
        if (edgeToEdge) {
            CompositionLocalProvider(
                LocalMmScreenInsets provides MmScreenInsets(top = statusTop + CompactBarHeight + largeH, bottom = bottomPad),
            ) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .glassBackdrop(localBackdrop),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            // Taller by the collapse distance, then slid up with
                            // the header so content follows the title 1:1.
                            .layout { measurable, constraints ->
                                val extra = (-limitPx).roundToInt()
                                val h = if (constraints.hasBoundedHeight) constraints.maxHeight + extra else constraints.maxHeight
                                val p = measurable.measure(constraints.copy(minHeight = h, maxHeight = h))
                                layout(constraints.maxWidth, constraints.maxHeight) {
                                    p.placeWithLayer(0, 0) { translationY = barState.heightOffset }
                                }
                            },
                    ) { content() }
                }
            }
            CompositionLocalProvider(LocalGlassEnv provides LocalGlassEnv.current.copy(backdrop = localBackdrop)) {
                GlassHeader(
                    title = title,
                    statusTop = statusTop,
                    largeH = largeH,
                    barState = barState,
                    glassAlpha = glassAlpha,
                    backdrop = localBackdrop,
                    back = back,
                    actions = actions,
                    modifier = Modifier.align(Alignment.TopStart),
                )
            }
        } else {
            // Legacy layout (content below the header) for screens that do not
            // pad for an overlaid header yet. Same glass header look.
            Column(Modifier.fillMaxSize()) {
                GlassHeader(
                    title = title,
                    statusTop = statusTop,
                    largeH = largeH,
                    barState = barState,
                    glassAlpha = glassAlpha,
                    backdrop = null,
                    back = back,
                    actions = actions,
                )
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(bottom = if (chrome.barVisible) bottomPad else 0.dp),
                ) {
                    CompositionLocalProvider(LocalMmScreenInsets provides MmScreenInsets(top = 0.dp, bottom = 16.dp)) {
                        content()
                    }
                }
            }
        }
        if (snackbarHostState != null) {
            CompositionLocalProvider(
                LocalGlassEnv provides LocalGlassEnv.current.copy(backdrop = if (edgeToEdge) localBackdrop else null),
            ) {
            MmGlassSnackbarHost(
                hostState = snackbarHostState,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 16.dp)
                    .padding(bottom = if (chrome.barVisible) chrome.barTop + 12.dp else 16.dp),
            )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GlassHeader(
    title: String,
    statusTop: Dp,
    largeH: Dp,
    barState: androidx.compose.material3.TopAppBarState,
    glassAlpha: () -> Float,
    backdrop: HazeState?,
    back: (() -> Unit)?,
    actions: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = MmColors.current
    val env = LocalGlassEnv.current
    val t = MmType.current
    val hasLarge = largeH > 0.dp
    val glassStyle = LiquidGlass.style(c, GlassWeight.Regular)
    val solid = LiquidGlass.solid(c)
    val fallback = LiquidGlass.fallback(c, GlassWeight.Regular)
    val hair = c.outline
    Box(
        modifier
            .fillMaxWidth()
            .layout { measurable, constraints ->
                val h = (statusTop + CompactBarHeight + largeH).roundToPx() + barState.heightOffset.roundToInt()
                val p = measurable.measure(Constraints.fixed(constraints.maxWidth, h.coerceAtLeast(0)))
                layout(p.width, p.height) { p.place(0, 0) }
            }
            .then(
                when {
                    env.solid -> Modifier.drawBehind {
                        drawRect(solid.copy(alpha = glassAlpha()))
                    }
                    backdrop != null -> Modifier.hazeEffect(backdrop, glassStyle) {
                        blurEnabled = env.blurAllowed
                        alpha = glassAlpha()
                    }
                    else -> Modifier.drawBehind { drawRect(fallback.copy(alpha = fallback.alpha * glassAlpha())) }
                },
            )
            .drawBehind {
                val a = glassAlpha()
                if (a > 0.01f) {
                    drawLine(hair.copy(alpha = hair.alpha * a), Offset(0f, size.height - 0.5f), Offset(size.width, size.height - 0.5f), strokeWidth = 1f)
                }
            }
            .clipToBounds(),
    ) {
        // Compact row: back · centred small title · actions.
        Box(
            Modifier
                .padding(top = statusTop)
                .fillMaxWidth()
                .height(CompactBarHeight),
        ) {
            Row(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (back != null) {
                    GlassBackButton(back)
                } else {
                    Spacer(Modifier.width(8.dp))
                }
                Spacer(Modifier.weight(1f))
                CompositionLocalProvider(LocalContentColor provides c.textPrimary) {
                    Row(verticalAlignment = Alignment.CenterVertically, content = actions)
                }
            }
            CappedFontScale(max = 1.3f) {
                Text(
                    title,
                    style = t.titleS,
                    color = c.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(horizontal = 72.dp)
                        .graphicsLayer {
                            alpha = if (hasLarge) ((barState.collapsedFraction - 0.6f) / 0.4f).coerceIn(0f, 1f) else 1f
                            translationY = if (hasLarge) lerp(6.dp.toPx(), 0f, barState.collapsedFraction) else 0f
                        }
                        .then(if (hasLarge) Modifier else Modifier.semantics { heading() }),
                )
            }
        }
        if (hasLarge) {
            CappedFontScale(max = 1.3f) {
                // Shrinks to fit (si/ta titles like "ඔබේ වාහනය විකුණන්න"
                // used to end in "…").
                lk.motormila.app.ui.components.MmFitText(
                    text = title,
                    style = t.displayM,
                    color = c.textPrimary,
                    minScale = 0.6f,
                    modifier = Modifier
                        .padding(top = statusTop + CompactBarHeight - 6.dp)
                        .padding(horizontal = 20.dp)
                        .height(largeH)
                        .graphicsLayer {
                            val f = barState.collapsedFraction
                            alpha = (1f - f * 1.5f).coerceIn(0f, 1f)
                            val s = lerp(1f, 0.86f, f)
                            scaleX = s
                            scaleY = s
                            transformOrigin = TransformOrigin(0f, 0f)
                        }
                        .semantics { heading() },
                )
            }
        }
    }
}

@Composable
private fun GlassBackButton(onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = MmHaptics.current
    val label = stringResource(R.string.scr_back)
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    Box(
        Modifier
            .size(44.dp)
            .padding(2.dp)
            .mmPress(interaction, 0.88f)
            .liquidGlass(MmShapes.pill, GlassWeight.Thin, elevation = 6.dp)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button) {
                haptics.press()
                onClick()
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.ArrowBackIos,
            contentDescription = null,
            tint = MmColors.current.textPrimary,
            modifier = Modifier
                .size(18.dp)
                // ArrowBackIos glyph sits left of centre; nudge it optically.
                .graphicsLayer { translationX = (if (rtl) -1 else 1) * 3.dp.toPx() },
        )
    }
}

/**
 * For non-scrolling states (skeleton, error, empty) inside an edge-to-edge
 * [MmScreen]: keeps them clear of the glass header and the tab bar.
 */
@Composable
fun Modifier.mmScreenSafe(): Modifier {
    val i = LocalMmScreenInsets.current
    return this.padding(top = i.top, bottom = i.bottom)
}
