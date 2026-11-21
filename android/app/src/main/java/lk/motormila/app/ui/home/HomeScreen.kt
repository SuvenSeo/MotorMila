package lk.motormila.app.ui.home

import android.app.Activity
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
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
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing

/**
 * Home, v1.10 "Showroom": a full-bleed stage-ink hero (featured deal photo
 * fading into the night band, kicker eyebrow, display headline with one
 * accent word, sub-line, search pill) → inventory first (best priced, price
 * drops) → labelled market strip → tools → most listed models → districts.
 * Major sections breathe at 48dp, minor ones at 24dp; every header is the
 * web eyebrow + title. Rail and hero cards share the ListingCard → Detail
 * container transform, and each listing registers its shared keys once.
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

    // Edge-to-edge: the stage hero runs under the status bar; the feed then
    // scrolls under a glass status-bar strip (top) and the floating glass
    // tab bar (bottom).
    val chrome = lk.motormila.app.ui.LocalBottomChrome.current
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val homeBackdrop = androidx.compose.runtime.remember { dev.chrisbanes.haze.HazeState() }
    val statusTop = androidx.compose.foundation.layout.WindowInsets.statusBars
        .asPaddingValues().calculateTopPadding()
    // Re-tapping the active Buy tab scrolls Home back to the top. Only a NEW
    // tick counts: the last handled one survives recomposition and coming
    // back to Home, so returning from Detail never jumps to the top (audit #5).
    val reselectTick = LocalTabReselect.current.tickFor(MotormilaTabs.BUY)
    var handledReselect by rememberSaveable { mutableStateOf(reselectTick) }
    LaunchedEffect(reselectTick) {
        if (reselectTick > handledReselect) {
            handledReselect = reselectTick
            listState.animateScrollToItem(0)
        }
    }
    // Light status-bar icons while the stage hero is under the status bar.
    HomeStatusBarIcons(overHero = { listState.firstVisibleItemIndex == 0 })

    // One shared-element registration per listing: the hero takes the first
    // deal with a photo, the best-priced rail the rest, and price drops only
    // listings neither of those already shows (audit: duplicate keys).
    val hotDeals = state.insights.hotDeals
    val featured = remember(hotDeals) { hotDeals.firstOrNull { !it.thumbnailUrl.isNullOrBlank() } }
    val railDeals = remember(hotDeals, featured) {
        hotDeals.distinctBy { it.id }.filter { it.id != featured?.id }.take(10)
    }
    val railDrops = remember(state.priceDrops, featured, railDeals) {
        val shown = railDeals.mapTo(HashSet()) { it.id }.apply { featured?.let { add(it.id) } }
        state.priceDrops.distinctBy { it.listing.id }.filter { it.listing.id !in shown }.take(10)
    }
    val trending = remember(state.insights.trendingModels) {
        state.insights.trendingModels.distinctBy { it.make to it.model }.take(5)
    }
    val districts = remember(state.districts) { state.districts.distinctBy { it.district }.take(12) }
    // Offline / unreachable with nothing to show: one honest error state in
    // place of the strip and rails, never a "0 listed" strip.
    val showError = !state.isLoading && state.error != null && !state.hasMarketData

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
            // The hero owns the status-bar inset (its photo runs under it);
            // the end clears the floating glass tab bar. Section rhythm is
            // set per item (major 48dp, minor 24dp), not one uniform gap.
            contentPadding = PaddingValues(bottom = chrome.contentPadding),
        ) {
            // 1. Stage hero: featured photo + lockup, kicker, headline, search.
            item(key = "hero", contentType = "hero") {
                HomeStageHero(
                    featured = featured,
                    statusTop = statusTop,
                    onFeaturedClick = { onListingClick(it.id) },
                    onSearchClick = onSearchClick,
                    onAlertsClick = onAlertsClick,
                )
            }

            // 2. Offline / cached notice, right under the hero.
            if (state.isOffline || state.showCachedBadge) {
                item(key = "offline", contentType = "offline") {
                    OfflineBanner(
                        visible = true,
                        onDismiss = onDismissCached,
                        onRetry = onRetry,
                        modifier = Modifier.padding(top = MmSpacing.lg),
                    )
                }
            }

            // 3. Announcement (market updates, dismissible, persisted): a
            // compact rounded card under the hero, no longer above the lockup.
            item(key = "banner", contentType = "banner") {
                Box(
                    Modifier
                        .padding(top = MmSpacing.lg, start = MmSpacing.gutter, end = MmSpacing.gutter)
                        .clip(MmShapes.lg),
                ) {
                    banner()
                }
            }

            if (state.isLoading && railDeals.isEmpty() && railDrops.isEmpty()) {
                item(key = "skeleton", contentType = "skeleton") {
                    LoadingSkeletonCard(Modifier.padding(top = MmSpacing.xxl, start = MmSpacing.gutter, end = MmSpacing.gutter))
                }
            }

            if (showError) {
                item(key = "error", contentType = "error") {
                    ErrorState(
                        message = state.error ?: stringResource(R.string.v19_unknown_error),
                        onRetry = onRetry,
                        cachedAvailable = false,
                        onLogin = onLoginClick,
                        modifier = Modifier.padding(top = MmSpacing.xxl, start = MmSpacing.gutter, end = MmSpacing.gutter),
                    )
                }
            }

            // 4. Best priced (real hot deals only; the featured one is in the hero).
            if (railDeals.isNotEmpty()) {
                item(key = "deals", contentType = "rail") {
                    Column(
                        Modifier.padding(top = MmSpacing.huge),
                        verticalArrangement = Arrangement.spacedBy(MmSpacing.md),
                    ) {
                        MmSectionHeader(
                            stringResource(R.string.mm_home_best_priced),
                            onSeeAll = { onSeeAll("deals") },
                            eyebrow = stringResource(R.string.v110_home_eyebrow_deals),
                        )
                        HomeDealRail(railDeals, onClick = onListingClick)
                    }
                }
            }

            // 5. Price drops (minor rhythm: same inventory story as above).
            if (railDrops.isNotEmpty()) {
                item(key = "drops", contentType = "rail") {
                    Column(
                        Modifier.padding(top = if (railDeals.isNotEmpty()) MmSpacing.xxl else MmSpacing.huge),
                        verticalArrangement = Arrangement.spacedBy(MmSpacing.md),
                    ) {
                        MmSectionHeader(
                            stringResource(R.string.mm_home_price_drops),
                            onSeeAll = { onSeeAll("drops") },
                            eyebrow = stringResource(R.string.v110_home_eyebrow_drops),
                        )
                        HomeDropRail(railDrops, onClick = onListingClick)
                    }
                }
            }

            // 6. Market strip: labelled honest counts. Shown once there is
            // something real (live or kept from an earlier load).
            if (!state.isLoading && !showError) {
                item(key = "market", contentType = "market") {
                    Column(
                        Modifier.padding(top = MmSpacing.huge),
                        verticalArrangement = Arrangement.spacedBy(MmSpacing.lg),
                    ) {
                        MmSectionHeader(
                            stringResource(R.string.v110_home_market_title),
                            onSeeAll = null,
                            eyebrow = stringResource(R.string.v110_home_eyebrow_market),
                        )
                        HomeMarketStrip(
                            totalListings = state.summary.totalListings,
                            new24h = state.insights.newListings24h,
                            avgPriceLkr = state.summary.avgPriceLkr,
                        )
                    }
                }
            }

            // 7. Tools: four primary tiles + "More" overflow.
            item(key = "tools", contentType = "tools") {
                Column(
                    Modifier.padding(top = MmSpacing.huge),
                    verticalArrangement = Arrangement.spacedBy(MmSpacing.lg),
                ) {
                    MmSectionHeader(
                        stringResource(R.string.v110_home_tools_title),
                        onSeeAll = null,
                        eyebrow = stringResource(R.string.v110_home_eyebrow_tools),
                    )
                    HomeShortcutGrid(
                        onBestPicksClick = onBestPicksClick,
                        onPriceIndexClick = onPriceIndexClick,
                        onCalculatorClick = onCalculatorClick,
                        onEvHubClick = onEvHubClick,
                        onPulseClick = onPulseClick,
                        onPermitsClick = onPermitsClick,
                    )
                }
            }

            // 8. Most listed models
            if (trending.isNotEmpty()) {
                item(key = "trending", contentType = "trending") {
                    Column(
                        Modifier.padding(top = MmSpacing.huge),
                        verticalArrangement = Arrangement.spacedBy(MmSpacing.md),
                    ) {
                        MmSectionHeader(
                            stringResource(R.string.mm_home_trending),
                            onSeeAll = { onSeeAll("trends") },
                            eyebrow = stringResource(R.string.v110_home_eyebrow_models),
                        )
                        HomeTrendingList(trending) { onMakeModelClick(it.make, it.model) }
                    }
                }
            }

            // 9. Districts (minor rhythm after the models list).
            if (districts.isNotEmpty()) {
                item(key = "districts", contentType = "districts") {
                    Column(
                        Modifier.padding(top = if (trending.isNotEmpty()) MmSpacing.xxl else MmSpacing.huge),
                        verticalArrangement = Arrangement.spacedBy(MmSpacing.md),
                    ) {
                        MmSectionHeader(
                            stringResource(R.string.mm_home_districts),
                            onSeeAll = { onSeeAll("districts") },
                            eyebrow = stringResource(R.string.v110_home_eyebrow_districts),
                        )
                        HomeDistrictRail(districts, onClick = onDistrictClick)
                    }
                }
            }

            // 10. Empty state: reached the backend, but there is no inventory.
            if (!state.isLoading && !showError && state.priceDrops.isEmpty() && hotDeals.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        title = stringResource(R.string.home_empty_title),
                        body = stringResource(R.string.home_empty_body),
                        ctaLabel = stringResource(R.string.home_empty_cta),
                        onCta = onSearchClick,
                        modifier = Modifier.padding(top = MmSpacing.huge, start = 16.dp, end = 16.dp),
                    )
                }
            }
        }
    }
    // Glass strip under the status bar once the feed scrolls beneath it.
    lk.motormila.app.ui.components.GlassStatusBarStrip(
        backdrop = homeBackdrop,
        // Clear over the stage hero (light icons on the photo), glass once
        // the hero has scrolled away.
        alpha = { if (listState.firstVisibleItemIndex > 0) 1f else 0f },
    )
    }
}

/**
 * Light status-bar icons while the stage hero (dark in both themes) sits
 * under the status bar; the theme's own appearance otherwise. Runs only
 * while Home is RESUMED and restores the theme icons when it pauses, so it
 * never fights Detail's own photo-aware icons (DetailStatusBarIcons) during
 * the card → Detail transition. Two frames are skipped on resume so a
 * closing Detail's on-dispose reset lands first.
 */
@Composable
private fun HomeStatusBarIcons(overHero: () -> Boolean) {
    val view = LocalView.current
    val dark = lk.motormila.app.ui.theme.MmColors.current.isDark
    val owner = LocalLifecycleOwner.current
    if (view.isInEditMode) return
    LaunchedEffect(view, dark, owner) {
        val window = (view.context as? Activity)?.window ?: return@LaunchedEffect
        val bars = WindowCompat.getInsetsController(window, view)
        owner.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            try {
                withFrameNanos { }
                withFrameNanos { }
                snapshotFlow { overHero() }.collect { over ->
                    bars.isAppearanceLightStatusBars = !over && !dark
                }
            } finally {
                bars.isAppearanceLightStatusBars = !dark
            }
        }
    }
}
