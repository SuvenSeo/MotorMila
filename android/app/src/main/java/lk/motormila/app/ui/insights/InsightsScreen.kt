package lk.motormila.app.ui.insights

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Power
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.format.formatLkrCompact
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SectionTitle
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.TrendPoint
import lk.motormila.app.ui.components.LivePulse
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaChipTabs
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaPage
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.components.SriLankaHeatMap
import lk.motormila.app.ui.components.toMapPoint
import lk.motormila.app.ui.theme.AppleEasing
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface as MotormilaSurfaceColor
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.MotormilaWarn
import lk.motormila.app.ui.theme.rememberHaptics

private val tabs = listOf("Trends", "EV Intelligence", "Index", "Districts", "Pulse")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InsightsScreen(
    onOpenPulseDetail: (signalId: String) -> Unit,
    onDrillDistrict: (district: String) -> Unit,
    onSearchModels: (query: String) -> Unit,
    onChargersClick: () -> Unit = {},
    onUpgrade: () -> Unit = {},
    initialTab: Int = 0,
    viewModel: InsightsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val live by viewModel.live.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    var tab by remember { mutableIntStateOf(initialTab.coerceIn(0, tabs.lastIndex)) }

    LaunchedEffect(state.error) {
        state.error?.let {
            snacks.showSnackbar(it)
            viewModel.onEvent(InsightsUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(title = stringResource(R.string.scr_ins_title), showBack = false, snackbarHostState = snacks, edgeToEdge = true) {
        val screenInsets = lk.motormila.app.ui.common.LocalMmScreenInsets.current
        Column(Modifier.fillMaxSize().padding(top = screenInsets.top)) {
            MotormilaChipTabs(
                tabs = tabs,
                selected = tab,
                onSelect = {
                    if (!reducedMotion) haptics.tick()
                    tab = it
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            // Tab panes pad only for the floating tab bar (the header + chips sit above).
            androidx.compose.runtime.CompositionLocalProvider(
                lk.motormila.app.ui.common.LocalMmScreenInsets provides lk.motormila.app.ui.common.MmScreenInsets(top = 0.dp, bottom = screenInsets.bottom),
            ) {
            lk.motormila.app.ui.components.MmPullToRefresh(
                isRefreshing = state.isRefreshing,
                onRefresh = { viewModel.onEvent(InsightsUiEvent.Refresh) },
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    state.isLoading -> SkeletonList()
                    state.error != null && state.trends.isEmpty() && state.index.isEmpty() ->
                        ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(InsightsUiEvent.Refresh) })
                    else -> AnimatedContent(
                        targetState = tab,
                        transitionSpec = {
                            fadeIn(tween(220, easing = AppleEasing)) togetherWith
                                fadeOut(tween(160, easing = AppleEasing))
                        },
                        label = "insights-tab",
                    ) { current ->
                        when (current) {
                            0 -> TrendsTab(state, viewModel, onSearchModels)
                            1 -> EvTab(state, viewModel, onChargersClick)
                            2 -> IndexTab(state, onUpgrade)
                            3 -> DistrictsTab(state, onDrillDistrict)
                            else -> PulseTab(state, live, onOpenPulseDetail)
                        }
                    }
                }
            }
            }
        }
    }
}

// ---------- 1. Trend Studio Module ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TrendsTab(
    state: InsightsUiState,
    viewModel: InsightsViewModel,
    onSearchModels: (String) -> Unit,
) {
    val s = state.selectors
    val popularMakes = listOf("Toyota", "Honda", "Nissan", "Suzuki", "BMW", "Hyundai")
    val popularModels = when (s.make.lowercase().trim()) {
        "toyota" -> listOf("Premio", "Aqua", "Axio", "Vitz", "Prius", "Vezel")
        "honda" -> listOf("Grace", "Vezel", "Fit", "Civic", "Insight")
        "suzuki" -> listOf("Alto", "Wagon R", "Swift", "Spacia")
        else -> listOf("Premio", "Aqua", "Grace", "Alto", "Vezel")
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = lk.motormila.app.ui.common.mmScreenPadding(horizontal = 16.dp, top = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Hero Header: Eyebrow Pill, Headline with negative letter spacing, Subtitle
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                MotormilaEyebrow("TREND STUDIO")

                Text(
                    text = "Price trends.",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5).sp,
                        color = MotormilaOnSurface,
                    ),
                )

                Text(
                    text = "District-aware price movement, historical trajectory, and mix-adjusted bands from verified listings.",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MotormilaSecondaryText,
                        lineHeight = 20.sp,
                    ),
                )
            }
        }

        // Offline badge + market summary strip (StatsRepository.summary).
        item {
            OfflineBanner(visible = state.offline)
        }

        state.summary?.let { summary ->
            item {
                MotormilaSurface(
                    modifier = Modifier.semantics {
                        contentDescription = "Market summary, ${summary.totalListings} listings"
                    },
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "MARKET SNAPSHOT",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            color = MotormilaSecondaryText,
                        ),
                    )
                    SummaryKpiFlow(summary)
                }
            }
        }

        // Selectors Card (16dp rounded glass card)
        item {
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "MARKET FILTERS",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                        color = MotormilaSecondaryText,
                    ),
                )

                // Make & Model Row
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    InsightTextField("Make", s.make, Modifier.weight(1f)) {
                        viewModel.onEvent(InsightsUiEvent.SelectorsChanged(s.copy(make = it)))
                    }
                    InsightTextField("Model", s.model, Modifier.weight(1f)) {
                        viewModel.onEvent(InsightsUiEvent.SelectorsChanged(s.copy(model = it)))
                    }
                }

                // Quick Make Chips
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    popularMakes.forEach { makeName ->
                        MotormilaChoiceChip(
                            label = makeName,
                            selected = s.make.equals(makeName, ignoreCase = true),
                            compact = true,
                            onClick = {
                                val nextMake = if (s.make.equals(makeName, ignoreCase = true)) "" else makeName
                                viewModel.onEvent(InsightsUiEvent.SelectorsChanged(s.copy(make = nextMake)))
                            },
                        )
                    }
                }

                // Condition & District Row
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    InsightTextField("Condition", s.condition, Modifier.weight(1f)) {
                        viewModel.onEvent(InsightsUiEvent.SelectorsChanged(s.copy(condition = it)))
                    }
                    InsightTextField("District", s.district, Modifier.weight(1f)) {
                        viewModel.onEvent(InsightsUiEvent.SelectorsChanged(s.copy(district = it)))
                    }
                }

                // Quick District Chips
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("All districts", "Colombo", "Kandy", "Gampaha", "Kurunegala").forEach { dist ->
                        MotormilaChoiceChip(
                            label = dist,
                            selected = s.district.equals(dist, ignoreCase = true),
                            compact = true,
                            onClick = {
                                viewModel.onEvent(InsightsUiEvent.SelectorsChanged(s.copy(district = dist)))
                            },
                        )
                    }
                }
            }
        }

        // Median price movement chart (real tracked points only; no synthetic band)
        item {
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.scr_ins_median_movement),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.8.sp,
                            color = MotormilaSecondaryText,
                        ),
                    )
                }

                // Key metric callout
                val latestPoint = state.trends.lastOrNull()
                if (latestPoint != null) {
                    val med = latestPoint.medianPriceLkr ?: latestPoint.avgPriceLkr ?: 0.0
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Column {
                            Text(
                                text = lk.motormila.app.ui.components.MmPriceFormat.compact(med),
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontFeatureSettings = "tnum",
                                    color = MotormilaOnSurface,
                                ),
                            )
                            Text(
                                text = "Latest tracked median · ${latestPoint.listingCount} listings",
                                style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                            )
                        }
                        Text(
                            text = "${state.trends.size} monthly periods",
                            style = MaterialTheme.typography.labelSmall.copy(color = MotormilaPrimaryBright),
                        )
                    }
                }

                Spacer(Modifier.height(4.dp))

                val trendValues = state.trends.mapNotNull { p -> (p.medianPriceLkr ?: p.avgPriceLkr)?.takeIf { it > 0 } }
                val trendLabels = state.trends.filter { p -> ((p.medianPriceLkr ?: p.avgPriceLkr) ?: 0.0) > 0 }
                    .map { p -> lk.motormila.app.ui.common.monthLabel(p.year, p.month) }
                if (trendValues.size >= 2) {
                    lk.motormila.app.ui.common.TrendLineChart(
                        values = trendValues,
                        xLabels = trendLabels,
                        yLabel = { lk.motormila.app.ui.components.MmPriceFormat.compactAmount(it).removeSuffix(" Mn") + " Mn" },
                        contentDescription = stringResource(R.string.scr_ins_chart_cd, trendValues.size),
                        height = 200.dp,
                    )
                } else {
                    Text(
                        stringResource(R.string.scr_ins_chart_sparse),
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
                }

                state.trendCoverageNote?.let {
                    Surface(
                        shape = MotormilaRadius.lg,
                        color = MotormilaSurfaceColor,
                        border = BorderStroke(1.dp, MotormilaOutline),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "Scope: $it",
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = MotormilaSecondaryText,
                                fontSize = 11.sp,
                            ),
                            modifier = Modifier.padding(8.dp),
                        )
                    }
                }
            }
        }

        // Search Listings CTA
        item {
            val query = "${s.make} ${s.model}".trim().ifBlank { "All listings" }
            MotormilaPrimaryButton(
                label = "Search $query in live inventory",
                leadingIcon = Icons.Filled.Search,
                onClick = { onSearchModels("${s.make} ${s.model}".trim()) },
            )
        }
    }
}

@Composable
private fun InsightTextField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        shape = MotormilaRadius.lg,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MotormilaPrimary,
            unfocusedBorderColor = MotormilaOutline,
            focusedContainerColor = MotormilaSurfaceColor,
            unfocusedContainerColor = MotormilaSurfaceColor,
            focusedTextColor = MotormilaOnSurface,
            unfocusedTextColor = MotormilaOnSurface,
            focusedLabelColor = MotormilaPrimaryBright,
            unfocusedLabelColor = MotormilaSecondaryText,
        ),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
    )
}

// ---------- Shared market-data sections (summary / velocity / fuel / drops / live) ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SummaryKpiFlow(summary: lk.motormila.app.domain.model.StatsSummary) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MotormilaMetricTile(label = "Live", value = summary.totalListings.toString())
        MotormilaMetricTile(label = "Avg price", value = lk.motormila.app.ui.common.mn(summary.avgPriceLkr))
        MotormilaMetricTile(label = "Good deals", value = summary.goodDealsCount.toString())
        MotormilaMetricTile(label = "New / 7d", value = summary.listingsThisWeek.toString())
        summary.priceChangeMom?.let {
            MotormilaMetricTile(label = "MoM", value = formatPct(it))
        }
    }
}

/** Static velocity bars (no animation — reduced-motion safe by construction). */
@Composable
private fun VelocityRow(v: DistrictVelocity, maxScore: Double) {
    val frac = if (maxScore > 0) (v.velocityScore / maxScore).toFloat().coerceIn(0f, 1f) else 0f
    MotormilaSurface(
        modifier = Modifier.semantics {
            contentDescription =
                "${v.district} velocity ${"%.1f".format(v.velocityScore)}, ${v.new7dCount} new in 7 days"
        },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(v.district, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text(
                    "+${v.new7dCount} / 7d",
                    style = MaterialTheme.typography.labelMedium.copy(color = MotormilaPrimaryBright),
                )
            }
            Box(
                Modifier.fillMaxWidth().height(8.dp)
                    .clip(MotormilaRadius.pill)
                    .background(MotormilaSurfaceColor),
            ) {
                Box(
                    Modifier.fillMaxWidth(frac).height(8.dp)
                        .clip(MotormilaRadius.pill)
                        .background(MotormilaPrimary),
                )
            }
            Text(
                "Velocity ${"%.1f".format(v.velocityScore)} · ${v.listingCount} listings",
                style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
            )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FuelMixRow(mix: List<lk.motormila.app.domain.model.FuelMixBucket>) {
    if (mix.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "FUEL MIX",
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MotormilaSecondaryText,
            ),
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            mix.forEach { bucket ->
                MotormilaMetricTile(
                    label = bucket.fuelType,
                    value = formatPct(bucket.pct, 0),
                )
            }
        }
    }
}

@Composable
private fun PriceDropCard(drop: PriceDrop) {
    MotormilaSurface(
        modifier = Modifier.semantics {
            contentDescription =
                "Price drop ${drop.listing.displayName}, down ${formatPct(drop.dropPct, 0)}"
        },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            drop.listing.displayName,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
        )
        Text(
            "${lk.motormila.app.ui.common.mn(drop.previousPriceLkr)} → ${lk.motormila.app.ui.common.mn(drop.newPriceLkr)} · −${formatPct(drop.dropPct, 0).trimStart('+')}",
            style = MaterialTheme.typography.bodyMedium.copy(
                fontFeatureSettings = "tnum",
                color = MotormilaGood,
            ),
        )
        Text(
            "${drop.listing.district ?: "Sri Lanka"} · ${drop.droppedAt.take(10)}",
            style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
        )
    }
}

@Composable
private fun LiveTicker(live: List<Listing>) {
    if (live.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LivePulse()
            Text(
                text = "LIVE NOW · ${live.size} fresh listings",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = MotormilaSecondaryText,
                ),
            )
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            live.take(8).forEach { listing ->
                MotormilaMetricTile(
                    label = listing.displayName,
                    value = lk.motormila.app.ui.common.mn(listing.priceLkr),
                )
            }
        }
    }
}

// ---------- 2. EV Intelligence Module ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EvTab(
    state: InsightsUiState,
    viewModel: InsightsViewModel,
    onChargersClick: () -> Unit,
) {
    val ev = state.ev

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = lk.motormila.app.ui.common.mmScreenPadding(horizontal = 16.dp, top = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Hero Header: Eyebrow Pill, Headline with negative letter spacing, Subtitle
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Surface(
                    shape = MotormilaRadius.pill,
                    color = MotormilaSurfaceHigh,
                    border = BorderStroke(1.dp, MotormilaOutline),
                ) {
                    Text(
                        text = "• ⚡ EV INTELLIGENCE",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            color = MotormilaPrimaryBright,
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }

                Text(
                    text = "EV buying signals.",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5).sp,
                        color = MotormilaOnSurface,
                    ),
                )

                Text(
                    text = "Battery health, charging fit, and duty signals for the Sri Lankan EV market.",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MotormilaSecondaryText,
                        lineHeight = 20.sp,
                    ),
                )
            }
        }

        // Metric Cards Grid: ELECTRIC LISTINGS LIVE: 599, EV MARKET SHARE: 0.3%
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    MotormilaSurface(modifier = Modifier.weight(1f), fillMaxWidth = false) {
                        Text(
                            text = "ELECTRIC LISTINGS LIVE",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.8.sp,
                                fontSize = 10.sp,
                                color = MotormilaSecondaryText,
                            ),
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = ev?.count?.takeIf { it > 0 }?.toString() ?: "—",
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontFeatureSettings = "tnum",
                                fontSize = 28.sp,
                                color = MotormilaPrimaryBright,
                            ),
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Tracked across all SL portals",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MotormilaSecondaryText,
                                fontSize = 11.sp,
                            ),
                        )
                    }

                    MotormilaSurface(modifier = Modifier.weight(1f), fillMaxWidth = false) {
                        Text(
                            text = "EV MARKET SHARE",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.8.sp,
                                fontSize = 10.sp,
                                color = MotormilaSecondaryText,
                            ),
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = ev?.let { "%.1f%%".format(it.sharePct) } ?: "—",
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontFeatureSettings = "tnum",
                                fontSize = 28.sp,
                                color = MotormilaGood,
                            ),
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Of total verified vehicle stock",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MotormilaSecondaryText,
                                fontSize = 11.sp,
                            ),
                        )
                    }
                }

                // Only real backend data: mean asking price of live EV listings. The
                // hybrid benchmark shows only when served; no estimated savings/payback here.
                MotormilaSurface(
                    contentPadding = PaddingValues(14.dp),
                ) {
                    Text(
                        text = "AVERAGE EV PRICE",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                            color = MotormilaSecondaryText,
                        ),
                    )
                    Text(
                        text = ev?.avgPriceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: "—",
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontWeight = FontWeight.Bold,
                            fontFeatureSettings = "tnum",
                            color = MotormilaOnSurface,
                        ),
                    )
                    ev?.aquaMedianLkr?.takeIf { it > 0 }?.let { aqua ->
                        Text(
                            text = "Hybrid benchmark (median): ${lk.motormila.app.ui.common.mn(aqua)}",
                            style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText, fontSize = 10.sp),
                        )
                    }
                }
            }
        }

        // Fuel mix from /stats/fuel-mix (shared with the EV share metric above).
        item {
            FuelMixRow(state.fuelMix)
        }

        // EV Decision Modules (Battery Health, Duty, Charging Fit)
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "BUYING SIGNALS & DECISION GUIDELINES",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                        color = MotormilaSecondaryText,
                    ),
                )

                // 1. Battery Health
                MotormilaSurface(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Filled.BatteryChargingFull, contentDescription = null, tint = MotormilaPrimaryBright)
                            Text(stringResource(R.string.ui_insights_battery_health_degradation), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        }
                        Text(stringResource(R.string.ui_insights_01_soh), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, color = MotormilaPrimaryBright))
                    }
                    Text(
                        text = "Insist on an OBD-II diagnostic report before placing a deposit. Maintain a 20%–30% reserve buffer for daily commuting. Japanese domestic imports (Leaf, e-Note, Ariya) degrade at ~2.1% per year under tropical humidity.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText, lineHeight = 18.sp),
                    )
                }

                // 2. Duty & Policy
                MotormilaSurface(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Filled.Shield, contentDescription = null, tint = MotormilaGood)
                            Text(stringResource(R.string.ui_insights_duty_import_concessions), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        }
                        Text(stringResource(R.string.ui_insights_02_tariff), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, color = MotormilaGood))
                    }
                    Text(
                        text = "Customs duty on battery electric vehicles (BEVs) under 100kW motor capacity carries preferential rates over ICE equivalents. Zero luxury tax applies below statutory CIF thresholds. Confirm HS code customs gazette classification before clearing.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText, lineHeight = 18.sp),
                    )
                }

                // 3. Charging Fit
                MotormilaSurface(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Filled.Power, contentDescription = null, tint = MotormilaWarn)
                            Text(stringResource(R.string.ui_insights_home_vs_public_charging_fit), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        }
                        Text(stringResource(R.string.ui_insights_03_range), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, color = MotormilaWarn))
                    }
                    Text(
                        text = "Overnight 7kW AC home charging delivers ~LKR 6/km running cost (off-peak tariff) versus LKR 28/km for petrol. Public DC fast charging covers Expressway E01/E02 corridors and Kandy/Galle inter-city corridors.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText, lineHeight = 18.sp),
                    )
                }
            }
        }

        // Sri Lanka Fast-Charging Network Status
        item {
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Filled.Bolt, contentDescription = null, tint = MotormilaPrimary)
                        Text(
                            text = "Sri Lanka Fast-Charging Network",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                    Surface(
                        shape = MotormilaRadius.pill,
                        color = MotormilaGood.copy(alpha = 0.15f),
                        border = BorderStroke(1.dp, MotormilaGood.copy(alpha = 0.4f)),
                    ) {
                        Text(
                            text = if (state.chargers.isEmpty()) "MAP" else "${state.chargers.size} NEARBY",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                color = MotormilaGood,
                            ),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }

                Text(
                    text = "Open Charge Map points cached for Sri Lanka. Confirm status before you travel.",
                    style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText, lineHeight = 18.sp),
                )

                // Connector Standards
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf("CCS2 (50-120kW)", "CHAdeMO (50kW)", "Type 2 (22kW)").forEach { connector ->
                        Surface(
                            shape = MotormilaRadius.lg,
                            color = MotormilaSurfaceColor,
                            border = BorderStroke(1.dp, MotormilaOutline),
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(
                                text = connector,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MotormilaOnSurface,
                                ),
                                modifier = Modifier.padding(vertical = 6.dp, horizontal = 4.dp),
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }

                // Search Radius Filter
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Locate chargers within radius",
                        style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(10, 25, 50, 100).forEach { km ->
                            MotormilaChoiceChip(
                                label = "${km}km",
                                selected = state.chargerRadiusKm == km,
                                onClick = { viewModel.onEvent(InsightsUiEvent.ChargerRadiusChanged(km)) },
                                compact = true,
                            )
                        }
                    }
                }

                // Active Chargers List
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.chargers.isEmpty()) {
                        Text(
                            "No cached chargers in this radius yet.",
                            style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                        )
                    } else {
                        state.chargers.take(6).forEach { c ->
                            Surface(
                                shape = MotormilaRadius.lg,
                                color = MotormilaSurfaceColor,
                                border = BorderStroke(1.dp, MotormilaOutline),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(Icons.Filled.Bolt, contentDescription = null, tint = MotormilaGood, modifier = Modifier.size(16.dp))
                                    Text(
                                        text = c,
                                        style = MaterialTheme.typography.bodySmall.copy(
                                            fontSize = 12.sp,
                                            color = MotormilaOnSurface,
                                        ),
                                    )
                                }
                            }
                        }
                    }
                    MotormilaGhostButton("Open charger map", onClick = onChargersClick)
                }
            }
        }
    }
}

// ---------- 3. Index Tab ----------

@Composable
private fun IndexTab(state: InsightsUiState, onUpgrade: () -> Unit) {
    PriceIndexPane(
        index = if (state.priceIndex.points.isNotEmpty() || state.priceIndex.methodology.isNotBlank()) {
            state.priceIndex
        } else {
            lk.motormila.app.domain.model.PriceIndex(points = state.index)
        },
        onOpenPro = onUpgrade,
        modifier = Modifier.padding(horizontal = 16.dp),
    )
}

// ---------- 4. Districts Tab ----------

@Composable
private fun DistrictsTab(state: InsightsUiState, onDrillDistrict: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = lk.motormila.app.ui.common.mmScreenPadding(horizontal = 16.dp, top = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { OfflineBanner(visible = state.offline) }
        item {
            MotormilaSurface {
                Text(
                    "District heat map",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MotormilaOnSurface,
                )
                Text(
                    "Tap a district to open its hub. Dot size is live listing weight.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MotormilaSecondaryText,
                )
                Spacer(Modifier.height(8.dp))
                SriLankaHeatMap(
                    points = state.districts.map { it.toMapPoint() },
                    onDistrictClick = onDrillDistrict,
                )
            }
        }
        item { SectionTitle("Velocity (median days to sell)") }
        items(state.districts, key = { it.district }) { d: DistrictStat ->
            DistrictRow(d, onDrill = { onDrillDistrict(d.district) })
        }
        if (state.velocities.isNotEmpty()) {
            item { SectionTitle("District velocity — new supply in 7 days") }
            val maxScore = state.velocities.maxOfOrNull { it.velocityScore } ?: 0.0
            items(state.velocities.take(8), key = { "vel-${it.district}" }) { v ->
                VelocityRow(v, maxScore)
            }
        }
    }
}

@Composable
private fun DistrictRow(d: DistrictStat, onDrill: () -> Unit) {
    val topLine = listOfNotNull(d.topMake, d.topModel)
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .joinToString(" · ")
    MotormilaSurface(
        onClick = onDrill,
        modifier = Modifier.semantics {
            contentDescription = "${d.district}, median ${lk.motormila.app.ui.common.mn(d.medianPriceLkr)}, ${d.count} listings"
        },
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(d.district, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text(
                    "${lk.motormila.app.ui.common.mn(d.medianPriceLkr)} median · ${d.count} listings",
                    style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                    color = MotormilaSecondaryText,
                )
                if (topLine.isNotEmpty()) {
                    Text(
                        "Top: $topLine",
                        style = MaterialTheme.typography.bodySmall,
                        color = MotormilaSecondaryText,
                    )
                }
            }
            IconButton(onClick = onDrill, modifier = Modifier.heightIn(min = 48.dp)) {
                Icon(Icons.Filled.ChevronRight, contentDescription = "Drill into ${d.district}")
            }
        }
    }
}

// ---------- 5. Pulse Tab ----------

@Composable
private fun PulseTab(state: InsightsUiState, live: List<Listing>, onOpenPulseDetail: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = lk.motormila.app.ui.common.mmScreenPadding(horizontal = 16.dp, top = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { OfflineBanner(visible = state.offline) }
        item { LiveTicker(live) }
        if (state.priceDrops.isNotEmpty()) {
            item { SectionTitle("Biggest price drops · 7 days") }
            items(state.priceDrops.take(5), key = { "drop-${it.listing.id}" }) { drop ->
                PriceDropCard(drop)
            }
        }
        item { SectionTitle("Market Signals Feed") }
        items(state.pulse, key = { it.id }) { s ->
            MotormilaSurface(
                onClick = { onOpenPulseDetail(s.id) },
                modifier = Modifier.semantics { contentDescription = "Signal ${s.title}" },
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                MotormilaMetricTile(label = s.tag, value = s.tag)
                Text(s.title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text(s.body, style = MaterialTheme.typography.bodySmall, color = MotormilaSecondaryText)
                Text(s.timeLabel, style = MaterialTheme.typography.labelSmall.copy(color = MotormilaPrimaryBright))
            }
        }
        item { SectionTitle("Automotive Industry News") }
        items(state.news, key = { it.id }) { n ->
            MotormilaSurface(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(n.title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text("${n.source} · ${n.timeLabel}", style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
            }
        }
    }
}
