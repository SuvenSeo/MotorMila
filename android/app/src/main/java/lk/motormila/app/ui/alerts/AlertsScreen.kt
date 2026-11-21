package lk.motormila.app.ui.alerts

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.MakeCombobox
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SectionTitle
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.domain.model.Alert
import lk.motormila.app.domain.model.AlertMatch
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaGoodText
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.pressKeyHaptic
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AlertsScreen(
    onOpenDetail: (id: Int) -> Unit,
    onUpgrade: () -> Unit,
    onSignIn: () -> Unit = {},
    viewModel: AlertsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val context = LocalContext.current

    LaunchedEffect(state.error) {
        state.error?.let {
            if (!reducedMotion) haptics.reject()
            snacks.showSnackbar(context.getString(it.textRes()))
            viewModel.onEvent(AlertsUiEvent.DismissError)
        }
    }
    // Delete is undoable: the snackbar re-creates the alert with its original settings.
    LaunchedEffect(state.deletedAlert) {
        val deleted = state.deletedAlert ?: return@LaunchedEffect
        val result = snacks.showSnackbar(
            message = context.getString(R.string.v110m_alert_deleted),
            actionLabel = context.getString(R.string.v19_watch_undo),
            duration = SnackbarDuration.Long,
        )
        if (result == SnackbarResult.ActionPerformed) {
            viewModel.onEvent(AlertsUiEvent.UndoDelete(deleted))
        } else {
            viewModel.onEvent(AlertsUiEvent.ConsumeDeleted)
        }
    }
    // Android 13+: ask for notification permission right after the first
    // alert is created (the moment the value of notifications is obvious).
    lk.motormila.app.core.notifications.NotificationPermissionPrompt(
        trigger = state.justCreatedId != null,
    )
    LaunchedEffect(state.justCreatedId) {
        if (state.justCreatedId != null) {
            if (!reducedMotion) haptics.confirm()
            delay(1600)
            viewModel.onEvent(AlertsUiEvent.ConsumeCreated)
        }
    }
    LaunchedEffect(state.justPrefill, state.isLoading) {
        if (state.justPrefill && !state.isLoading) {
            listState.animateScrollToItem(0)
            snacks.showSnackbar(context.getString(R.string.v19_alerts_prefilled))
            viewModel.onEvent(AlertsUiEvent.ConsumePrefill)
        }
    }
    // Consume the confetti burst after it plays.

    lk.motormila.app.ui.common.MmScreen(
        title = if (state.unreadCount > 0) {
            stringResource(R.string.v19_alerts_title_unread, state.unreadCount)
        } else {
            stringResource(R.string.v19_alerts_title)
        },
        snackbarHostState = snacks,
    ) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(AlertsUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.isLoading -> SkeletonList()
                state.error != null && state.alerts.isEmpty() && !state.prefillFromListing ->
                    ErrorRetry(
                        error = (state.error as? AlertsMessage.Failure)?.error ?: AppError.Unknown(),
                        onRetry = { viewModel.onEvent(AlertsUiEvent.Refresh) },
                    )

                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { OfflineBanner(visible = state.offline) }
                    if (!state.signedIn || state.signInRequired) {
                        item { SignInRequiredCard(emphasised = state.signInRequired, onSignIn = onSignIn) }
                    }
                    item { CreateForm(state, viewModel, onUpgrade) }
                    if (state.justCreatedId != null) {
                        item { ConfettiLite(modifier = Modifier.fillMaxWidth().height(64.dp)) }
                    }
                    item {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            SectionTitle(stringResource(R.string.v19_alerts_active, state.alerts.size))
                            if (state.matchesLoading) {
                                Text(
                                    stringResource(R.string.v19_alerts_matching),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            } else if (state.alerts.isNotEmpty()) {
                                MotormilaGhostButton(
                                    label = stringResource(R.string.v19_alerts_refresh_matches),
                                    fillMaxWidth = false,
                                    onClick = { viewModel.onEvent(AlertsUiEvent.RefreshMatches) },
                                )
                            }
                        }
                    }
                    if (state.alerts.isEmpty()) {
                        item {
                            EmptyState(
                                title = stringResource(R.string.v19_alerts_empty_title),
                                body = stringResource(R.string.v19_alerts_empty_body),
                            )
                        }
                    } else {
                        items(state.alerts, key = { it.id }) { alert ->
                          Box(Modifier.animateItem(fadeInSpec = null, placementSpec = lk.motormila.app.ui.theme.MmMotion.itemPlacement, fadeOutSpec = androidx.compose.animation.core.spring(stiffness = androidx.compose.animation.core.Spring.StiffnessMediumLow))) {
                            AlertRow(
                                alert = alert,
                                active = alert.active,
                                toggling = alert.id in state.togglingIds,
                                channelUpdating = alert.id in state.channelUpdatingIds,
                                isPro = state.isPro,
                                matches = state.matches.filter { m -> m.alertId == alert.id },
                                onOpenDetail = { if (!reducedMotion) haptics.tick(); onOpenDetail(it) },
                                onToggle = { viewModel.onEvent(AlertsUiEvent.ToggleActive(alert.id, it)) },
                                onEdit = { viewModel.onEvent(AlertsUiEvent.Prefill(alert.id)) },
                                onDelete = { viewModel.onEvent(AlertsUiEvent.Delete(alert.id)) },
                                onToggleChannel = { channel ->
                                    viewModel.onEvent(AlertsUiEvent.ToggleAlertChannel(alert.id, channel))
                                },
                                onToggleDelivery = {
                                    viewModel.onEvent(AlertsUiEvent.ToggleAlertDelivery(alert.id))
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CreateForm(state: AlertsUiState, viewModel: AlertsViewModel, onUpgrade: () -> Unit) {
    val haptics = rememberHaptics()
    val f = state.form
    val editing = state.editingId != null
    val proLocked = !state.isPro
    MotormilaSurface {
        SectionTitle(stringResource(if (editing) R.string.v19_alerts_edit else R.string.v19_alerts_new))
        // Make/model pick from the live catalogue (web Combobox parity) instead of free text,
        // so alerts match the exact make spelling the matcher uses.
        MakeCombobox(
            options = state.makes,
            selected = f.make.ifBlank { null },
            onSelect = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(make = it.orEmpty(), model = ""))) },
            label = stringResource(R.string.v19_alerts_make),
            searchHint = stringResource(R.string.v19_alerts_select_make),
            allLabel = stringResource(R.string.v19_alerts_select_make),
        )
        Spacer(Modifier.height(8.dp))
        MakeCombobox(
            options = if (f.make.isNotBlank()) state.models else emptyList(),
            selected = f.model.ifBlank { null },
            onSelect = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(model = it.orEmpty()))) },
            label = stringResource(R.string.v19_alerts_model_optional),
            searchHint = stringResource(
                if (f.make.isBlank()) R.string.v19_alerts_pick_make_first else R.string.v19_alerts_select_model,
            ),
            allLabel = stringResource(R.string.filter_all_models),
            enabled = f.make.isNotBlank(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = f.district, onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(district = it))) },
            label = { Text(stringResource(R.string.v19_alerts_district)) },
            placeholder = { Text(stringResource(R.string.v19_alerts_any_district)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        )
        OutlinedTextField(
            value = f.maxPrice, onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(maxPrice = it))) },
            label = { Text(stringResource(R.string.v19_alerts_max_price)) }, singleLine = true,
            supportingText = { Text(stringResource(R.string.v19_alerts_max_price_hint)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        )
        // Shortcuts: the number pad has no "m", so common ceilings are one tap away.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MAX_PRICE_SHORTCUTS.forEach { value ->
                val shorthand = formatLkrShorthand(value)
                MotormilaChoiceChip(
                    label = lk.motormila.app.ui.common.mn(value),
                    selected = f.maxPrice.equals(shorthand, ignoreCase = true),
                    compact = true,
                    onClick = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(maxPrice = shorthand))) },
                )
            }
        }
        // Pro-only channels: hidden (not teased) while Pro isn't on sale.
        if (!proLocked) {
        OutlinedTextField(
            value = f.whatsappPhone,
            onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(whatsappPhone = it))) },
            label = { Text(stringResource(R.string.v19_alerts_whatsapp_phone)) },
            singleLine = true,
            supportingText = { Text(stringResource(R.string.v19_alerts_whatsapp_hint)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        )
        OutlinedTextField(
            value = f.telegramChatId,
            onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(telegramChatId = it))) },
            label = { Text(stringResource(R.string.v19_alerts_telegram_chat_id)) },
            singleLine = true,
            supportingText = { Text(stringResource(R.string.v19_alerts_telegram_hint)) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        )
        }
        Text(
            stringResource(R.string.v19_alerts_notify_via),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ChannelChoiceChip(
                label = stringResource(R.string.v19_alerts_channel_inapp),
                selected = f.inapp,
                locked = false,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(inapp = !f.inapp))) },
            )
            MotormilaChoiceChip(
                label = stringResource(R.string.v19_alerts_channel_email),
                selected = f.email,
                onClick = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(email = !f.email))) },
            )
            if (!proLocked) ChannelChoiceChip(
                label = stringResource(R.string.v19_alerts_channel_whatsapp),
                selected = f.whatsapp,
                locked = proLocked,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(whatsapp = !f.whatsapp))) },
            )
            if (!proLocked) ChannelChoiceChip(
                label = stringResource(R.string.v19_alerts_channel_telegram),
                selected = f.telegram,
                locked = proLocked,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(telegram = !f.telegram))) },
            )
            MotormilaChoiceChip(
                label = stringResource(R.string.v19_alerts_channel_push),
                selected = f.push,
                onClick = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(push = !f.push))) },
            )
        }
        if (!proLocked) {
        Text(
            stringResource(R.string.v19_alerts_delivery),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MotormilaChoiceChip(
                label = stringResource(R.string.v19_alerts_instant),
                selected = !f.digest,
                onClick = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(digest = false))) },
            )
            ChannelChoiceChip(
                label = stringResource(R.string.v19_alerts_digest),
                selected = f.digest,
                locked = proLocked,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(digest = true))) },
            )
        }
        val quietDesc = stringResource(R.string.v19_alerts_quiet_hours_desc)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                stringResource(R.string.v19_alerts_quiet_hours),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            Switch(
                checked = f.quietHours,
                onCheckedChange = { enabled ->
                    if (proLocked) onUpgrade()
                    else viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(quietHours = enabled)))
                },
                modifier = Modifier.semantics { contentDescription = quietDesc },
            )
        }
        }
        if (!proLocked) Text(
            stringResource(R.string.v19_alerts_digest_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (state.freeCapReached && !editing) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.size(8.dp))
                Text(
                    stringResource(R.string.scr_alerts_cap),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                )
                MotormilaGhostButton(
                    label = stringResource(R.string.scr_alerts_cap_cta),
                    fillMaxWidth = false,
                    onClick = onUpgrade,
                )
            }
            Spacer(Modifier.height(8.dp))
        }
        if (editing) {
            MotormilaPrimaryButton(
                label = stringResource(R.string.v19_alerts_save),
                loading = state.updating,
                onClick = { viewModel.onEvent(AlertsUiEvent.Update) },
                modifier = Modifier.pressKeyHaptic(haptics),
            )
            MotormilaGhostButton(
                label = stringResource(R.string.v19_alerts_cancel_edit),
                onClick = { viewModel.onEvent(AlertsUiEvent.CancelEdit) },
            )
        } else {
            MotormilaPrimaryButton(
                label = stringResource(R.string.v19_alerts_create),
                loading = state.creating,
                enabled = !state.freeCapReached,
                onClick = { viewModel.onEvent(AlertsUiEvent.Create) },
                modifier = Modifier.pressKeyHaptic(haptics),
            )
        }
    }
}

/** One-tap max-price ceilings offered under the price field (LKR). */
private val MAX_PRICE_SHORTCUTS = listOf(3_000_000.0, 5_000_000.0, 8_000_000.0, 12_000_000.0)

@Composable
private fun ChannelChoiceChip(
    label: String,
    selected: Boolean,
    locked: Boolean,
    onUpgrade: () -> Unit,
    onToggle: () -> Unit,
) {
    MotormilaChoiceChip(
        label = label,
        selected = selected,
        leadingIcon = if (locked) Icons.Filled.Lock else null,
        onClick = { if (locked) onUpgrade() else onToggle() },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AlertRow(
    alert: Alert,
    active: Boolean,
    toggling: Boolean,
    channelUpdating: Boolean,
    isPro: Boolean,
    matches: List<AlertMatch>,
    onOpenDetail: (Int) -> Unit,
    onToggle: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggleChannel: (String) -> Unit,
    onToggleDelivery: () -> Unit,
) {
    val channels = parseNotifyChannels(alert.notifyChannels)
    val title = listOfNotNull(alert.make, alert.model).joinToString(" ")
        .ifBlank { stringResource(R.string.v110m_any_vehicle) }
    val maxLabel = lk.motormila.app.ui.common.mn(alert.maxPriceLkr)
    val channelLabels = channels.map { channelLabel(it) }.joinToString(", ")
    val rowDesc = stringResource(R.string.v19_alerts_row_desc, title, maxLabel)
    val toggleDesc = stringResource(if (active) R.string.v19_alerts_deactivate else R.string.v19_alerts_activate)
    val editDesc = stringResource(R.string.v19_alerts_edit_desc)
    val deleteDesc = stringResource(R.string.v19_alerts_delete_desc)
    MotormilaSurface(
        modifier = Modifier.semantics { contentDescription = rowDesc },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    stringResource(
                        R.string.v19_alerts_row_meta,
                        alert.district ?: stringResource(R.string.v19_alerts_any_district),
                        maxLabel,
                        channelLabels,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = active,
                onCheckedChange = onToggle,
                enabled = !toggling,
                modifier = Modifier.semantics { contentDescription = toggleDesc },
            )
            IconButton(
                onClick = onEdit,
                modifier = Modifier.size(48.dp).semantics { contentDescription = editDesc },
            ) {
                Icon(Icons.Filled.Edit, contentDescription = null)
            }
            IconButton(
                onClick = onDelete,
                modifier = Modifier.size(48.dp).semantics { contentDescription = deleteDesc },
            ) {
                Icon(Icons.Filled.Delete, contentDescription = null)
            }
        }
        Text(
            stringResource(R.string.v19_alerts_channels),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ALERT_CHANNEL_ORDER.forEach { channel ->
                val proOnly = channel == "whatsapp" || channel == "telegram"
                // In-app, email and push are free and toggle in place for everyone.
                // Pro-only channels stay hidden for free users (not teased while
                // Pro isn't on sale) unless the alert already uses one.
                if (!proOnly || isPro || channel in channels) {
                    MotormilaChoiceChip(
                        label = channelLabel(channel),
                        selected = channel in channels,
                        enabled = !channelUpdating && (!proOnly || isPro),
                        onClick = { onToggleChannel(channel) },
                    )
                }
            }
            if (isPro) {
                MotormilaChoiceChip(
                    label = stringResource(
                        if (alert.deliveryMode == "digest") R.string.v19_alerts_digest else R.string.v19_alerts_instant,
                    ),
                    selected = true,
                    enabled = !channelUpdating,
                    onClick = onToggleDelivery,
                )
            }
        }
        val flat = matches.flatMap { it.listings }.take(5)
        if (flat.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            SectionTitle(stringResource(R.string.v19_alerts_matches, flat.size))
            val priceOnRequest = stringResource(R.string.v19_alerts_price_on_request)
            flat.forEach { m ->
                // % under the alert threshold — the "move" that triggered this match.
                val maxPrice = alert.maxPriceLkr
                val price = m.priceLkr
                val underPct = if (price != null && maxPrice != null && maxPrice > 0) {
                    (maxPrice - price) / maxPrice * 100
                } else {
                    null
                }
                val underLabel = if (underPct != null && underPct >= 0) {
                    stringResource(R.string.v19_alerts_under_max, formatPct(underPct, 0))
                } else {
                    null
                }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            m.title ?: "${m.make} ${m.model}".trim(),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            buildString {
                                append(m.priceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: priceOnRequest)
                                append(" · ${m.district ?: "—"}")
                                m.dealScore?.let { append(" ★ %.1f".format(it)) }
                                underLabel?.let { append(" · $it") }
                            },
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                    MotormilaGhostButton(
                        label = stringResource(R.string.v19_alerts_view),
                        fillMaxWidth = false,
                        onClick = { onOpenDetail(m.id) },
                    )
                }
            }
        } else if (!active) {
            Text(
                stringResource(R.string.v19_alerts_paused),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Localized label for a backend channel id. */
@Composable
private fun channelLabel(channel: String): String = when (channel) {
    "inapp" -> stringResource(R.string.v19_alerts_channel_inapp)
    "email" -> stringResource(R.string.v19_alerts_channel_email)
    "whatsapp" -> stringResource(R.string.v19_alerts_channel_whatsapp)
    "telegram" -> stringResource(R.string.v19_alerts_channel_telegram)
    "push" -> stringResource(R.string.v19_alerts_channel_push)
    else -> channel
}

/**
 * Confetti-lite: exactly 12 dots bursting from centre. Static scatter under
 * reduced motion; no endless animation, auto-consumed by the screen.
 */
@Composable
private fun ConfettiLite(modifier: Modifier = Modifier) {
    val reduced = rememberReducedMotion()
    val progress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = tween(if (reduced) 0 else 900),
        label = "confetti",
    )
    val colors = remember {
        // Brand confetti: Motormila Blue #0A7AFF, Deal Green #00C853, white.
        listOf(
            MotormilaPrimary, MotormilaGood, MotormilaOnSurface,
            MotormilaPrimaryBright, MotormilaGoodText, MotormilaPrimary,
        )
    }
    val celebrationDesc = stringResource(R.string.v19_alerts_confetti_desc)
    Canvas(modifier.semantics { contentDescription = celebrationDesc }) {
        val cx = size.width / 2
        val cy = size.height / 2
        val radius = (size.minDimension / 2.4f) * progress
        repeat(12) { i ->
            val angle = (i * 30.0).let { Math.toRadians(it) }
            drawCircle(
                color = colors[i % colors.size],
                radius = 10f * (1 - progress * 0.4f),
                center = Offset(
                    cx + (radius * Math.cos(angle)).toFloat(),
                    cy + (radius * Math.sin(angle)).toFloat(),
                ),
            )
        }
    }
}

/** Shown when signed out: alert creation needs an account, so say so on screen instead of failing silently. */
@Composable
private fun SignInRequiredCard(emphasised: Boolean, onSignIn: () -> Unit) {
    MotormilaSurface(highlighted = emphasised) {
        Text(
            stringResource(if (emphasised) R.string.v19_alerts_signin_title_emph else R.string.v19_alerts_signin_title),
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            stringResource(R.string.v19_alerts_signin_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
        )
        MotormilaPrimaryButton(label = stringResource(R.string.v19_alerts_signin_cta), onClick = onSignIn)
    }
}
