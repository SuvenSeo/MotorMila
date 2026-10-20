package lk.motormila.app.ui.search

import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import lk.motormila.app.ui.components.MmChip
import lk.motormila.app.ui.components.MmIconButton
import lk.motormila.app.ui.components.MmIconButtonStyle
import lk.motormila.app.ui.components.MmListingCardSkeleton
import lk.motormila.app.ui.components.MmPullToRefresh
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmSpacing
import android.app.Activity
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.ExperimentalSharedTransitionApi
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAlert
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.res.stringResource
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import kotlinx.coroutines.launch
import lk.motormila.app.domain.repository.ListingSorts
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.FilterSheet
import lk.motormila.app.ui.components.ListingCard
import lk.motormila.app.ui.components.ListingImage
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.R
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.components.SearchBar
import lk.motormila.app.ui.components.cascadeDelay
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.applePress
import lk.motormila.app.ui.theme.motormilaReveal
import lk.motormila.app.ui.components.motormilaSharedBoundsTransform
import lk.motormila.app.ui.scan.VoiceSearchHelper
import lk.motormila.app.ui.scan.parseVoiceQuery
import lk.motormila.app.ui.theme.MotormilaGlassFillStrong
import lk.motormila.app.ui.theme.liquidGlass

/**
 * Search: query + suggestions + filters + sort + Paging3 LazyColumn
 * (stagger first-8 35ms) + compare-select tray (max 3) + save-watchlist +
 * create-alert-from-filters.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    onListingClick: (Int) -> Unit,
    onCompare: (List<Int>) -> Unit,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val items = viewModel.paging.collectAsLazyPagingItems()
    val fromSnapshot by viewModel.fromSnapshot.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val isRefreshing = items.loadState.refresh is LoadState.Loading
    var gridMode by rememberSaveable { mutableStateOf(true) }
    val haptics = MmHaptics.current

    // Voice affordance: system recogniser (no RECORD_AUDIO permission needed),
    // parsed with the shared parseVoiceQuery heuristic (si/ta/en via locale).
    val context = LocalContext.current
    val voiceHelper = remember(context) { VoiceSearchHelper(context) }
    val voiceAvailable = remember { voiceHelper.isAvailable() }
    val voiceLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val heard = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull().orEmpty()
            if (heard.isBlank()) {
                scope.launch { snackbar.showSnackbar("Didn't catch that — try again.") }
            } else {
                viewModel.onQueryChange(heard)
                val parsed = parseVoiceQuery(heard)
                viewModel.applyFilters(parsed.copy(sort = state.filters.sort))
            }
        }
    }

    LaunchedEffect(state.pendingVoice) {
        if (!state.pendingVoice) return@LaunchedEffect
        viewModel.consumeVoice()
        if (!voiceAvailable) return@LaunchedEffect
        runCatching { voiceLauncher.launch(voiceHelper.recogniserIntent()) }
            .onFailure {
                snackbar.showSnackbar("Voice search isn't available on this device.")
            }
    }

    LaunchedEffect(state.alertSaved) {
        if (state.alertSaved) {
            snackbar.showSnackbar("Alert saved — we'll notify you of matches")
            viewModel.consumeAlertSaved()
        }
    }
    LaunchedEffect(state.error) {
        if (state.error != null) {
            snackbar.showSnackbar(state.error ?: "Error")
            viewModel.clearError()
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            if (items.loadState.refresh is LoadState.Error) {
                OfflineBanner(visible = true, onRetry = { items.refresh() })
            } else if (fromSnapshot) {
                OfflineBanner(
                    visible = true,
                    text = stringResource(R.string.offline_snapshot_banner),
                    onRetry = { items.refresh() },
                )
            }
            SearchBar(
                query = state.query,
                onQueryChange = viewModel::onQueryChange,
                onSearch = viewModel::onSearch,
                suggestions = state.suggestions,
                recentSearches = state.recentSearches,
                onSuggestionClick = { onListingClick(it.id) },
                onRecentClick = { viewModel.onSearch(it) },
                onVoiceClick = if (voiceAvailable) {
                    {
                        runCatching { voiceLauncher.launch(voiceHelper.recogniserIntent()) }
                            .onFailure {
                                scope.launch { snackbar.showSnackbar("Voice search isn't available on this device.") }
                            }
                    }
                } else {
                    null
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
            // Free tier has no deal_score — backend forces `newest` (web parity).
            if (!state.isPro) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .semantics { contentDescription = "Free plan sorts by newest" },
                ) {
                    Icon(
                        Icons.Filled.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "Free plan · newest first — Pro unlocks deal-score sort",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(4.dp))
            }
            SortFilterRow(
                sort = state.filters.sort,
                onSort = viewModel::onSortChange,
                onFilters = viewModel::openFilters,
                onCreateAlert = viewModel::createAlertFromFilters,
                gridMode = gridMode,
                onToggleLayout = {
                    haptics.toggle()
                    gridMode = !gridMode
                },
            )
            MmPullToRefresh(
                isRefreshing = isRefreshing,
                onRefresh = { items.refresh() },
                modifier = Modifier.weight(1f),
            ) {
                when {
                    isRefreshing -> {
                        // Skeletons match the result layout (grid cards / list rows).
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(if (gridMode) 2 else 1),
                            contentPadding = PaddingValues(MmSpacing.lg),
                            horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
                            verticalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
                            userScrollEnabled = false,
                        ) {
                            items(6) { MmListingCardSkeleton() }
                        }
                    }
                    items.loadState.refresh is LoadState.Error -> {
                        val err = items.loadState.refresh as LoadState.Error
                        ErrorState(
                            message = err.error.message ?: "Couldn't load results",
                            onRetry = { items.retry() },
                            cachedAvailable = items.itemCount > 0,
                            onShowCached = { items.retry() },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                    items.itemCount == 0 -> {
                        EmptyState(
                            title = "No vehicles found",
                            body = "Try widening the budget or clearing a filter.",
                            ctaLabel = "Reset filters",
                            onCta = viewModel::resetFilters,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                    else -> {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(if (gridMode) 2 else 1),
                            contentPadding = PaddingValues(
                                start = MmSpacing.lg,
                                end = MmSpacing.lg,
                                top = MmSpacing.sm,
                                bottom = if (state.compareIds.isNotEmpty()) 120.dp else MmSpacing.huge,
                            ),
                            horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
                            verticalArrangement = Arrangement.spacedBy(MmSpacing.lg),
                            modifier = Modifier
                                .fillMaxSize()
                                .semantics { contentDescription = "Search results" },
                        ) {
                            items(
                                count = items.itemCount,
                                key = { i -> items.peek(i)?.id ?: -i - 1 },
                            ) { i ->
                                val listing = items[i]
                                if (listing != null) {
                                    Column(
                                        Modifier.animateItem(
                                            fadeInSpec = null,
                                            fadeOutSpec = null,
                                            placementSpec = MmMotion.itemPlacement,
                                        ),
                                    ) {
                                        StaggeredItem(index = i) {
                                            ListingCard(
                                                listing = listing,
                                                isWatched = false,
                                                onClick = { onListingClick(listing.id) },
                                                onWatchToggle = { viewModel.toggleWatch(listing) },
                                            )
                                        }
                                        CompareToggleRow(
                                            selected = state.compareIds.contains(listing.id),
                                            enabled = state.compareIds.contains(listing.id) ||
                                                state.compareIds.size < MAX_COMPARE_IDS,
                                            onToggle = {
                                                if (state.compareIds.contains(listing.id)) haptics.unsave() else haptics.save()
                                                viewModel.toggleCompare(listing.id)
                                            },
                                        )
                                    }
                                }
                            }
                            if (items.loadState.append is LoadState.Loading) {
                                item { MmListingCardSkeleton() }
                            }
                            if (items.loadState.append is LoadState.Error) {
                                item(span = { GridItemSpan(maxLineSpan) }) {
                                    ErrorState(
                                        message = "Couldn't load more",
                                        onRetry = { items.retry() },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Compare tray (max 3).
        if (state.compareIds.isNotEmpty()) {
            val compareThumbs = remember(state.compareIds, items.itemSnapshotList) {
                val byId = items.itemSnapshotList.items.filterNotNull().associateBy { it.id }
                state.compareIds.mapNotNull { id ->
                    byId[id]?.let { CompareThumb(id = it.id, imageUrl = it.heroImageUrl) }
                }
            }
            CompareTray(
                count = state.compareIds.size,
                onCompare = { onCompare(state.compareIds) },
                onClear = viewModel::clearCompare,
                modifier = Modifier.align(Alignment.BottomCenter),
                thumbnails = compareThumbs,
            )
        }
        SnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter))

        if (state.showFilterSheet) {
            FilterSheet(
                current = state.filters,
                makes = state.makes,
                districts = state.districts,
                resultCount = items.itemCount.takeIf { it > 0 },
                onApply = viewModel::applyFilters,
                onReset = viewModel::resetFilters,
                onDismiss = viewModel::closeFilters,
            )
        }
    }
}

@Composable
internal fun SortFilterRow(
    sort: String,
    onSort: (String) -> Unit,
    onFilters: () -> Unit,
    onCreateAlert: () -> Unit,
    gridMode: Boolean,
    onToggleLayout: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        LazyRow(
            contentPadding = PaddingValues(start = 8.dp, end = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f),
        ) {
            item {
                MmIconButton(
                    icon = Icons.Outlined.Tune,
                    contentDescription = "Open filters",
                    onClick = onFilters,
                    style = MmIconButtonStyle.Filled,
                )
            }
            items(ListingSorts.ALL) { s ->
                MmChip(
                    label = when (s) {
                        ListingSorts.NEWEST -> "Newest"
                        ListingSorts.DEAL_SCORE -> "Best deal"
                        ListingSorts.PRICE_ASC -> "Price ↑"
                        ListingSorts.PRICE_DESC -> "Price ↓"
                        ListingSorts.MILEAGE_ASC -> "Low km"
                        else -> s
                    },
                    selected = sort == s,
                    onClick = { onSort(s) },
                )
            }
            item {
                MmIconButton(
                    icon = Icons.Filled.AddAlert,
                    contentDescription = "Create alert from these filters",
                    onClick = onCreateAlert,
                )
            }
        }
        MmIconButton(
            icon = if (gridMode) Icons.AutoMirrored.Outlined.ViewList else Icons.Outlined.GridView,
            contentDescription = if (gridMode) "Show as list" else "Show as grid",
            onClick = onToggleLayout,
            modifier = Modifier.padding(end = 4.dp),
        )
    }
}

/**
 * Result-row stagger on the house pattern: [motormilaReveal] with
 * [cascadeDelay] (45ms steps, capped at the 700ms entrance window).
 * Reduced motion is handled inside the modifier.
 */
@Composable
private fun StaggeredItem(index: Int, content: @Composable () -> Unit) {
    Box(Modifier.motormilaReveal(delayMillis = cascadeDelay(index))) {
        content()
    }
}

@Composable
private fun CompareToggleRow(selected: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
            MmChip(
                label = if (selected) "In compare" else "Compare",
                selected = selected,
                enabled = enabled,
                onClick = onToggle,
                leadingIcon = if (selected) Icons.Filled.Check else Icons.AutoMirrored.Filled.CompareArrows,
            )
    }
}

@Composable
private fun CompareTray(
    count: Int,
    onCompare: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
    thumbnails: List<CompareThumb> = emptyList(),
) {
    androidx.compose.material3.Surface(
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        color = Color.Transparent,
        shape = MotormilaRadius.lg,
        modifier = modifier
            .padding(16.dp)
            .liquidGlass(MotormilaRadius.lg, fill = MotormilaGlassFillStrong),
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Selected-vehicle thumbnails — the fly-to-tray target end
            // (spec §3 / §7.5, sharedElement key "compare-thumb-{id}").
            thumbnails.forEach { thumb ->
                CompareTrayThumb(thumb = thumb)
                Spacer(Modifier.width(8.dp))
            }
            Text("$count/$MAX_COMPARE_IDS selected", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            val clearPress = remember { MutableInteractionSource() }
            Text(
                "Clear",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .applePress(clearPress)
                    .heightIn(min = 48.dp)
                    .clickable(interactionSource = clearPress, indication = null, onClick = onClear)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
            Spacer(Modifier.width(8.dp))
            MotormilaPrimaryButton(
                label = "Compare",
                onClick = onCompare,
                enabled = count >= 2,
                fillMaxWidth = false,
            )
        }
    }
}

/** Thumbnail shown in the compare tray for one selected listing. */
private data class CompareThumb(val id: Int, val imageUrl: String?)

/** Shared-transition key for the compare-tray thumbnail (grid → tray). */
private fun compareThumbKey(listingId: Int): String = "compare-thumb-$listingId"

/**
 * One compare-tray thumbnail. Carries the sharedElement target end of the
 * "compare-thumb-{id}" pair (spec §3 / §7.5) — the source end belongs on the
 * originating grid card.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun CompareTrayThumb(thumb: CompareThumb) {
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    val sharedMod = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedElement(
                rememberSharedContentState(key = compareThumbKey(thumb.id)),
                animatedScope,
                boundsTransform = motormilaSharedBoundsTransform(),
            )
        }
    } else {
        Modifier
    }
    ListingImage(
        model = thumb.imageUrl,
        contentDescription = "Compared vehicle",
        modifier = Modifier
            .size(44.dp)
            .clip(MotormilaRadius.xs)
            .then(sharedMod),
    )
}
