package lk.motormila.app.ui.search

import lk.motormila.app.domain.model.VehicleCategory

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
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.Role
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.theme.CappedFontScale
import lk.motormila.app.ui.LocalAssistantLift
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
                viewModel.applyFilters(
                    parsed.copy(sort = state.filters.sort).let {
                        if (it.vehicleCategory == null) it.copy(vehicleCategory = state.filters.vehicleCategory) else it
                    },
                )
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

    // Android 13+: ask for notification permission right after an alert is
    // saved from search (rationale first; never on cold start).
    lk.motormila.app.core.notifications.NotificationPermissionPrompt(trigger = state.alertSaved)
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

    // Measured compare-tray height: pads the grid so the last row scrolls
    // clear of it, and lifts the assistant button above it (no overlap).
    var trayHeightPx by remember { mutableStateOf(0) }
    val density = LocalDensity.current
    val trayHeight = with(density) { trayHeightPx.toDp() }
    val assistantLift = LocalAssistantLift.current
    val trayShown = state.compareIds.isNotEmpty()
    LaunchedEffect(trayShown, trayHeight) {
        assistantLift?.value = if (trayShown && trayHeight > 0.dp) trayHeight else 0.dp
    }
    DisposableEffect(assistantLift) {
        onDispose { assistantLift?.value = 0.dp }
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
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(4.dp))
            }
            CategoryChipRow(
                selected = VehicleCategory.fromApi(state.filters.vehicleCategory),
                onSelect = viewModel::onCategoryChange,
            )
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
                        // Narrow category + nothing else to clear -> offer All vehicles,
                        // so the empty state is never a dead end.
                        val onlyCategory = state.filters.copy(vehicleCategory = null, sort = ListingSorts.NEWEST, keyword = null).isEmpty &&
                            state.filters.vehicleCategory != null
                        EmptyState(
                            title = stringResource(R.string.search_empty_title),
                            body = stringResource(if (onlyCategory) R.string.search_empty_category_body else R.string.search_empty_filters_body),
                            ctaLabel = stringResource(if (onlyCategory) R.string.search_empty_show_all else R.string.search_empty_reset),
                            onCta = if (onlyCategory) {
                                { viewModel.onCategoryChange(VehicleCategory.ALL) }
                            } else {
                                viewModel::resetFilters
                            },
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
                                // Clear the floating assistant button (and the compare
                                // tray + lifted button when the tray shows).
                                bottom = if (state.compareIds.isNotEmpty()) trayHeight + 112.dp else 88.dp,
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
                                    val inCompare = state.compareIds.contains(listing.id)
                                    Box(
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
                                                compareSelected = inCompare,
                                                compareEnabled = inCompare || state.compareIds.size < MAX_COMPARE_IDS,
                                                onCompareToggle = {
                                                    if (inCompare) haptics.unsave() else haptics.save()
                                                    viewModel.toggleCompare(listing.id)
                                                },
                                            )
                                        }
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

        // Compare tray (max 3): compact solid capsule floating above the tab bar.
        val compareThumbs = remember(state.compareIds, items.itemSnapshotList) {
            val byId = items.itemSnapshotList.items.filterNotNull().associateBy { it.id }
            state.compareIds.mapNotNull { id ->
                byId[id]?.let { CompareThumb(id = it.id, imageUrl = it.heroImageUrl) }
            }
        }
        AnimatedVisibility(
            visible = state.compareIds.isNotEmpty(),
            enter = if (MmMotion.reduced) fadeIn(tween(0)) else slideInVertically(MmMotion.snappy()) { it } + fadeIn(tween(MmMotion.Fast)),
            exit = if (MmMotion.reduced) fadeOut(tween(0)) else slideOutVertically(tween(MmMotion.Fast)) { it } + fadeOut(tween(MmMotion.Fast)),
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            CompareTray(
                count = state.compareIds.size,
                onCompare = { onCompare(state.compareIds) },
                onClear = viewModel::clearCompare,
                thumbnails = compareThumbs,
                modifier = Modifier.onSizeChanged { trayHeightPx = it.height },
            )
        }
        SnackbarHost(
            snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = if (trayShown) trayHeight else 0.dp),
        )

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

/**
 * Browse category chips. Cars is the default first impression; one tap
 * switches to All vehicles or another type.
 */
@Composable
internal fun CategoryChipRow(
    selected: VehicleCategory,
    onSelect: (VehicleCategory) -> Unit,
    modifier: Modifier = Modifier,
) {
    val categoryRowCd = stringResource(R.string.vehicle_category_row_cd)
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 4.dp)
            .semantics { contentDescription = categoryRowCd },
    ) {
        items(VehicleCategory.entries, key = { it.name }) { cat ->
            MmChip(
                label = stringResource(cat.labelRes()),
                selected = cat == selected,
                onClick = { onSelect(cat) },
            )
        }
    }
}

/** Localised chip label; the domain enum keeps an English label for logs/tests only. */
@androidx.annotation.StringRes
internal fun VehicleCategory.labelRes(): Int = when (this) {
    VehicleCategory.CARS -> R.string.vehicle_category_cars
    VehicleCategory.ALL -> R.string.vehicle_category_all
    VehicleCategory.MOTORBIKES -> R.string.vehicle_category_bikes
    VehicleCategory.THREE_WHEELERS -> R.string.vehicle_category_three_wheelers
    VehicleCategory.VANS -> R.string.vehicle_category_vans
    VehicleCategory.LORRIES -> R.string.vehicle_category_lorries
    VehicleCategory.BUSES -> R.string.vehicle_category_buses
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
    val c = MmColors.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        // Chips scroll under a soft fade at the trailing edge instead of being
        // cut hard against the layout toggle ("P" of "Price ↓" clipped).
        LazyRow(
            contentPadding = PaddingValues(start = 8.dp, end = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    val fade = 24.dp.toPx()
                    drawRect(
                        brush = Brush.horizontalGradient(
                            colors = listOf(Color.Black, Color.Transparent),
                            startX = size.width - fade,
                            endX = size.width,
                        ),
                        topLeft = Offset(size.width - fade, 0f),
                        size = Size(fade, size.height),
                        blendMode = BlendMode.DstIn,
                    )
                },
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
        // Layout toggle gets its own slot, separated by a hairline.
        Box(
            Modifier
                .padding(horizontal = 2.dp)
                .width(0.5.dp)
                .height(24.dp)
                .background(c.outline),
        )
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

/**
 * Compare tray: a compact, solid floating capsule (theme surface, soft shadow
 * in light / hairline in dark) — overlapping thumbnails, "n/3 selected",
 * Clear, and a single-line "Compare n" pill. Font scale capped at 1.3x so it
 * stays one row at 200 %.
 */
@Composable
internal fun CompareTray(
    count: Int,
    onCompare: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
    thumbnails: List<CompareThumb> = emptyList(),
) {
    val c = MmColors.current
    val trayCd = stringResource(R.string.compare_tray_cd, count, MAX_COMPARE_IDS)
    CappedFontScale(max = 1.3f) {
        Row(
            modifier = modifier
                .padding(horizontal = MmSpacing.lg, vertical = MmSpacing.md)
                .fillMaxWidth()
                .shadow(
                    elevation = if (c.isDark) 0.dp else 16.dp,
                    shape = MmShapes.pill,
                    clip = false,
                    ambientColor = Color.Black.copy(alpha = 0.08f),
                    spotColor = Color.Black.copy(alpha = 0.18f),
                )
                .clip(MmShapes.pill)
                .background(if (c.isDark) c.surfaceHigh else c.surfaceRaised)
                .then(if (c.isDark) Modifier.border(0.5.dp, c.outlineStrong, MmShapes.pill) else Modifier)
                .heightIn(min = 60.dp)
                .padding(start = 8.dp, end = 6.dp, top = 6.dp, bottom = 6.dp)
                .semantics(mergeDescendants = false) { contentDescription = trayCd },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Overlapping avatar stack — the fly-to-tray target end
            // (spec §3 / §7.5, sharedElement key "compare-thumb-{id}").
            if (thumbnails.isNotEmpty()) {
                Box(Modifier.width(ThumbSize + ThumbStep * (thumbnails.size - 1)).height(ThumbSize)) {
                    thumbnails.forEachIndexed { i, thumb ->
                        CompareTrayThumb(
                            thumb = thumb,
                            ring = if (c.isDark) c.surfaceHigh else c.surfaceRaised,
                            modifier = Modifier.offset(x = ThumbStep * i),
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
            }
            Column(Modifier.weight(1f)) {
                // Shrinks to fit rather than "3/3 s…" when space is tight (200 %).
                lk.motormila.app.ui.components.MmFitText(
                    text = stringResource(R.string.compare_selected_count, count, MAX_COMPARE_IDS),
                    style = MmType.current.label,
                    color = c.textPrimary,
                    minScale = 0.7f,
                )
                if (count < 2) {
                    Text(
                        stringResource(R.string.compare_pick_more),
                        style = MmType.current.caption,
                        color = c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            val clearPress = remember { MutableInteractionSource() }
            Box(
                Modifier
                    .applePress(clearPress)
                    .heightIn(min = 48.dp)
                    .clip(MmShapes.pill)
                    .clickable(interactionSource = clearPress, indication = null, role = Role.Button, onClick = onClear)
                    .padding(horizontal = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.compare_clear),
                    style = MmType.current.label,
                    color = c.textSecondary,
                    maxLines = 1,
                    softWrap = false,
                )
            }
            Spacer(Modifier.width(4.dp))
            val ctaPress = remember { MutableInteractionSource() }
            val ctaEnabled = count >= 2
            val ctaLabel = stringResource(R.string.compare_cta_count, count)
            Box(
                Modifier
                    .applePress(ctaPress)
                    .heightIn(min = 48.dp)
                    .clip(MmShapes.pill)
                    .background(if (ctaEnabled) c.brand else c.brand.copy(alpha = 0.35f))
                    .clickable(
                        enabled = ctaEnabled,
                        interactionSource = ctaPress,
                        indication = null,
                        role = Role.Button,
                        onClick = onCompare,
                    )
                    .padding(horizontal = 18.dp)
                    .semantics { contentDescription = ctaLabel },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    ctaLabel,
                    style = MmType.current.label,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}

private val ThumbSize = 36.dp
private val ThumbStep = 22.dp

/** Thumbnail shown in the compare tray for one selected listing. */
internal data class CompareThumb(val id: Int, val imageUrl: String?)

/** Shared-transition key for the compare-tray thumbnail (grid → tray). */
private fun compareThumbKey(listingId: Int): String = "compare-thumb-$listingId"

/**
 * One compare-tray thumbnail. Carries the sharedElement target end of the
 * "compare-thumb-{id}" pair (spec §3 / §7.5) — the source end belongs on the
 * originating grid card.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun CompareTrayThumb(thumb: CompareThumb, ring: Color, modifier: Modifier = Modifier) {
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
        contentDescription = null,
        modifier = modifier
            .size(ThumbSize)
            .border(2.dp, ring, CircleShape)
            .padding(2.dp)
            .clip(CircleShape)
            .then(sharedMod),
    )
}
