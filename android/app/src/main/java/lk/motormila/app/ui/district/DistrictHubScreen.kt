package lk.motormila.app.ui.district

import androidx.compose.animation.core.snap
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.DistrictInsight
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.HubTopModel
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.components.BrandLogo
import lk.motormila.app.ui.components.BrandLogoSize
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.ListingCard
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.AppleEasing
import lk.motormila.app.ui.theme.MotormilaBg
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DistrictHubScreen(
    onBack: () -> Unit,
    onListingClick: (Int) -> Unit,
    onModelClick: (make: String, model: String) -> Unit,
    onSeeAllSearch: (district: String) -> Unit,
    onDistrictClick: (district: String) -> Unit = {},
    viewModel: DistrictHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val backCd = stringResource(R.string.district_hub_back)
    val refreshCd = stringResource(R.string.district_hub_cd_refresh)

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null && state.hasContent) {
            snacks.showSnackbar(message)
            viewModel.onEvent(DistrictHubUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = state.displayName.ifBlank { stringResource(R.string.district_hub_title) },
        onBack = {
            if (!reducedMotion) haptics.tick()
            onBack()
        },
        snackbarHostState = snacks,
        // The hero already shows the title: compact glass bar only (audit B10).
        largeTitle = false,
    ) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(DistrictHubUiEvent.Refresh) },
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = refreshCd },
        ) {
            when {
                state.isLoading -> DistrictHubSkeleton()
                state.error != null && !state.hasContent ->
                    ErrorState(
                        message = state.error ?: stringResource(R.string.district_hub_error_title),
                        onRetry = { viewModel.onEvent(DistrictHubUiEvent.Refresh) },
                        modifier = Modifier.fillMaxSize(),
                    )
                !state.hasContent ->
                    EmptyState(
                        title = stringResource(R.string.district_hub_empty_title),
                        body = stringResource(R.string.district_hub_empty_body),
                        ctaLabel = stringResource(R.string.district_hub_retry),
                        onCta = { viewModel.onEvent(DistrictHubUiEvent.Refresh) },
                        icon = Icons.Filled.Place,
                        modifier = Modifier.fillMaxSize(),
                    )
                else -> DistrictHubBody(
                    state = state,
                    onListingClick = { id ->
                        if (!reducedMotion) haptics.tick()
                        onListingClick(id)
                    },
                    onModelClick = { make, model ->
                        if (!reducedMotion) haptics.tick()
                        onModelClick(make, model)
                    },
                    onSeeAllSearch = { district ->
                        if (!reducedMotion) haptics.tick()
                        onSeeAllSearch(district)
                    },
                    onDistrictClick = { district ->
                        if (!reducedMotion) haptics.tick()
                        onDistrictClick(district)
                    },
                    onWatchToggle = { listing ->
                        viewModel.onEvent(DistrictHubUiEvent.ToggleWatch(listing))
                    },
                )
            }
        }
    }
}

@Composable
private fun DistrictHubSkeleton() {
    val loadingCd = stringResource(R.string.district_hub_loading)
    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = loadingCd },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(5) { LoadingSkeletonCard() }
    }
}

@Composable
private fun DistrictHubBody(
    state: DistrictHubUiState,
    onListingClick: (Int) -> Unit,
    onModelClick: (String, String) -> Unit,
    onSeeAllSearch: (String) -> Unit,
    onDistrictClick: (String) -> Unit,
    onWatchToggle: (Listing) -> Unit,
) {
    val displayName = state.displayName
    val searchDistrict = state.searchDistrict
    val topModels = state.insight?.topModels.orEmpty()
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item { DistrictHero(displayName = displayName) }
        item { DistrictStatsGrid(insight = state.insight) }
        if (state.velocityTop.isNotEmpty()) {
            item {
                DistrictVelocitySection(points = state.velocityTop)
            }
        }
        if (state.nearby.isNotEmpty()) {
            item {
                NearbyDistrictsRow(
                    nearby = state.nearby,
                    onDistrictClick = onDistrictClick,
                )
            }
        }
        if (topModels.isNotEmpty()) {
            item {
                TopModelsSection(
                    district = displayName,
                    models = topModels,
                    onModelClick = onModelClick,
                )
            }
        }
        if (state.listings.isNotEmpty()) {
            item { RecentListingsHeader() }
            items(state.listings, key = { it.id }) { listing ->
                ListingCard(
                    listing = listing,
                    isWatched = state.watchedIds.contains(listing.id),
                    onClick = { onListingClick(listing.id) },
                    onWatchToggle = { onWatchToggle(listing) },
                )
            }
        }
        item {
            val browseLabel = stringResource(R.string.district_hub_browse, displayName)
            MotormilaPrimaryButton(
                label = browseLabel,
                leadingIcon = Icons.Filled.Search,
                modifier = Modifier.semantics { contentDescription = browseLabel },
                onClick = { onSeeAllSearch(searchDistrict) },
            )
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun DistrictHero(displayName: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        Surface(
            shape = MotormilaRadius.pill,
            color = MotormilaSurfaceHigh,
            border = BorderStroke(1.dp, MotormilaOutline),
        ) {
            Row(
                Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    Icons.Filled.Place,
                    contentDescription = null,
                    tint = MotormilaPrimaryBright,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = "• ${stringResource(R.string.district_hub_eyebrow).uppercase()}",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                        color = MotormilaPrimaryBright,
                    ),
                )
            }
        }
        Text(
            text = displayName,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
                color = MotormilaOnSurface,
            ),
        )
        Text(
            text = stringResource(R.string.district_hub_description, displayName),
            style = MaterialTheme.typography.bodyMedium.copy(
                color = MotormilaSecondaryText,
                lineHeight = 20.sp,
            ),
        )
    }
}

@Composable
private fun DistrictStatsGrid(insight: DistrictInsight?) {
    val na = stringResource(R.string.district_hub_na)
    val countText = insight?.listingCount?.let { LkrFormat.count(it) } ?: na
    val avgText = insight?.avgPriceLkr?.takeIf { it > 0 }?.let { lk.motormila.app.ui.common.mn(it) } ?: na
    val medianText = insight?.medianPriceLkr?.takeIf { it > 0 }?.let { lk.motormila.app.ui.common.mn(it) } ?: na
    val countCd = stringResource(R.string.district_hub_cd_stat_count, countText)
    val avgCd = stringResource(R.string.district_hub_cd_stat_avg, avgText)
    val medianCd = stringResource(R.string.district_hub_cd_stat_median, medianText)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        DistrictMetricCard(
            label = stringResource(R.string.district_hub_live_listings),
            value = countText,
            valueColor = MotormilaPrimaryBright,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = countCd },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DistrictMetricCard(
                label = stringResource(R.string.district_hub_avg_price),
                value = avgText,
                modifier = Modifier.weight(1f).semantics { contentDescription = avgCd },
            )
            DistrictMetricCard(
                label = stringResource(R.string.district_hub_median_price),
                value = medianText,
                modifier = Modifier.weight(1f).semantics { contentDescription = medianCd },
            )
        }
        val change = insight?.changePct30d
        if (change != null) {
            val changeText = formatPct(change)
            Text(
                text = stringResource(R.string.district_hub_change_30d, changeText),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    color = lk.motormila.app.ui.common.trendColor(lk.motormila.app.ui.common.trendOf(change)),
                ),
            )
        }
    }
}

@Composable
private fun DistrictMetricCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MotormilaOnSurface,
) {
    MotormilaSurface(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp,
                fontSize = 10.sp,
                color = MotormilaSecondaryText,
            ),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.Bold,
                fontFeatureSettings = "tnum",
                color = valueColor,
            ),
        )
    }
}

@Composable
private fun NearbyDistrictsRow(
    nearby: List<NearbyDistrict>,
    onDistrictClick: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = stringResource(R.string.district_hub_nearby_eyebrow).uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MotormilaSecondaryText,
            ),
        )
        Text(
            text = stringResource(R.string.district_hub_nearby),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 4.dp),
        ) {
            items(nearby, key = { it.district }) { item ->
                NearbyDistrictChip(item = item, onClick = { onDistrictClick(item.district) })
            }
        }
    }
}

@Composable
private fun NearbyDistrictChip(
    item: NearbyDistrict,
    onClick: () -> Unit,
) {
    val price = item.avgPriceLkr?.takeIf { it > 0 }?.let { lk.motormila.app.ui.common.mn(it) }
        ?: stringResource(R.string.district_hub_na)
    val chipCd = stringResource(R.string.district_hub_cd_nearby, item.district)
    MotormilaSurface(
        onClick = onClick,
        fillMaxWidth = false,
        modifier = Modifier
            .width(168.dp)
            .semantics { contentDescription = chipCd },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            item.district,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            stringResource(R.string.district_hub_listings_count, item.count),
            style = MaterialTheme.typography.labelSmall,
            color = MotormilaSecondaryText,
        )
        Text(
            price,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = FontWeight.Bold,
                fontFeatureSettings = "tnum",
            ),
        )
        val new7d = item.new7dCount
        if (new7d != null && new7d > 0) {
            Text(
                stringResource(R.string.district_hub_new_7d, new7d),
                style = MaterialTheme.typography.labelSmall,
                color = MotormilaPrimaryBright,
            )
        }
    }
}

@Composable
private fun TopModelsSection(
    district: String,
    models: List<HubTopModel>,
    onModelClick: (String, String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = stringResource(R.string.district_hub_models).uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MotormilaSecondaryText,
            ),
        )
        Text(
            text = stringResource(R.string.district_hub_popular, district),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        )
        models.forEach { entry ->
            TopModelCard(entry = entry, onClick = { onModelClick(entry.make, entry.model) })
        }
    }
}

@Composable
private fun TopModelCard(
    entry: HubTopModel,
    onClick: () -> Unit,
) {
    val price = entry.avgPriceLkr.takeIf { it > 0 }?.let { lk.motormila.app.ui.common.mn(it) }
        ?: stringResource(R.string.district_hub_price_na)
    val modelCd = stringResource(
        R.string.district_hub_cd_model,
        entry.make,
        entry.model,
        entry.listingCount,
    )
    MotormilaSurface(
        onClick = onClick,
        modifier = Modifier.semantics { contentDescription = modelCd },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = "${entry.make} ${entry.model}",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
        )
        Text(
            text = stringResource(R.string.district_hub_listings_count, entry.listingCount),
            style = MaterialTheme.typography.labelSmall,
            color = MotormilaSecondaryText,
        )
        Text(
            text = price,
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                fontFeatureSettings = "tnum",
            ),
        )
    }
}

@Composable
private fun RecentListingsHeader() {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 4.dp)) {
        Text(
            text = stringResource(R.string.district_hub_live_inventory).uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MotormilaSecondaryText,
            ),
        )
        Text(
            text = stringResource(R.string.district_hub_recent),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        )
    }
}

/**
 * District sales-velocity section — web `DistrictVelocityList` (Tremor BarList)
 * parity: top districts by active listings as animated blue bars, fed by the
 * real `GET /stats/district-velocity` endpoint (already loaded in the VM).
 */
@Composable
private fun DistrictVelocitySection(points: List<DistrictVelocity>) {
    val reduced = rememberReducedMotion()
    val max = (points.maxOfOrNull { it.listingCount } ?: 0).coerceAtLeast(1)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = stringResource(R.string.district_velocity_eyebrow).uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = MotormilaSecondaryText,
                ),
            )
            Text(
                text = stringResource(R.string.district_velocity_title),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                text = stringResource(R.string.district_velocity_sub),
                fontSize = 13.sp,
                color = MotormilaSecondaryText,
            )
        }
        points.forEach { point ->
            VelocityRow(point = point, max = max, reducedMotion = reduced)
        }
    }
}

@Composable
private fun VelocityRow(
    point: DistrictVelocity,
    max: Int,
    reducedMotion: Boolean,
) {
    val fraction by animateFloatAsState(
        targetValue = point.listingCount.toFloat() / max,
        animationSpec = if (reducedMotion) snap() else spring(dampingRatio = 0.9f, stiffness = Spring.StiffnessLow, visibilityThreshold = 0.001f),
        label = "velocity-bar",
    )
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = point.district,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = MotormilaOnSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.district_velocity_listings, point.listingCount),
                fontSize = 12.sp,
                color = MotormilaSecondaryText,
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(MotormilaRadius.pill)
                .background(MotormilaSurfaceHigh),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction.coerceIn(0f, 1f))
                    .height(8.dp)
                    .clip(MotormilaRadius.pill)
                    .background(MotormilaPrimaryBright),
            )
        }
    }
}
