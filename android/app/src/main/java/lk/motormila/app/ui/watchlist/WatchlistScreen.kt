@file:OptIn(ExperimentalSharedTransitionApi::class, ExperimentalMaterial3Api::class)

package lk.motormila.app.ui.watchlist

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.spring
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAlert
import androidx.compose.material.icons.filled.ClearAll
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.ui.MotormilaTabs
import lk.motormila.app.ui.common.mmScreenSafe
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.MmCard
import lk.motormila.app.ui.components.MmDealBadge
import lk.motormila.app.ui.components.MmImage
import lk.motormila.app.ui.components.MmPriceFormat
import lk.motormila.app.ui.components.MotormilaIconAction
import lk.motormila.app.ui.components.listingCardKey
import lk.motormila.app.ui.navigation.listingHeroKey
import lk.motormila.app.ui.components.motormilaSharedBoundsTransform
import lk.motormila.app.ui.navigation.LocalNavAnimatedVisibilityScope
import lk.motormila.app.ui.navigation.LocalSharedTransitionScope
import lk.motormila.app.ui.navigation.LocalTabReselect
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmDealTone
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import kotlin.math.roundToInt

/**
 * Watchlist, v1.9.0: photo-leading rows on the shared MmCard/MmType language
 * with the deal verdict badge, "typical" wording (never "FMV"), bookmark
 * empty-state copy, a counted Clear-all confirmation, and Undo snackbars for
 * both swipe-remove and Clear-all (entities retained until expiry).
 */
@Composable
fun WatchlistScreen(
    onOpenDetail: (id: Int) -> Unit,
    onCreateAlert: (id: Int) -> Unit,
    onBrowse: () -> Unit,
    viewModel: WatchlistViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    var showClearDialog by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    // Re-tapping the active Saved tab scrolls the list back to the top.
    val reselectTick = LocalTabReselect.current.tickFor(MotormilaTabs.SAVED)
    LaunchedEffect(reselectTick) {
        if (reselectTick > 0) listState.animateScrollToItem(0)
    }

    LaunchedEffect(state.error) {
        state.error?.let {
            snacks.showSnackbar(it)
            viewModel.onEvent(WatchlistUiEvent.DismissError)
        }
    }

    // Undo snackbar: one at a time, driven by the retained-entities state.
    val undo = state.pendingUndo
    val undoMessage = when {
        undo == null -> null
        undo.isClearAll -> stringResource(R.string.v19_watch_cleared, undo.items.size)
        else -> stringResource(R.string.v19_watch_removed, undo.items.first().title)
    }
    val undoLabel = stringResource(R.string.v19_watch_undo)
    LaunchedEffect(undo) {
        if (undo != null && undoMessage != null) {
            val result = snacks.showSnackbar(
                message = undoMessage,
                actionLabel = undoLabel,
                duration = SnackbarDuration.Long,
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.onEvent(WatchlistUiEvent.Undo)
            } else {
                viewModel.onEvent(WatchlistUiEvent.DismissUndo)
            }
        }
    }

    // Clear-all is destructive: confirm with the count + history warning.
    if (showClearDialog) {
        AlertDialog(
            onDismissRequest = { showClearDialog = false },
            title = { Text(stringResource(R.string.v19_watch_clear_title)) },
            text = { Text(stringResource(R.string.v19_watch_clear_body, state.items.size)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showClearDialog = false
                        viewModel.onEvent(WatchlistUiEvent.ClearAll)
                    },
                ) {
                    Text(stringResource(R.string.v19_watch_clear_confirm), color = MmColors.current.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    lk.motormila.app.ui.common.MmScreen(
        title = if (state.items.isEmpty()) {
            stringResource(R.string.v19_watch_title)
        } else {
            stringResource(R.string.v19_watch_title_count, state.items.size)
        },
        showBack = false,
        snackbarHostState = snacks,
        edgeToEdge = true,
        actions = {
            MotormilaIconAction(
                icon = Icons.Filled.Refresh,
                contentDescription = stringResource(R.string.v19_watch_refresh_cd),
                onClick = { viewModel.onEvent(WatchlistUiEvent.RefreshPrices) },
            )
            if (state.items.isNotEmpty()) {
                MotormilaIconAction(
                    icon = Icons.Filled.ClearAll,
                    contentDescription = stringResource(R.string.v19_watch_clear_cd),
                    onClick = { showClearDialog = true },
                )
            }
        },
    ) {
        lk.motormila.app.ui.components.MmPullToRefresh(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(WatchlistUiEvent.Refresh) },
            indicatorTop = lk.motormila.app.ui.common.LocalMmScreenInsets.current.top,
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.isLoading -> Box(Modifier.mmScreenSafe()) { SkeletonList() }
                state.error != null && state.items.isEmpty() ->
                    Box(Modifier.mmScreenSafe()) {
                        ErrorRetry(
                            state.error ?: stringResource(R.string.v19_unknown_error),
                            onRetry = { viewModel.onEvent(WatchlistUiEvent.Refresh) },
                        )
                    }

                state.items.isEmpty() -> Box(Modifier.mmScreenSafe()) {
                    EmptyState(
                        title = stringResource(R.string.v19_watch_empty_title),
                        body = stringResource(R.string.v19_watch_empty_body),
                        ctaLabel = stringResource(R.string.v19_watch_browse),
                        onCta = onBrowse,
                        graphic = { BookmarkEmptyGraphic() },
                    )
                }

                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = lk.motormila.app.ui.common.mmScreenPadding(top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(MmSpacing.cardGap),
                ) {
                    itemsIndexed(state.items, key = { _, it -> it.id }) { _, item ->
                        // Removing a saved car closes the gap on a spring instead of jumping.
                        Box(
                            Modifier.animateItem(
                                fadeInSpec = null,
                                placementSpec = MmMotion.itemPlacement,
                                fadeOutSpec = spring(stiffness = androidx.compose.animation.core.Spring.StiffnessMediumLow),
                            ),
                        ) {
                            WatchRow(
                                item = item,
                                flash = item.id in state.droppedIds,
                                onOpen = { onOpenDetail(item.id) },
                                onAlert = { onCreateAlert(item.id) },
                                onRemove = { viewModel.onEvent(WatchlistUiEvent.Remove(item.id)) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Bookmark graphic for the empty state — the save control is a bookmark. */
@Composable
private fun BookmarkEmptyGraphic() {
    val c = MmColors.current
    Box(
        Modifier.size(80.dp).clip(MmShapes.pill).background(c.brandContainer),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Outlined.BookmarkBorder,
            contentDescription = null,
            tint = c.onBrandContainer,
            modifier = Modifier.size(36.dp),
        )
    }
}

@Composable
private fun WatchRow(
    item: WatchItem,
    flash: Boolean,
    onOpen: () -> Unit,
    onAlert: () -> Unit,
    onRemove: () -> Unit,
) {
    val c = MmColors.current
    val t = MmType.current
    val alertCd = stringResource(R.string.v19_watch_alert_cd, item.title)
    val removeCd = stringResource(R.string.v19_watch_remove_cd, item.title)
    val rowCd = stringResource(R.string.v19_watch_row_cd, item.title, MmPriceFormat.compact(item.priceLkr))
    val swipeAlertCd = stringResource(R.string.v19_watch_swipe_alert)
    val swipeRemoveCd = stringResource(R.string.v19_watch_swipe_remove)
    val createAlertLabel = stringResource(R.string.v19_watch_create_alert)
    val removeLabel = stringResource(R.string.v19_watch_remove)

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                // Swipe right: create a price alert, snap back (never deletes).
                SwipeToDismissBoxValue.StartToEnd -> {
                    onAlert()
                    false
                }
                // Swipe left: remove from watchlist (with Undo). Return false
                // so the box snaps back — the repository Flow drives removal.
                SwipeToDismissBoxValue.EndToStart -> {
                    onRemove()
                    false
                }
                SwipeToDismissBoxValue.Settled -> false
            }
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = true,
        enableDismissFromEndToStart = true,
        backgroundContent = {
            val isAlertSide = dismissState.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = MmSpacing.gutter)
                    .clip(MmShapes.lg)
                    .background(if (isAlertSide) c.brandContainer else c.dealHighContainer)
                    .padding(horizontal = 20.dp)
                    .semantics {
                        contentDescription = if (isAlertSide) swipeAlertCd else swipeRemoveCd
                    },
                contentAlignment = if (isAlertSide) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                Icon(
                    if (isAlertSide) Icons.Filled.AddAlert else Icons.Filled.Delete,
                    contentDescription = if (isAlertSide) createAlertLabel else removeLabel,
                    tint = if (isAlertSide) c.onBrandContainer else c.onDealHigh,
                )
            }
        },
        content = {
            MmCard(
                modifier = Modifier
                    .padding(horizontal = MmSpacing.gutter)
                    .then(watchCardShared(item.id))
                    .semantics { contentDescription = rowCd },
                onClick = onOpen,
                color = if (flash) c.brandContainer else null,
                contentPadding = PaddingValues(0.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Photo leads the row (was a photo-less HealthRing).
                    Box(Modifier.size(width = 96.dp, height = 72.dp).clip(MmShapes.sm)) {
                        MmImage(
                            item.thumbnailUrl,
                            contentDescription = null,
                            modifier = Modifier.matchParentSize().then(watchHeroShared(item.id)),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            item.title,
                            style = t.label.copy(fontSize = 15.sp, lineHeight = 20.sp),
                            color = c.textPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            MmPriceFormat.compact(item.priceLkr),
                            style = t.priceS,
                            color = c.textPrimary,
                            maxLines = 1,
                        )
                        item.district?.takeIf { it.isNotBlank() }?.let { district ->
                            Spacer(Modifier.height(2.dp))
                            Text(district, style = t.caption, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Spacer(Modifier.height(6.dp))
                        WatchVerdictLine(item)
                    }
                    // 48dp targets, stacked so the text column keeps room.
                    Column {
                        IconButton(
                            onClick = onAlert,
                            modifier = Modifier.size(MmSpacing.touch).semantics { contentDescription = alertCd },
                        ) {
                            Icon(Icons.Filled.AddAlert, contentDescription = null, tint = c.textSecondary)
                        }
                        IconButton(
                            onClick = onRemove,
                            modifier = Modifier.size(MmSpacing.touch).semantics { contentDescription = removeCd },
                        ) {
                            Icon(Icons.Filled.Delete, contentDescription = null, tint = c.textSecondary)
                        }
                    }
                }
            }
        },
    )
}

/**
 * Drop chip + verdict badge vs the TYPICAL price (never "FMV"): the badge
 * uses the same below-typical rules as the home rails; when the gap is small
 * or unknown we show the quiet typical asking price instead.
 */
@Composable
private fun WatchVerdictLine(item: WatchItem) {
    val c = MmColors.current
    val t = MmType.current
    val pct = item.underFmvFraction?.let { (it * 100).roundToInt() }
    val dropPctText = item.dropPct()?.let { LkrFormat.deltaPct(it) }
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (item.hasPriceDrop && dropPctText != null) {
            val dropCd = stringResource(R.string.v19_watch_drop_cd, dropPctText)
            Text(
                text = "▼ $dropPctText",
                style = t.caption,
                fontWeight = FontWeight.Bold,
                color = c.onDealGood,
                modifier = Modifier
                    .clip(MmShapes.pill)
                    .background(c.dealGoodContainer)
                    .padding(horizontal = 8.dp, vertical = 3.dp)
                    .semantics { contentDescription = dropCd },
            )
        }
        if (pct != null && pct >= 5) {
            val tone = when {
                pct >= 15 -> MmDealTone.GREAT
                else -> MmDealTone.GOOD
            }
            MmDealBadge(stringResource(R.string.mm_pct_below_typical, pct), tone)
        }
    }
    if (item.fmvLkr != null && (pct == null || pct < 5)) {
        Spacer(Modifier.height(4.dp))
        Text(
            stringResource(R.string.v19_watch_typical, MmPriceFormat.compact(item.fmvLkr)),
            style = t.caption,
            color = c.textTertiary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ── Shared-transition wiring: watchlist row → Detail container transform ──

@Composable
private fun watchCardShared(listingId: Int): Modifier {
    val sharedScope = LocalSharedTransitionScope.current ?: return Modifier
    val animatedScope = LocalNavAnimatedVisibilityScope.current ?: return Modifier
    return with(sharedScope) {
        Modifier.sharedBounds(
            rememberSharedContentState(key = listingCardKey(listingId)),
            animatedScope,
            enter = androidx.compose.animation.fadeIn(
                androidx.compose.animation.core.tween(200, delayMillis = 140, easing = MmMotion.Standard),
            ),
            exit = androidx.compose.animation.fadeOut(
                androidx.compose.animation.core.tween(90, easing = MmMotion.Exit),
            ),
            boundsTransform = motormilaSharedBoundsTransform(),
            clipInOverlayDuringTransition = OverlayClip(MmShapes.lg),
        )
    }
}

@Composable
private fun watchHeroShared(listingId: Int): Modifier {
    val sharedScope = LocalSharedTransitionScope.current ?: return Modifier
    val animatedScope = LocalNavAnimatedVisibilityScope.current ?: return Modifier
    return with(sharedScope) {
        Modifier.sharedElement(
            rememberSharedContentState(key = listingHeroKey(listingId)),
            animatedScope,
            boundsTransform = motormilaSharedBoundsTransform(),
        )
    }
}
