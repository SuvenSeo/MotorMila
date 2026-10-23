package lk.motormila.app.ui.bestpicks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.ui.components.BrandLogo
import lk.motormila.app.ui.components.BrandLogoSize
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.ListingCard
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaBg
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BestPicksScreen(
    onBack: () -> Unit,
    onListingClick: (Int) -> Unit,
    onSeeAllSearch: () -> Unit,
    viewModel: BestPicksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val pagingItems = viewModel.paging.collectAsLazyPagingItems()
    val fromSnapshot by viewModel.fromSnapshot.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val backCd = stringResource(R.string.hub_back)
    val refreshCd = stringResource(R.string.hub_picks_cd_refresh)
    val lockedSort = stringResource(R.string.hub_picks_sort_locked)

    val pagingRefresh = pagingItems.loadState.refresh
    val pagingError = (pagingRefresh as? LoadState.Error)?.error?.message
    val pagingLoading = state.unlocked && pagingRefresh is LoadState.Loading && pagingItems.itemCount == 0
    val showInitialLoading = state.isLoading || pagingLoading
    val hasPicks = if (state.unlocked) pagingItems.itemCount > 0 else state.freePicks.isNotEmpty()
    val hasAny = hasPicks || state.priceDrops.isNotEmpty()
    val fatalError = state.error.takeIf { !hasAny && !showInitialLoading }
        ?: pagingError.takeIf { state.unlocked && pagingItems.itemCount == 0 && pagingRefresh is LoadState.Error }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null && hasAny) {
            snacks.showSnackbar(message)
            viewModel.onEvent(BestPicksUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.hub_picks_title),
        onBack = {
            if (!reducedMotion) haptics.tick()
            onBack()
        },
        snackbarHostState = snacks,
    ) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = {
                viewModel.onEvent(BestPicksUiEvent.Refresh)
                pagingItems.refresh()
            },
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = refreshCd },
        ) {
            when {
                showInitialLoading -> PicksSkeleton()
                fatalError != null ->
                    ErrorState(
                        message = fatalError,
                        onRetry = {
                            viewModel.onEvent(BestPicksUiEvent.Refresh)
                            pagingItems.retry()
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                else -> LazyColumn(
                    Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { OfflineBanner(visible = state.offline) }
                    if (!state.offline && fromSnapshot && state.unlocked) {
                        item {
                            OfflineBanner(
                                visible = true,
                                text = stringResource(R.string.offline_snapshot_banner),
                                onRetry = { pagingItems.refresh() },
                            )
                        }
                    }
                    item { PicksHero(unlocked = state.unlocked) }
                    item {
                        SortRow(
                            unlocked = state.unlocked,
                            sort = state.sort,
                            onSort = { next ->
                                if (!reducedMotion) haptics.tick()
                                if (next == BestPicksSort.DEAL_SCORE && !state.unlocked) {
                                    scope.launch { snacks.showSnackbar(lockedSort) }
                                } else {
                                    viewModel.onEvent(BestPicksUiEvent.SortChanged(next))
                                }
                            },
                        )
                    }
                    item {
                        CutsSection(
                            drops = state.priceDrops,
                            onListingClick = onListingClick,
                            onHaptic = { if (!reducedMotion) haptics.tick() },
                        )
                    }
                    item {
                        Text(
                            text = if (state.unlocked) {
                                stringResource(R.string.hub_picks_ranked)
                            } else {
                                stringResource(R.string.hub_picks_free_teasers)
                            },
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontWeight = FontWeight.Bold,
                                color = MotormilaPrimary,
                            ),
                            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                        )
                    }
                    if (!hasPicks) {
                        item {
                            EmptyState(
                                title = stringResource(R.string.hub_picks_empty_title),
                                body = stringResource(R.string.hub_picks_empty_body),
                                ctaLabel = stringResource(R.string.hub_picks_see_all),
                                onCta = onSeeAllSearch,
                                icon = Icons.Filled.Star,
                            )
                        }
                    } else if (state.unlocked) {
                        items(
                            count = pagingItems.itemCount,
                            key = { index -> pagingItems.peek(index)?.id ?: -index - 1 },
                            contentType = { "pick" },
                        ) { index ->
                            val listing = pagingItems[index]
                            if (listing != null) {
                                PickCard(
                                    listing = listing,
                                    watched = state.watchedIds.contains(listing.id),
                                    onClick = {
                                        if (!reducedMotion) haptics.tick()
                                        onListingClick(listing.id)
                                    },
                                    onWatch = {
                                        viewModel.onEvent(BestPicksUiEvent.ToggleWatch(listing))
                                    },
                                    modifier = Modifier.motormilaReveal(
                                        delayMillis = (index % 8) * 45,
                                    ),
                                )
                            }
                        }
                        if (pagingItems.loadState.append is LoadState.Loading) {
                            item { LoadingSkeletonCard() }
                        }
                    } else {
                        itemsIndexed(state.freePicks, key = { _, it -> it.id }) { index, listing ->
                            PickCard(
                                listing = listing,
                                watched = state.watchedIds.contains(listing.id),
                                onClick = {
                                    if (!reducedMotion) haptics.tick()
                                    onListingClick(listing.id)
                                },
                                onWatch = {
                                    viewModel.onEvent(BestPicksUiEvent.ToggleWatch(listing))
                                },
                                modifier = Modifier.motormilaReveal(
                                    delayMillis = (index % 8) * 45,
                                ),
                            )
                        }
                        item { PicksUpgradeStrip() }
                    }
                    item {
                        val seeAll = stringResource(R.string.hub_picks_see_all)
                        MotormilaPrimaryButton(
                            label = seeAll,
                            onClick = {
                                if (!reducedMotion) haptics.tick()
                                onSeeAllSearch()
                            },
                        )
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun PicksSkeleton() {
    val loadingCd = stringResource(R.string.hub_loading)
    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = loadingCd },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(4) { LoadingSkeletonCard() }
    }
}

@Composable
private fun PicksHero(unlocked: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        MotormilaEyebrow(stringResource(R.string.hub_picks_eyebrow))
        Text(
            text = stringResource(R.string.hub_picks_headline),
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
                color = MotormilaOnSurface,
            ),
        )
        Text(
            text = if (unlocked) {
                stringResource(R.string.hub_picks_description_pro)
            } else {
                stringResource(R.string.hub_picks_description_free)
            },
            style = MaterialTheme.typography.bodyMedium.copy(
                color = MotormilaSecondaryText,
                lineHeight = 20.sp,
            ),
        )
        Text(
            text = stringResource(R.string.hub_picks_min_score),
            style = MaterialTheme.typography.labelSmall.copy(color = MotormilaPrimaryBright),
        )
    }
}

@Composable
private fun SortRow(
    unlocked: Boolean,
    sort: BestPicksSort,
    onSort: (BestPicksSort) -> Unit,
) {
    val aria = stringResource(R.string.hub_picks_sort_aria)
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.semantics { contentDescription = aria },
    ) {
        SortChip(
            label = stringResource(R.string.hub_picks_sort_deal),
            selected = sort == BestPicksSort.DEAL_SCORE,
            locked = !unlocked,
            onClick = { onSort(BestPicksSort.DEAL_SCORE) },
        )
        SortChip(
            label = stringResource(R.string.hub_picks_sort_recency),
            selected = sort == BestPicksSort.RECENCY,
            locked = false,
            onClick = { onSort(BestPicksSort.RECENCY) },
        )
    }
}

@Composable
private fun SortChip(
    label: String,
    selected: Boolean,
    locked: Boolean,
    onClick: () -> Unit,
) {
    MotormilaChoiceChip(
        label = label,
        selected = selected,
        onClick = onClick,
        leadingIcon = if (locked) Icons.Filled.Lock else null,
    )
}

@Composable
private fun CutsSection(
    drops: List<PriceDrop>,
    onListingClick: (Int) -> Unit,
    onHaptic: () -> Unit,
) {
    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.TrendingDown, contentDescription = null, tint = MotormilaGood)
            Column {
                Text(
                    stringResource(R.string.hub_picks_cuts_title),
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                )
                Text(
                    stringResource(R.string.hub_picks_cuts_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MotormilaSecondaryText,
                )
            }
        }
        if (drops.isEmpty()) {
            Text(
                stringResource(R.string.hub_picks_cuts_empty),
                style = MaterialTheme.typography.bodySmall,
                color = MotormilaSecondaryText,
            )
        } else {
            drops.forEach { drop ->
                CutRow(drop = drop, onClick = {
                    onHaptic()
                    onListingClick(drop.listing.id)
                })
            }
        }
    }
}

@Composable
private fun CutRow(drop: PriceDrop, onClick: () -> Unit) {
    val pct = formatPct(drop.dropPct, 0).trimStart('+')
    val cd = stringResource(R.string.hub_picks_cd_drop, drop.listing.displayName, pct)
    MotormilaSurface(
        onClick = onClick,
        modifier = Modifier
            .heightIn(min = 48.dp)
            .semantics { contentDescription = cd },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                drop.listing.displayName,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                stringResource(R.string.hub_picks_cuts_drop, pct),
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = FontWeight.Bold,
                    color = MotormilaGood,
                    fontFeatureSettings = "tnum",
                ),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                lk.motormila.app.ui.common.mn(drop.previousPriceLkr),
                style = MaterialTheme.typography.labelSmall.copy(
                    color = MotormilaSecondaryText,
                    textDecoration = TextDecoration.LineThrough,
                    fontFeatureSettings = "tnum",
                ),
            )
            Text(
                lk.motormila.app.ui.common.mn(drop.newPriceLkr),
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontFeatureSettings = "tnum",
                ),
            )
        }
    }
}

@Composable
private fun PickCard(
    listing: Listing,
    watched: Boolean,
    onClick: () -> Unit,
    onWatch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ListingCard(
        listing = listing,
        isWatched = watched,
        onClick = onClick,
        onWatchToggle = onWatch,
        modifier = modifier,
    )
}

@Composable
private fun PicksUpgradeStrip() {
    MotormilaSurface(
        highlighted = true,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            stringResource(R.string.hub_picks_upgrade_title),
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold, color = MotormilaPrimaryBright),
        )
        Text(
            stringResource(R.string.hub_picks_upgrade_body),
            style = MaterialTheme.typography.bodySmall,
            color = MotormilaSecondaryText,
        )
    }
}

