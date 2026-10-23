package lk.motormila.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import lk.motormila.app.ui.theme.CappedFontScale
import lk.motormila.app.ui.theme.GlassWeight
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.liquidGlass
import lk.motormila.app.ui.theme.mmPress
import kotlin.math.roundToInt
import kotlin.math.sign
import kotlin.math.sqrt

data class MmBottomBarItem(
    val key: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon,
    val badge: Int? = null,
)

/** Geometry of the floating glass tab bar (shared with screens that pad for it). */
object MmTabBarMetrics {
    val height: Dp = 64.dp
    val minimizedHeight: Dp = 52.dp
    val minimizedWidth: Dp = 64.dp
    val sideInset: Dp = 16.dp
    val bottomGap: Dp = 8.dp
    val accessoryGap: Dp = 10.dp
}

/**
 * Scroll-driven minimise state for the floating tab bar (iOS 26): scrolling
 * content down past a small threshold shrinks the bar to its selected tab,
 * scrolling up (or reaching the top) expands it. Attach [connection] to the
 * content's `nestedScroll` — it never consumes scroll, it only listens.
 */
@Stable
class MmTabBarState(private val thresholdPx: Float) {
    var minimized by mutableStateOf(false)
    private var acc = 0f

    val connection: NestedScrollConnection = object : NestedScrollConnection {
        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            val dy = consumed.y
            if (dy == 0f && available.y > 0f) {
                // Over-scrolling at the very top: always show the full bar.
                minimized = false
                acc = 0f
                return Offset.Zero
            }
            if (dy == 0f) return Offset.Zero
            if (sign(dy) != sign(acc)) acc = 0f
            acc += dy
            if (acc < -thresholdPx) minimized = true else if (acc > thresholdPx) minimized = false
            return Offset.Zero
        }
    }

    fun expand() {
        minimized = false
        acc = 0f
    }
}

/**
 * Floating liquid-glass tab bar: a fully rounded capsule (real backdrop blur
 * of the content scrolling under it), inset from the screen edges.
 *
 * Signature motion:
 *  - **Liquid selection pill** — the pill's leading and trailing edges ride
 *    two springs of different stiffness, so it *stretches* toward the new tab,
 *    squashes vertically while stretched, then snaps back into a capsule.
 *    Fully interruptible (re-targets mid-flight).
 *  - **Icon fill morph** — outline → filled icon cross-fade with a bouncy
 *    1 → 1.14 → 1 pop on the newly selected tab; press-scale 0.88 on touch.
 *  - **Minimise on scroll** — the capsule shrinks around the selected tab
 *    (width + height + labels fade) on a critically-damped spring; the tab
 *    row slides so the selected icon stays centred. Tap to expand.
 *
 * All animation values are read in layout/draw lambdas only (no per-frame
 * recomposition). Reduced motion: every spring snaps.
 */
@Composable
fun MmBottomBar(
    items: List<MmBottomBarItem>,
    selectedKey: String?,
    onSelect: (MmBottomBarItem) -> Unit,
    modifier: Modifier = Modifier,
    onReselect: (MmBottomBarItem) -> Unit = {},
    minimized: Boolean = false,
    onExpand: () -> Unit = {},
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    val selectedIndex = items.indexOfFirst { it.key == selectedKey }.coerceAtLeast(0)
    val n = items.size.coerceAtLeast(1)

    val progress: State<Float> = animateFloatAsState(
        targetValue = if (minimized) 1f else 0f,
        animationSpec = if (reduced) tween(0) else spring(dampingRatio = 0.86f, stiffness = 420f),
        label = "tabbar-minimise",
    )

    // Liquid pill edges, in fractions of one slot (0..n). Leading edge in the
    // direction of travel is stiff, trailing edge lags → stretch.
    val left = remember { Animatable(selectedIndex.toFloat()) }
    val right = remember { Animatable(selectedIndex + 1f) }
    LaunchedEffect(selectedIndex, reduced) {
        val targetL = selectedIndex.toFloat()
        val targetR = selectedIndex + 1f
        if (reduced) {
            left.snapTo(targetL); right.snapTo(targetR); return@LaunchedEffect
        }
        val movingRight = targetL > left.value
        val fast = spring<Float>(dampingRatio = 0.72f, stiffness = 900f)
        val slow = spring<Float>(dampingRatio = 0.78f, stiffness = 260f)
        coroutineScope {
            launch { left.animateTo(targetL, if (movingRight) slow else fast) }
            launch { right.animateTo(targetR, if (movingRight) fast else slow) }
        }
    }

    val pillFill = if (c.isDark) Color.White.copy(alpha = 0.13f) else c.brand.copy(alpha = 0.12f)
    val pillStroke = if (c.isDark) Color.White.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.9f)
    val minimizedLabel = items.getOrNull(selectedIndex)?.label.orEmpty()

    BoxWithConstraints(modifier.fillMaxWidth().height(MmTabBarMetrics.height)) {
        val fullW = maxWidth
        Box(
            Modifier
                .align(Alignment.BottomStart)
                // Capsule width/height follow the minimise progress (layout phase only).
                .layout { measurable, constraints ->
                    val p = progress.value
                    val w = lerp(constraints.maxWidth.toFloat(), MmTabBarMetrics.minimizedWidth.toPx(), p).roundToInt()
                    val h = lerp(MmTabBarMetrics.height.toPx(), MmTabBarMetrics.minimizedHeight.toPx(), p).roundToInt()
                    val placeable = measurable.measure(Constraints.fixed(w, h))
                    layout(w, h) { placeable.place(0, 0) }
                }
                .liquidGlass(MmShapes.pill, GlassWeight.Regular, elevation = 18.dp)
                .then(
                    if (minimized) {
                        Modifier.clickable(role = Role.Button, onClickLabel = minimizedLabel) {
                            haptics.toggle()
                            onExpand()
                        }
                    } else {
                        Modifier
                    },
                ),
        ) {
            // The tab row keeps its full width and slides so the selected tab
            // stays centred while the capsule shrinks around it.
            Row(
                Modifier
                    .wrapContentWidth(Alignment.Start, unbounded = true)
                    .width(fullW)
                    .fillMaxHeight()
                    .offset {
                        val p = progress.value
                        val slot = fullW.toPx() / n
                        val minW = MmTabBarMetrics.minimizedWidth.toPx()
                        IntOffset(lerp(0f, minW / 2f - (selectedIndex + 0.5f) * slot, p).roundToInt(), 0)
                    }
                    .drawBehind {
                        val slot = size.width / n
                        val insetX = 5.dp.toPx()
                        val l = left.value * slot + insetX
                        val r = right.value * slot - insetX
                        val base = slot - insetX * 2
                        val stretch = ((r - l) / base).coerceAtLeast(1f)
                        val squash = 1f / sqrt(stretch)
                        val fullPillH = size.height - 10.dp.toPx()
                        val ph = (fullPillH * squash).coerceAtLeast(fullPillH * 0.72f)
                        val top = (size.height - ph) / 2f
                        val radius = CornerRadius(ph / 2f, ph / 2f)
                        drawRoundRect(pillFill, Offset(l, top), Size(r - l, ph), radius)
                        drawRoundRect(
                            Brush.verticalGradient(
                                0f to pillStroke,
                                1f to pillStroke.copy(alpha = pillStroke.alpha * 0.15f),
                                startY = top,
                                endY = top + ph,
                            ),
                            Offset(l, top),
                            Size(r - l, ph),
                            radius,
                            style = Stroke(1.dp.toPx()),
                        )
                    },
            ) {
                items.forEachIndexed { index, item ->
                    val isSelected = index == selectedIndex
                    BottomBarTab(
                        item = item,
                        selected = isSelected,
                        reduced = reduced,
                        minimize = progress,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            if (minimized) {
                                haptics.toggle()
                                onExpand()
                            } else if (isSelected) {
                                onReselect(item)
                            } else {
                                haptics.toggle()
                                onSelect(item)
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun BottomBarTab(
    item: MmBottomBarItem,
    selected: Boolean,
    reduced: Boolean,
    minimize: State<Float>,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val c = MmColors.current
    val interaction = remember { MutableInteractionSource() }
    val fill by animateFloatAsState(
        targetValue = if (selected) 1f else 0f,
        animationSpec = if (reduced) tween(0) else spring(dampingRatio = 0.9f, stiffness = Spring.StiffnessMedium),
        label = "tab-fill",
    )
    val pop = remember { Animatable(1f) }
    LaunchedEffect(selected) {
        if (selected && !reduced) {
            pop.snapTo(0.86f)
            pop.animateTo(1f, spring(dampingRatio = 0.42f, stiffness = 520f))
        }
    }
    val tint = if (selected) c.brandText else c.textSecondary
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clickable(interactionSource = interaction, indication = null, role = Role.Tab, onClick = onClick)
            .mmPress(interaction, 0.88f)
            .semantics(mergeDescendants = true) {
                contentDescription = item.label
                this.selected = selected
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
                .height(26.dp)
                .graphicsLayer {
                    val p = minimize.value
                    // Centre the icon vertically once labels fade away.
                    translationY = lerp(0f, 3.dp.toPx(), p)
                    val s = pop.value
                    scaleX = s
                    scaleY = s
                    // Non-selected tabs dissolve while minimising.
                    alpha = if (selected) 1f else (1f - p * 1.8f).coerceIn(0f, 1f)
                },
            contentAlignment = Alignment.Center,
        ) {
            val icon: @Composable () -> Unit = {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        item.icon,
                        contentDescription = null,
                        tint = c.textSecondary,
                        modifier = Modifier
                            .size(24.dp)
                            .graphicsLayer { alpha = 1f - fill },
                    )
                    Icon(
                        item.selectedIcon,
                        contentDescription = null,
                        tint = c.brandText,
                        modifier = Modifier
                            .size(24.dp)
                            .graphicsLayer { alpha = fill },
                    )
                }
            }
            val count = item.badge
            if (count != null && count > 0) {
                BadgedBox(badge = {
                    Badge(containerColor = c.brand, contentColor = c.textOnBrand) {
                        Text(if (count > 99) "99+" else count.toString(), style = MmType.current.caption)
                    }
                }) { icon() }
            } else {
                icon()
            }
        }
        Spacer(Modifier.height(4.dp))
        CappedFontScale(max = 1.15f) {
            MmFitText(
                item.label,
                style = MmType.current.caption.copy(textAlign = TextAlign.Center),
                color = tint,
                minScale = 0.7f,
                modifier = Modifier
                    .padding(horizontal = 2.dp)
                    .graphicsLayer { alpha = (1f - minimize.value * 2.2f).coerceIn(0f, 1f) },
            )
        }
    }
}

/**
 * Round liquid-glass button that sits beside the tab bar (assistant), same
 * material and height as the bar so they read as one family.
 */
@Composable
fun MmGlassCircleButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = MmTabBarMetrics.height,
    tint: Color = MmColors.current.brandText,
) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = MmHaptics.current
    Box(
        modifier = modifier
            .size(size)
            .mmPress(interaction, 0.9f)
            .liquidGlass(MmShapes.pill, GlassWeight.Regular, elevation = 18.dp)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button) {
                haptics.press()
                onClick()
            }
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
    }
}

