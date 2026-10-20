package lk.motormila.app.ui.home

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
import lk.motormila.app.ui.components.SlidingNumber
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
    val haptics = rememberHaptics()
    val reducedMotion = rememberReducedMotion()

    MmPullToRefresh(
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            // Extra bottom clearance so the last card clears the nav dock
            // and the floating AI/scan buttons instead of sliding under them.
            contentPadding = PaddingValues(bottom = 128.dp),
            // Generous 22dp rhythm between sections — the web's airy,
            // confident feel rather than a cramped feed.
            verticalArrangement = Arrangement.spacedBy(MmSpacing.xxl),
        ) {
            // 0. Announcement banner (market updates, dismissible, persisted)
            item {
                AnnouncementBanner(onViewDeals = onBestPicksClick)
            }

            // 1. Top row (lockup + alerts) — design v2
            item {
                Column {
                    if (state.isOffline || state.showCachedBadge) {
                        OfflineBanner(
                            visible = true,
                            onDismiss = viewModel::dismissCachedBadge,
                            onRetry = viewModel::retry,
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

            // 3. Stats Row / Bento Metrics Card
            // When offline (banner showing), never show the blocking error —
            // the tappable banner is the single offline affordance and the
            // screen renders cached data beneath it.
            item {
                if (state.isLoading) {
                    LoadingSkeletonCard(Modifier.padding(horizontal = 16.dp))
                } else if (state.error != null && state.summary.totalListings == 0 &&
                    !state.isOffline && !state.showCachedBadge
                ) {
                    ErrorState(
                        message = state.error ?: "Unknown error",
                        onRetry = viewModel::retry,
                        cachedAvailable = false,
                        onLogin = onLoginClick,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                } else {
                    HeroStatsCard(
                        total = state.summary.totalListings,
                        goodDeals = state.summary.goodDealsCount,
                        new24h = state.insights.newListings24h,
                        avgPrice = state.summary.avgPriceLkr?.let { LkrFormat.price(it) },
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }

            // (design v2) How-it-works beam band and feature banners removed
            // from Home for calm; utilities live on the Tools tab.

            item {
                HubShortcutsRow(
                    onEvHubClick = onEvHubClick,
                    onPulseClick = onPulseClick,
                    onBestPicksClick = onBestPicksClick,
                    onCalculatorClick = onCalculatorClick,
                    onPriceIndexClick = onPriceIndexClick,
                    onPermitsClick = onPermitsClick,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }

            // 5. Live Incoming Feed Ticker — real listings only (no placeholder cars)
            item {
                val feedItems = remember(state.insights.hotDeals, live, state.priceDrops) {
                    when {
                        state.insights.hotDeals.isNotEmpty() ->
                            state.insights.hotDeals.take(4).map { deal ->
                                LiveFeedItem(
                                    title = "${deal.make} ${deal.model}",
                                    district = deal.district ?: "Sri Lanka",
                                    dealScoreText = "+${deal.dealScore.toInt()} deal",
                                    listingId = deal.id,
                                )
                            }
                        live.isNotEmpty() ->
                            live.take(4).map { listing ->
                                LiveFeedItem(
                                    title = "${listing.make} ${listing.model}",
                                    district = listing.district ?: "Sri Lanka",
                                    dealScoreText = listing.formattedPrice(),
                                    listingId = listing.id,
                                )
                            }
                        state.priceDrops.isNotEmpty() ->
                            state.priceDrops.take(4).map { drop ->
                                LiveFeedItem(
                                    title = drop.listing.displayName,
                                    district = drop.listing.district ?: "Sri Lanka",
                                    dealScoreText = LkrFormat.price(drop.newPriceLkr),
                                    listingId = drop.listing.id,
                                )
                            }
                        else -> emptyList()
                    }
                }
                if (feedItems.isNotEmpty()) {
                    LiveIncomingFeedTicker(
                        items = feedItems,
                        onItemClick = { item ->
                            if (item.listingId != null) {
                                onListingClick(item.listingId)
                            } else {
                                onSearchClick()
                            }
                        },
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }

            // 6. Trending Models Rail
            if (state.insights.trendingModels.isNotEmpty()) {
                item {
                    val trendingList = remember(state.insights.trendingModels) {
                        state.insights.trendingModels.take(4).map {
                            TrendingModelItem(
                                make = it.make,
                                model = it.model,
                                countText = "${LkrFormat.count(it.listingCount)} listed",
                                avgPriceText = "avg ${LkrFormat.price(it.avgPriceLkr)}",
                                imageUrl = it.thumbnailUrl,
                            )
                        }
                    }
                    TrendingModelsRail(
                        models = trendingList,
                        onSeeAllTrends = { onSeeAll("trends") },
                        onModelClick = { onMakeModelClick(it.make, it.model) },
                    )
                }
            }

            // 7. Live Now Strip (if available from streaming backend)
            if (live.isNotEmpty()) {
                item {
                    SectionRow(title = "Live now", onSeeAll = null)
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(live, key = { it.id }) { l ->
                            val tickerInteraction = remember(l.id) { MutableInteractionSource() }
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clip(MotormilaRadius.pill)
                                    .applePress(tickerInteraction, pressedScale = 0.95f)
                                    .clickable(
                                        interactionSource = tickerInteraction,
                                        indication = null,
                                    ) {
                                        if (!reducedMotion) haptics.tick()
                                        onListingClick(l.id)
                                    }
                                    .padding(end = 12.dp),
                            ) {
                                LivePulse()
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    "${l.make} ${l.model} · ${l.formattedPrice()}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Medium,
                                    color = MotormilaOnSurface,
                                )
                            }
                        }
                    }
                }
            }

            // 8. Hot Deals / Best Picks (with Context Eyebrow Capsule Badge)
            if (state.insights.hotDeals.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                        ContextCapsuleBadge(text = "• ✩ BEST PICKS", isAccent = true)
                        Spacer(Modifier.height(6.dp))
                    }
                    SectionRow(title = "Hot deals", onSeeAll = { onSeeAll("deals") })
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        itemsIndexed(state.insights.hotDeals.take(10), key = { _, deal -> deal.id }) { index, deal ->
                            HotDealCard(
                                title = "${deal.make} ${deal.model} ${deal.year ?: ""}".trim(),
                                imageUrl = deal.thumbnailUrl,
                                priceLkr = deal.priceLkr,
                                score = deal.dealScore,
                                isPro = state.isPro,
                                index = index,
                                belowFmv = deal.dealScore > 0,
                                onClick = { onListingClick(deal.id) },
                            )
                        }
                    }
                }
            }

            // 9. Price Drops Rail
            if (state.priceDrops.isNotEmpty()) {
                item {
                    SectionRow(title = "Price drops", onSeeAll = { onSeeAll("drops") })
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        itemsIndexed(state.priceDrops.take(10), key = { _, drop -> drop.listing.id }) { index, drop ->
                            PriceDropCard(
                                title = drop.listing.displayName,
                                imageUrl = drop.listing.heroImageUrl,
                                newPrice = LkrFormat.price(drop.newPriceLkr),
                                dropPct = drop.dropPct,
                                index = index,
                                onClick = { onListingClick(drop.listing.id) },
                            )
                        }
                    }
                }
            }

            // 10. Fuel Mix
            if (state.fuelMix.isNotEmpty()) {
                item {
                    SectionRow(title = "Fuel mix", onSeeAll = null)
                    FuelMixRow(
                        buckets = state.fuelMix,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }

            // 11. Districts
            if (state.districts.isNotEmpty()) {
                item {
                    SectionRow(title = "Districts", onSeeAll = { onSeeAll("districts") })
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(state.districts.take(12), key = { it.district }) { d ->
                            DistrictChip(
                                district = d.district,
                                count = d.count,
                                median = LkrFormat.price(d.medianPriceLkr),
                                onClick = { onDistrictClick(d.district) },
                            )
                        }
                    }
                }
            }

            // 12. Empty State
            if (!state.isLoading && state.priceDrops.isEmpty() && state.insights.hotDeals.isEmpty()) {
                item {
                    EmptyState(
                        title = "No market data yet",
                        body = "Pull to refresh — new listings appear here as scrapers run.",
                        ctaLabel = "Browse all vehicles",
                        onCta = onSearchClick,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }
        }
    }
}

/** Top navigation brand bar with live squircle mark and notification action. */
@Composable
private fun TopBrandBar(onAlertsClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        BrandLogo(
            size = BrandLogoSize.NAV,
            showLiveIndicator = true,
        )
        IconButton(
            onClick = onAlertsClick,
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .border(1.dp, MotormilaOutline, CircleShape),
        ) {
            Icon(
                Icons.Filled.Notifications,
                contentDescription = "Price alerts",
                tint = MotormilaOnSurface,
                modifier = Modifier.size(20.dp),
            )
        }
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
            .background(Color(0xFF141419))
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
 * Cinematic Hero Header with negative-tracked headline, electric blue accent,
 * dynamic subtitle, and dark liquid glass search pill with blue button.
 */
@Composable
private fun CinematicHeroHeader(
    total: Int,
    onSearchClick: () -> Unit,
    modifier: Modifier = Modifier,
    summarySourceCount: Int = 0,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        ContextCapsuleBadge(
            text = "• MARKET PULSE",
            isAccent = true,
        )

        Spacer(Modifier.height(14.dp))

        // Headline: "Sri Lanka's entire vehicle market, decoded."
        Text(
            text = buildAnnotatedString {
                withStyle(
                    SpanStyle(
                        color = MotormilaOnSurface,
                        fontWeight = FontWeight.ExtraBold,
                    )
                ) {
                    append("Sri Lanka's entire vehicle market, ")
                }
                withStyle(
                    SpanStyle(
                        color = MotormilaPrimaryBright,
                        fontWeight = FontWeight.ExtraBold,
                    )
                ) {
                    append("decoded.")
                }
            },
            style = MaterialTheme.typography.headlineLarge,
            lineHeight = 34.sp,
            letterSpacing = (-0.8).sp,
        )

        Spacer(Modifier.height(10.dp))

        // Subtitle with live listings count
        val countText = if (total > 0) "${LkrFormat.count(total)} live listings" else "Sri Lanka's live market"
        val sourcesText = if (summarySourceCount > 0) "$summarySourceCount sources" else "13 sources"
        Text(
            text = "$countText across $sourcesText — pricing, deal scores, and market intel in one place.",
            color = MotormilaSecondaryText,
            style = MaterialTheme.typography.bodyMedium,
            lineHeight = 21.sp,
            fontWeight = FontWeight.Normal,
        )

        Spacer(Modifier.height(16.dp))

        // Dark liquid glass pill with search icon and electric blue "SEARCH" button
        val searchPress = remember { MutableInteractionSource() }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .applePress(searchPress)
                .heightIn(min = 48.dp)
                .clip(MotormilaRadius.pill)
                .background(Color(0xFF131318))
                .border(1.dp, MotormilaOutline, MotormilaRadius.pill)
                .clickable(interactionSource = searchPress, indication = null, onClick = onSearchClick)
                .padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp)
                .semantics { contentDescription = "Search vehicles" },
            contentAlignment = Alignment.CenterStart,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Search,
                    contentDescription = null,
                    tint = Color(0x99FFFFFF),
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "Toyota Aqua, Honda Vezel, Wagon R...",
                    color = MotormilaSecondaryText,
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .clip(MotormilaRadius.pill)
                        .background(MotormilaPrimary)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "SEARCH",
                        color = Color.White,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                    )
                }
            }
        }
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
                    text = "LIVE LISTINGS",
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
                        text = "DATA AS OF 1H AGO",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp,
                        color = Color(0xFF69F0AE),
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
                    label = "AVG PRICE",
                    value = avgPrice ?: "—",
                    modifier = Modifier.weight(1f),
                )
                MotormilaMetricTile(
                    label = "NEW 24H",
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
                    label = "GOOD DEALS",
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

/**
 * Bento highlight cards matching web:
 * - VEHICLE TYPES ("Browse cars, vans, and SUVs across the live index.")
 * - VERIFIED SIGNALS ("Deal scores and seller trust baked into every listing.")
 */
@Composable
private fun FeatureBannersRow(
    onVehicleTypesClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        MotormilaGlass(
            onClick = onVehicleTypesClick,
            specular = true,
            modifier = Modifier
                .weight(1f)
                .height(115.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0x1F0A7AFF), Color(0x000A7AFF)),
                            radius = 280f,
                        )
                    )
                    .padding(14.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "VEHICLE TYPES",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.4.sp,
                            color = MotormilaPrimaryBright,
                        )
                        Icon(
                            imageVector = Icons.Filled.DirectionsCar,
                            contentDescription = null,
                            tint = MotormilaPrimaryBright.copy(alpha = 0.5f),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Text(
                        text = "Browse cars, vans, and SUVs across the live index.",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MotormilaOnSurface,
                        lineHeight = 16.sp,
                    )
                }
            }
        }

        MotormilaGlass(
            specular = true,
            modifier = Modifier
                .weight(1f)
                .height(115.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0x1A00C853), Color(0x0000C853)),
                            radius = 280f,
                        )
                    )
                    .padding(14.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "VERIFIED SIGNALS",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.4.sp,
                            color = Color(0xFF69F0AE),
                        )
                        Icon(
                            imageVector = Icons.Filled.Verified,
                            contentDescription = null,
                            tint = Color(0xFF69F0AE).copy(alpha = 0.5f),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Text(
                        text = "Deal scores and seller trust baked into every listing.",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MotormilaOnSurface,
                        lineHeight = 16.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun HubShortcutsRow(
    onEvHubClick: () -> Unit,
    onPulseClick: () -> Unit,
    onBestPicksClick: () -> Unit,
    onCalculatorClick: () -> Unit,
    onPriceIndexClick: () -> Unit,
    onPermitsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.hub_home_row).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.4.sp,
            color = MotormilaPrimaryBright,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            HubShortcutCard(
                title = stringResource(R.string.hub_ev_title),
                hint = stringResource(R.string.hub_home_ev_hint),
                icon = Icons.Filled.ElectricCar,
                contentDescription = stringResource(R.string.hub_open_ev),
                onClick = onEvHubClick,
                modifier = Modifier.weight(1f),
            )
            HubShortcutCard(
                title = stringResource(R.string.hub_pulse_title),
                hint = stringResource(R.string.hub_home_pulse_hint),
                icon = Icons.Filled.CellTower,
                contentDescription = stringResource(R.string.hub_open_pulse),
                onClick = onPulseClick,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            HubShortcutCard(
                title = stringResource(R.string.hub_picks_title),
                hint = stringResource(R.string.hub_home_picks_hint),
                icon = Icons.Filled.Star,
                contentDescription = stringResource(R.string.hub_open_picks),
                onClick = onBestPicksClick,
                modifier = Modifier.weight(1f),
            )
            HubShortcutCard(
                title = stringResource(R.string.hub_calc_title),
                hint = stringResource(R.string.hub_home_calc_hint),
                icon = Icons.Filled.Calculate,
                contentDescription = stringResource(R.string.hub_open_calc),
                onClick = onCalculatorClick,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            HubShortcutCard(
                title = stringResource(R.string.hub_index_title),
                hint = stringResource(R.string.hub_home_index_hint),
                icon = Icons.AutoMirrored.Filled.TrendingUp,
                contentDescription = stringResource(R.string.hub_open_index),
                onClick = onPriceIndexClick,
                modifier = Modifier.weight(1f),
            )
            HubShortcutCard(
                title = stringResource(R.string.hub_permits_title),
                hint = stringResource(R.string.hub_home_permits_hint),
                icon = Icons.Filled.Verified,
                contentDescription = stringResource(R.string.hub_open_permits),
                onClick = onPermitsClick,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun HubShortcutCard(
    title: String,
    hint: String,
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    MotormilaSurface(
        onClick = onClick,
        modifier = modifier
            .heightIn(min = 96.dp)
            .semantics { this.contentDescription = contentDescription },
        contentPadding = PaddingValues(12.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MotormilaPrimaryBright,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MotormilaOnSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = hint,
            style = MaterialTheme.typography.labelSmall,
            color = MotormilaSecondaryText,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Live incoming feed ticker with pulse eyebrow and real-time deal scoring stream.
 */
@Composable
private fun LiveIncomingFeedTicker(
    items: List<LiveFeedItem>,
    onItemClick: (LiveFeedItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    MotormilaGlass(
        modifier = modifier.fillMaxWidth(),
        specular = true,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Header Row: Pulse icon + LIVE INCOMING FEED + ((•)) SYNCED 2H
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        width = 0.5.dp,
                        color = MotormilaOutline,
                        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                    )
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LivePulse()
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "LIVE INCOMING FEED",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.3.sp,
                        color = MotormilaSecondaryText,
                    )
                }
                Text(
                    text = "((•)) SYNCED 2H",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp,
                    color = MotormilaPrimaryBright,
                )
            }

            // Real-time List Items with Flame Icon and Deal Score Badge
            Column(modifier = Modifier.fillMaxWidth()) {
                items.forEachIndexed { index, item ->
                    if (index > 0) {
                        Spacer(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(0.5.dp)
                                .background(MotormilaOutline),
                        )
                    }
                    val itemPress = remember { MutableInteractionSource() }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .applePress(itemPress)
                            .clickable(
                                interactionSource = itemPress,
                                indication = null,
                                onClick = { onItemClick(item) },
                            )
                            .padding(horizontal = 16.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.LocalFireDepartment,
                                contentDescription = null,
                                tint = MotormilaPrimaryBright,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = item.title,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                                color = MotormilaOnSurface,
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "· ${item.district}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MotormilaSecondaryText,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }

                        // Deal score badge in blue
                        Box(
                            modifier = Modifier
                                .clip(MotormilaRadius.pill)
                                .background(MotormilaPrimaryContainer)
                                .border(1.dp, MotormilaPrimaryBorder, MotormilaRadius.pill)
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = item.dealScoreText,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MotormilaPrimaryBright,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Trending models rail with ALL TRENDS ↗ action and rounded capsule cards.
 */
@Composable
private fun TrendingModelsRail(
    models: List<TrendingModelItem>,
    onSeeAllTrends: () -> Unit,
    onModelClick: (TrendingModelItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "Trending models",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = MotormilaOnSurface,
            )
            val trendsPress = remember { MutableInteractionSource() }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .applePress(trendsPress)
                    .heightIn(min = 48.dp)
                    .clickable(interactionSource = trendsPress, indication = null, onClick = onSeeAllTrends)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text(
                    text = "ALL TRENDS ↗",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp,
                    color = MotormilaPrimaryBright,
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(models, key = { "${it.make}-${it.model}" }) { item ->
                TrendingModelCard(
                    item = item,
                    onClick = { onModelClick(item) },
                )
            }
        }
    }
}

@Composable
private fun TrendingModelCard(
    item: TrendingModelItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    MotormilaGlass(
        onClick = onClick,
        modifier = modifier.width(260.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(MotormilaRadius.lg)
                    .background(Color(0xFF1B1B22)),
                contentAlignment = Alignment.Center,
            ) {
                if (item.imageUrl != null) {
                    AsyncImage(
                        model = item.imageUrl,
                        contentDescription = "${item.make} ${item.model}",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        imageVector = Icons.Filled.DirectionsCar,
                        contentDescription = null,
                        tint = MotormilaPrimaryBright,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${item.make} ${item.model}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MotormilaOnSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "${item.countText} · ${item.avgPriceText}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MotormilaSecondaryText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.width(8.dp))

            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                tint = MotormilaSecondaryText,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}


@Composable
private fun SectionRow(title: String, onSeeAll: (() -> Unit)?) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (onSeeAll != null) {
            val seeAllPress = remember { MutableInteractionSource() }
            Text(
                "See all",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MotormilaPrimaryBright,
                modifier = Modifier
                    .applePress(seeAllPress)
                    .heightIn(min = 48.dp)
                    .clickable(interactionSource = seeAllPress, indication = null, onClick = onSeeAll)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
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
                Text(newPrice, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
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
                        color = Color(0xFF69F0AE),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

/**
 * Deal-pulse card (motion spec §7.1): below-FMV listings get a living treatment —
 * a Deal-Green edge glow breathing on a 1600ms loop, the price in rolling digits,
 * and a soft spatialExpressive() settle on first appearance. The glow is gated to
 * below-FMV cards only and oscillates alpha, never scale.
 */
@Composable
private fun HotDealCard(
    title: String,
    imageUrl: String?,
    priceLkr: Double,
    score: Double,
    isPro: Boolean,
    onClick: () -> Unit,
    index: Int = 0,
    belowFmv: Boolean = true,
) {
    val reduced = rememberReducedMotion()
    // Breathing edge glow — infinite, alpha-only, below-FMV cards only.
    val glowTransition = rememberInfiniteTransition(label = "deal-glow")
    val glowPulse by glowTransition.animateFloat(
        initialValue = 0.28f,
        targetValue = 0.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = PULSE_MS),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "glow-alpha",
    )
    val glowActive = belowFmv && !reduced
    // Soft settle on first appearance.
    val settle = remember { Animatable(if (reduced) 1f else 0.97f) }
    LaunchedEffect(Unit) {
        if (!reduced) settle.animateTo(1f, MotionTokens.spatialExpressive())
    }
    // Price rolls in on first appearance via NumberTicker.
    var priceShown by remember { mutableStateOf(reduced) }
    LaunchedEffect(priceLkr) { priceShown = true }

    MotormilaGlass(
        onClick = onClick,
        modifier = Modifier
            .width(220.dp)
            .motormilaReveal(delayMillis = cascadeDelay(index))
            .graphicsLayer {
                scaleX = settle.value
                scaleY = settle.value
            }
            .then(
                if (glowActive) {
                    Modifier.border(
                        width = 1.5.dp,
                        color = MotormilaGood.copy(alpha = glowPulse),
                        shape = MotormilaRadius.lg,
                    )
                } else {
                    Modifier
                },
            ),
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
                if (priceLkr > 0) {
                    SlidingNumber(
                        value = if (priceShown) priceLkr.toLong() else 0L,
                        prefix = "Rs. ",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                        ),
                        color = MotormilaOnSurface,
                    )
                } else {
                    Text(
                        "Price on request",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                    )
                }
                Spacer(Modifier.height(4.dp))
                Row(
                    modifier = Modifier
                        .clip(MotormilaRadius.pill)
                        .background(if (isPro) MotormilaGoodContainer else MotormilaPrimaryContainer)
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (isPro) "★ %.1f DEAL".format(score) else "🔒 PRO SCORE",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (isPro) Color(0xFF69F0AE) else MotormilaPrimaryBright,
                    )
                }
            }
        }
    }
}

@Composable
private fun FuelMixRow(buckets: List<lk.motormila.app.domain.model.FuelMixBucket>, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        buckets.take(5).forEach { b ->
            MotormilaMetricTile(
                label = b.fuelType.replaceFirstChar(Char::uppercase),
                value = "${b.pct}%",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun DistrictChip(district: String, count: Int, median: String, onClick: () -> Unit) {
    MotormilaSurface(
        onClick = onClick,
        fillMaxWidth = false,
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
        modifier = Modifier.heightIn(min = 48.dp),
    ) {
        Text(district, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge, color = MotormilaOnSurface)
        Text("$count · $median", style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
    }
}
