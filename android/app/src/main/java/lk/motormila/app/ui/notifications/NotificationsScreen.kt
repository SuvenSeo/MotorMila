package lk.motormila.app.ui.notifications

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import lk.motormila.app.R
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.LoadingSkeletonList
import lk.motormila.app.ui.components.cascadeEntrance
import lk.motormila.app.domain.model.AppNotification
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onOpenListing: (listingId: Int) -> Unit,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()

    val message = state.error?.let { stringResource(it) }
    LaunchedEffect(message) {
        message?.let {
            if (!reducedMotion) haptics.reject()
            snacks.showSnackbar(it)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.buyer_inbox_title) + if (state.unreadCount > 0) " (${state.unreadCount})" else "",
        snackbarHostState = snacks,
        actions = {
            if (state.unreadCount > 0) MotormilaGhostButton(
                label = stringResource(R.string.buyer_inbox_mark_all),
                fillMaxWidth = false,
                onClick = {
                    if (state.unreadCount > 0) {
                        viewModel.onEvent(NotificationsUiEvent.MarkAllRead)
                    }
                },
            )
        },
    ) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(NotificationsUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            // Motion spec §5: skeleton→content via Crossfade(200ms); rows cascade in
            // (fade + 24dp rise, 45ms stagger, 700ms window). Refresh keeps content
            // visible — isRefreshing never flips isLoading, so no skeleton flash.
            Crossfade(
                targetState = state.isLoading,
                animationSpec = tween(durationMillis = 200),
                label = "inbox-loading",
            ) { loading ->
                if (loading) {
                    LoadingSkeletonList(rows = 6)
                } else {
                    when {
                        !state.signedIn -> EmptyState(title = stringResource(R.string.buyer_inbox_title), body = stringResource(R.string.buyer_inbox_signed_out))
                        message != null && state.items.isEmpty() ->
                            ErrorRetry(message, onRetry = { viewModel.onEvent(NotificationsUiEvent.Refresh) })

                        state.items.isEmpty() -> EmptyState(
                            title = stringResource(R.string.buyer_inbox_empty),
                            body = stringResource(R.string.buyer_inbox_empty_body),
                        )

                        else -> LazyColumn(
                            Modifier.fillMaxSize().padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            item { OfflineBanner(visible = state.offline) }
                            itemsIndexed(state.items, key = { _, n -> n.id }) { index, n ->
                                NotificationRow(
                                    n = n,
                                    modifier = Modifier.animateItem(fadeInSpec = null, placementSpec = lk.motormila.app.ui.theme.MmMotion.itemPlacement, fadeOutSpec = androidx.compose.animation.core.spring(stiffness = androidx.compose.animation.core.Spring.StiffnessMediumLow)).cascadeEntrance(index),
                                    onOpen = {
                                        if (!reducedMotion) haptics.tick()
                                        n.openFromInbox(
                                            markRead = { viewModel.onEvent(NotificationsUiEvent.MarkRead(it)) },
                                            openListing = onOpenListing,
                                        )
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(
    n: AppNotification,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val kindLabel = stringResource(if (n.listingId != null) R.string.buyer_inbox_listing else R.string.buyer_inbox_alert)
    val readLabel = stringResource(if (n.isRead) R.string.buyer_inbox_read else R.string.buyer_inbox_unread)
    MotormilaSurface(
        modifier = modifier.semantics {
            contentDescription = "$readLabel: ${n.title}"
        },
        onClick = onOpen,
        highlighted = !n.isRead,
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                n.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (n.isRead) FontWeight.Normal else FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Badge(
                modifier = Modifier.padding(start = 8.dp),
            ) { Text(kindLabel) }
        }
        Text(n.body, style = MaterialTheme.typography.bodySmall)
        Text(
            n.createdAt,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Notification IDs address read receipts only. General messages stay visible in the inbox. */
internal fun AppNotification.openFromInbox(markRead: (Int) -> Unit, openListing: (Int) -> Unit) {
    if (!isRead) markRead(id)
    listingId?.takeIf { it > 0 }?.let(openListing)
}
