package lk.motormila.app.ui.watchlist

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import lk.motormila.app.ui.common.mmScreenSafe
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAlert
import androidx.compose.material.icons.filled.ClearAll
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.format.formatLkrDelta
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.HealthRing
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.core.ui.SteeringWheelGraphic
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.ui.components.MotormilaIconAction
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.cascadeDelay
import lk.motormila.app.ui.theme.MotormilaGoodContainer
import lk.motormila.app.ui.theme.MotormilaGoodSoft
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.motormilaReveal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(
    onOpenDetail: (id: Int) -> Unit,
    onCreateAlert: (id: Int) -> Unit,
    onBrowse: () -> Unit,
    viewModel: WatchlistViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }

    LaunchedEffect(state.error) {
        state.error?.let {
            snacks.showSnackbar(it)
            viewModel.onEvent(WatchlistUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = if (state.items.isEmpty()) "Watchlist" else "Watchlist (${state.items.size})",
        showBack = false,
        snackbarHostState = snacks,
        edgeToEdge = true,
        actions = {
            MotormilaIconAction(
                icon = Icons.Filled.Refresh,
                contentDescription = "Refresh watched prices",
                onClick = { viewModel.onEvent(WatchlistUiEvent.RefreshPrices) },
            )
            if (state.items.isNotEmpty()) {
                MotormilaIconAction(
                    icon = Icons.Filled.ClearAll,
                    contentDescription = "Clear entire watchlist",
                    onClick = { viewModel.onEvent(WatchlistUiEvent.ClearAll) },
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
                    Box(Modifier.mmScreenSafe()) { ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(WatchlistUiEvent.Refresh) }) }

                state.items.isEmpty() -> Box(Modifier.mmScreenSafe()) { EmptyState(
                    title = "Nothing watched yet",
                    body = "Tap the steering wheel — save a listing and we'll flag every price drop against fair value.",
                    ctaLabel = "Browse listings",
                    onCta = onBrowse,
                    graphic = { SteeringWheelGraphic() },
                ) }

                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = lk.motormila.app.ui.common.mmScreenPadding(top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(state.items, key = { _, it -> it.id }) { index, item ->
                        // Removing a saved car closes the gap on a spring instead of jumping.
                        Box(Modifier.animateItem(fadeInSpec = null, placementSpec = lk.motormila.app.ui.theme.MmMotion.itemPlacement, fadeOutSpec = androidx.compose.animation.core.spring(stiffness = androidx.compose.animation.core.Spring.StiffnessMediumLow)).motormilaReveal(delayMillis = cascadeDelay(index))) {
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WatchRow(
    item: WatchItem,
    flash: Boolean,
    onOpen: () -> Unit,
    onAlert: () -> Unit,
    onRemove: () -> Unit,
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                // Swipe right: create a price alert, snap back (never deletes).
                SwipeToDismissBoxValue.StartToEnd -> {
                    onAlert()
                    false
                }
                // Swipe left: remove from watchlist. Return false so the box
                // snaps back — the repository Flow drives the actual removal.
                // Returning true left the card stuck in dismissed state (red
                // background bleeding through) when the list update lagged.
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
            val direction = dismissState.dismissDirection
            val isAlertSide = direction == SwipeToDismissBoxValue.StartToEnd
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        if (isAlertSide) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.errorContainer,
                    )
                    .padding(horizontal = 16.dp)
                    .semantics {
                        contentDescription = if (isAlertSide) {
                            "Swipe to create price alert"
                        } else {
                            "Swipe to remove from watchlist"
                        }
                    },
                contentAlignment = if (isAlertSide) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.width(72.dp),
                ) {
                    Icon(
                        if (isAlertSide) Icons.Filled.AddAlert else Icons.Filled.Delete,
                        contentDescription = if (isAlertSide) "Create alert" else "Remove",
                        tint = if (isAlertSide) {
                            MaterialTheme.colorScheme.onPrimaryContainer
                        } else {
                            MaterialTheme.colorScheme.onErrorContainer
                        },
                    )
                }
            }
        },
        content = {
            MotormilaSurface(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .semantics { contentDescription = "Watched ${item.title} at ${lk.motormila.app.ui.common.mn(item.priceLkr)}" },
                onClick = onOpen,
                highlighted = flash,
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    HealthRing(
                        fractionUnderFmv = (item.underFmvFraction?.toFloat() ?: 0f).coerceIn(0f, 1f),
                        modifier = Modifier.size(44.dp),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Text(
                            "${lk.motormila.app.ui.common.mn(item.priceLkr)} · ${item.district}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        // Price-drop badge vs the add-price baseline (WatchItem.dropPct).
                        if (item.hasPriceDrop) {
                            Spacer(Modifier.heightIn(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "▼ ${LkrFormat.deltaPct(item.dropPct())}",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = lk.motormila.app.ui.theme.MotormilaGoodText,
                                    modifier = Modifier
                                        .clip(MotormilaRadius.pill)
                                        .background(MotormilaGoodContainer)
                                        .border(1.dp, MotormilaGoodSoft, MotormilaRadius.pill)
                                        .padding(horizontal = 8.dp, vertical = 3.dp)
                                        .semantics {
                                            contentDescription = "Price dropped ${LkrFormat.deltaPct(item.dropPct())}"
                                        },
                                )
                            }
                            Spacer(Modifier.heightIn(2.dp))
                        }
                        val drop = (item.previousPriceLkr ?: item.priceLkr ?: 0.0) - (item.priceLkr ?: 0.0)
                        if (drop > 0) {
                            Text(
                                "▼ ${formatLkrDelta(-drop)} · ${formatPct((item.underFmvFraction ?: 0.0) * 100)} under FMV",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.tertiary,
                            )
                        } else if (item.fmvLkr != null) {
                            Text(
                                "FMV ${lk.motormila.app.ui.common.mn(item.fmvLkr)}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    IconButton(
                        onClick = onAlert,
                        modifier = Modifier
                            .size(48.dp)
                            .semantics { contentDescription = "Create price alert for ${item.title}" },
                    ) {
                        Icon(Icons.Filled.AddAlert, contentDescription = null)
                    }
                    IconButton(
                        onClick = onRemove,
                        modifier = Modifier
                            .size(48.dp)
                            .semantics { contentDescription = "Remove ${item.title} from watchlist" },
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = null)
                    }
                }
            }
        },
    )
}
