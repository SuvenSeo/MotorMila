package lk.motormila.app.ui.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.chrisbanes.haze.HazeState
import lk.motormila.app.R
import lk.motormila.app.ui.LocalBottomChrome
import lk.motormila.app.ui.MotormilaTabs
import lk.motormila.app.ui.components.GlassStatusBarStrip
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmPullToRefresh
import lk.motormila.app.ui.navigation.LocalTabReselect
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.glassBackdrop
import lk.motormila.app.ui.theme.mmTappable

/** Buy reuses the existing Search, Alerts and listing-detail routes (including fromCard).
 * Keep legacy navigation arguments source-compatible; tools/market destinations live on their tabs.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun HomeScreen(
    onListingClick: (Int) -> Unit,
    onSearchClick: () -> Unit,
    onAlertsClick: () -> Unit,
    onSeeAll: (String) -> Unit,
    onLoginClick: () -> Unit = {},
    onEvHubClick: () -> Unit = {},
    onBestPicksClick: () -> Unit = {},
    onPulseClick: () -> Unit = {},
    onMakeModelClick: (make: String, model: String) -> Unit = { _, _ -> },
    onDistrictClick: (district: String) -> Unit = {},
    onCalculatorClick: () -> Unit = {},
    onPriceIndexClick: () -> Unit = {},
    onPermitsClick: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    HomeContent(state = state, onRefresh = viewModel::refresh, onRetry = viewModel::retry,
        onDismissCached = viewModel::dismissCachedBadge, onListingClick = onListingClick,
        onSearchClick = onSearchClick, onAlertsClick = onAlertsClick)
}

/** Stateless body used by the shipping route and screenshot tests. The legacy banner and
 * see-all slots are not used: market promotions must not lead a buyer to an unrated bargain.
 */
@Suppress("UNUSED_PARAMETER")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeContent(
    state: HomeUiState,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onDismissCached: () -> Unit,
    banner: @Composable () -> Unit = {},
    onListingClick: (Int) -> Unit,
    onSearchClick: () -> Unit,
    onAlertsClick: () -> Unit,
    onSeeAll: (String) -> Unit = {},
) {
    val chrome = LocalBottomChrome.current
    val listState = rememberLazyListState()
    val backdrop = remember { HazeState() }
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val reselect = LocalTabReselect.current.tickFor(MotormilaTabs.BUY)
    LaunchedEffect(reselect) { if (reselect > 0) listState.animateScrollToItem(0) }
    val saved = state.savedVehicle
    val drop = remember(state.priceDrops, saved?.listingId) { state.recordedDrop }

    Box(Modifier.fillMaxSize()) {
        MmPullToRefresh(isRefreshing = state.isRefreshing, onRefresh = onRefresh, indicatorTop = statusTop,
            modifier = Modifier.fillMaxSize().glassBackdrop(backdrop)) {
            LazyColumn(state = listState, modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = statusTop, bottom = chrome.contentPadding + 20.dp)) {
                item(key = "masthead") { HomeTopRow(onAlertsClick, Modifier.padding(bottom = 8.dp)) }
                item(key = "entry") {
                    if (saved == null && state.shortlistReady) {
                        BuyerHomeIntroduction(onSearchClick)
                    } else {
                        Column {
                            if (saved != null) SavedVehicleSection(saved, onListingClick)
                            Spacer(Modifier.height(16.dp))
                            BuyerHomeSearch(onSearchClick)
                        }
                    }
                }
                if (state.showCachedBadge) {
                    item(key = "feed-status") {
                        FeedUnavailable(onRetry = onRetry, onDismiss = onDismissCached)
                    }
                }
                if (state.shortlistReady && drop != null) {
                    item(key = "change") {
                        Spacer(Modifier.height(MmSpacing.section))
                        RecordedDropSection(drop, onListingClick)
                    }
                }
            }
        }
        GlassStatusBarStrip(backdrop = backdrop, alpha = {
            if (listState.firstVisibleItemIndex > 0) 1f
            else (listState.firstVisibleItemScrollOffset / 40f).coerceIn(0f, 1f)
        })
    }
}

/** A failed optional feed is not a claim that the device is offline or that data is cached. */
@Composable
private fun FeedUnavailable(onRetry: () -> Unit, onDismiss: () -> Unit) {
    val c = MmColors.current
    Column(Modifier.fillMaxWidth().padding(start = MmSpacing.gutter, end = MmSpacing.gutter, top = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.buyer_home_feed_error), style = MmType.current.bodyM,
                color = c.textSecondary, modifier = Modifier.weight(1f))
            MmIconButton(icon = Icons.Outlined.Close, contentDescription = stringResource(R.string.v19_offline_dismiss_desc),
                onClick = onDismiss)
        }
        Box(Modifier.heightIn(min = 48.dp).mmTappable(role = Role.Button, onClick = onRetry)
            .padding(horizontal = 8.dp), contentAlignment = Alignment.CenterStart) {
            Text(stringResource(R.string.retry), style = MmType.current.label, color = c.brandText)
        }
    }
}
