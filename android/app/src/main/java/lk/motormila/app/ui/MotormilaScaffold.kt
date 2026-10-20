package lk.motormila.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.ui.chat.AIChatBottomSheet
import lk.motormila.app.ui.components.MmBottomBar
import lk.motormila.app.ui.components.MmBottomBarItem
import lk.motormila.app.ui.home.badgeFor
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.mmPress

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
 * App shell: [MmBottomBar] (sliding indicator, icon spring, haptics) and a
 * single quiet AI-assistant button on the Buy and Prices tabs. Plate scan
 * moved to the Tools tab (and the search bar), so content is no longer
 * covered by a floating FAB stack.
 *
 * [selected] is a [MotormilaTabs] key, or "" for full-screen routes.
 * [onScan] is kept for API compatibility (Tools owns the entry now).
 */
@OptIn(ExperimentalMaterial3Api::class)
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

    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = {
            AnimatedVisibility(
                visible = showBottomBar,
                enter = if (reduced) fadeIn(tween(0)) else slideInVertically(MmMotion.snappy()) { it } + fadeIn(tween(MmMotion.Fast)),
                exit = if (reduced) fadeOut(tween(0)) else slideOutVertically(tween(MmMotion.Fast, easing = MmMotion.Exit)) { it } + fadeOut(tween(MmMotion.Fast)),
            ) {
                MmBottomBar(
                    items = motormilaTabItems(badges),
                    selectedKey = selected,
                    onSelect = { onNavigate(it.key) },
                    onReselect = { onReselect(it.key) },
                )
            }
        },
        floatingActionButton = {
            AnimatedVisibility(
                visible = showAssistant,
                enter = if (reduced) fadeIn(tween(0)) else scaleIn(MmMotion.snappy(), initialScale = 0.8f) + fadeIn(tween(MmMotion.Fast)),
                exit = if (reduced) fadeOut(tween(0)) else scaleOut(tween(MmMotion.Fast), targetScale = 0.8f) + fadeOut(tween(MmMotion.Fast)),
            ) {
                AssistantButton(onClick = { showAIChat = true })
            }
        },
        content = content,
    )

    if (showAIChat) {
        AIChatBottomSheet(
            onDismissRequest = { showAIChat = false },
            onOpenListing = { listingId ->
                showAIChat = false
                onOpenListing?.invoke(listingId) ?: onNavigate("listing/$listingId")
            },
        )
    }
}

@Composable
private fun AssistantButton(onClick: () -> Unit) {
    val c = MmColors.current
    val interaction = remember { MutableInteractionSource() }
    val label = stringResource(R.string.mm_assistant)
    Box(
        modifier = Modifier
            .padding(bottom = 4.dp)
            .size(52.dp)
            .mmPress(interaction, 0.92f)
            .shadow(12.dp, MmShapes.pill, ambientColor = Color.Black, spotColor = Color.Black)
            .clip(MmShapes.pill)
            .background(c.surfaceHigh)
            .border(1.dp, c.outlineStrong, MmShapes.pill)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = c.brandText, modifier = Modifier.size(22.dp))
    }
}
