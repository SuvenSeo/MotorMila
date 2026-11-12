package lk.motormila.app.ui.screenshots

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.ui.MotormilaTabs
import lk.motormila.app.ui.components.ListingCard
import lk.motormila.app.ui.components.MmBottomBar
import lk.motormila.app.ui.components.MmBottomBarItem
import lk.motormila.app.ui.components.MmButton
import lk.motormila.app.ui.components.MmButtonStyle
import lk.motormila.app.ui.components.MmChip
import lk.motormila.app.ui.components.MmDealBadge
import lk.motormila.app.ui.components.MmDetailSkeleton
import lk.motormila.app.ui.components.MmEmptyState
import lk.motormila.app.ui.components.MmListingCardSkeleton
import lk.motormila.app.ui.components.MmPrice
import lk.motormila.app.ui.components.MmPriceChart
import lk.motormila.app.ui.components.MmPriceMode
import lk.motormila.app.ui.components.MmDealVerdict
import lk.motormila.app.ui.detail.BeforeYouPayCard
import lk.motormila.app.ui.detail.DealVerdictRow
import lk.motormila.app.ui.detail.DetailActionBar
import lk.motormila.app.ui.detail.DetailGallery
import lk.motormila.app.ui.motormilaTabItems
import lk.motormila.app.ui.splash.SplashScreen
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.MotormilaTheme
import lk.motormila.app.ui.tools.ToolsScreen
import lk.motormila.app.ui.home.HomeContent
import lk.motormila.app.ui.home.HomeUiState
import lk.motormila.app.ui.search.SortFilterRow
import lk.motormila.app.ui.components.SearchBar
import lk.motormila.app.ui.components.FilterDraft
import lk.motormila.app.ui.components.FilterSheetBody
import lk.motormila.app.ui.components.MmSheetFrame
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.HotDeal
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.TrendingModel
import lk.motormila.app.domain.model.DistrictStat
import org.junit.Rule
import org.junit.Test

/**
 * Design system v2 renders (android/design). Fixture data below is
 * SCREENSHOT-ONLY sample content, never shipped. Record with
 * `./gradlew :app:recordPaparazziDirectDebug --tests '*DesignSystemScreenshotsTest*'`.
 */
class DesignSystemScreenshotsTest {

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    private fun listing(id: Int, title: String, price: Double, median: Double?, score: Double?) = Listing(
        id = id, title = title, make = title.substringBefore(' '), model = title.substringAfter(' '),
        year = 2018, priceLkr = price, mileageKm = 48_000.0, fuelType = "hybrid", transmission = "auto",
        condition = "used", bodyType = "hatchback", district = "Colombo", city = "Nugegoda", source = "ikman",
        thumbnailUrl = null, images = emptyList(), dealScore = score, marketMedianLkr = median,
        scrapedAt = null, firstSeenAt = null, lastSeenAt = null, detailUrl = null, externalUrl = null, engineCc = 1000.0,
    )

    @Composable
    private fun Page(dark: Boolean, content: @Composable () -> Unit) {
        MotormilaTheme(darkTheme = dark, reducedMotion = true, languageTag = "en") {
            Box(Modifier.fillMaxSize().background(MmColors.current.background).statusBarsPadding()) { content() }
        }
    }

    @OptIn(ExperimentalLayoutApi::class)
    @Composable
    private fun ComponentSheet() {
        val c = MmColors.current
        val t = MmType.current
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MmSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text("Find a fair price", style = t.displayM, color = c.textPrimary)
            Text("Compare asking prices across Sri Lanka's biggest sites.", style = t.bodyL, color = c.textSecondary)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MmButton("Search cars", onClick = {}, leadingIcon = Icons.Filled.Search)
                MmButton("Filters", onClick = {}, style = MmButtonStyle.Secondary, leadingIcon = Icons.Outlined.Tune)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MmButton("Tonal", onClick = {}, style = MmButtonStyle.Tonal)
                MmButton("Ghost", onClick = {}, style = MmButtonStyle.Ghost)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                MmChip("Toyota", selected = true, onClick = {})
                MmChip("Hybrid", selected = false, onClick = {})
                MmChip("Under Rs 10 Mn", selected = true, onClick = {})
                MmChip("Colombo", selected = false, onClick = {})
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                MmDealBadge("Rs 0.85 Mn below typical", MmDealTone.GREAT)
                MmDealBadge("Rs 0.3 Mn below typical", MmDealTone.GOOD)
                MmDealBadge("Near typical price", MmDealTone.FAIR, onWhy = {})
                MmDealBadge("Rs 0.6 Mn above typical", MmDealTone.HIGH)
                MmDealBadge("Unusually low — verify first", MmDealTone.CAUTION)
            }
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                MmPrice(8_500_000.0, style = t.priceL)
                MmPrice(350_000.0)
                MmPrice(85_400.0, mode = MmPriceMode.Monthly, style = t.priceS)
            }
            MmPrice(7_250_000.0, mode = MmPriceMode.Full, style = t.priceM)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MmListingCardSkeleton(Modifier.weight(1f))
                MmListingCardSkeleton(Modifier.weight(1f))
            }
        }
    }

    @Test fun components_dark() = paparazzi.snapshot { Page(true) { ComponentSheet() } }

    @Test fun components_light() = paparazzi.snapshot { Page(false) { ComponentSheet() } }

    @Composable
    private fun CardsGrid() {
        Column(Modifier.padding(MmSpacing.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ListingCard(listing(1, "Toyota Aqua G", 6_450_000.0, 7_200_000.0, 10.4), isWatched = true, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f), compareSelected = true, onCompareToggle = {})
                ListingCard(listing(2, "Suzuki Wagon R Stingray", 5_900_000.0, 5_800_000.0, 1.0), isWatched = false, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f), compareSelected = false, onCompareToggle = {})
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ListingCard(listing(3, "Honda Vezel RS", 11_750_000.0, 10_600_000.0, -6.0), isWatched = false, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f))
                ListingCard(listing(4, "Nissan Leaf lease takeover", 2_175_000.0, 6_900_000.0, 30.0), isWatched = false, onClick = {}, onWatchToggle = {}, modifier = Modifier.weight(1f))
            }
        }
    }

    @Test fun listing_cards_dark() = paparazzi.snapshot { Page(true) { CardsGrid() } }

    @Test fun listing_cards_light() = paparazzi.snapshot { Page(false) { CardsGrid() } }

    @Composable
    private fun DetailSample() {
        val l = listing(1, "Toyota Aqua G", 6_450_000.0, 7_200_000.0, 10.4)
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                DetailGallery(images = listOf("a", "b", "c", "d"), title = l.title, listingId = l.id, onOpenViewer = {})
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DealVerdictRow(MmDealVerdict.compute(l.priceLkr, l.marketMedianLkr, ratingAllowed = true), onWhy = {})
                    Text("Toyota Aqua G 2018", style = MmType.current.titleL, color = MmColors.current.textPrimary)
                    Text("48,000 km · Hybrid · Auto · Nugegoda, Colombo", style = MmType.current.bodyM, color = MmColors.current.textSecondary)
                    MmPriceChart(
                        points = listOf(
                            PricePoint(7_100_000.0, "2026-08-01"), PricePoint(6_950_000.0, "2026-08-20"),
                            PricePoint(6_950_000.0, "2026-09-05"), PricePoint(6_700_000.0, "2026-09-25"),
                            PricePoint(6_450_000.0, "2026-10-12"),
                        ),
                        typicalLkr = 7_200_000.0,
                    )
                    BeforeYouPayCard()
                    Spacer(Modifier.height(120.dp))
                }
            }
            DetailActionBar(l.priceLkr, "ikman", onViewSource = {}, modifier = Modifier.align(Alignment.BottomCenter))
        }
    }

    @Test fun detail_dark() = paparazzi.snapshot { Page(true) { DetailSample() } }

    @Test fun detail_light() = paparazzi.snapshot { Page(false) { DetailSample() } }

    @Test fun detail_skeleton_dark() = paparazzi.snapshot { Page(true) { MmDetailSkeleton() } }

    @Test fun tools_dark() = paparazzi.snapshot {
        Page(true) {
            Box(Modifier.fillMaxSize()) {
                ToolsScreen({}, {}, {}, {}, {}, {}, {}, {}, {})
                MmBottomBar(motormilaTabItems(mapOf("watchlist" to 3)), MotormilaTabs.TOOLS, onSelect = {}, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
            }
        }
    }

    @Test fun bottom_bar_light() = paparazzi.snapshot {
        Page(false) {
            Box(Modifier.fillMaxSize()) {
                MmEmptyState(
                    icon = Icons.Filled.Search,
                    title = "No cars match yet",
                    message = "Try widening the budget or clearing a filter.",
                    primaryAction = "Reset filters" to {},
                    modifier = Modifier.align(Alignment.Center),
                )
                MmBottomBar(motormilaTabItems(emptyMap()), MotormilaTabs.BUY, onSelect = {}, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
            }
        }
    }

    @Test fun splash_dark() = paparazzi.snapshot { Page(true) { SplashScreen(onDone = {}, animate = false) } }

    // ---------------- Home / Search / Filters (screenshot-only fixtures) ----------------

    private fun homeState() = HomeUiState(
        isLoading = false,
        summary = StatsSummary(totalListings = 48_210, avgPriceLkr = 8_450_000.0, goodDealsCount = 1_284, sourceCount = 6),
        insights = Insights(
            newListings24h = 342,
            trendingModels = listOf(
                TrendingModel("Toyota", "Aqua", 2_140, 6_900_000.0, -1.2, null),
                TrendingModel("Suzuki", "Wagon R", 1_870, 5_600_000.0, 0.4, null),
                TrendingModel("Honda", "Vezel", 1_220, 11_300_000.0, 2.1, null),
            ),
            hotDeals = listOf(
                HotDeal(1, "Toyota", "Aqua", 2017, "Colombo", "ikman", 6_450_000.0, 10.4, null),
                HotDeal(2, "Honda", "Fit", 2015, "Gampaha", "riyasewana", 5_200_000.0, 7.8, null),
                HotDeal(3, "Nissan", "Leaf", 2018, "Kandy", "patpat", 4_900_000.0, 6.1, null),
            ),
        ),
        priceDrops = listOf(
            PriceDrop(listing(5, "Toyota Prius S", 8_900_000.0, 9_300_000.0, 4.0), 9_400_000.0, 8_900_000.0, 5.3, "2026-10-18"),
            PriceDrop(listing(6, "Suzuki Swift RS", 6_100_000.0, 6_300_000.0, 3.0), 6_450_000.0, 6_100_000.0, 5.4, "2026-10-17"),
        ),
        districts = listOf(
            DistrictStat("Colombo", 6.9, 79.8, 14_200, 9_100_000.0, 8_200_000.0),
            DistrictStat("Gampaha", 7.0, 80.0, 8_100, 7_600_000.0, 7_000_000.0),
            DistrictStat("Kandy", 7.3, 80.6, 4_300, 7_200_000.0, 6_700_000.0),
        ),
    )

    @Composable
    private fun HomeSample() {
        Box(Modifier.fillMaxSize()) {
            HomeContent(
                state = homeState(), live = emptyList(), onRefresh = {}, onRetry = {}, onDismissCached = {},
                banner = {}, onListingClick = {}, onSearchClick = {}, onAlertsClick = {}, onSeeAll = {},
            )
            MmBottomBar(motormilaTabItems(emptyMap()), MotormilaTabs.BUY, onSelect = {}, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
        }
    }

    @Test fun home_dark() = paparazzi.snapshot { Page(true) { HomeSample() } }

    @Test fun home_light() = paparazzi.snapshot { Page(false) { HomeSample() } }

    @Composable
    private fun SearchSample() {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                SearchBar(
                    query = "", onQueryChange = {}, onSearch = {}, suggestions = emptyList(), recentSearches = emptyList(),
                    onSuggestionClick = {}, onRecentClick = {}, onVoiceClick = {},
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), showDropdown = false,
                )
                SortFilterRow(sort = "newest", onSort = {}, onFilters = {}, onCreateAlert = {}, gridMode = true, onToggleLayout = {})
                CardsGrid()
            }
            Column(Modifier.align(Alignment.BottomCenter)) {
                lk.motormila.app.ui.search.CompareTray(
                    count = 2,
                    onCompare = {},
                    onClear = {},
                    thumbnails = listOf(
                        lk.motormila.app.ui.search.CompareThumb(1, null),
                        lk.motormila.app.ui.search.CompareThumb(2, null),
                    ),
                )
                MmBottomBar(motormilaTabItems(emptyMap()), MotormilaTabs.BUY, onSelect = {}, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
            }
        }
    }

    @Test fun search_dark() = paparazzi.snapshot { Page(true) { SearchSample() } }

    @Test fun search_light() = paparazzi.snapshot { Page(false) { SearchSample() } }

    @Composable
    private fun FilterSample() {
        Box(Modifier.fillMaxSize()) {
            SearchSample()
            Box(Modifier.fillMaxSize().background(MmColors.current.scrim))
            MmSheetFrame(title = "Filters", modifier = Modifier.align(Alignment.BottomCenter)) {
                FilterSheetBody(
                    draft = FilterDraft(make = "Toyota", model = "Aqua", priceMin = 3_000_000.0, priceMax = 9_500_000.0, yearMin = 2014, fuelType = "hybrid", condition = "reconditioned"),
                    onDraftChange = {},
                    makes = listOf("Toyota", "Honda", "Suzuki", "Nissan"),
                    districts = listOf("Colombo", "Gampaha", "Kandy", "Kurunegala", "Galle", "Kalutara"),
                    onReset = {},
                    onApply = {},
                )
            }
        }
    }

    @Test fun filter_sheet_dark() = paparazzi.snapshot { Page(true) { FilterSample() } }

    @Test fun filter_sheet_light() = paparazzi.snapshot { Page(false) { FilterSample() } }

    @Test fun splash_light() = paparazzi.snapshot { Page(false) { SplashScreen(onDone = {}, animate = false) } }

    @Test fun tools_light() = paparazzi.snapshot {
        Page(false) {
            Box(Modifier.fillMaxSize()) {
                ToolsScreen({}, {}, {}, {}, {}, {}, {}, {}, {})
                MmBottomBar(motormilaTabItems(mapOf("watchlist" to 3)), MotormilaTabs.TOOLS, onSelect = {}, modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 12.dp))
            }
        }
    }
}
