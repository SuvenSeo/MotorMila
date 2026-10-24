package lk.motormila.app.ui.make

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.components.BrandLogo
import lk.motormila.app.ui.components.BrandLogoSize
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.ListingCard
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MakeModelHubScreen(
    onBack: () -> Unit,
    onMakeClick: (make: String) -> Unit,
    onListingClick: (Int) -> Unit,
    onSeeAllSearch: (make: String, model: String) -> Unit,
    onEstimate: (make: String, model: String) -> Unit,
    viewModel: MakeModelHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val backCd = stringResource(R.string.make_hub_back)
    val refreshCd = stringResource(R.string.make_model_hub_cd_refresh)
    val hasBody = state.insight != null || state.listings.isNotEmpty()

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null && hasBody) {
            snacks.showSnackbar(message)
            viewModel.onEvent(MakeModelHubUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = state.vehicleLabel.ifBlank { stringResource(R.string.make_model_hub_eyebrow) },
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
            onRefresh = { viewModel.onEvent(MakeModelHubUiEvent.Refresh) },
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = refreshCd },
        ) {
            when {
                state.isLoading -> MakeHubSkeleton()
                state.error != null && !hasBody ->
                    ErrorState(
                        message = state.error ?: stringResource(R.string.make_model_hub_error_title),
                        onRetry = { viewModel.onEvent(MakeModelHubUiEvent.Refresh) },
                        modifier = Modifier.fillMaxSize(),
                    )
                !hasBody ->
                    EmptyState(
                        title = stringResource(R.string.make_model_hub_empty_title),
                        body = stringResource(R.string.make_model_hub_empty_body),
                        ctaLabel = stringResource(R.string.make_hub_retry),
                        onCta = { viewModel.onEvent(MakeModelHubUiEvent.Refresh) },
                        icon = Icons.Filled.DirectionsCar,
                        modifier = Modifier.fillMaxSize(),
                    )
                else -> MakeModelHubBody(
                    state = state,
                    onMakeClick = {
                        if (!reducedMotion) haptics.tick()
                        onMakeClick(state.searchMake)
                    },
                    onListingClick = { id ->
                        if (!reducedMotion) haptics.tick()
                        onListingClick(id)
                    },
                    onWatchToggle = { listing ->
                        viewModel.onEvent(MakeModelHubUiEvent.ToggleWatch(listing))
                    },
                    onSeeAllSearch = {
                        if (!reducedMotion) haptics.tick()
                        onSeeAllSearch(state.searchMake, state.searchModel)
                    },
                    onEstimate = {
                        if (!reducedMotion) haptics.tick()
                        onEstimate(state.searchMake, state.searchModel)
                    },
                )
            }
        }
    }
}

@Composable
private fun MakeModelHubBody(
    state: MakeModelHubUiState,
    onMakeClick: () -> Unit,
    onListingClick: (Int) -> Unit,
    onWatchToggle: (Listing) -> Unit,
    onSeeAllSearch: () -> Unit,
    onEstimate: () -> Unit,
) {
    val insight = state.insight
    val browseLabel = stringResource(R.string.make_model_hub_browse_all, state.vehicleLabel)
    val estimateLabel = stringResource(R.string.make_model_hub_estimate)
    val allMakeLabel = stringResource(R.string.make_model_hub_all_make, state.displayMake)
    val allMakeCd = stringResource(R.string.make_model_hub_cd_all_make, state.displayMake)
    val estimateCd = stringResource(R.string.make_model_hub_cd_estimate, state.vehicleLabel)
    val na = stringResource(R.string.make_hub_na)
    val trend = insight?.trend.orEmpty()
    val showRange = insight?.minPriceLkr != null || insight?.maxPriceLkr != null
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item {
            MakeHubHero(
                eyebrow = stringResource(R.string.make_model_hub_eyebrow),
                title = state.vehicleLabel,
                description = stringResource(R.string.make_model_hub_description, state.vehicleLabel),
                trailing = {
                    MotormilaGhostButton(
                        label = allMakeLabel,
                        fillMaxWidth = false,
                        modifier = Modifier.semantics { contentDescription = allMakeCd },
                        onClick = onMakeClick,
                    )
                },
            )
        }
        item {
            MakeHubStatsGrid(
                listingCount = insight?.listingCount,
                avgPriceLkr = insight?.avgPriceLkr,
                medianPriceLkr = insight?.medianPriceLkr,
                listingsNote = stringResource(R.string.make_model_hub_listings_tracked, state.vehicleLabel),
            )
        }
        if (showRange) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MakeHubMetricCard(
                        label = stringResource(R.string.make_model_hub_min_price),
                        value = insight?.minPriceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: na,
                        note = stringResource(R.string.make_model_hub_min_note),
                        modifier = Modifier.weight(1f),
                    )
                    MakeHubMetricCard(
                        label = stringResource(R.string.make_model_hub_max_price),
                        value = insight?.maxPriceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: na,
                        note = stringResource(R.string.make_model_hub_max_note),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        if (trend.isNotEmpty()) {
            item {
                MakeHubTrendSection(
                    points = trend,
                    coverageNote = insight?.coverageNote,
                )
            }
        }
        if (state.listings.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    MakeHubSectionLabel(stringResource(R.string.make_hub_live_inventory))
                    Text(
                        text = stringResource(R.string.make_hub_recent),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                }
            }
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
            MakeHubBrowseButton(label = browseLabel, onClick = onSeeAllSearch)
        }
        item {
            MotormilaGhostButton(
                label = estimateLabel,
                modifier = Modifier.semantics { contentDescription = estimateCd },
                onClick = onEstimate,
            )
        }
        item {
            Text(
                text = stringResource(R.string.make_model_hub_estimate_desc, state.vehicleLabel),
                style = MaterialTheme.typography.bodySmall,
                color = MotormilaSecondaryText,
            )
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}
