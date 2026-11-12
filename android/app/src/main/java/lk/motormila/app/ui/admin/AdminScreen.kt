package lk.motormila.app.ui.admin

import lk.motormila.app.ui.theme.tabular
import androidx.compose.material3.LocalTextStyle
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.domain.model.AdminNamedCount
import lk.motormila.app.domain.model.AdminOverview
import lk.motormila.app.ui.components.MotormilaChipTabs
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaGoodText
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    onBack: () -> Unit,
    onLoginClick: () -> Unit,
    viewModel: AdminViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current
    val snacks = remember { SnackbarHostState() }

    LaunchedEffect(state.error) {
        val message = state.error ?: return@LaunchedEffect
        if (state.overview != null || state.desk != AdminDesk.Overview) {
            snacks.showSnackbar(message)
            viewModel.onEvent(AdminUiEvent.DismissError)
        }
    }
    LaunchedEffect(state.notice) {
        val message = state.notice ?: return@LaunchedEffect
        snacks.showSnackbar(message)
        viewModel.onEvent(AdminUiEvent.DismissNotice)
    }

    lk.motormila.app.ui.common.MmScreen(title = "Admin", onBack = onBack, snackbarHostState = snacks) {
        when {
            !state.isAdmin && !state.isLoading -> {
                Column(
                    Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        "Admin only",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 22.sp,
                        color = MotormilaOnSurface,
                    )
                    Text(
                        "Sign in with an admin account to invite users and manage plans.",
                        color = MotormilaSecondaryText,
                    )
                    MotormilaPrimaryButton(
                        label = "Log in",
                        onClick = onLoginClick,
                    )
                }
            }
            state.isLoading -> SkeletonList()
            state.error != null && state.overview == null ->
                ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(AdminUiEvent.Refresh) })
            else -> {
                Column(Modifier.fillMaxSize()) {
                    MotormilaChipTabs(
                        tabs = AdminDesk.labels,
                        selected = state.tab,
                        onSelect = { viewModel.onEvent(AdminUiEvent.TabChanged(it)) },
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                    PullToRefreshBox(
                        isRefreshing = state.isRefreshing,
                        onRefresh = { viewModel.onEvent(AdminUiEvent.Refresh) },
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        when (state.desk) {
                            AdminDesk.Overview -> OverviewPane(state)
                            AdminDesk.Users -> UsersPane(state, viewModel)
                            AdminDesk.Invites -> InvitesPane(state, viewModel, clipboard)
                            AdminDesk.Pipeline -> PipelinePane(state, viewModel)
                            AdminDesk.Analytics -> AnalyticsPane(state)
                            AdminDesk.Feedback -> FeedbackPane(state, viewModel)
                            AdminDesk.Dealers -> DealersPane(state, viewModel)
                            AdminDesk.Permits -> PermitsPane(state, viewModel)
                            AdminDesk.System -> SystemPane(state, viewModel)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OverviewPane(state: AdminUiState) {
    val overview = state.overview ?: return
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            MotormilaEyebrow("CONSOLE")
            Spacer(Modifier.height(8.dp))
            Text("Platform health", fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, color = MotormilaOnSurface)
        }
        item { OverviewMetrics(overview) }
        if (overview.topMakes.isNotEmpty()) {
            item { Text("Top makes", fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface) }
            items(overview.topMakes, key = { it.make }) { row ->
                MotormilaSurface {
                    Row(Modifier.fillMaxWidth()) {
                        Text(row.make, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                        Text(LkrFormat.count(row.count), style = LocalTextStyle.current.tabular(),  color = MotormilaPrimaryBright)
                    }
                }
            }
        }
        if (overview.recentScrapes.isNotEmpty()) {
            item { Text("Recent scrapes", fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface) }
            items(overview.recentScrapes, key = { it.id }) { run ->
                MotormilaSurface {
                    Text(run.source, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                    Text(
                        "${run.status} · ${run.listingsFound} found · ${run.listingsNew} new",
                        fontSize = 12.sp,
                        color = MotormilaSecondaryText,
                    )
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun OverviewMetrics(overview: AdminOverview) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MotormilaMetricTile("LIVE", LkrFormat.count(overview.listingsLive), modifier = Modifier.weight(1f))
            MotormilaMetricTile("USERS", LkrFormat.count(overview.usersTotal), modifier = Modifier.weight(1f))
            MotormilaMetricTile("PENDING", LkrFormat.count(overview.invitesPending), modifier = Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MotormilaMetricTile("FREE", LkrFormat.count(overview.usersFree), modifier = Modifier.weight(1f))
            MotormilaMetricTile("PRO", LkrFormat.count(overview.usersPro), modifier = Modifier.weight(1f))
            MotormilaMetricTile("ADMINS", LkrFormat.count(overview.usersAdmin), modifier = Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MotormilaMetricTile("FEEDBACK", LkrFormat.count(overview.feedbackOpen), modifier = Modifier.weight(1f))
            MotormilaMetricTile("DEALERS", LkrFormat.count(overview.dealersVerified), modifier = Modifier.weight(1f))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UsersPane(state: AdminUiState, viewModel: AdminViewModel) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            MotormilaSurface {
                Text("Users & plans", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = MotormilaOnSurface)
                Text(
                    "Search, filter, upgrade, demote, or disable seats.",
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.userQuery,
                    onValueChange = { viewModel.onEvent(AdminUiEvent.UserQueryChanged(it)) },
                    label = { Text("Search email or name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Text("Plan filter", fontSize = 12.sp, color = MotormilaSecondaryText)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    MotormilaChoiceChip(
                        label = "ALL",
                        selected = state.userPlanFilter == null,
                        compact = true,
                        onClick = { viewModel.onEvent(AdminUiEvent.UserPlanFilterChanged(null)) },
                    )
                    ADMIN_PLANS.forEach { plan ->
                        MotormilaChoiceChip(
                            label = plan.uppercase(),
                            selected = state.userPlanFilter.equals(plan, true),
                            compact = true,
                            onClick = { viewModel.onEvent(AdminUiEvent.UserPlanFilterChanged(plan)) },
                        )
                    }
                }
            }
        }
        if (state.usersLoading && state.users.isEmpty()) {
            item { Text("Loading users…", color = MotormilaSecondaryText) }
        } else if (state.users.isEmpty()) {
            item { Text("No users match.", color = MotormilaSecondaryText) }
        }
        items(state.users, key = { it.id }) { user ->
            MotormilaSurface {
                Text(user.name.ifBlank { user.email }, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                Text(user.email, fontSize = 12.sp, color = MotormilaSecondaryText)
                Text(
                    "${if (user.isActive) "Active" else "Disabled"} · ${user.subscriptionStatus}",
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
                Spacer(Modifier.height(8.dp))
                Text("Plan", fontSize = 12.sp, color = MotormilaSecondaryText)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ADMIN_PLANS.forEach { plan ->
                        MotormilaChoiceChip(
                            label = plan.uppercase(),
                            selected = user.plan.equals(plan, true),
                            compact = true,
                            onClick = { viewModel.onEvent(AdminUiEvent.SetUserPlan(user.id, plan)) },
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text("Role", fontSize = 12.sp, color = MotormilaSecondaryText)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ADMIN_ROLES.forEach { role ->
                        MotormilaChoiceChip(
                            label = role.uppercase(),
                            selected = user.role.equals(role, true),
                            compact = true,
                            onClick = { viewModel.onEvent(AdminUiEvent.SetUserRole(user.id, role)) },
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                MotormilaPrimaryButton(
                    label = if (user.isActive) "Disable" else "Enable",
                    enabled = !user.email.equals(state.sessionEmail, true),
                    onClick = { viewModel.onEvent(AdminUiEvent.SetUserActive(user.id, !user.isActive)) },
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InvitesPane(
    state: AdminUiState,
    viewModel: AdminViewModel,
    clipboard: ClipboardManager,
) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            MotormilaSurface {
                Text("Invite by email", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = MotormilaOnSurface)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.inviteEmail,
                    onValueChange = { viewModel.onEvent(AdminUiEvent.InviteEmailChanged(it)) },
                    label = { Text("Email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text("Plan", fontSize = 12.sp, color = MotormilaSecondaryText)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ADMIN_PLANS.forEach { plan ->
                        MotormilaChoiceChip(
                            label = plan.uppercase(),
                            selected = state.invitePlan.equals(plan, true),
                            compact = true,
                            onClick = { viewModel.onEvent(AdminUiEvent.InvitePlanChanged(plan)) },
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text("Role", fontSize = 12.sp, color = MotormilaSecondaryText)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ADMIN_ROLES.forEach { role ->
                        MotormilaChoiceChip(
                            label = role.uppercase(),
                            selected = state.inviteRole.equals(role, true),
                            compact = true,
                            onClick = { viewModel.onEvent(AdminUiEvent.InviteRoleChanged(role)) },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                MotormilaPrimaryButton(
                    label = if (state.sendingInvite) "Sending…" else "Send invite",
                    enabled = !state.sendingInvite,
                    loading = state.sendingInvite,
                    onClick = { viewModel.onEvent(AdminUiEvent.SendInvite) },
                )
                val signupUrl = state.lastInviteSignupUrl
                if (signupUrl != null) {
                    Spacer(Modifier.height(10.dp))
                    Text("Share this sign-up link.", fontSize = 12.sp, color = MotormilaGoodText)
                    Text(signupUrl, style = LocalTextStyle.current.tabular(),  fontSize = 11.sp, color = MotormilaPrimaryBright)
                    Spacer(Modifier.height(8.dp))
                    MotormilaGhostButton(
                        label = "Copy sign-up URL",
                        onClick = { clipboard.setText(AnnotatedString(signupUrl)) },
                    )
                    if (state.lastInviteToken != null) {
                        Spacer(Modifier.height(8.dp))
                        MotormilaGhostButton(
                            label = "Copy token",
                            onClick = { clipboard.setText(AnnotatedString(state.lastInviteToken.orEmpty())) },
                        )
                    }
                }
            }
        }
        item {
            Text(
                "Pending (${state.pendingInvites.size})",
                fontWeight = FontWeight.SemiBold,
                color = MotormilaOnSurface,
            )
        }
        if (state.invitesLoading && state.invites.isEmpty()) {
            item { Text("Loading invites…", color = MotormilaSecondaryText) }
        } else if (state.pendingInvites.isEmpty()) {
            item { Text("No pending invites.", color = MotormilaSecondaryText) }
        }
        items(state.pendingInvites, key = { "pending-${it.id}" }) { invite ->
            val url = adminSignupUrl(invite.signupPath, invite.token)
            MotormilaSurface {
                Text(invite.email, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                Text(
                    "${invite.plan} · ${invite.role}" +
                        (invite.expiresAt?.let { " · expires $it" } ?: ""),
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
                Spacer(Modifier.height(8.dp))
                MotormilaGhostButton(
                    label = "Copy sign-up URL",
                    onClick = { clipboard.setText(AnnotatedString(url)) },
                )
                Spacer(Modifier.height(8.dp))
                MotormilaGhostButton(
                    label = "Revoke",
                    onClick = { viewModel.onEvent(AdminUiEvent.RevokeInvite(invite.id)) },
                )
            }
        }
        item {
            Text("Invite history", fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
        }
        items(state.invites, key = { "hist-${it.id}" }) { invite ->
            MotormilaSurface {
                Text(invite.email, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                Text(
                    "${invite.status} · ${invite.plan} · ${invite.role}",
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun PipelinePane(state: AdminUiState, viewModel: AdminViewModel) {
    val triggering = state.triggeringJob != null
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            MotormilaSurface {
                Text("Scrape pipeline", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = MotormilaOnSurface)
                Text(
                    "Full error text is visible to session admins.",
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
                Spacer(Modifier.height(12.dp))
                MotormilaPrimaryButton(
                    label = if (state.triggeringJob == "sync") "Launching…" else "Trigger core sync",
                    enabled = !triggering,
                    loading = state.triggeringJob == "sync",
                    onClick = { viewModel.onEvent(AdminUiEvent.TriggerPipeline("sync")) },
                )
                Spacer(Modifier.height(8.dp))
                MotormilaGhostButton(
                    label = if (state.triggeringJob == "alt_sync") "Launching…" else "Trigger alt sync",
                    onClick = { viewModel.onEvent(AdminUiEvent.TriggerPipeline("alt_sync")) },
                )
                state.pipeline?.orphansReconciled?.takeIf { it > 0 }?.let { count ->
                    Spacer(Modifier.height(8.dp))
                    Text("Reconciled $count orphan run(s).", fontSize = 12.sp, color = MotormilaSecondaryText)
                }
            }
        }
        if (state.pipelineLoading && state.pipeline == null) {
            item { Text("Loading runs…", color = MotormilaSecondaryText) }
        }
        items(state.pipeline?.runs.orEmpty(), key = { it.id }) { run ->
            MotormilaSurface {
                Text(run.source, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                Text(
                    "${run.status.ifBlank { "—" }} · ${run.listingsFound} found · ${run.listingsNew} new",
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
                Text(
                    run.startedAt ?: "—",
                    fontSize = 11.sp,
                    color = MotormilaSecondaryText,
                )
                run.errorMessage?.takeIf { it.isNotBlank() }?.let { message ->
                    Spacer(Modifier.height(4.dp))
                    Text(message, fontSize = 11.sp, color = MotormilaPrimaryBright)
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun AnalyticsPane(state: AdminUiState) {
    val analytics = state.analytics
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Analytics", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = MotormilaOnSurface)
        }
        if (state.analyticsLoading && analytics == null) {
            item { Text("Loading analytics…", color = MotormilaSecondaryText) }
        } else if (analytics == null) {
            item { Text("Analytics unavailable.", color = MotormilaSecondaryText) }
        } else {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MotormilaMetricTile(
                            label = "AVG ASK",
                            value = lk.motormila.app.ui.common.mn(analytics.listings.avgPriceLkr),
                            note = "${lk.motormila.app.ui.common.mn(analytics.listings.minPriceLkr)} – ${lk.motormila.app.ui.common.mn(analytics.listings.maxPriceLkr)}",
                            modifier = Modifier.weight(1f),
                        )
                        MotormilaMetricTile(
                            label = "SIGNUPS",
                            value = LkrFormat.count(analytics.users.signupsToday),
                            note = "${LkrFormat.count(analytics.users.neverLoggedIn)} never logged in",
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MotormilaMetricTile(
                            label = "ALERTS",
                            value = LkrFormat.count(analytics.alerts.active),
                            note = "${LkrFormat.count(analytics.alerts.withWhatsapp)} with WhatsApp",
                            modifier = Modifier.weight(1f),
                        )
                        MotormilaMetricTile(
                            label = "SCRAPES",
                            value = "${LkrFormat.count(analytics.scrapes.success)}/${LkrFormat.count(analytics.scrapes.failed)}",
                            note = "success / failed",
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            item { NamedCountList("Listings by source", analytics.listings.bySource) }
            item { NamedCountList("Listings by district", analytics.listings.byDistrict) }
            item { NamedCountList("Users by plan", analytics.users.byPlan) }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun NamedCountList(title: String, rows: List<AdminNamedCount>) {
    MotormilaSurface {
        Text(title, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
        Spacer(Modifier.height(8.dp))
        if (rows.isEmpty()) {
            Text("No data yet.", fontSize = 12.sp, color = MotormilaSecondaryText)
        } else {
            rows.forEach { row ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(row.label, modifier = Modifier.weight(1f), color = MotormilaOnSurface)
                    Text(
                        LkrFormat.count(row.count),
                        style = LocalTextStyle.current.tabular(),
                        color = MotormilaPrimaryBright,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FeedbackPane(state: AdminUiState, viewModel: AdminViewModel) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Feedback inbox", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = MotormilaOnSurface)
            Text(
                "Triage bugs, ideas, and data reports from the in-app widget.",
                fontSize = 12.sp,
                color = MotormilaSecondaryText,
            )
        }
        if (state.feedbackLoading && state.feedback.isEmpty()) {
            item { Text("Loading feedback…", color = MotormilaSecondaryText) }
        } else if (state.feedback.isEmpty()) {
            item { Text("No feedback yet.", color = MotormilaSecondaryText) }
        }
        items(state.feedback, key = { it.id }) { item ->
            MotormilaSurface {
                Text(
                    "${item.category} · ${item.status}",
                    fontSize = 12.sp,
                    color = MotormilaPrimaryBright,
                )
                Spacer(Modifier.height(6.dp))
                Text(item.message, color = MotormilaOnSurface)
                Text(
                    listOfNotNull(item.email ?: "anonymous", item.route, item.createdAt).joinToString(" · "),
                    fontSize = 11.sp,
                    color = MotormilaSecondaryText,
                )
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ADMIN_FEEDBACK_STATUSES.forEach { status ->
                        MotormilaChoiceChip(
                            label = status.uppercase(),
                            selected = item.status.equals(status, true),
                            compact = true,
                            onClick = { viewModel.onEvent(AdminUiEvent.UpdateFeedback(item.id, status)) },
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun DealersPane(state: AdminUiState, viewModel: AdminViewModel) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Dealer claims", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = MotormilaOnSurface)
            Text(
                "Verify pending yards without the separate dealer admin token.",
                fontSize = 12.sp,
                color = MotormilaSecondaryText,
            )
        }
        if (state.dealersLoading && state.dealers.isEmpty()) {
            item { Text("Loading dealers…", color = MotormilaSecondaryText) }
        } else if (state.dealers.isEmpty()) {
            item { Text("No dealer profiles yet.", color = MotormilaSecondaryText) }
        }
        items(state.dealers, key = { it.id }) { dealer ->
            MotormilaSurface {
                Text(
                    dealer.displayName.ifBlank { "Dealer #${dealer.id}" },
                    fontWeight = FontWeight.SemiBold,
                    color = MotormilaOnSurface,
                )
                Text(
                    dealer.sellerNamePattern ?: dealer.claimedUrl ?: "—",
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
                Text(
                    dealer.contactEmail ?: dealer.contactPhone ?: "—",
                    fontSize = 12.sp,
                    color = MotormilaSecondaryText,
                )
                Text(dealer.status, fontSize = 12.sp, color = MotormilaPrimaryBright)
                if (!dealer.isVerified) {
                    Spacer(Modifier.height(10.dp))
                    MotormilaPrimaryButton(
                        label = if (state.verifyingDealerId == dealer.id) "Verifying…" else "Verify",
                        enabled = state.verifyingDealerId == null,
                        loading = state.verifyingDealerId == dealer.id,
                        onClick = { viewModel.onEvent(AdminUiEvent.VerifyDealer(dealer.id)) },
                    )
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun PermitsPane(state: AdminUiState, viewModel: AdminViewModel) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            MotormilaSurface {
                Text("Upsert permit price", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = MotormilaOnSurface)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.permitName,
                    onValueChange = { viewModel.onEvent(AdminUiEvent.PermitNameChanged(it)) },
                    label = { Text("Permit name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.permitType,
                    onValueChange = { viewModel.onEvent(AdminUiEvent.PermitTypeChanged(it)) },
                    label = { Text("Type (duty_free / ev)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.permitPrice,
                    onValueChange = { viewModel.onEvent(AdminUiEvent.PermitPriceChanged(it)) },
                    label = { Text("Market price LKR") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                MotormilaPrimaryButton(
                    label = if (state.savingPermit) "Saving…" else "Save permit",
                    enabled = !state.savingPermit,
                    loading = state.savingPermit,
                    onClick = { viewModel.onEvent(AdminUiEvent.UpsertPermit) },
                )
            }
        }
        item { Text("Current permits", fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface) }
        if (state.permitsLoading && state.permits.isEmpty()) {
            item { Text("Loading permits…", color = MotormilaSecondaryText) }
        } else if (state.permits.isEmpty()) {
            item { Text("No permits configured.", color = MotormilaSecondaryText) }
        }
        items(state.permits, key = { it.id }) { permit ->
            MotormilaSurface {
                Text(permit.permitName, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                Text(permit.permitType, fontSize = 12.sp, color = MotormilaSecondaryText)
                Text(
                    lk.motormila.app.ui.common.mn(permit.marketPriceLkr),
                    style = LocalTextStyle.current.tabular(),
                    color = MotormilaPrimaryBright,
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun SystemPane(state: AdminUiState, viewModel: AdminViewModel) {
    val system = state.system
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("System", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = MotormilaOnSurface)
        }
        if (state.systemLoading && system == null) {
            item { Text("Loading system…", color = MotormilaSecondaryText) }
        }
        if (system != null) {
            item {
                MotormilaSurface {
                    Text("Security & config", fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                    Spacer(Modifier.height(8.dp))
                    FlagRow("Database", if (system.databaseOk) "ok" else "down")
                    FlagRow("App access enforced", system.flags.appAccessEnforced.toString())
                    FlagRow("Pro access enforced", system.flags.proAccessEnforced.toString())
                    FlagRow("Admin API key", if (system.flags.adminApiKeyConfigured) "set" else "missing")
                    FlagRow("Billing webhook", if (system.flags.billingWebhookConfigured) "set" else "missing")
                    FlagRow("B2B API keys", if (system.flags.b2bKeysConfigured) "set" else "missing")
                    FlagRow("Invite email (Resend)", if (system.flags.resendConfigured) "set" else "missing")
                    FlagRow("Twilio WhatsApp", if (system.flags.twilioConfigured) "set" else "missing")
                    FlagRow("Telegram", if (system.flags.telegramConfigured) "set" else "missing")
                    FlagRow("Email alerts", if (system.flags.emailAlertConfigured) "set" else "missing")
                    FlagRow("Public app origin", system.flags.publicAppOrigin ?: "unset")
                }
            }
            item {
                MotormilaSurface {
                    Text("Ops tools", fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                    Text(
                        "Clear the 1-hour market stats cache so summary / district endpoints recompute immediately after data changes.",
                        fontSize = 12.sp,
                        color = MotormilaSecondaryText,
                    )
                    Spacer(Modifier.height(12.dp))
                    MotormilaPrimaryButton(
                        label = if (state.clearingCache) "Clearing…" else "Clear stats cache",
                        enabled = !state.clearingCache,
                        loading = state.clearingCache,
                        onClick = { viewModel.onEvent(AdminUiEvent.ClearCache) },
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (system.statsCacheKeys.isEmpty()) {
                            "No cache rows currently."
                        } else {
                            "Keys: ${system.statsCacheKeys.joinToString(", ")}"
                        },
                        fontSize = 11.sp,
                        color = MotormilaSecondaryText,
                    )
                }
            }
            item {
                MotormilaSurface {
                    Text("Enrichment providers", fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                    Text(
                        "Third-party research adapters. Keys stay on the backend.",
                        fontSize = 12.sp,
                        color = MotormilaSecondaryText,
                    )
                    Spacer(Modifier.height(8.dp))
                    if (system.providers.isEmpty()) {
                        Text("Provider health unavailable.", fontSize = 12.sp, color = MotormilaSecondaryText)
                    } else {
                        system.providers.forEach { provider ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                                Column(Modifier.weight(1f)) {
                                    Text(provider.label, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface)
                                    Text(
                                        provider.lastRun ?: "No ingest run recorded",
                                        fontSize = 11.sp,
                                        color = MotormilaSecondaryText,
                                    )
                                }
                                Text(
                                    adminProviderStatus(provider.enabled, provider.configured, provider.lastRun),
                                    fontSize = 12.sp,
                                    color = MotormilaPrimaryBright,
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    MotormilaGhostButton(
                        label = if (state.runningPilot) "Running spec pilot…" else "Run RevCarData 100-record pilot",
                        onClick = { viewModel.onEvent(AdminUiEvent.RunRevcarPilot) },
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Match-rate sample only. Foreign MSRP is never written into LKR fair market value.",
                        fontSize = 11.sp,
                        color = MotormilaSecondaryText,
                    )
                    state.lastPilot?.let { pilot ->
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "${pilot.matched}/${pilot.attempted} matched" +
                                (pilot.matchRate?.let { " · rate $it" } ?: ""),
                            fontSize = 12.sp,
                            color = MotormilaGoodText,
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun FlagRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(label, modifier = Modifier.weight(1f), color = MotormilaSecondaryText, fontSize = 13.sp)
        Text(value, fontWeight = FontWeight.SemiBold, color = MotormilaOnSurface, fontSize = 13.sp)
    }
}
