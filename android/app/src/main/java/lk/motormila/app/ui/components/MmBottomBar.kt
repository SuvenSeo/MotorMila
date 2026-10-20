package lk.motormila.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

data class MmBottomBarItem(
    val key: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon,
    val badge: Int? = null,
)

/**
 * Bottom navigation: translucent ground with a top hairline, a single brand
 * pill indicator that SLIDES between tabs on a snappy spring, and an icon
 * spring (bouncy, 1 → 1.12 → 1) on the newly selected tab. Toggle haptic on
 * change; re-tapping the current tab calls [onReselect] (scroll to top).
 * Handles the navigation-bar inset itself.
 */
@Composable
fun MmBottomBar(
    items: List<MmBottomBarItem>,
    selectedKey: String?,
    onSelect: (MmBottomBarItem) -> Unit,
    modifier: Modifier = Modifier,
    onReselect: (MmBottomBarItem) -> Unit = {},
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    val reduced = MmMotion.reduced
    val selectedIndex = items.indexOfFirst { it.key == selectedKey }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(c.surfaceOverlay.copy(alpha = 0.97f)) // no real blur: keep content from bleeding through labels
            .drawBehind {
                drawLine(c.outline, Offset(0f, 0f), Offset(size.width, 0f), strokeWidth = 1f)
            }
            .navigationBarsPadding(),
    ) {
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(MmSpacing.bottomBar)
                .padding(horizontal = 8.dp),
        ) {
            val slot = maxWidth / items.size.coerceAtLeast(1)
            val indicatorWidth = 56.dp
            val target = if (selectedIndex >= 0) slot * selectedIndex + (slot - indicatorWidth) / 2 else 0.dp
            val x by animateDpAsState(
                targetValue = target,
                animationSpec = if (reduced) tween(0) else MmMotion.snappy(),
                label = "bar-indicator",
            )
            val indicatorAlpha by animateFloatAsState(
                if (selectedIndex >= 0) 1f else 0f,
                tween(if (reduced) 0 else MmMotion.Fast),
                label = "bar-indicator-alpha",
            )
            // Sliding indicator behind the icon row.
            Box(
                Modifier
                    .offset(x = x, y = 8.dp)
                    .width(indicatorWidth)
                    .height(30.dp)
                    .graphicsLayer { alpha = indicatorAlpha }
                    .clip(MmShapes.pill)
                    .background(c.brandContainer),
            )
            Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                items.forEachIndexed { index, item ->
                    val isSelected = index == selectedIndex
                    BottomBarTab(
                        item = item,
                        selected = isSelected,
                        reduced = reduced,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            if (isSelected) {
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
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val c = MmColors.current
    val interaction = remember { MutableInteractionSource() }
    val scale by animateFloatAsState(
        targetValue = if (selected && !reduced) 1f else 0.92f,
        animationSpec = if (reduced) tween(0) else MmMotion.bouncy(),
        label = "tab-icon-scale",
    )
    val tint by animateColorAsState(
        if (selected) c.brandText else c.textSecondary,
        tween(if (reduced) 0 else MmMotion.Fast),
        label = "tab-tint",
    )
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clickable(interactionSource = interaction, indication = null, role = Role.Tab, onClick = onClick)
            .semantics {
                contentDescription = item.label
                this.selected = selected
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
        Spacer(Modifier.height(11.dp))
        Box(
            Modifier
                .height(22.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                },
            contentAlignment = Alignment.Center,
        ) {
            val icon: @Composable () -> Unit = {
                Icon(
                    if (selected) item.selectedIcon else item.icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(22.dp),
                )
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
        Spacer(Modifier.height(9.dp))
        Text(
            item.label,
            style = MmType.current.caption,
            color = tint,
            maxLines = 1,
        )
    }
}
