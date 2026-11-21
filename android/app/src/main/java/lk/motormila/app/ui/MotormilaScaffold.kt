package lk.motormila.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.PostAdd
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.ShowChart
import androidx.compose.material.icons.outlined.PostAdd
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.ui.components.MmBottomBarItem
import lk.motormila.app.ui.components.ShowroomDock
import lk.motormila.app.ui.components.ShowroomRail
import lk.motormila.app.ui.home.badgeFor
import lk.motormila.app.ui.theme.LocalGlassEnv
import lk.motormila.app.ui.theme.rememberGlassEnv

/**
 * Bottom inset for edge-to-edge lists and accessories. Compact windows use
 * the measured dock; a wide window has the OS inset and a separate rail.
 *
 * @param barVisible the tab bar is shown on this route.
 * @param contentPadding bottom content padding a scrolling list should add
 *   (bar + gesture inset + breathing room). 16.dp on routes without a bar.
 * @param barTop distance from the window bottom to the top of the expanded
 *   bar (where trays / snackbars should sit). 0 when there is no bar.
 * @param minimize 0 = bar expanded, 1 = minimised (read it in draw/layout only).
 */
@Immutable
data class MmBottomChrome(
    val barVisible: Boolean = false,
    val contentPadding: Dp = 16.dp,
    val barTop: Dp = 0.dp,
    val minimize: State<Float>? = null,
    /** Height the bar loses when minimised (trays slide down by this × [minimize]). */
    val minimizeDrop: Dp = 0.dp,
)

val LocalBottomChrome = compositionLocalOf { MmBottomChrome() }

/** Bottom-bar tab keys (Buy, Prices, Tools, Sell, Saved). */
object MotormilaTabs {
    const val BUY = "buy"
    const val PRICES = "prices"
    const val TOOLS = "tools"
    const val SELL = "sell"
    const val SAVED = "saved"
}

@Composable
fun motormilaTabItems(badges: Map<String, Int>): List<MmBottomBarItem> = listOf(
    MmBottomBarItem(MotormilaTabs.BUY, stringResource(R.string.mm_nav_buy), Icons.Outlined.Home, Icons.Filled.Home),
    MmBottomBarItem(MotormilaTabs.PRICES, stringResource(R.string.mm_nav_prices), Icons.Outlined.ShowChart, Icons.Filled.ShowChart),
    MmBottomBarItem(MotormilaTabs.TOOLS, stringResource(R.string.mm_nav_tools), Icons.Outlined.Build, Icons.Filled.Build, badge = badgeFor("inbox", badges)),
    MmBottomBarItem(MotormilaTabs.SELL, stringResource(R.string.mm_nav_sell), Icons.Outlined.PostAdd, Icons.Filled.PostAdd),
    MmBottomBarItem(MotormilaTabs.SAVED, stringResource(R.string.mm_nav_saved), Icons.Outlined.BookmarkBorder, Icons.Filled.Bookmark, badge = badgeFor("watchlist", badges)),
)

/** Stable compact destinations, a side rail on wide windows. No scroll-driven loss of tabs. */
@Suppress("UNUSED_PARAMETER")
@Composable
fun MotormilaScaffold(
    selected: String,
    showBottomBar: Boolean = true,
    badges: Map<String, Int> = emptyMap(),
    onNavigate: (route: String) -> Unit,
    onScan: () -> Unit,
    onReselect: (route: String) -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    val density = LocalDensity.current
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val imeOpen = WindowInsets.ime.getBottom(density) > WindowInsets.navigationBars.getBottom(density)
    val select: (MmBottomBarItem) -> Unit = { item ->
        if (item.key == selected) onReselect(item.key) else onNavigate(item.key)
    }
    val env = rememberGlassEnv(null)
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val rail = showBottomBar && maxWidth >= 760.dp
        val dock = showBottomBar && !rail && !imeOpen
        var dockPx by remember(density) { mutableIntStateOf(0) }
        val dockMeasure = if (dockPx > 0) with(density) { dockPx.toDp() } else navBottom + 65.dp
        val chrome = if (dock) MmBottomChrome(true, dockMeasure + 16.dp, dockMeasure)
            else MmBottomChrome(contentPadding = navBottom + 16.dp, barTop = if (rail) navBottom else 0.dp)
        CompositionLocalProvider(LocalGlassEnv provides env, LocalBottomChrome provides chrome) {
            Row(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))) {
                if (rail) ShowroomRail(motormilaTabItems(badges), selected, select)
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    content(PaddingValues(0.dp))
                    if (dock) ShowroomDock(motormilaTabItems(badges), selected, select,
                        Modifier.align(Alignment.BottomCenter).onSizeChanged { dockPx = it.height })
                }
            }
        }
    }
}
