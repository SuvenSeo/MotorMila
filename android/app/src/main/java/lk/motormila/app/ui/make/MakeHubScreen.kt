package lk.motormila.app.ui.make

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DirectionsCar
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.HubTopModel
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.ui.components.BrandLogo
import lk.motormila.app.ui.components.BrandLogoSize
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.ListingCard
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaBg
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MakeHubScreen(
    onBack: () -> Unit,
    onModelClick: (make: String, model: String) -> Unit,
    onListingClick: (Int) -> Unit,
    onSeeAllSearch: (make: String) -> Unit,
    viewModel: MakeHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val backCd = stringResource(R.string.make_hub_back)
    val refreshCd = stringResource(R.string.make_hub_cd_refresh)
    val hasBody = state.insight != null || state.listings.isNotEmpty()

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null && hasBody) {
            snacks.showSnackbar(message)
            viewModel.onEvent(MakeHubUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = state.displayMake.ifBlank { stringResource(R.string.make_hub_eyebrow) },
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
            onRefresh = { viewModel.onEvent(MakeHubUiEvent.Refresh) },
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = refreshCd },
        ) {
            when {
                state.isLoading -> MakeHubSkeleton()
                state.error != null && !hasBody ->
                    ErrorState(
                        message = state.error ?: stringResource(R.string.make_hub_error_title),
                        onRetry = { viewModel.onEvent(MakeHubUiEvent.Refresh) },
                        modifier = Modifier.fillMaxSize(),
                    )
                !hasBody ->
                    EmptyState(
                        title = stringResource(R.string.make_hub_empty_title),
                        body = stringResource(R.string.make_hub_empty_body),
                        ctaLabel = stringResource(R.string.make_hub_retry),
                        onCta = { viewModel.onEvent(MakeHubUiEvent.Refresh) },
                        icon = Icons.Filled.DirectionsCar,
                        modifier = Modifier.fillMaxSize(),
                    )
                else -> MakeHubBody(
                    state = state,
                    onModelClick = { make, model ->
                        if (!reducedMotion) haptics.tick()
                        onModelClick(make, model)
                    },
                    onListingClick = { id ->
                        if (!reducedMotion) haptics.tick()
                        onListingClick(id)
                    },
                    onWatchToggle = { listing ->
                        viewModel.onEvent(MakeHubUiEvent.ToggleWatch(listing))
                    },
                    onSeeAllSearch = {
                        if (!reducedMotion) haptics.tick()
                        onSeeAllSearch(state.searchMake)
                    },
                )
            }
        }
    }
}

@Composable
private fun MakeHubBody(
    state: MakeHubUiState,
    onModelClick: (String, String) -> Unit,
    onListingClick: (Int) -> Unit,
    onWatchToggle: (Listing) -> Unit,
    onSeeAllSearch: () -> Unit,
) {
    val insight = state.insight
    val browseLabel = stringResource(R.string.make_hub_browse_all, state.displayMake)
    val models = insight?.topModels.orEmpty()
    val trend = insight?.trend.orEmpty()
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item {
            MakeHubHero(
                eyebrow = stringResource(R.string.make_hub_eyebrow),
                title = state.displayMake,
                description = stringResource(R.string.make_hub_description, state.displayMake),
            )
        }
        item {
            MakeHubStatsGrid(
                listingCount = insight?.listingCount,
                avgPriceLkr = insight?.avgPriceLkr,
                medianPriceLkr = insight?.medianPriceLkr,
                listingsNote = stringResource(R.string.make_hub_listings_note),
            )
        }
        if (models.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    MakeHubSectionLabel(stringResource(R.string.make_hub_models_eyebrow))
                    Text(
                        text = stringResource(R.string.make_hub_popular_models, state.displayMake),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                }
            }
            items(models, key = { "${it.make}-${it.model}" }) { entry ->
                MakeHubModelRow(
                    entry = entry,
                    fallbackMake = state.searchMake,
                    onClick = onModelClick,
                )
            }
        }
        if (trend.isNotEmpty()) {
            item { MakeHubTrendSection(points = trend, coverageNote = null) }
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
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun MakeHubModelRow(
    entry: HubTopModel,
    fallbackMake: String,
    onClick: (String, String) -> Unit,
) {
    val make = entry.make.ifBlank { fallbackMake }
    val price = lk.motormila.app.ui.common.mn(entry.avgPriceLkr)
    val rowCd = stringResource(R.string.make_hub_cd_model, make, entry.model)
    MotormilaSurface(
        onClick = { onClick(make, entry.model) },
        modifier = Modifier.semantics { contentDescription = rowCd },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    entry.model,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                )
                Text(
                    price,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontFeatureSettings = "tnum",
                    ),
                )
            }
            Surface(
                shape = MotormilaRadius.pill,
                color = MotormilaSurfaceHigh,
                border = BorderStroke(1.dp, MotormilaOutline),
            ) {
                Text(
                    LkrFormat.count(entry.listingCount),
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = MotormilaSecondaryText,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
            Icon(Icons.Filled.Search, contentDescription = null, tint = MotormilaPrimaryBright)
        }
    }
}
