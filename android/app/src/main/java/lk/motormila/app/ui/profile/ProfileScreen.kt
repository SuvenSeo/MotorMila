package lk.motormila.app.ui.profile

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ElectricCar
import androidx.compose.material.icons.filled.EvStation
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.BuildConfig
import lk.motormila.app.R
import lk.motormila.app.ui.common.InsetGroup
import lk.motormila.app.ui.common.InsetRow
import lk.motormila.app.ui.common.MmScreen
import lk.motormila.app.ui.common.MmTag
import lk.motormila.app.ui.common.ScreenError
import lk.motormila.app.ui.common.ScreenPadding
import lk.motormila.app.ui.common.ScreenSkeleton
import lk.motormila.app.ui.components.MmButton
import lk.motormila.app.ui.components.MmCard
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType
import lk.motormila.app.ui.updates.AppUpdateDialog
import lk.motormila.app.ui.updates.AppUpdateViewModel

/** Navigation targets reachable from the "You" tab. */
data class ProfileActions(
    val onLoginClick: () -> Unit = {},
    val onSettingsClick: () -> Unit = {},
    val onProClick: () -> Unit = {},
    val onDealerClick: () -> Unit = {},
    val onAlertsClick: () -> Unit = {},
    val onNotificationsClick: () -> Unit = {},
    val onEvHubClick: () -> Unit = {},
    val onPulseClick: () -> Unit = {},
    val onBestPicksClick: () -> Unit = {},
    val onCalculatorClick: () -> Unit = {},
    val onCompareClick: () -> Unit = {},
    val onTrendsClick: () -> Unit = {},
    val onPriceIndexClick: () -> Unit = {},
    val onDocsClick: () -> Unit = {},
    val onPricingClick: () -> Unit = {},
    val onPermitsClick: () -> Unit = {},
    val onSellClick: () -> Unit = {},
    val onAdminClick: () -> Unit = {},
    val onEvChargersClick: () -> Unit = {},
    val onPrivacyClick: () -> Unit = {},
    val onTermsClick: () -> Unit = {},
    val onCheckUpdates: (() -> Unit)? = null,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onLoginClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onProClick: () -> Unit,
    onDealerClick: () -> Unit,
    onAlertsClick: () -> Unit,
    onNotificationsClick: () -> Unit,
    onEvHubClick: () -> Unit = {},
    onPulseClick: () -> Unit = {},
    onBestPicksClick: () -> Unit = {},
    onCalculatorClick: () -> Unit = {},
    onCompareClick: () -> Unit = {},
    onTrendsClick: () -> Unit = {},
    onPriceIndexClick: () -> Unit = {},
    onDocsClick: () -> Unit = {},
    onPricingClick: () -> Unit = {},
    onPermitsClick: () -> Unit = {},
    onSellClick: () -> Unit = {},
    onAdminClick: () -> Unit = {},
    onEvChargersClick: () -> Unit = {},
    onPrivacyClick: () -> Unit = {},
    onTermsClick: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel(),
    updateViewModel: AppUpdateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val updateState by updateViewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }

    LaunchedEffect(state.error) {
        state.error?.let {
            snacks.showSnackbar(it)
            viewModel.onEvent(ProfileUiEvent.DismissError)
        }
    }
    val upToDate = stringResource(R.string.update_up_to_date)
    val downloadFailed = stringResource(R.string.update_download_failed)
    LaunchedEffect(updateState.manuallyCheckedWithNoUpdate) {
        if (updateState.manuallyCheckedWithNoUpdate) {
            snacks.showSnackbar(upToDate)
            updateViewModel.consumeNoUpdateFeedback()
        }
    }
    LaunchedEffect(updateState.downloadFailedTick) {
        if (updateState.downloadFailedTick > 0) {
            snacks.showSnackbar(downloadFailed)
            updateViewModel.consumeDownloadFailure()
        }
    }

    val actions = ProfileActions(
        onLoginClick, onSettingsClick, onProClick, onDealerClick, onAlertsClick, onNotificationsClick,
        onEvHubClick, onPulseClick, onBestPicksClick, onCalculatorClick, onCompareClick, onTrendsClick,
        onPriceIndexClick, onDocsClick, onPricingClick, onPermitsClick, onSellClick, onAdminClick,
        onEvChargersClick, onPrivacyClick, onTermsClick,
        // The Play build updates through the Play Store; the self-updater row would always say "up to date".
        onCheckUpdates = if (BuildConfig.SELF_UPDATE_ENABLED) {
            { updateViewModel.manualCheck(BuildConfig.VERSION_CODE) }
        } else {
            null
        },
    )

    val reducedMotion = MmMotion.reduced
    MmScreen(title = stringResource(R.string.scr_profile_title), showBack = false, snackbarHostState = snacks, edgeToEdge = true) {
        lk.motormila.app.ui.components.MmPullToRefresh(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(ProfileUiEvent.Refresh) },
            indicatorTop = lk.motormila.app.ui.common.LocalMmScreenInsets.current.top,
            modifier = Modifier.fillMaxSize(),
        ) {
            AnimatedContent(
                targetState = when {
                    state.isLoading -> 0
                    state.profile == null -> 1
                    else -> 2
                },
                transitionSpec = { MmMotion.crossfade(reducedMotion) },
                label = "profile-state",
            ) { phase ->
                when (phase) {
                    0 -> ScreenSkeleton(rows = 4)
                    1 -> ScreenError(state.error, onRetry = { viewModel.onEvent(ProfileUiEvent.Refresh) })
                    else -> state.profile?.let { ProfileContent(it, actions) }
                }
            }
        }
    }

    updateState.available?.let { update ->
        AppUpdateDialog(
            update = update,
            downloading = updateState.downloading,
            onUpdate = { updateViewModel.downloadAndInstall(update) },
            onDismiss = { updateViewModel.dismiss() },
        )
    }
}

@Composable
fun ProfileContent(p: UiProfile, a: ProfileActions) {
    val c = MmColors.current
    val type = MmType.current
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = ScreenPadding,
        verticalArrangement = Arrangement.spacedBy(MmSpacing.xl),
    ) {
        item(key = "account") { AccountHeader(p, a) }
        if (p.loggedIn) {
            item(key = "counts") {
                Row(horizontalArrangement = Arrangement.spacedBy(MmSpacing.cardGap)) {
                    CountTile(stringResource(R.string.scr_profile_watched), p.watchlistCount, Modifier.weight(1f), onClick = null)
                    CountTile(stringResource(R.string.scr_profile_alerts), p.alertCount, Modifier.weight(1f), onClick = a.onAlertsClick)
                }
            }
        }
        item(key = "activity") {
            InsetGroup(header = stringResource(R.string.scr_profile_activity)) {
                InsetRow(stringResource(R.string.scr_profile_alerts_row), icon = Icons.Filled.NotificationsActive, onClick = a.onAlertsClick)
                InsetRow(stringResource(R.string.scr_profile_inbox), icon = Icons.Filled.Inbox, onClick = a.onNotificationsClick, showDivider = false)
            }
        }
        item(key = "market") {
            InsetGroup(header = stringResource(R.string.scr_profile_market)) {
                InsetRow(stringResource(R.string.hub_picks_title), icon = Icons.Filled.Star, onClick = a.onBestPicksClick)
                InsetRow(stringResource(R.string.hub_trends_title), icon = Icons.AutoMirrored.Filled.TrendingUp, onClick = a.onTrendsClick)
                InsetRow(stringResource(R.string.hub_index_title), icon = Icons.Filled.ShowChart, onClick = a.onPriceIndexClick)
                InsetRow(stringResource(R.string.hub_pulse_title), icon = Icons.Filled.Campaign, onClick = a.onPulseClick)
                InsetRow(stringResource(R.string.hub_permits_title), icon = Icons.Filled.Gavel, onClick = a.onPermitsClick, showDivider = false)
            }
        }
        item(key = "tools") {
            InsetGroup(header = stringResource(R.string.scr_profile_tools)) {
                InsetRow(stringResource(R.string.hub_calc_title), icon = Icons.Filled.Calculate, onClick = a.onCalculatorClick)
                InsetRow(stringResource(R.string.hub_compare_title), icon = Icons.AutoMirrored.Filled.CompareArrows, onClick = a.onCompareClick)
                InsetRow(stringResource(R.string.hub_ev_title), icon = Icons.Filled.ElectricCar, iconTint = c.dealGreat, onClick = a.onEvHubClick)
                InsetRow(stringResource(R.string.scr_profile_chargers), icon = Icons.Filled.EvStation, iconTint = c.dealGreat, onClick = a.onEvChargersClick)
                InsetRow(stringResource(R.string.hub_docs_title), icon = Icons.AutoMirrored.Filled.MenuBook, onClick = a.onDocsClick, showDivider = false)
            }
        }
        item(key = "sell") {
            InsetGroup(header = stringResource(R.string.scr_profile_selling)) {
                InsetRow(stringResource(R.string.sell_title), icon = Icons.Filled.Sell, onClick = a.onSellClick)
                InsetRow(stringResource(R.string.scr_profile_dealer), icon = Icons.Filled.Storefront, onClick = a.onDealerClick, showDivider = false)
            }
        }
        item(key = "app") {
            InsetGroup(
                header = stringResource(R.string.scr_profile_app),
                footer = stringResource(R.string.scr_profile_version, BuildConfig.VERSION_NAME),
            ) {
                InsetRow(
                    if (p.isPro) stringResource(R.string.scr_profile_pro_dashboard) else stringResource(R.string.scr_price_title),
                    icon = Icons.Filled.WorkspacePremium,
                    iconTint = c.caution,
                    value = if (p.isPro) null else stringResource(R.string.scr_price_badge),
                    onClick = if (p.isPro) a.onProClick else a.onPricingClick,
                )
                InsetRow(stringResource(R.string.settings_title), icon = Icons.Filled.Settings, onClick = a.onSettingsClick)
                a.onCheckUpdates?.let {
                    InsetRow(stringResource(R.string.profile_check_updates), icon = Icons.Filled.SystemUpdate, onClick = it)
                }
                if (p.isAdmin) {
                    InsetRow(stringResource(R.string.scr_profile_admin), icon = Icons.Filled.AdminPanelSettings, iconTint = c.danger, onClick = a.onAdminClick)
                }
                InsetRow(stringResource(R.string.settings_privacy_title), icon = Icons.Filled.Policy, onClick = a.onPrivacyClick)
                InsetRow(stringResource(R.string.settings_terms_title), icon = Icons.Filled.Description, onClick = a.onTermsClick, showDivider = false)
            }
        }
    }
}

@Composable
private fun AccountHeader(p: UiProfile, a: ProfileActions) {
    val c = MmColors.current
    val type = MmType.current
    MmCard(Modifier.fillMaxWidth()) {
        if (p.loggedIn) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(52.dp).clip(CircleShape).background(c.brandContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        p.displayName.take(1).uppercase().ifBlank { "M" },
                        style = type.titleL,
                        color = c.onBrandContainer,
                    )
                }
                Spacer(Modifier.width(MmSpacing.md))
                Column(Modifier.weight(1f)) {
                    Text(p.displayName, style = type.titleL, color = c.textPrimary, maxLines = 1)
                    Text(p.email, style = type.bodyS, color = c.textSecondary, maxLines = 1)
                    Spacer(Modifier.height(MmSpacing.xs))
                    Row(horizontalArrangement = Arrangement.spacedBy(MmSpacing.xs)) {
                        MmTag(
                            if (p.isPro) stringResource(R.string.scr_price_pro) else stringResource(R.string.scr_price_free),
                            color = if (p.isPro) c.onCaution else c.textSecondary,
                            container = if (p.isPro) c.cautionContainer else c.surfaceHigh,
                        )
                        if (p.isAdmin) MmTag(stringResource(R.string.scr_profile_admin_tag), color = c.onDealHigh, container = c.dealHighContainer)
                    }
                }
            }
        } else {
            Text(stringResource(R.string.scr_profile_guest_title), style = type.titleL, color = c.textPrimary)
            Spacer(Modifier.height(MmSpacing.xs))
            Text(stringResource(R.string.scr_profile_guest_body), style = type.bodyM, color = c.textSecondary)
            Spacer(Modifier.height(MmSpacing.lg))
            MmButton(stringResource(R.string.scr_profile_sign_in), onClick = a.onLoginClick, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun CountTile(label: String, count: Int, modifier: Modifier, onClick: (() -> Unit)?) {
    val c = MmColors.current
    MmCard(modifier, onClick = onClick) {
        Text(label, style = MmType.current.label, color = c.textSecondary)
        Spacer(Modifier.height(MmSpacing.xs))
        Text("$count", style = MmType.current.priceL, color = c.textPrimary)
    }
}
