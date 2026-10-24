package lk.motormila.app.ui.home

import lk.motormila.app.ui.theme.tabular
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import lk.motormila.app.ui.theme.glassBackdrop as glassBackdropOfImpl
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.CellTower
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.ElectricCar
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.ui.components.BrandLogo
import lk.motormila.app.ui.components.BrandLogoSize
import lk.motormila.app.ui.components.AnnouncementBanner
import lk.motormila.app.ui.components.HowItWorksBand
import lk.motormila.app.ui.components.NumberTicker
import lk.motormila.app.ui.components.SlidingLkr
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.MmPullToRefresh
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.components.LivePulse
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.cascadeDelay
import lk.motormila.app.ui.components.MotormilaGlass
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.components.rememberReducedMotion
import lk.motormila.app.ui.theme.MotionTokens
import lk.motormila.app.ui.theme.MotormilaGlassBorder
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaGoodContainer
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBorder
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaPrimaryContainer
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.PULSE_MS
import lk.motormila.app.ui.theme.applePress
import lk.motormila.app.ui.theme.motormilaReveal
import lk.motormila.app.ui.theme.rememberHaptics

/** Data representation for Trending Models rail. */
data class TrendingModelItem(
    val make: String,
    val model: String,
    val countText: String,
    val avgPriceText: String,
    val imageUrl: String? = null,
)

/** Data representation for Live Incoming Feed ticker item. */
data class LiveFeedItem(
    val title: String,
    val district: String,
    val dealScoreText: String,
    val listingId: Int? = null,
)

/**
 * Home: Cinematic Hero Header, Context Eyebrow Capsule Badges, Feature Banners,
 * Live Incoming Feed Ticker, Trending Models Rail, and Market Inventory.
 *
 * Events: [onListingClick], [onSearchClick], [onAlertsClick], [onSeeAll]
 * (section key: "drops" | "deals" | "districts" | "feed" | "trends").
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
    val live by viewModel.liveStrip.collectAsStateWithLifecycle()
    HomeContent(
        state = state,
        live = live,
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
    live: List<lk.motormila.app.domain.model.Listing>,
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
            // Generous 22dp rhythm between sections — the web's airy,
            // confident feel rather than a cramped feed.
            verticalArrangement = Arrangement.spacedBy(MmSpacing.xxl),
        ) {
            // 0. Announcement banner (market updates, dismissible, persisted)
            item {
                banner()
            }

            // 1. Top row (lockup + alerts) — design v2
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

            // 2. Calm hero: one line, honest counts, one search entry
            item {
                HomeHero(
                    totalListings = state.summary.totalListings,
                    sourceCount = state.summary.sourceCount,
                    onSearchClick = onSearchClick,
                    modifier = Modifier.padding(top = 12.dp, bottom = 8.dp),
                )
            }

            // 3. Market strip (honest counts) — skeleton / error / data
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
                        message = state.error ?: "Unknown error",
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

            // 4. Shortcuts
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

            // 5. Best priced (real hot deals only)
            if (state.insights.hotDeals.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        MmSectionHeader(stringResource(R.string.mm_home_best_priced), onSeeAll = { onSeeAll("deals") })
                        HomeDealRail(state.insights.hotDeals.take(10), onClick = onListingClick)
                    }
                }
            }

            // 6. Price drops
            if (state.priceDrops.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        MmSectionHeader(stringResource(R.string.mm_home_price_drops), onSeeAll = { onSeeAll("drops") })
                        HomeDropRail(state.priceDrops.take(10), onClick = onListingClick)
                    }
                }
            }

            // 7. Most listed models
            if (state.insights.trendingModels.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        MmSectionHeader(stringResource(R.string.mm_home_trending), onSeeAll = { onSeeAll("trends") })
                        HomeTrendingList(state.insights.trendingModels.take(5)) { onMakeModelClick(it.make, it.model) }
                    }
                }
            }

            // 8. Districts
            if (state.districts.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        MmSectionHeader(stringResource(R.string.mm_home_districts), onSeeAll = { onSeeAll("districts") })
                        HomeDistrictRail(state.districts.take(12), onClick = onDistrictClick)
                    }
                }
            }

            // 12. Empty State
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

/**
 * Signature context capsule badge (e.g. `• MARKET PULSE`, `• ✩ BEST PICKS`).
 */
@Composable
fun ContextCapsuleBadge(
    text: String,
    modifier: Modifier = Modifier,
    isAccent: Boolean = false,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(MotormilaRadius.pill)
            .background(lk.motormila.app.ui.theme.MotormilaSurfaceHigh)
            .border(
                width = 1.dp,
                color = if (isAccent) Color(0x440A7AFF) else MotormilaGlassBorder,
                shape = MotormilaRadius.pill,
            )
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(if (isAccent) MotormilaPrimaryBright else Color(0xFF00C853)),
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
            color = if (isAccent) MotormilaPrimaryBright else MotormilaOnSurface,
        )
    }
}

/**
 * Stats row / Bento card with LIVE LISTINGS eyebrow, DATA AS OF 1H AGO pill,
 * large bold count, sub-label, and metrics grid (AVG PRICE, NEW 24H, GOOD DEALS).
 */
@Composable
internal fun HeroStatsCard(
    total: Int,
    goodDeals: Int,
    new24h: Int,
    avgPrice: String?,
    modifier: Modifier = Modifier,
) {
    val reduced = rememberReducedMotion()
    var shown by remember { mutableStateOf(reduced) }
    LaunchedEffect(total) { shown = true }
    // Per-digit rolling ticker (web NumberTicker parity) instead of a plain count-up.
    val tickerValue = if (shown) total.toLong() else 0L

    MotormilaGlass(
        modifier = modifier.fillMaxWidth(),
        specular = true,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color(0x180A7AFF),
                            Color(0x000A7AFF),
                        )
                    )
                )
                .padding(16.dp)
        ) {
            // Eyebrow LIVE LISTINGS with DATA AS OF 1H AGO pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = stringResource(R.string.home_live_listings),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.5.sp,
                    color = MotormilaSecondaryText,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(MotormilaRadius.pill)
                        .background(Color(0x1F00C853))
                        .border(1.dp, Color(0x3300C853), MotormilaRadius.pill)
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF00C853))
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(
                        text = stringResource(R.string.home_data_fresh),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp,
                        color = lk.motormila.app.ui.theme.MotormilaGoodText,
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            // Bold count (207,786 or dynamic) — per-digit rolling ticker.
            if (total > 0) {
                NumberTicker(
                    value = tickerValue,
                            style = MaterialTheme.typography.displayMedium.copy(
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = (-0.03).em,
                            ),
                    color = MotormilaOnSurface,
                )
            } else {
                Text(
                    text = "—",
                    style = MaterialTheme.typography.displayMedium.copy(
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = (-0.03).em,
                    ),
                    color = MotormilaOnSurface,
                )
            }

            Spacer(Modifier.height(3.dp))

            // Sub-label
            Text(
                text = if (total > 0) "Live indexed inventory across Sri Lanka" else "Connect to the market feed to load listings",
                style = MaterialTheme.typography.labelSmall,
                color = MotormilaSecondaryText,
            )

            Spacer(Modifier.height(16.dp))

            // Metrics Grid (AVG PRICE: Rs. 8.63M, NEW 24H: 5,649, GOOD DEALS: 2,184)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MotormilaMetricTile(
                    label = stringResource(R.string.home_avg_price),
                    value = avgPrice ?: "—",
                    modifier = Modifier.weight(1f),
                )
                MotormilaMetricTile(
                    label = stringResource(R.string.home_new_24h),
                    modifier = Modifier.weight(1f),
                ) {
                    if (new24h > 0) {
                        NumberTicker(
                            value = new24h.toLong(),
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = FontWeight.Bold,
                            ),
                            color = MotormilaOnSurface,
                        )
                    } else {
                        Text(
                            text = "—",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold,
                            color = MotormilaOnSurface,
                        )
                    }
                }
                MotormilaMetricTile(
                    label = stringResource(R.string.home_good_deals),
                    modifier = Modifier.weight(1f),
                ) {
                    if (goodDeals > 0) {
                        NumberTicker(
                            value = goodDeals.toLong(),
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = FontWeight.Bold,
                            ),
                            color = MotormilaOnSurface,
                        )
                    } else {
                        Text(
                            text = "—",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold,
                            color = MotormilaOnSurface,
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun PriceDropCard(
    title: String,
    imageUrl: String?,
    newPrice: String,
    dropPct: Double,
    onClick: () -> Unit,
    index: Int = 0,
) {
    MotormilaGlass(
        onClick = onClick,
        modifier = Modifier
            .width(220.dp)
            .motormilaReveal(delayMillis = cascadeDelay(index)),
    ) {
        Column {
            AsyncImage(
                model = imageUrl,
                contentDescription = "Photo of $title",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(118.dp),
            )
            Column(Modifier.padding(12.dp)) {
                Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(newPrice, style = (MaterialTheme.typography.titleMedium).tabular(), fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Row(
                    modifier = Modifier
                        .clip(MotormilaRadius.pill)
                        .background(MotormilaGoodContainer)
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "▼ ${LkrFormat.deltaPct(dropPct)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = lk.motormila.app.ui.theme.MotormilaGoodText,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

