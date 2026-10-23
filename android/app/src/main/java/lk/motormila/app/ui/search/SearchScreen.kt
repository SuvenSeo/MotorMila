package lk.motormila.app.ui.search

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.material.icons.filled.Close
import lk.motormila.app.ui.components.activeFilterChips
import lk.motormila.app.ui.components.activeFilterCount
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
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import lk.motormila.app.ui.LocalBottomChrome
import lk.motormila.app.ui.theme.GlassWeight
import lk.motormila.app.ui.theme.LiquidGlass
import lk.motormila.app.ui.theme.LocalGlassEnv
import lk.motormila.app.ui.theme.glassBackdrop
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
    /** A pasted ad / MotorMila link ("Make, model or paste a link") opens the share-import flow. */
    onOpenSharedUrl: ((String) -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val items = viewModel.paging.collectAsLazyPagingItems()
    val searchResultsCd = stringResource(R.string.mm_search_results_cd)
    val bestDealProCd = stringResource(R.string.mm_best_deal_pro_cd)
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
    // clear of it.
    var trayHeightPx by remember { mutableStateOf(0) }
    val density = LocalDensity.current
    val trayHeight = with(density) { trayHeightPx.toDp() }
    val trayShown = state.compareIds.isNotEmpty()

    // Edge-to-edge: results scroll under a liquid-glass search header (top)
    // and the floating glass tab bar (bottom). The header is measured once
    // per size change (not per frame) and pads the result grid.
    val chrome = LocalBottomChrome.current
    // Saveable: on pop back from Detail the screen re-enters composition and a
    // 0 header for the first frame drew the grid up under the chips.
    var headerPx by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(0) }
    val headerH = with(density) { headerPx.toDp() }
    val searchBackdrop = remember { HazeState() }
    val gridState = rememberLazyGridState()
    val scrolledUnder by remember {
        derivedStateOf { gridState.firstVisibleItemIndex > 0 || gridState.firstVisibleItemScrollOffset > 4 }
    }
    val headerGlass by animateFloatAsState(
        if (scrolledUnder) 1f else 0f,
        if (MmMotion.reduced) tween(0) else tween(MmMotion.Base),
        label = "search-header-glass",
    )
    val glassEnv = LocalGlassEnv.current
    val c = MmColors.current
    val headerStyle = LiquidGlass.style(c, GlassWeight.Regular)
    val bottomPad = chrome.contentPadding + if (trayShown) trayHeight + 8.dp else 0.dp
    // Fly-to-tray: a photo copy arcs from the card into the compare tray.
    val flights = remember { mutableStateListOf<CompareFlight>() }
    // Lives in the ViewModel: Search leaves composition while Detail is open,
    // and a remembered set came back empty on return, so every visible card
    // re-ran its entrance (alpha 0 -> 1) exactly while the Detail page was
    // shrinking back into it: the end of the morph flickered.
    val revealedIds = viewModel.revealedIds
    var trayBounds by remember { mutableStateOf(androidx.compose.ui.geometry.Rect.Zero) }
    val reducedMotion = MmMotion.reduced

    var rootHeightPx by remember { mutableStateOf(0f) }
    Box(Modifier.fillMaxSize().onSizeChanged { rootHeightPx = it.height.toFloat() }) {
            MmPullToRefresh(
                isRefreshing = isRefreshing,
                onRefresh = { items.refresh() },
                indicatorTop = headerH,
                modifier = Modifier
                    .fillMaxSize()
                    .glassBackdrop(searchBackdrop),
            ) {
                // Results update (filter apply, sort, category, refresh) cross-fades
                // between skeleton / error / empty / grid instead of cutting.
                val phase = when {
                    isRefreshing -> 0
                    items.loadState.refresh is LoadState.Error -> 1
                    items.itemCount == 0 && !items.loadState.append.endOfPaginationReached -> 2
                    items.itemCount == 0 -> 3
                    else -> 4
                }
                AnimatedContent(
                    targetState = phase,
                    transitionSpec = {
                        if (reducedMotion) {
                            fadeIn(tween(150)) togetherWith fadeOut(tween(150))
                        } else {
                            fadeIn(tween(MmMotion.Base, easing = MmMotion.Standard)) togetherWith fadeOut(tween(MmMotion.Fast, easing = MmMotion.Exit))
                        }
                    },
                    label = "search-results",
                    modifier = Modifier.fillMaxSize(),
                ) { shownPhase ->
                when (shownPhase) {
                    0 -> {
                        // Skeletons match the result layout (grid cards / list rows).
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(if (gridMode) 2 else 1),
                            contentPadding = PaddingValues(start = MmSpacing.lg, end = MmSpacing.lg, top = headerH + MmSpacing.sm, bottom = bottomPad),
                            horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
                            verticalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
                            userScrollEnabled = false,
                        ) {
                            items(6, contentType = { "skeleton" }) { MmListingCardSkeleton() }
                        }
                    }
                    1 -> {
                        // Safe cast: this branch is still drawn while it fades out.
                        val err = items.loadState.refresh as? LoadState.Error
                        ErrorState(
                            message = err?.error?.message ?: "Couldn't load results",
                            onRetry = { items.retry() },
                            cachedAvailable = items.itemCount > 0,
                            onShowCached = { items.retry() },
                            modifier = Modifier.fillMaxSize().padding(top = headerH, bottom = bottomPad),
                        )
                    }
                    // Truly empty only once the source says so: on (re)entry the
                    // first frame can have 0 items before the cached page lands,
                    // which flashed the empty state.
                    2 -> {
                        Box(Modifier.fillMaxSize())
                    }
                    3 -> {
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
                            modifier = Modifier.fillMaxSize().padding(top = headerH, bottom = bottomPad),
                        )
                    }
                    else -> {
                        LazyVerticalGrid(
                            state = gridState,
                            columns = GridCells.Fixed(if (gridMode) 2 else 1),
                            contentPadding = PaddingValues(
                                start = MmSpacing.lg,
                                end = MmSpacing.lg,
                                top = headerH + MmSpacing.sm,
                                // Clear the floating glass tab bar (and the compare tray).
                                bottom = bottomPad,
                            ),
                            horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
                            verticalArrangement = Arrangement.spacedBy(MmSpacing.lg),
                            modifier = Modifier
                                .fillMaxSize()
                                .semantics { contentDescription = searchResultsCd },
                        ) {
                            items(
                                count = items.itemCount,
                                key = { i -> items.peek(i)?.id ?: -i - 1 },
                                contentType = { "listing" },
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
                                        val firstReveal = remember(listing.id) { revealedIds.add(listing.id) }
                                        StaggeredItem(index = i, animate = firstReveal) {
                                            ListingCard(
                                                listing = listing,
                                                isWatched = state.watchedIds.contains(listing.id),
                                                onClick = { onListingClick(listing.id) },
                                                onWatchToggle = { viewModel.toggleWatch(listing) },
                                                compareSelected = inCompare,
                                                compareEnabled = inCompare || state.compareIds.size < MAX_COMPARE_IDS,
                                                onCompareToggle = {
                                                    if (inCompare) haptics.unsave() else haptics.save()
                                                    viewModel.toggleCompare(listing.id)
                                                },
                                                onCompareFly = { from ->
                                                    if (!reducedMotion && from != androidx.compose.ui.geometry.Rect.Zero) {
                                                        flights += CompareFlight(System.nanoTime(), listing.heroImageUrl, from, state.compareIds.size)
                                                    }
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
        CompositionLocalProvider(LocalGlassEnv provides glassEnv.copy(backdrop = searchBackdrop)) {
        Box(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
                .onSizeChanged { headerPx = it.height }
                .then(
                    if (glassEnv.solid) {
                        Modifier.background(LiquidGlass.solid(c).copy(alpha = 0.97f))
                    } else {
                        Modifier.hazeEffect(searchBackdrop, headerStyle) {
                            blurEnabled = glassEnv.blurAllowed
                            alpha = headerGlass
                        }
                    },
                )
                .drawBehind {
                    if (headerGlass > 0.01f) {
                        drawLine(c.outline.copy(alpha = c.outline.alpha * headerGlass), androidx.compose.ui.geometry.Offset(0f, size.height - 0.5f), androidx.compose.ui.geometry.Offset(size.width, size.height - 0.5f), 1f)
                    }
                }
                .statusBarsPadding()
                .padding(bottom = 4.dp),
        ) {
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
                onSearch = { q ->
                    val t = q.trim()
                    if (onOpenSharedUrl != null && Regex("^(https?://|motormila://)", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
                        onOpenSharedUrl(t)
                    } else {
                        viewModel.onSearch(q)
                    }
                },
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
                        .semantics { contentDescription = bestDealProCd },
                ) {
                    Icon(
                        Icons.Filled.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        stringResource(R.string.glass_free_plan_note),
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
                onFilters = {
                    viewModel.loadModels(state.filters.make)
                    viewModel.openFilters()
                },
                activeCount = state.filters.activeFilterCount(),
                onCreateAlert = viewModel::createAlertFromFilters,
                gridMode = gridMode,
                onToggleLayout = {
                    haptics.toggle()
                    gridMode = !gridMode
                },
            )
            // Removable active-filter chips (web parity), spring in/out.
            ActiveFilterChipsRow(
                chips = activeFilterChips(state.filters),
                onRemove = viewModel::removeFilter,
            )
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
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = chrome.barTop)
                // Follows the tab bar down when it minimises (layout-free offset).
                .offset {
                    val p = chrome.minimize?.value ?: 0f
                    IntOffset(0, (chrome.minimizeDrop.toPx() * p).roundToInt())
                },
        ) {
            CompareTray(
                count = state.compareIds.size,
                onCompare = { onCompare(state.compareIds) },
                onClear = viewModel::clearCompare,
                thumbnails = compareThumbs,
                modifier = Modifier
                    .onSizeChanged { trayHeightPx = it.height }
                    .onGloballyPositioned { trayBounds = it.boundsInRoot() },
            )
        }
        lk.motormila.app.ui.components.MmGlassSnackbarHost(
            snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 16.dp)
                .padding(bottom = chrome.barTop + 12.dp + if (trayShown) trayHeight else 0.dp),
        )

            // In-flight compare thumbnails (drawn above everything in Search).
            flights.forEach { f ->
                androidx.compose.runtime.key(f.key) {
                    FlyingCompareThumb(
                        flight = f,
                        target = {
                            val d = density
                            val slot = with(d) { (8.dp + ThumbSize / 2 + ThumbStep * f.slot).toPx() }
                            if (trayBounds != androidx.compose.ui.geometry.Rect.Zero) {
                                androidx.compose.ui.geometry.Offset(trayBounds.left + with(d) { MmSpacing.lg.toPx() } + slot, trayBounds.center.y)
                            } else {
                                androidx.compose.ui.geometry.Offset(
                                    with(d) { (MmSpacing.lg + 8.dp).toPx() } + slot,
                                    rootHeightPx - with(d) { (chrome.barTop + 40.dp).toPx() },
                                )
                            }
                        },
                        onDone = { flights.remove(f) },
                    )
                }
            }
        }
        }

        if (state.showFilterSheet) {
            FilterSheet(
                current = state.filters,
                makes = state.makes,
                districts = state.districts,
                resultCount = items.itemCount.takeIf { it > 0 },
                onApply = viewModel::applyFilters,
                onReset = {},
                onDismiss = viewModel::closeFilters,
                models = state.models,
                sources = state.sources,
                onMakeChange = viewModel::loadModels,
                countFor = viewModel::countFor,
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
    VehicleCategory.HEAVY_DUTY -> R.string.vehicle_category_heavy
    VehicleCategory.TRACTORS -> R.string.vehicle_category_tractors
    VehicleCategory.BOATS -> R.string.vehicle_category_boats
    VehicleCategory.BICYCLES -> R.string.vehicle_category_cycles
    VehicleCategory.OTHERS -> R.string.vehicle_category_other
}

@Composable
internal fun SortFilterRow(
    sort: String,
    onSort: (String) -> Unit,
    onFilters: () -> Unit,
    onCreateAlert: () -> Unit,
    gridMode: Boolean,
    onToggleLayout: () -> Unit,
    activeCount: Int = 0,
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
                Box {
                    MmIconButton(
                        icon = Icons.Outlined.Tune,
                        contentDescription = stringResource(R.string.mm_open_filters_cd),
                        onClick = onFilters,
                        style = MmIconButtonStyle.Filled,
                    )
                    FilterCountBadge(activeCount, Modifier.align(Alignment.TopEnd))
                }
            }
            items(ListingSorts.ALL) { s ->
                MmChip(
                    label = when (s) {
                        ListingSorts.NEWEST -> stringResource(R.string.sort_newest)
                        ListingSorts.DEAL_SCORE -> stringResource(R.string.sort_best_deal)
                        ListingSorts.PRICE_ASC -> stringResource(R.string.sort_price_asc)
                        ListingSorts.PRICE_DESC -> stringResource(R.string.sort_price_desc)
                        ListingSorts.MILEAGE_ASC -> stringResource(R.string.sort_low_km)
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
            contentDescription = if (gridMode) stringResource(R.string.mm_show_list_cd) else stringResource(R.string.mm_show_grid_cd),
            onClick = onToggleLayout,
            modifier = Modifier.padding(end = 4.dp),
        )
    }
}

/** Brand count bubble on the filter button; springs in / out and pops on change. */
@Composable
private fun FilterCountBadge(count: Int, modifier: Modifier = Modifier) {
    val c = MmColors.current
    AnimatedVisibility(
        visible = count > 0,
        enter = if (MmMotion.reduced) fadeIn(tween(0)) else scaleIn(MmMotion.bouncy()) + fadeIn(tween(MmMotion.Fast)),
        exit = if (MmMotion.reduced) fadeOut(tween(0)) else scaleOut(MmMotion.snappy()) + fadeOut(tween(MmMotion.Fast)),
        modifier = modifier,
    ) {
        val reducedBadge = MmMotion.reduced
        CappedFontScale(max = 1.15f) {
            AnimatedContent(
                targetState = count,
                transitionSpec = {
                    if (reducedBadge) {
                        fadeIn(tween(0)) togetherWith fadeOut(tween(0))
                    } else {
                        (scaleIn(MmMotion.bouncy(), initialScale = 0.6f) + fadeIn(tween(MmMotion.Fast))) togetherWith fadeOut(tween(90))
                    }
                },
                label = "filter-badge",
            ) { n ->
                Text(
                    n.toString(),
                    style = MmType.current.labelS,
                    color = c.textOnBrand,
                    maxLines = 1,
                    modifier = Modifier
                        .padding(top = 2.dp, end = 2.dp)
                        .heightIn(min = 18.dp)
                        .clip(MmShapes.pill)
                        .background(c.brand)
                        .border(1.5.dp, c.background, MmShapes.pill)
                        .padding(horizontal = 5.dp, vertical = 1.dp)
                        .clearAndSetSemantics { },
                )
            }
        }
    }
}

/**
 * Removable chips for the applied filters, under the sort row. Each chip
 * removes its filter (spring placement / fade); the row itself expands and
 * collapses as the first chip arrives or the last leaves.
 */
@Composable
internal fun ActiveFilterChipsRow(
    chips: List<lk.motormila.app.ui.components.ActiveFilterChip>,
    onRemove: (String) -> Unit,
) {
    val c = MmColors.current
    val haptics = MmHaptics.current
    AnimatedVisibility(
        visible = chips.isNotEmpty(),
        enter = if (MmMotion.reduced) fadeIn(tween(0)) else expandVertically(MmMotion.gentle()) + fadeIn(tween(MmMotion.Base)),
        exit = if (MmMotion.reduced) fadeOut(tween(0)) else shrinkVertically(MmMotion.snappy()) + fadeOut(tween(MmMotion.Fast)),
    ) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 2.dp, bottom = 4.dp),
        ) {
            items(chips, key = { it.key }, contentType = { "active-filter" }) { chip ->
                val removeCd = stringResource(R.string.filter_remove_cd, chip.label)
                CappedFontScale(max = 1.3f) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .animateItem(
                                fadeInSpec = if (MmMotion.reduced) null else tween(MmMotion.Base),
                                placementSpec = if (MmMotion.reduced) null else MmMotion.itemPlacement,
                                fadeOutSpec = if (MmMotion.reduced) null else tween(MmMotion.Fast),
                            )
                            .heightIn(min = 36.dp)
                            .clip(MmShapes.pill)
                            .background(c.brandContainer)
                            .border(0.5.dp, c.brand.copy(alpha = 0.35f), MmShapes.pill)
                            .clickable(role = androidx.compose.ui.semantics.Role.Button, onClickLabel = removeCd) {
                                haptics.unsave()
                                onRemove(chip.key)
                            }
                            .semantics(mergeDescendants = true) { contentDescription = removeCd }
                            .padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
                    ) {
                        Text(chip.label, style = MmType.current.label, color = c.onBrandContainer, maxLines = 1)
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.Filled.Close, contentDescription = null, tint = c.onBrandContainer, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

/**
 * Result-row stagger on the house pattern: [motormilaReveal] with
 * [cascadeDelay] (45ms steps, capped at the 700ms entrance window).
 * Reduced motion is handled inside the modifier.
 */
@Composable
private fun StaggeredItem(index: Int, animate: Boolean = true, content: @Composable () -> Unit) {
    // Cascade only the first screenful, once: items scrolled into view later
    // (or back into view) appear in place — no late pop-in while scrolling.
    Box(if (animate && index < 8) Modifier.motormilaReveal(delayMillis = cascadeDelay(index)) else Modifier) {
        content()
    }
}

/**
 * Compare tray: a liquid-glass capsule stacked above the glass tab bar (same
 * material, same side insets) — overlapping thumbnails, "n/3 selected",
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
                .padding(horizontal = MmSpacing.lg, vertical = 10.dp)
                .fillMaxWidth()
                // Same liquid-glass material as the tab bar it is stacked on.
                .liquidGlass(MmShapes.pill, lk.motormila.app.ui.theme.GlassWeight.Regular, elevation = 18.dp)
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
                            ring = if (c.isDark) Color(0xFF2A2A30) else Color.White,
                            modifier = Modifier.offset(x = ThumbStep * i),
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
            }
            Column(Modifier.weight(1f)) {
                // Shrinks to fit rather than "3/3 s…" when space is tight (200 %).
                // Full "3/3 selected" when it fits; otherwise the bare "3/3"
                // count (never "3/3 sele…" at 200 %). The tray's content
                // description still reads the full sentence.
                androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val labelStyle = MmType.current.label
                    val full = stringResource(R.string.compare_selected_count, count, MAX_COMPARE_IDS)
                    val measurer = androidx.compose.ui.text.rememberTextMeasurer()
                    val fits = remember(full, labelStyle, constraints.maxWidth) {
                        measurer.measure(full, labelStyle, maxLines = 1, softWrap = false).size.width <= constraints.maxWidth
                    }
                    Text(
                        if (fits) full else "$count/$MAX_COMPARE_IDS",
                        style = labelStyle,
                        fontWeight = if (fits) null else FontWeight.SemiBold,
                        color = c.textPrimary,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
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


/** One compare thumbnail flying from a card photo to its tray slot. */
internal data class CompareFlight(val key: Long, val imageUrl: String?, val from: androidx.compose.ui.geometry.Rect, val slot: Int)

/**
 * Signature **fly-to-tray** motion: a copy of the card photo lifts (shadow),
 * arcs along a quadratic Bézier toward its slot in the compare tray while
 * shrinking and rounding into a 36dp avatar, then dissolves as the real tray
 * thumbnail lands. Everything is read in layout/draw lambdas (no
 * recomposition per frame). Not started under reduced motion.
 */
@Composable
private fun FlyingCompareThumb(
    flight: CompareFlight,
    target: () -> androidx.compose.ui.geometry.Offset,
    onDone: () -> Unit,
) {
    val p = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(Unit) {
        p.animateTo(1f, tween(640, easing = androidx.compose.animation.core.CubicBezierEasing(0.32f, 0f, 0.18f, 1f)))
        onDone()
    }
    ListingImage(
        model = flight.imageUrl,
        contentDescription = null,
        modifier = Modifier
            .layout { measurable, constraints ->
                val t = p.value
                val from = flight.from
                val end = target()
                val toSize = ThumbSize.toPx()
                val w = androidx.compose.ui.util.lerp(from.width, toSize, t)
                val h = androidx.compose.ui.util.lerp(from.height, toSize, t)
                val start = from.center
                val ctrl = androidx.compose.ui.geometry.Offset(
                    (start.x + end.x) / 2f,
                    minOf(start.y, end.y) - 140.dp.toPx(),
                )
                val u = 1f - t
                val x = u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x
                val y = u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y
                val placeable = measurable.measure(androidx.compose.ui.unit.Constraints.fixed(w.roundToInt().coerceAtLeast(1), h.roundToInt().coerceAtLeast(1)))
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.placeWithLayer((x - w / 2f).roundToInt(), (y - h / 2f).roundToInt()) {
                        val corner = androidx.compose.ui.util.lerp(24.dp.toPx(), minOf(w, h) / 2f, t)
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(corner)
                        clip = true
                        shadowElevation = (1f - t) * 18.dp.toPx() + 4.dp.toPx()
                        alpha = if (t > 0.86f) ((1f - t) / 0.14f).coerceIn(0f, 1f) else 1f
                        val lift = if (t < 0.18f) 1f + t * 0.4f else 1.07f - (t - 0.18f) * 0.085f
                        scaleX = lift
                        scaleY = lift
                    }
                }
            },
    )
}
