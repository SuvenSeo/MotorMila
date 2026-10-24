package lk.motormila.app.ui.screenshots

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.HotDeal
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.model.TrendingModel
import lk.motormila.app.ui.MotormilaTabs
import lk.motormila.app.ui.compare.CompareMatrix
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.FilterDraft
import lk.motormila.app.ui.components.FilterSheetBody
import lk.motormila.app.ui.components.FmvGauge
import lk.motormila.app.ui.components.ListingCard
import lk.motormila.app.ui.components.MmBottomBar
import lk.motormila.app.ui.components.MmDealVerdict
import lk.motormila.app.ui.components.MmEmptyState
import lk.motormila.app.ui.components.MmPriceChart
import lk.motormila.app.ui.components.MmSheetFrame
import lk.motormila.app.ui.components.SearchBar
import lk.motormila.app.ui.detail.BeforeYouPayCard
import lk.motormila.app.ui.detail.BentoSpecsGrid
import lk.motormila.app.ui.detail.DealLadder
import lk.motormila.app.ui.detail.DealVerdictRow
import lk.motormila.app.ui.detail.DetailActionBar
import lk.motormila.app.ui.detail.DetailGallery
import lk.motormila.app.ui.detail.PriceDealSection
import lk.motormila.app.ui.home.HeroStatsCard
import lk.motormila.app.ui.home.HomeContent
import lk.motormila.app.ui.home.HomeUiState
import lk.motormila.app.ui.home.PriceDropCard
import lk.motormila.app.ui.motormilaTabItems
import lk.motormila.app.ui.pricing.PricingContent
import lk.motormila.app.ui.profile.ProfileActions
import lk.motormila.app.ui.profile.ProfileContent
import lk.motormila.app.ui.profile.UiProfile
import lk.motormila.app.ui.search.SortFilterRow
import lk.motormila.app.ui.splash.SplashScreen
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.tools.ToolsScreen
import lk.motormila.app.ui.valuation.QuizResult
import lk.motormila.app.ui.valuation.ValuationContent
import lk.motormila.app.ui.valuation.ValuationQuiz
import lk.motormila.app.ui.valuation.ValuationUiState
import org.junit.Assume
import org.junit.Rule
import org.junit.Test

/**
 * Visual sweep (review shots, NOT CI goldens): every screen x [Sweep.matrix]
 * (light/dark, 100/130/200 % font, 360/411 dp, en/si/ta) with stress data.
 * Skipped unless MM_SWEEP=1:
 * `MM_SWEEP=1 ./gradlew :app:recordPaparazziPlayDebug --tests '*VisualSweepScreenshotsTest*'`
 * Images land in src/test/snapshots/images — do NOT commit them.
 */
/** TEMPORARY: true only while the sweep renders in PR CI (no arm64 layoutlib locally). */
private const val SWEEP_ALWAYS = true

class VisualSweepScreenshotsTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    private fun sweep(screen: String, reducedMotion: Boolean = true, content: @Composable () -> Unit) {
        Assume.assumeTrue(SWEEP_ALWAYS || System.getenv("MM_SWEEP") == "1")
        Sweep.matrix.forEach { cfg ->
            paparazzi.unsafeUpdateConfig(deviceConfig = cfg.device())
            paparazzi.snapshot(name = "${screen}_${cfg.id}") {
                Sweep.Frame(cfg, reducedMotion) { content() }
            }
        }
    }

    private fun one(screen: String, reducedMotion: Boolean = true, content: @Composable () -> Unit) {
        // Each screen gets its own test so a crash in one does not hide the rest.
        sweep(screen, reducedMotion, content)
    }

    // ---------- Listing detail ----------

    @Test fun detail_price_drop_animated() = one("detail_price_drop_anim", reducedMotion = false) { DetailPriceBlock() }

    @Test fun detail_price_drop_reduced() = one("detail_price_drop_reduced") { DetailPriceBlock() }

    @Composable
    private fun DetailPriceBlock() {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PriceDealSection(Sweep.nissan, isPro = false, onDealShown = {}, history = Sweep.drop(7, 1_125_000.0, 950_000.0))
                PriceDealSection(Sweep.longPrice, isPro = true, onDealShown = {}, history = Sweep.drop(8, 132_500_000.0, 125_000_000.0))
                PriceDealSection(Sweep.zeroPrice, isPro = false, onDealShown = {}, history = null)
                PriceDealSection(Sweep.negative, isPro = true, onDealShown = {}, history = null)
            }
            DetailActionBar(125_000_000.0, "Riyasewana", onViewSource = {}, modifier = Modifier.align(Alignment.BottomCenter))
        }
    }

    @Test fun detail_sticky_bars() = one("detail_sticky_bars", reducedMotion = false) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.Bottom)) {
            DetailActionBar(950_000.0, "Riyasewana", onViewSource = {})
            DetailActionBar(125_000_000.0, "Riyasewana", onViewSource = {})
            DetailActionBar(7_250_000.0, "ikman.lk", onViewSource = {})
            DetailActionBar(0.0, "patpat.lk", onViewSource = {})
            DetailActionBar(125_000_000.0, "Riyasewana", onViewSource = null)
        }
    }

    @Test fun detail_sections() = one("detail_sections") {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DealVerdictRow(MmDealVerdict.compute(125_000_000.0, 118_000_000.0, ratingAllowed = true), onWhy = {})
            DealVerdictRow(MmDealVerdict.compute(1_850_000.0, 2_900_000.0, ratingAllowed = true), onWhy = {})
            FmvGauge(
                Fmv(
                    askingLkr = 125_000_000.0, fmvLkr = 118_000_000.0, dealScore = -4.0, deltaPct = 5.9,
                    band = DealBand.HIGH, label = "overpriced", method = null, sampleCount = 12, confidence = "medium",
                ),
                onExplainClick = {},
            )
            DealLadder(askingLkr = 125_000_000.0, fmvLkr = 118_000_000.0)
            BentoSpecsGrid(Sweep.longPrice)
            BentoSpecsGrid(Sweep.negative)
            MmPriceChart(
                points = listOf(
                    PricePoint(132_500_000.0, "2026-08-01"), PricePoint(130_000_000.0, "2026-08-20"),
                    PricePoint(128_000_000.0, "2026-09-25"), PricePoint(125_000_000.0, "2026-10-12"),
                ),
                typicalLkr = 118_000_000.0,
            )
        }
    }

    @Test fun detail_gallery_and_safety() = one("detail_gallery_safety") {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            DetailGallery(images = emptyList(), title = Sweep.LONG_TITLE, listingId = 8, onOpenViewer = {})
            Box(Modifier.padding(16.dp)) { BeforeYouPayCard() }
        }
    }

    // ---------- Cards / search / filters ----------

    @Composable
    private fun StressCards() {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ListingCard(Sweep.longPrice, isWatched = true, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f), compareSelected = true, onCompareToggle = {})
                ListingCard(Sweep.zeroPrice, isWatched = false, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f), compareSelected = false, onCompareToggle = {})
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ListingCard(Sweep.negative, isWatched = false, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f))
                ListingCard(Sweep.nissan, isWatched = false, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f))
            }
        }
    }

    @Test fun listing_cards() = one("listing_cards") { Column(Modifier.verticalScroll(rememberScrollState())) { StressCards() } }

    @Test fun search() = one("search") {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                SearchBar(
                    query = "Mercedes-Benz S-Class S400d AMG Line", onQueryChange = {}, onSearch = {}, suggestions = emptyList(), recentSearches = emptyList(),
                    onSuggestionClick = {}, onRecentClick = {}, onVoiceClick = {},
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), showDropdown = false,
                )
                SortFilterRow(sort = "price_desc", onSort = {}, onFilters = {}, onCreateAlert = {}, gridMode = true, onToggleLayout = {})
                StressCards()
            }
            Column(Modifier.align(Alignment.BottomCenter)) {
                lk.motormila.app.ui.search.CompareTray(
                    count = 3, onCompare = {}, onClear = {},
                    thumbnails = listOf(
                        lk.motormila.app.ui.search.CompareThumb(1, null),
                        lk.motormila.app.ui.search.CompareThumb(2, null),
                        lk.motormila.app.ui.search.CompareThumb(3, null),
                    ),
                )
                MmBottomBar(motormilaTabItems(mapOf("watchlist" to 128)), MotormilaTabs.BUY, onSelect = {}, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
            }
        }
    }

    @Test fun filter_sheet() = one("filter_sheet") {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().background(MmColors.current.scrim))
            MmSheetFrame(title = "Filters", modifier = Modifier.align(Alignment.BottomCenter)) {
                FilterSheetBody(
                    draft = FilterDraft(make = "Mercedes-Benz", model = "S-Class", priceMin = 0.0, priceMax = 125_000_000.0, yearMin = 2014, fuelType = "hybrid", condition = "reconditioned"),
                    onDraftChange = {},
                    makes = listOf("Mercedes-Benz", "Toyota", "Honda", "Suzuki", "Nissan"),
                    districts = listOf("Colombo", "Gampaha", "Kandy", "Nuwara Eliya", "Anuradhapura", "Kalutara"),
                    onReset = {},
                    onApply = {},
                )
            }
        }
    }

    // ---------- Home ----------

    private fun homeState() = HomeUiState(
        isLoading = false,
        summary = StatsSummary(totalListings = 1_248_210, avgPriceLkr = 125_000_000.0, goodDealsCount = 91_284, sourceCount = 6),
        insights = Insights(
            newListings24h = 15_342,
            trendingModels = listOf(
                TrendingModel("Mercedes-Benz", "S-Class S400d AMG Line", 2_140, 125_000_000.0, -12.4, null),
                TrendingModel("Suzuki", "Wagon R", 1_870, 5_600_000.0, 0.0, null),
            ),
            hotDeals = listOf(
                HotDeal(1, "Mercedes-Benz", "S-Class S400d AMG Line Premium", 2019, "Nuwara Eliya", "riyasewana", 125_000_000.0, 10.4, null),
                HotDeal(2, "Honda", "Fit", 2015, "Gampaha", "ikman", 0.0, -7.8, null),
            ),
        ),
        priceDrops = listOf(
            PriceDrop(Sweep.longPrice, 132_500_000.0, 125_000_000.0, 5.7, "2026-10-18"),
            PriceDrop(Sweep.nissan, 1_125_000.0, 950_000.0, 15.6, "2026-10-17"),
        ),
    )

    @Test fun home() = one("home", reducedMotion = false) {
        Box(Modifier.fillMaxSize()) {
            HomeContent(
                state = homeState(), live = emptyList(), onRefresh = {}, onRetry = {}, onDismissCached = {},
                banner = {}, onListingClick = {}, onSearchClick = {}, onAlertsClick = {}, onSeeAll = {},
            )
            MmBottomBar(motormilaTabItems(emptyMap()), MotormilaTabs.BUY, onSelect = {}, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
        }
    }

    @Test fun home_parts() = one("home_parts", reducedMotion = false) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            HeroStatsCard(total = 1_248_210, goodDeals = 91_284, new24h = 15_342, avgPrice = "Rs 125 Mn")
            PriceDropCard(title = Sweep.LONG_TITLE, imageUrl = null, newPrice = "Rs 125,000,000", dropPct = 5.7, onClick = {})
            ErrorState(message = "Couldn't reach Motormila. Check your connection and try again.", onRetry = {}, cachedAvailable = true, onShowCached = {})
        }
    }

    @Test fun empty_state() = one("empty_state") {
        Box(Modifier.fillMaxSize()) {
            MmEmptyState(
                icon = Icons.Filled.Search,
                title = "No cars match yet",
                message = "Try widening the budget or clearing a filter.",
                primaryAction = "Reset filters" to {},
                modifier = Modifier.align(Alignment.Center),
            )
            MmBottomBar(motormilaTabItems(mapOf("watchlist" to 3)), MotormilaTabs.BUY, onSelect = {}, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
        }
    }

    // ---------- Other screens ----------

    @Test fun compare() = one("compare") {
        CompareMatrix(
            items = listOf(Sweep.longPrice, Sweep.zeroPrice, Sweep.negative),
            onlyDifferences = false, onToggleDifferences = {}, onOpenDetail = {}, onRemove = {}, onAdd = {},
        )
    }

    @Test fun tools() = one("tools") {
        Box(Modifier.fillMaxSize()) {
            ToolsScreen({}, {}, {}, {}, {}, {}, {}, {}, {})
            MmBottomBar(motormilaTabItems(mapOf("watchlist" to 3)), MotormilaTabs.TOOLS, onSelect = {}, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
        }
    }

    @Test fun valuation_result() = one("valuation_result") {
        ValuationContent(
            ValuationUiState(
                step = 3, make = "Mercedes-Benz", model = "S-Class S400d AMG Line", year = 2019, mileage = "92000",
                registration = ValuationQuiz.Registration.USED, makesLoading = false,
                result = QuizResult(
                    low = 118_000_000.0, median = 125_000_000.0, high = 132_500_000.0,
                    confidence = "low", comparableCount = 0, methodology = "", comparables = emptyList(),
                ),
            ),
            {}, {}, { _, _ -> },
        )
    }

    @Test fun pricing() = one("pricing") {
        PricingContent(
            isPro = false, externalCheckout = false, dealerBusy = false,
            onOpenHome = {}, onOpenPro = {}, onDealer = {}, onOpenDealer = {},
            notify = { Spacer(Modifier.height(1.dp)) },
        )
    }

    @Test fun profile() = one("profile") {
        ProfileContent(
            UiProfile(
                displayName = "Selvanathan Suven Seoras", email = "suvenseoras2992007@gmail.com", planName = "Free", isPro = false,
                role = "user", isAdmin = false, sessionState = "signed_in", expiresAt = null,
                watchlistCount = 128, alertCount = 0, loggedIn = true,
            ),
            ProfileActions(),
        )
    }

    @Test fun splash() = one("splash") { SplashScreen(onDone = {}, animate = false) }
}
