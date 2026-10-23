package lk.motormila.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Handyman
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Handyman
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import lk.motormila.app.R
import lk.motormila.app.ui.chat.AIChatBottomSheet
import lk.motormila.app.ui.components.MmBottomBar
import lk.motormila.app.ui.components.MmBottomBarItem
import lk.motormila.app.ui.components.MmGlassCircleButton
import lk.motormila.app.ui.components.MmTabBarMetrics
import lk.motormila.app.ui.components.MmTabBarState
import lk.motormila.app.ui.home.badgeFor
import lk.motormila.app.ui.theme.LocalGlassEnv
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.glassBackdrop
import lk.motormila.app.ui.theme.rememberGlassEnv

/**
 * Kept for source compatibility: screens used to lift the floating assistant
 * button above their own bottom chrome. The assistant now lives inside the
 * glass tab bar, so this is only read by the Search compare tray.
 */
val LocalAssistantLift = staticCompositionLocalOf<MutableState<Dp>?> { null }

/**
 * What the floating glass tab bar occupies at the bottom of the window, so
 * edge-to-edge screens can let content scroll *under* it and still end clear
 * of it.
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
    MmBottomBarItem(MotormilaTabs.BUY, stringResource(R.string.mm_nav_buy), Icons.Outlined.DirectionsCar, Icons.Filled.DirectionsCar),
    MmBottomBarItem(MotormilaTabs.PRICES, stringResource(R.string.mm_nav_prices), Icons.Outlined.Insights, Icons.Filled.Insights),
    MmBottomBarItem(MotormilaTabs.TOOLS, stringResource(R.string.mm_nav_tools), Icons.Outlined.Handyman, Icons.Filled.Handyman, badge = badgeFor("inbox", badges)),
    MmBottomBarItem(MotormilaTabs.SELL, stringResource(R.string.mm_nav_sell), Icons.Outlined.Sell, Icons.Filled.Sell),
    MmBottomBarItem(MotormilaTabs.SAVED, stringResource(R.string.mm_nav_saved), Icons.Outlined.BookmarkBorder, Icons.Filled.Bookmark, badge = badgeFor("watchlist", badges)),
)

/**
 * App shell, edge-to-edge: content fills the whole window and scrolls under
 * a floating liquid-glass tab bar (real backdrop blur, see LiquidGlass.kt).
 * The assistant is a matching glass circle docked to the right of the bar on
 * Buy and Prices. Scrolling down minimises the bar to its selected tab;
 * scrolling up restores it.
 *
 * [selected] is a [MotormilaTabs] key, or "" for full-screen routes.
 * [onScan] is kept for API compatibility (Tools owns the entry now).
 *
 * The content lambda receives zero padding: each screen owns its insets
 * (status bar via its top bar; bottom via [LocalBottomChrome]).
 */
@Composable
fun MotormilaScaffold(
    selected: String,
    showBottomBar: Boolean = true,
    badges: Map<String, Int> = emptyMap(),
    onNavigate: (route: String) -> Unit,
    onScan: () -> Unit,
    onOpenListing: ((Int) -> Unit)? = null,
    onReselect: (route: String) -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    var showAIChat by rememberSaveable { mutableStateOf(false) }
    val reduced = MmMotion.reduced
    val showAssistant = showBottomBar && (selected == MotormilaTabs.BUY || selected == MotormilaTabs.PRICES)
    val assistantLift = remember { mutableStateOf(0.dp) }
    val density = LocalDensity.current
    val barState = remember(density) { MmTabBarState(thresholdPx = with(density) { 28.dp.toPx() }) }
    LaunchedEffect(selected, showBottomBar) { barState.expand() }
    val minimize = animateFloatAsState(
        targetValue = if (barState.minimized && showBottomBar) 1f else 0f,
        animationSpec = if (reduced) tween(0) else spring(dampingRatio = 0.86f, stiffness = 420f),
        label = "chrome-minimise",
    )

    val backdrop = remember { HazeState() }
    val glassEnv = rememberGlassEnv(backdrop)
    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val barTop = navInset + MmTabBarMetrics.bottomGap + MmTabBarMetrics.height
    val chrome = remember(showBottomBar, navInset, minimize) {
        if (showBottomBar) {
            MmBottomChrome(
                barVisible = true,
                contentPadding = barTop + 20.dp,
                barTop = barTop,
                minimize = minimize,
                minimizeDrop = MmTabBarMetrics.height - MmTabBarMetrics.minimizedHeight,
            )
        } else {
            MmBottomChrome(barVisible = false, contentPadding = 16.dp, barTop = 0.dp)
        }
    }

    CompositionLocalProvider(
        LocalGlassEnv provides glassEnv,
        LocalBottomChrome provides chrome,
        LocalAssistantLift provides assistantLift,
    ) {
        Box(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .glassBackdrop(backdrop)
                    .nestedScroll(barState.connection),
            ) {
                // Inside the backdrop, glass must not sample its own source
                // (Haze skips self-sampling and would draw nothing): content
                // glass uses screen-local backdrops or the translucent tint.
                CompositionLocalProvider(LocalGlassEnv provides glassEnv.copy(backdrop = null)) {
                    content(PaddingValues(0.dp))
                }
            }

            AnimatedVisibility(
                visible = showBottomBar,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = if (reduced) fadeIn(tween(0)) else slideInVertically(spring(dampingRatio = 0.8f, stiffness = 420f)) { it } + fadeIn(tween(MmMotion.Fast)),
                exit = if (reduced) fadeOut(tween(0)) else slideOutVertically(tween(MmMotion.Fast, easing = MmMotion.Exit)) { it } + fadeOut(tween(MmMotion.Fast)),
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(
                            start = MmTabBarMetrics.sideInset,
                            end = MmTabBarMetrics.sideInset,
                            bottom = MmTabBarMetrics.bottomGap,
                        ),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    MmBottomBar(
                        items = motormilaTabItems(badges),
                        selectedKey = selected,
                        onSelect = { onNavigate(it.key) },
                        onReselect = { onReselect(it.key) },
                        minimized = barState.minimized,
                        onExpand = barState::expand,
                        modifier = Modifier.weight(1f),
                    )
                    AnimatedVisibility(
                        visible = showAssistant,
                        enter = if (reduced) fadeIn(tween(0)) else expandHorizontally(spring(dampingRatio = 0.82f, stiffness = 380f), expandFrom = Alignment.Start) +
                            scaleIn(spring(dampingRatio = 0.55f, stiffness = 420f), initialScale = 0.6f) + fadeIn(tween(MmMotion.Fast)),
                        exit = if (reduced) fadeOut(tween(0)) else shrinkHorizontally(spring(dampingRatio = 0.9f, stiffness = 420f), shrinkTowards = Alignment.Start) +
                            scaleOut(tween(MmMotion.Fast), targetScale = 0.6f) + fadeOut(tween(MmMotion.Fast)),
                    ) {
                        Row {
                            Spacer(Modifier.width(MmTabBarMetrics.accessoryGap))
                            MmGlassCircleButton(
                                icon = Icons.Filled.AutoAwesome,
                                contentDescription = stringResource(R.string.mm_assistant),
                                onClick = { showAIChat = true },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAIChat) {
        CompositionLocalProvider(LocalGlassEnv provides glassEnv) {
            AIChatBottomSheet(
                onDismissRequest = { showAIChat = false },
                onOpenListing = { listingId ->
                    showAIChat = false
                    onOpenListing?.invoke(listingId) ?: onNavigate("listing/$listingId")
                },
            )
        }
    }
}
