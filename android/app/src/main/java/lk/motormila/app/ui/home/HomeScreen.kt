package lk.motormila.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import lk.motormila.app.ui.theme.glassBackdrop as glassBackdropOfImpl
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.ui.MotormilaTabs
import lk.motormila.app.ui.components.AnnouncementBanner
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.MmPullToRefresh
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.navigation.LocalTabReselect
import lk.motormila.app.ui.theme.MmSpacing

/**
 * Home, v1.9.0: brand lockup → display headline → one search entry → ONE
 * art-directed hero moment (the featured deal photo with its verdict) →
 * honest 3-stat market strip → four primary shortcuts + "More" overflow →
 * dot-eyebrow rails (best priced, price drops, most listed, districts) with
 * 32dp section rhythm. Rail cards share the ListingCard → Detail container
 * transform. No photography-free fold, no ticker, no legacy stat bento.
 *
 * Events: [onListingClick], [onSearchClick], [onAlertsClick], [onSeeAll]
 * (section key: "drops" | "deals" | "districts" | "trends").
 */
@OptIn(ExperimentalMaterial3Api::class)
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
    HomeContent(
        state = state,
        onRefresh = viewModel::refresh,
        onRetry = viewModel::retry,
        onDismissCached = viewModel::dismissCachedBadge,
        banner = { AnnouncementBanner(onViewDeals = onBestPicksClick) },
        onListingClick = onListingClick,
        onSearchClick = onSearchClick,
        onAlertsClick = onAlertsClick,
        onSeeAll = onSeeAll,
        onLoginClick = onLoginClick,
        onEvHubClick = onEvHubClick,
        onBestPicksClick = onBestPicksClick,
        onPulseClick = onPulseClick,
        onMakeModelClick = onMakeModelClick,
        onDistrictClick = onDistrictClick,
        onCalculatorClick = onCalculatorClick,
        onPriceIndexClick = onPriceIndexClick,
        onPermitsClick = onPermitsClick,
    )
}

/** Stateless Home body (previewable / Paparazzi-renderable). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeContent(
    state: HomeUiState,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onDismissCached: () -> Unit,
    banner: @Composable () -> Unit,
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
) {

    // Edge-to-edge: the feed scrolls under a glass status-bar strip (top) and
    // the floating glass tab bar (bottom).
    val chrome = lk.motormila.app.ui.LocalBottomChrome.current
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val homeBackdrop = androidx.compose.runtime.remember { dev.chrisbanes.haze.HazeState() }
    val statusTop = androidx.compose.foundation.layout.WindowInsets.statusBars
        .asPaddingValues().calculateTopPadding()
    // Re-tapping the active Buy tab scrolls Home back to the top without firing on fresh composition.
    val reselectTick = LocalTabReselect.current.tickFor(MotormilaTabs.BUY)
    val lastHandledTick = androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableIntStateOf(reselectTick) }
    LaunchedEffect(reselectTick) {
        if (reselectTick > lastHandledTick.intValue) {
            lastHandledTick.intValue = reselectTick
            listState.animateScrollToItem(0)
        }
    }
    androidx.compose.foundation.layout.Box(Modifier.fillMaxSize()) {
    MmPullToRefresh(
        isRefreshing = state.isRefreshing,
        onRefresh = onRefresh,
        indicatorTop = statusTop,
        modifier = Modifier
            .fillMaxSize()
            .glassBackdropOfImpl(homeBackdrop),
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            // Content clears the status bar at rest and the floating glass
            // tab bar at the end.
            contentPadding = PaddingValues(top = statusTop, bottom = chrome.contentPadding),
            // Major sections breathe at the 32dp section token (web rhythm);
            // header → rail gaps inside a section stay tight.
            verticalArrangement = Arrangement.spacedBy(MmSpacing.section),
        ) {
            // 0. Announcement banner (market updates, dismissible, persisted)
            item {
                banner()
            }

            // 1. Top row (lockup + alerts)
            item {
                Column {
                    if (state.isOffline || state.showCachedBadge) {
                        OfflineBanner(
                            visible = true,
                            onDismiss = onDismissCached,
                            onRetry = onRetry,
                        )
                    }
                    HomeTopRow(onAlertsClick = onAlertsClick)
                }
            }

            // 2. Hero: display headline, honest sub-line, one search entry
            item {
                HomeHero(
                    totalListings = state.summary.totalListings,
                    sourceCount = state.summary.sourceCount,
                    onSearchClick = onSearchClick,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }

            // 3. The one art-directed hero moment: featured deal, photo-first.
            val featured = state.insights.hotDeals.firstOrNull()
            if (featured != null) {
                item {
                    HomeFeaturedDeal(deal = featured, onClick = onListingClick)
                }
            }

            // 4. Market strip (honest counts) — skeleton / error / data
            item {
                // Skeleton -> content crossfades (no jump when data lands).
                val stripState = when {
                    state.isLoading -> 0
                    state.error != null && state.summary.totalListings == 0 &&
                        !state.isOffline && !state.showCachedBadge -> 1
                    else -> 2
                }
                androidx.compose.animation.AnimatedContent(
                    targetState = stripState,
                    transitionSpec = { lk.motormila.app.ui.theme.MmMotion.crossfade() },
                    label = "home-strip",
                ) { strip ->
                if (strip == 0) {
                    LoadingSkeletonCard(Modifier.padding(horizontal = MmSpacing.gutter))
                } else if (strip == 1) {
                    ErrorState(
                        message = state.error ?: stringResource(R.string.v19_unknown_error),
                        onRetry = onRetry,
                        cachedAvailable = false,
                        onLogin = onLoginClick,
                        modifier = Modifier.padding(horizontal = MmSpacing.gutter),
                    )
                } else {
                    HomeMarketStrip(
                        totalListings = state.summary.totalListings,
                        new24h = state.insights.newListings24h,
                        avgPriceLkr = state.summary.avgPriceLkr,
                    )
                }
                }
            }

            // 5. Best priced (real hot deals — inventory before tools, web parity).
            // The featured deal above is hotDeals[0], so drop it here to keep
            // shared-element keys unique.
            val railDeals = state.insights.hotDeals.drop(1).take(10)
            if (railDeals.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
                        MmSectionHeader(stringResource(R.string.mm_home_best_priced), onSeeAll = { onSeeAll("deals") })
                        HomeDealRail(railDeals, onClick = onListingClick)
                    }
                }
            }

            // 6. Price drops
            if (state.priceDrops.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
                        MmSectionHeader(stringResource(R.string.mm_home_price_drops), onSeeAll = { onSeeAll("drops") })
                        HomeDropRail(state.priceDrops.take(10), onClick = onListingClick)
                    }
                }
            }

            // 7. Shortcuts: four primary + "More" overflow
            item {
                HomeShortcutGrid(
                    onBestPicksClick = onBestPicksClick,
                    onPriceIndexClick = onPriceIndexClick,
                    onCalculatorClick = onCalculatorClick,
                    onEvHubClick = onEvHubClick,
                    onPulseClick = onPulseClick,
                    onPermitsClick = onPermitsClick,
                )
            }

            // 8. Most listed models
            if (state.insights.trendingModels.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
                        MmSectionHeader(stringResource(R.string.mm_home_trending), onSeeAll = { onSeeAll("trends") })
                        HomeTrendingList(state.insights.trendingModels.take(5)) { onMakeModelClick(it.make, it.model) }
                    }
                }
            }

            // 9. Districts
            if (state.districts.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
                        MmSectionHeader(stringResource(R.string.mm_home_districts), onSeeAll = { onSeeAll("districts") })
                        HomeDistrictRail(state.districts.take(12), onClick = onDistrictClick)
                    }
                }
            }

            // 10. Empty State
            if (!state.isLoading && state.priceDrops.isEmpty() && state.insights.hotDeals.isEmpty()) {
                item {
                    EmptyState(
                        title = stringResource(R.string.home_empty_title),
                        body = stringResource(R.string.home_empty_body),
                        ctaLabel = stringResource(R.string.home_empty_cta),
                        onCta = onSearchClick,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }
        }
    }
    // Glass strip under the status bar once the feed scrolls beneath it.
    lk.motormila.app.ui.components.GlassStatusBarStrip(
        backdrop = homeBackdrop,
        alpha = {
            if (listState.firstVisibleItemIndex > 0) 1f
            else (listState.firstVisibleItemScrollOffset / 40f).coerceIn(0f, 1f)
        },
    )
    }
}
