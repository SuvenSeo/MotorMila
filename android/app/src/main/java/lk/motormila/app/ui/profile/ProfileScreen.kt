package lk.motormila.app.ui.profile

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGroup
import lk.motormila.app.ui.components.MotormilaGroupRow
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaPage
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.BuildConfig
import lk.motormila.app.ui.updates.AppUpdateDialog
import lk.motormila.app.ui.updates.AppUpdateViewModel
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()

    fun navTap(onClick: () -> Unit) {
        if (!reducedMotion) haptics.tick()
        onClick()
    }

    LaunchedEffect(state.error) {
        state.error?.let {
            snacks.showSnackbar(it)
            viewModel.onEvent(ProfileUiEvent.DismissError)
        }
    }

    // In-app update feedback for the manual "tap to check" row: the dialog
    // handles UpdateAvailable, but UpToDate and download failure would
    // otherwise be silent. These toasts consume the ViewModel's one-shot
    // flags; the passive launch check never sets them.
    val updateUpToDateText = stringResource(R.string.update_up_to_date)
    val updateDownloadFailedText = stringResource(R.string.update_download_failed)
    LaunchedEffect(updateState.manuallyCheckedWithNoUpdate) {
        if (updateState.manuallyCheckedWithNoUpdate) {
            snacks.showSnackbar(updateUpToDateText)
            updateViewModel.consumeNoUpdateFeedback()
        }
    }
    LaunchedEffect(updateState.downloadFailedTick) {
        if (updateState.downloadFailedTick > 0) {
            snacks.showSnackbar(updateDownloadFailedText)
            updateViewModel.consumeDownloadFailure()
        }
    }

    MotormilaPage(title = "You", snackbarHostState = snacks) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(ProfileUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.isLoading -> SkeletonList(rows = 4)
                state.error != null && state.profile == null ->
                    ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(ProfileUiEvent.Refresh) })
                state.profile == null ->
                    ErrorRetry("Couldn't load profile.", onRetry = { viewModel.onEvent(ProfileUiEvent.Refresh) })
                else -> {
                    val p = state.profile!!
                    LazyColumn(
                        Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        item { OfflineBanner(visible = state.offline) }
                        item {
                            MotormilaSurface(
                                highlighted = p.isAdmin,
                                modifier = Modifier.motormilaReveal().semantics {
                                    contentDescription = "${p.sessionState} session for ${p.displayName}, plan ${p.planName}, role ${p.role}"
                                },
                            ) {
                                MotormilaEyebrow(if (p.loggedIn) "MEMBER" else "GUEST")
                                Spacer(Modifier.height(10.dp))
                                Text(p.displayName, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, color = MotormilaOnSurface)
                                Spacer(Modifier.height(4.dp))
                                Text(p.email, fontSize = 13.sp, color = MotormilaSecondaryText)
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    "${p.sessionState} · ${p.role.replaceFirstChar { c -> c.uppercase() }}" +
                                        (p.expiresAt?.let { " · expires ${it.take(10)}" } ?: ""),
                                    fontSize = 12.sp,
                                    color = MotormilaSecondaryText,
                                )
                                Spacer(Modifier.height(14.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    MotormilaMetricTile("Plan", p.planName.uppercase(), modifier = Modifier.weight(1f))
                                    MotormilaMetricTile("Role", p.role.replaceFirstChar { it.uppercase() }, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                        item {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                MotormilaMetricTile("Watched", "${p.watchlistCount}", modifier = Modifier.weight(1f))
                                MotormilaMetricTile("Alerts", "${p.alertCount}", modifier = Modifier.weight(1f))
                            }
                        }
                        item {
                            MotormilaSurface {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = MotormilaPrimaryBright)
                                    Text(
                                        "  Deal-hunter ${p.dealHunterScore}/100",
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 15.sp,
                                        color = MotormilaOnSurface,
                                    )
                                }
                                Spacer(Modifier.height(10.dp))
                                LinearProgressIndicator(
                                    progress = { (p.dealHunterScore / 100f).coerceIn(0f, 1f) },
                                    color = MotormilaPrimary,
                                    trackColor = Color(0x22FFFFFF),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Spacer(Modifier.height(10.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Filled.LocalFireDepartment, contentDescription = null, tint = MotormilaPrimaryBright)
                                    Text("  ${p.streakDays}-day streak", fontSize = 14.sp, color = MotormilaOnSurface)
                                }
                            }
                        }
                        item {
                            Text("Badges", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = MotormilaSecondaryText)
                            Spacer(Modifier.height(8.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                p.badges.forEach { b ->
                                    MotormilaEyebrow("${if (b.earned) "★" else "☆"} ${b.label}", accent = b.earned)
                                }
                            }
                        }
                        item {
                            Text(stringResource(R.string.hub_profile_section), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = MotormilaSecondaryText)
                            Spacer(Modifier.height(8.dp))
                            MotormilaGroup {
                                MotormilaGroupRow(stringResource(R.string.hub_ev_title), onClick = { navTap(onEvHubClick) })
                                MotormilaGroupRow("EV chargers", onClick = { navTap(onEvChargersClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_pulse_title), onClick = { navTap(onPulseClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_picks_title), onClick = { navTap(onBestPicksClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_calc_title), onClick = { navTap(onCalculatorClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_compare_title), onClick = { navTap(onCompareClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_trends_title), onClick = { navTap(onTrendsClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_index_title), onClick = { navTap(onPriceIndexClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_permits_title), onClick = { navTap(onPermitsClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_docs_title), onClick = { navTap(onDocsClick) })
                                MotormilaGroupRow(stringResource(R.string.hub_pricing_title), onClick = { navTap(onPricingClick) })
                                MotormilaGroupRow(stringResource(R.string.sell_title), onClick = { navTap(onSellClick) }, showDivider = false)
                            }
                        }
                        item {
                            Text("Manage", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = MotormilaSecondaryText)
                            Spacer(Modifier.height(8.dp))
                            MotormilaGroup {
                                MotormilaGroupRow("Settings", onClick = { navTap(onSettingsClick) })
                                MotormilaGroupRow(
                                    if (p.planName.equals("Pro", true)) "Pro dashboard" else "Go Pro",
                                    onClick = { navTap(onProClick) },
                                )
                                MotormilaGroupRow("Dealer tools", onClick = { navTap(onDealerClick) })
                                MotormilaGroupRow("Price alerts", onClick = { navTap(onAlertsClick) })
                                MotormilaGroupRow("Notifications", onClick = { navTap(onNotificationsClick) })
                                MotormilaGroupRow(
                                    "${stringResource(R.string.profile_app_version)} ${BuildConfig.VERSION_NAME} — ${stringResource(R.string.profile_check_updates)}",
                                    onClick = { navTap { updateViewModel.manualCheck(BuildConfig.VERSION_CODE) } },
                                )
                                if (p.isAdmin) MotormilaGroupRow("Admin console", onClick = { navTap(onAdminClick) })
                                MotormilaGroupRow("Privacy", onClick = { navTap(onPrivacyClick) })
                                MotormilaGroupRow("Terms", onClick = { navTap(onTermsClick) }, showDivider = p.loggedIn.not())
                                if (!p.loggedIn) {
                                    MotormilaGroupRow("Log in / sign up", onClick = { navTap(onLoginClick) }, showDivider = false)
                                }
                            }
                        }
                        item { Spacer(Modifier.heightIn(min = 24.dp)) }
                    }
                }
            }
        }
    }

    // Hosted here so manual "Check for updates" from Profile shows the dialog too.
    updateState.available?.let { update ->
        AppUpdateDialog(
            update = update,
            downloading = updateState.downloading,
            onUpdate = { updateViewModel.downloadAndInstall(update) },
            onDismiss = { updateViewModel.dismiss() },
        )
    }
}
