package lk.motormila.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmType

/** Steady five-destination bar. The app's own safe-area insets, never artwork OS chrome. */
@Composable
internal fun ShowroomDock(items: List<MmBottomBarItem>, selectedKey: String,
    onSelect: (MmBottomBarItem) -> Unit, modifier: Modifier = Modifier) {
    val c = MmColors.current
    val type = MmType.current
    Column(modifier.fillMaxWidth().background(c.surface)) {
        HorizontalDivider(color = c.outlineStrong)
        BoxWithConstraints(Modifier.fillMaxWidth().navigationBarsPadding()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))) {
            val density = LocalDensity.current
            val reflow = density.fontScale >= 1.45f
            val horizontalPad = if (reflow) 2.dp else 5.dp
            val availablePx = with(density) { maxWidth.roundToPx() }
            val entries = if (reflow) {
                val measurer = rememberTextMeasurer()
                val targetPx = with(density) { 48.dp.roundToPx() }
                val padPx = with(density) { horizontalPad.roundToPx() * 2 }
                items.map { item ->
                    val inkWidth = measurer.measure(item.label, type.caption, softWrap = false, maxLines = 1).size.width
                    item to maxOf(targetPx, inkWidth + padPx + 2) // allowance for Row's integer rounding
                }
            } else items.map { it to 1 }
            // Pack full translated labels in tab order. Equal thirds still split
            // Tamil words at 200%, even if the combined widths fit the window.
            val rows = if (!reflow) listOf(entries) else buildList {
                var row = mutableListOf<Pair<MmBottomBarItem, Int>>()
                var usedPx = 0
                for (entry in entries) {
                    if (row.isNotEmpty() && usedPx + entry.second > availablePx) {
                        add(row)
                        row = mutableListOf()
                        usedPx = 0
                    }
                    row.add(entry)
                    usedPx += entry.second
                }
                if (row.isNotEmpty()) add(row)
            }
            Column(Modifier.fillMaxWidth().selectableGroup()) {
                rows.forEachIndexed { index, row ->
                    if (index > 0) HorizontalDivider(color = c.outline)
                    val sparePx = if (reflow) (availablePx - row.sumOf { it.second }).coerceAtLeast(0) / row.size.toFloat() else 0f
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                        row.forEach { (item, basisPx) ->
                            val selected = item.key == selectedKey
                            val ink by animateColorAsState(if (selected) c.brandText else c.textSecondary,
                                tween(if (MmMotion.reduced) 0 else 145), label = "tab-ink")
                            Box(Modifier.weight(basisPx + sparePx).heightIn(min = if (reflow) 60.dp else 64.dp)
                                .selectable(selected = selected, role = Role.Tab, onClick = { onSelect(item) })) {
                                if (selected) Box(Modifier.align(Alignment.TopCenter).size(27.dp, 2.dp)
                                    .background(ink, RoundedCornerShape(bottomStart = 2.dp, bottomEnd = 2.dp)))
                                Column(Modifier.fillMaxWidth().align(Alignment.TopCenter)
                                    .padding(horizontal = horizontalPad, vertical = if (reflow) 7.dp else 11.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(if (reflow) 2.dp else 4.dp)) {
                                    NavGlyph(item, selected, ink)
                                    Text(item.label, style = if (selected && !reflow) type.labelS else type.caption,
                                        textAlign = TextAlign.Center, color = ink)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ShowroomRail(items: List<MmBottomBarItem>, selectedKey: String, onSelect: (MmBottomBarItem) -> Unit) {
    val c = MmColors.current
    NavigationRail(containerColor = c.surface, contentColor = c.textPrimary) {
        items.forEach { item ->
            val selected = item.key == selectedKey
            NavigationRailItem(selected, onClick = { onSelect(item) },
                icon = { NavGlyph(item, selected, if (selected) c.brandText else c.textSecondary) },
                label = { Text(item.label, textAlign = TextAlign.Center) },
                colors = NavigationRailItemDefaults.colors(selectedIconColor = c.brandText,
                    selectedTextColor = c.brandText, indicatorColor = c.brandContainer,
                    unselectedIconColor = c.textSecondary, unselectedTextColor = c.textSecondary))
        }
    }
}

@Composable
private fun NavGlyph(item: MmBottomBarItem, selected: Boolean, ink: androidx.compose.ui.graphics.Color) {
    val c = MmColors.current
    BadgedBox(badge = {
        val unread = item.badge ?: 0
        if (unread > 0) {
            val label = if (unread > 99) "99+" else unread.toString()
            Badge(containerColor = c.brand, contentColor = c.textOnBrand) { Text(label) }
        }
    }) {
        Icon(if (selected) item.selectedIcon else item.icon, null, tint = ink, modifier = Modifier.size(22.dp))
    }
}
