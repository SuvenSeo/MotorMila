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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.ui.components.EmptyState
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

    LaunchedEffect(state.error) {
        state.error?.let {
            if (!reducedMotion) haptics.reject()
            snacks.showSnackbar(it)
            viewModel.onEvent(AlertsUiEvent.DismissError)
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
            snacks.showSnackbar("Form filled from listing")
            viewModel.onEvent(AlertsUiEvent.ConsumePrefill)
        }
    }
    // Consume the confetti burst after it plays.

    lk.motormila.app.ui.common.MmScreen(
        title = if (state.unreadCount > 0) "Price alerts (${state.unreadCount})" else "Price alerts",
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
                    ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(AlertsUiEvent.Refresh) })

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
                            SectionTitle("Active (${state.alerts.size})")
                            if (state.matchesLoading) {
                                Text(
                                    "Matching…",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            } else if (state.alerts.isNotEmpty()) {
                                MotormilaGhostButton(
                                    label = "Refresh matches",
                                    fillMaxWidth = false,
                                    onClick = { viewModel.onEvent(AlertsUiEvent.RefreshMatches) },
                                )
                            }
                        }
                    }
                    if (state.alerts.isEmpty()) {
                        item {
                            EmptyState(
                                title = "No alerts yet",
                                body = "Create one above — we'll ping you the moment a match lands under your max price.",
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
                                onUpgrade = onUpgrade,
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
        SectionTitle(if (editing) "Edit alert" else "New alert")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = f.make, onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(make = it))) },
                label = { Text(stringResource(R.string.ui_alerts_make)) }, singleLine = true,
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            )
            OutlinedTextField(
                value = f.model, onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(model = it))) },
                label = { Text(stringResource(R.string.ui_alerts_model_optional)) }, singleLine = true,
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = f.district, onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(district = it))) },
                label = { Text(stringResource(R.string.ui_alerts_district)) }, singleLine = true,
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            )
            OutlinedTextField(
                value = f.maxPrice, onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(maxPrice = it))) },
                label = { Text(stringResource(R.string.ui_alerts_max_e_g_8m)) }, singleLine = true,
                supportingText = { Text(stringResource(R.string.ui_alerts_triggers_at_or_under_this)) },
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            )
        }
        // Pro-only channels: hidden (not teased) while Pro isn't on sale.
        if (!proLocked) {
        OutlinedTextField(
            value = f.whatsappPhone,
            onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(whatsappPhone = it))) },
            label = { Text(stringResource(R.string.ui_alerts_whatsapp_phone)) },
            singleLine = true,
            supportingText = { Text(stringResource(R.string.ui_alerts_used_when_whatsapp_is_selected)) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        )
        OutlinedTextField(
            value = f.telegramChatId,
            onValueChange = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(telegramChatId = it))) },
            label = { Text(stringResource(R.string.ui_alerts_telegram_chat_id)) },
            singleLine = true,
            supportingText = { Text(stringResource(R.string.ui_alerts_chat_id_or_username_pro)) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        )
        }
        Text(
            "Notify via",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ChannelChoiceChip(
                label = stringResource(R.string.scr_alerts_inapp),
                selected = f.inapp,
                locked = false,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(inapp = !f.inapp))) },
            )
            MotormilaChoiceChip(
                label = "Email",
                selected = f.email,
                onClick = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(email = !f.email))) },
            )
            if (!proLocked) ChannelChoiceChip(
                label = "WhatsApp",
                selected = f.whatsapp,
                locked = proLocked,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(whatsapp = !f.whatsapp))) },
            )
            if (!proLocked) ChannelChoiceChip(
                label = "Telegram",
                selected = f.telegram,
                locked = proLocked,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(telegram = !f.telegram))) },
            )
            MotormilaChoiceChip(
                label = "Push",
                selected = f.push,
                onClick = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(push = !f.push))) },
            )
        }
        if (!proLocked) {
        Text(
            "Delivery",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MotormilaChoiceChip(
                label = "Instant",
                selected = !f.digest,
                onClick = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(digest = false))) },
            )
            ChannelChoiceChip(
                label = "Digest",
                selected = f.digest,
                locked = proLocked,
                onUpgrade = onUpgrade,
                onToggle = { viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(digest = true))) },
            )
        }
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                "Quiet hours 21:00–07:00",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            Switch(
                checked = f.quietHours,
                onCheckedChange = { enabled ->
                    if (proLocked) onUpgrade()
                    else viewModel.onEvent(AlertsUiEvent.FormChanged(f.copy(quietHours = enabled)))
                },
                modifier = Modifier.semantics { contentDescription = "Quiet hours" },
            )
        }
        }
        if (!proLocked) Text(
            "Email, WhatsApp, Telegram and push queue for the 07:00 digest. In-app always delivers.",
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
                label = "Save changes",
                loading = state.updating,
                onClick = { viewModel.onEvent(AlertsUiEvent.Update) },
                modifier = Modifier.pressKeyHaptic(haptics),
            )
            MotormilaGhostButton(
                label = "Cancel editing",
                onClick = { viewModel.onEvent(AlertsUiEvent.CancelEdit) },
            )
        } else {
            MotormilaPrimaryButton(
                label = "Create alert",
                loading = state.creating,
                enabled = !state.freeCapReached,
                onClick = { viewModel.onEvent(AlertsUiEvent.Create) },
                modifier = Modifier.pressKeyHaptic(haptics),
            )
        }
    }
}

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
    onUpgrade: () -> Unit,
    onToggleChannel: (String) -> Unit,
    onToggleDelivery: () -> Unit,
) {
    val channels = parseNotifyChannels(alert.notifyChannels)
    MotormilaSurface(
        modifier = Modifier.semantics {
            contentDescription = "Alert ${alert.title} under ${lk.motormila.app.ui.common.mn(alert.maxPriceLkr)}"
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    alert.title,
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    "${alert.district ?: "Any district"} · triggers ≤ ${lk.motormila.app.ui.common.mn(alert.maxPriceLkr)} · ${alert.notifyChannels ?: "push"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = active,
                onCheckedChange = onToggle,
                enabled = !toggling,
                modifier = Modifier.semantics {
                    contentDescription = if (active) "Deactivate alert" else "Activate alert"
                },
            )
            IconButton(
                onClick = onEdit,
                modifier = Modifier.size(48.dp).semantics { contentDescription = "Edit alert" },
            ) {
                Icon(Icons.Filled.Edit, contentDescription = null)
            }
            IconButton(
                onClick = onDelete,
                modifier = Modifier.size(48.dp).semantics { contentDescription = "Delete alert" },
            ) {
                Icon(Icons.Filled.Delete, contentDescription = null)
            }
        }
        Text(
            "Channels",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ALERT_CHANNEL_ORDER.forEach { channel ->
                val label = when (channel) {
                    "inapp" -> "In-app"
                    "email" -> "Email"
                    "whatsapp" -> "WhatsApp"
                    "telegram" -> "Telegram"
                    "push" -> "Push"
                    else -> channel
                }
                MotormilaChoiceChip(
                    label = label,
                    selected = channel in channels,
                    enabled = if (isPro) !channelUpdating else true,
                    leadingIcon = if (!isPro && channel !in listOf("push", "email")) Icons.Filled.Lock else null,
                    onClick = {
                        if (isPro) onToggleChannel(channel) else onUpgrade()
                    },
                )
            }
            MotormilaChoiceChip(
                label = if (alert.deliveryMode == "digest") "Digest" else "Instant",
                selected = true,
                enabled = if (isPro) !channelUpdating else true,
                leadingIcon = if (!isPro) Icons.Filled.Lock else null,
                onClick = { if (isPro) onToggleDelivery() else onUpgrade() },
            )
        }
        val flat = matches.flatMap { it.listings }.take(5)
        if (flat.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            SectionTitle("Matches (${flat.size})")
            flat.forEach { m ->
                // % under the alert threshold — the "move" that triggered this match.
                val maxPrice = alert.maxPriceLkr
                val price = m.priceLkr
                val underPct = if (price != null && maxPrice != null && maxPrice > 0) {
                    (maxPrice - price) / maxPrice * 100
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
                                append(m.priceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: "Price on request")
                                append(" · ${m.district ?: "—"}")
                                m.dealScore?.let { append(" ★ %.1f".format(it)) }
                                if (underPct != null && underPct >= 0) {
                                    append(" · ${formatPct(underPct, 0)} under max")
                                }
                            },
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                    MotormilaGhostButton(
                        label = "View",
                        fillMaxWidth = false,
                        onClick = { onOpenDetail(m.id) },
                    )
                }
            }
        } else if (!active) {
            Text(
                "Paused — flip the switch to resume matching.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
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
    Canvas(modifier.semantics { contentDescription = "Alert created celebration" }) {
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
            if (emphasised) "Sign in to create this alert" else "Sign in to create price alerts",
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            "Price alerts are saved to your MotorMila account so we can notify you when a match lands.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
        )
        MotormilaPrimaryButton(label = "Sign in", onClick = onSignIn)
    }
}
