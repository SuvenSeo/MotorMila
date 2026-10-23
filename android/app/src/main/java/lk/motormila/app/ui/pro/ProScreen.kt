package lk.motormila.app.ui.pro

import android.app.Activity
import android.content.Intent
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.draw.blur
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.File
import lk.motormila.app.BuildConfig
import lk.motormila.app.R
import lk.motormila.app.ui.common.MmScreen
import lk.motormila.app.ui.common.PRO_COMING_SOON
import lk.motormila.app.billing.BillingState
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.PrimaryAction
import lk.motormila.app.core.ui.SectionTitle
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.domain.model.ArbitrageGap
import lk.motormila.app.domain.model.ProDistrict
import lk.motormila.app.domain.model.VehicleLane
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProScreen(
    onOpenCheckout: (url: String) -> Unit,
    onOpenDistrict: (district: String) -> Unit,
    viewModel: ProViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val billingState by viewModel.billingState.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val context = LocalContext.current
    val activity = context as? Activity
    var paywallOpen by remember { mutableStateOf(false) }

    fun tapConfirm() {
        if (!reducedMotion) haptics.tick()
    }

    LaunchedEffect(state.error, state.billingError, state.checkoutMessage) {
        (state.error ?: state.billingError ?: state.checkoutMessage)?.let {
            if (state.billingError != null && !reducedMotion) haptics.reject()
            snacks.showSnackbar(it)
            viewModel.onEvent(ProUiEvent.DismissError)
        }
    }
    LaunchedEffect(state.checkoutUrl) {
        state.checkoutUrl?.let {
            if (!reducedMotion) haptics.confirm()
            onOpenCheckout(it)
            viewModel.onEvent(ProUiEvent.ConsumeCheckout)
        }
    }
    LaunchedEffect(state.billingMessageRes) {
        state.billingMessageRes?.let { res ->
            snacks.showSnackbar(context.getString(res))
            viewModel.onEvent(ProUiEvent.DismissError)
        }
    }
    LaunchedEffect(billingState) {
        when (billingState) {
            is BillingState.Purchased -> {
                if (!reducedMotion) haptics.confirm()
                snacks.showSnackbar(context.getString(R.string.billing_pro_unlocked))
                viewModel.onEvent(ProUiEvent.Refresh)
            }
            BillingState.Pending -> snacks.showSnackbar(context.getString(R.string.billing_pending))
            BillingState.VerificationFailed ->
                snacks.showSnackbar(context.getString(R.string.billing_verification_failed))
            else -> Unit
        }
    }
    // Paid plans aren't on sale yet: non-Pro users get an honest "coming soon"
    // page with the launch list (no checkout, no blurred placeholder data).
    if (PRO_COMING_SOON && !state.isLoading && !state.isPro) {
        MmScreen(title = stringResource(R.string.scr_pro_title), snackbarHostState = snacks) {
            ProComingSoon()
        }
        return
    }
    // Legacy paywall path (only reachable once PRO_COMING_SOON is false).
    LaunchedEffect(state.isPro, state.isLoading) {
        if (!PRO_COMING_SOON && !state.isLoading && !state.isPro) paywallOpen = true
    }

    MmScreen(title = stringResource(R.string.scr_pro_title), snackbarHostState = snacks) {
        PullToRefreshBox(
            isRefreshing = false,
            onRefresh = { viewModel.onEvent(ProUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.isLoading -> SkeletonList()
                state.error != null && state.snapshot == null && state.isPro ->
                    ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(ProUiEvent.Refresh) })

                else -> ProContent(
                    state = state,
                    blurred = !state.isPro,
                    onOpenDistrict = { tapConfirm(); onOpenDistrict(it) },
                    onUpgrade = { paywallOpen = true },
                    onSelectLane = { make, model ->
                        tapConfirm()
                        viewModel.onEvent(ProUiEvent.SelectLane(make, model))
                    },
                    onToggleDistrict = { district ->
                        tapConfirm()
                        viewModel.onEvent(ProUiEvent.ToggleDistrictDetail(district))
                    },
                    onThreshold = { pct ->
                        tapConfirm()
                        viewModel.onEvent(ProUiEvent.ThresholdChanged(pct))
                    },
                    onExportCsv = {
                        tapConfirm()
                        shareProCsv(context, state)
                    },
                )
            }
        }

        if (!PRO_COMING_SOON && paywallOpen && !state.isPro) {
            ModalBottomSheet(
                onDismissRequest = { paywallOpen = false },
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                shape = lk.motormila.app.ui.theme.MmShapes.sheet,
                containerColor = lk.motormila.app.ui.components.glassSheetColor(),
            ) {
                lk.motormila.app.ui.components.WindowBackdropBlur()
                Column(
                    Modifier.fillMaxWidth().padding(24.dp)
                        .semantics { contentDescription = "Pro paywall" },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.ui_pro_motormila_pro), style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Snapshots, lane velocity, district arbitrage and source-quality scores. " +
                            "Blurred previews above — unlock to trade on them.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(16.dp))
                    // Blur-locked preview strip inside the sheet itself.
                    BlurredPreview()
                    Spacer(Modifier.height(16.dp))
                    if (billingState is BillingState.Purchased) {
                        Text(
                            stringResource(R.string.billing_pro_unlocked),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    PrimaryAction(
                        stringResource(
                            if (BuildConfig.PLAY_BILLING_ENABLED) R.string.billing_subscribe_play
                            else R.string.billing_continue_checkout,
                        ),
                        onClick = {
                            tapConfirm()
                            if (activity != null) viewModel.onCheckout(activity)
                            else viewModel.onEvent(ProUiEvent.CheckoutIntent)
                        },
                        loading = state.billingLoading,
                    )
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProContent(
    state: ProUiState,
    blurred: Boolean,
    onOpenDistrict: (String) -> Unit,
    onUpgrade: () -> Unit,
    onSelectLane: (make: String, model: String) -> Unit,
    onToggleDistrict: (district: String) -> Unit,
    onThreshold: (pct: Double) -> Unit,
    onExportCsv: () -> Unit,
) {
    // When blurred, show deterministic placeholder snapshot so the paywall has
    // something to lock; real values arrive post-upgrade via Refresh.
    val snap = state.snapshot
    val significant = state.significantGaps()
    LazyColumn(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item {
            SectionTitle("Snapshot KPIs · ${state.planName}")
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = if (blurred) Modifier.blur(10.dp) else Modifier,
            ) {
                if (snap != null) {
                    KpiChip("Listings", snap.totalListings.toString())
                    KpiChip("Avg", lk.motormila.app.ui.common.mn(snap.avgPriceLkr))
                    KpiChip("Median", lk.motormila.app.ui.common.mn(snap.medianPriceLkr))
                    KpiChip("New 7d", snap.newListings7d.toString())
                    KpiChip("Hot deals", snap.hotDealCount.toString())
                    KpiChip("Districts", snap.districtsCovered.toString())
                } else {
                    Text(stringResource(R.string.ui_pro_upgrade_to_load_live_kpis), style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (!blurred && snap != null) {
                Spacer(Modifier.height(8.dp))
                MotormilaPrimaryButton(
                    label = "Export CSV report",
                    leadingIcon = Icons.Filled.Share,
                    onClick = onExportCsv,
                    fillMaxWidth = true,
                    modifier = Modifier.semantics { contentDescription = "Export Pro CSV report" },
                )
            }
        }
        item { SectionTitle("Lanes — tap a lane for detail") }
        val lanes: List<VehicleLane> = state.lanes
        if (lanes.isEmpty() && !blurred) {
            item { Text(stringResource(R.string.ui_pro_no_lane_data_yet), style = MaterialTheme.typography.bodyMedium) }
        } else {
            items((lanes.ifEmpty { previewLanes() })) { lane ->
                val laneName = "${lane.make} ${lane.model}".trim().ifBlank { "Lane" }
                val key = "${lane.make}|${lane.model}"
                val expanded = state.selectedLaneKey == key && !blurred
                MotormilaSurface(
                    onClick = { if (!blurred) onSelectLane(lane.make, lane.model) },
                    modifier = Modifier
                        .then(if (blurred) Modifier.blur(10.dp) else Modifier)
                        .semantics { contentDescription = "Vehicle lane $laneName" },
                ) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(laneName, style = MaterialTheme.typography.titleSmall)
                            Text(
                                "${lane.listingCount} listings · median ${lk.motormila.app.ui.common.mn(lane.medianPriceLkr)}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Text(
                            lane.avgDealScore?.let { "★ %.1f".format(it) }
                                ?: (lane.topDistrict ?: ""),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (expanded) {
                        when {
                            state.loadingDetail -> Text(
                                "Loading lane detail…",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            state.laneDetail != null -> {
                                val d = state.laneDetail!!
                                Spacer(Modifier.height(8.dp))
                                LaneDetailRow("Range", "${lk.motormila.app.ui.common.mn(d.minPriceLkr)} – ${lk.motormila.app.ui.common.mn(d.maxPriceLkr)}")
                                LaneDetailRow("Districts / sources", "${d.districtCount} / ${d.sourceCount}")
                                LaneDetailRow(
                                    "Top district / source",
                                    "${d.topDistrict ?: "—"} / ${d.topSource ?: "—"}",
                                )
                            }
                            state.detailError != null -> Text(
                                state.detailError ?: "Couldn't load lane detail.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
        item { SectionTitle("Districts") }
        val districts: List<ProDistrict> = state.districts
        if (districts.isEmpty() && !blurred) {
            item { Text(stringResource(R.string.ui_pro_no_district_data_yet), style = MaterialTheme.typography.bodyMedium) }
        } else {
            items(districts.ifEmpty { if (blurred) previewDistricts() else emptyList() }) { d ->
                val expanded = state.districtDetailKey == d.district && !blurred
                MotormilaSurface(
                    onClick = { onOpenDistrict(d.district) },
                    modifier = Modifier
                        .then(if (blurred) Modifier.blur(10.dp) else Modifier)
                        .semantics { contentDescription = "District ${d.district}, deep-dive in Insights" },
                ) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(d.district, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "${d.listingCount} · median ${lk.motormila.app.ui.common.mn(d.medianPriceLkr)}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    if (!blurred) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            MotormilaGhostButton(
                                label = if (expanded) "Hide detail" else "Inspect",
                                fillMaxWidth = false,
                                onClick = { onToggleDistrict(d.district) },
                            )
                        }
                        if (expanded) {
                            when {
                                state.loadingDetail -> Text(
                                    "Loading district detail…",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                state.districtDetail != null -> {
                                    val dd = state.districtDetail!!
                                    LaneDetailRow("Average", lk.motormila.app.ui.common.mn(dd.avgPriceLkr))
                                    LaneDetailRow("Sources", dd.sourceCount.toString())
                                    LaneDetailRow(
                                        "Top make / model",
                                        "${dd.topMake ?: "—"} / ${dd.topModel ?: "—"}",
                                    )
                                }
                                state.detailError != null -> Text(
                                    state.detailError ?: "Couldn't load district detail.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
        }
        item {
            SectionTitle(
                "Arbitrage pairs · ${significant.size} significant ≥ ${"%.0f".format(state.arbitrageThresholdPct)}%",
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(3.0, 5.0, 8.0).forEach { pct ->
                    MotormilaChoiceChip(
                        label = "≥ ${"%.0f".format(pct)}%",
                        selected = state.arbitrageThresholdPct == pct,
                        onClick = { onThreshold(pct) },
                        modifier = Modifier.semantics {
                            contentDescription = "Arbitrage threshold ${"%.0f".format(pct)} percent"
                        },
                    )
                }
            }
        }
        val arb: List<ArbitrageGap> = state.arbitrage
        if (arb.isEmpty() && !blurred) {
            item { Text(stringResource(R.string.ui_pro_no_arbitrage_gaps_for_your), style = MaterialTheme.typography.bodyMedium) }
        } else {
            items(arb.ifEmpty { if (blurred) previewArb() else emptyList() }) { a ->
                val hot = a.gapPct >= state.arbitrageThresholdPct
                MotormilaSurface(
                    highlighted = hot && !blurred,
                    modifier = Modifier
                        .then(if (blurred) Modifier.blur(10.dp) else Modifier)
                        .semantics {
                            contentDescription =
                                "Arbitrage buy ${a.buyDistrict} sell ${a.sellDistrict}, gap ${formatPct(a.gapPct)}"
                        },
                ) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Buy ${a.buyDistrict} → sell ${a.sellDistrict}",
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.weight(1f),
                        )
                        if (hot && !blurred) {
                            MotormilaMetricTile(
                                label = "GAP",
                                value = formatPct(a.gapPct),
                            )
                        }
                    }
                    Text(
                        "Spread ${lk.motormila.app.ui.common.mn(a.sellMedianLkr - a.buyMedianLkr)} · ${formatPct(a.gapPct)}",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    if (!blurred) {
                        Text(
                            "${a.buyListingCount} buys · ${a.sellListingCount} sells",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        item { SectionTitle("Source quality") }
        if (blurred) {
            // Static blurred placeholders: per-lane source mix has no ProRepository
            // surface in this build, so free-tier users see locked preview cards.
            items(previewSourceLabels()) { label ->
                MotormilaSurface(modifier = Modifier.blur(10.dp)) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                        Text(stringResource(R.string.ui_pro_pro), style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
        } else {
            item {
                Text(
                    "Source-quality scores live in the Insights feed in this build.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        if (blurred) {
            item {
                PrimaryAction("Unlock Pro", onClick = onUpgrade)
            }
        }
    }
}

@Composable
private fun LaneDetailRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun BlurredPreview() {
    MotormilaSurface(
        modifier = Modifier
            .blur(8.dp)
            .semantics { contentDescription = "Locked Pro preview" },
    ) {
        Text(stringResource(R.string.ui_pro_deal_radar), style = MaterialTheme.typography.titleSmall)
        Text(stringResource(R.string.ui_pro_spread_district), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun KpiChip(label: String, value: String) {
    MotormilaMetricTile(label = label, value = value)
}

private fun previewLanes() = listOf(
    VehicleLane(
        make = "Toyota", model = "Axio", listingCount = 214,
        avgPriceLkr = 8_450_000.0, medianPriceLkr = 8_450_000.0,
        minPriceLkr = null, maxPriceLkr = null, avgDealScore = 7.5,
        districtCount = 3, sourceCount = 2, topDistrict = "Colombo",
        topSource = "ikman", latestSeenAt = null,
    ),
    VehicleLane(
        make = "Toyota", model = "Aqua", listingCount = 167,
        avgPriceLkr = 6_900_000.0, medianPriceLkr = 6_900_000.0,
        minPriceLkr = null, maxPriceLkr = null, avgDealScore = 6.8,
        districtCount = 2, sourceCount = 2, topDistrict = "Gampaha",
        topSource = "riyasewana", latestSeenAt = null,
    ),
)

private fun previewDistricts() = listOf(
    ProDistrict(
        district = "Colombo", listingCount = 1204,
        avgPriceLkr = 9_100_000.0, medianPriceLkr = 8_750_000.0,
        minPriceLkr = null, maxPriceLkr = null, sourceCount = 3,
        topMake = "Toyota", topModel = "Axio", latestSeenAt = null,
    ),
    ProDistrict(
        district = "Gampaha", listingCount = 986,
        avgPriceLkr = 7_400_000.0, medianPriceLkr = 7_100_000.0,
        minPriceLkr = null, maxPriceLkr = null, sourceCount = 3,
        topMake = "Toyota", topModel = "Aqua", latestSeenAt = null,
    ),
)

private fun previewArb() = listOf(
    ArbitrageGap(
        buyDistrict = "Kurunegala", sellDistrict = "Colombo",
        buyMedianLkr = 7_800_000.0, sellMedianLkr = 8_250_000.0,
        gapPct = 5.8, buyListingCount = 42, sellListingCount = 214,
    ),
)

private fun previewSourceLabels() = listOf("ikman · 1,204", "riyasewana · 986")

private fun shareProCsv(context: android.content.Context, state: ProUiState) {
    val csv = ProCsvExport.build(
        snapshot = state.snapshot,
        lanes = state.lanes,
        districts = state.districts,
        arbitrage = state.arbitrage,
    )
    val dir = File(context.cacheDir, "share").apply { mkdirs() }
    val file = File(dir, "motormila-pro-report.csv")
    file.writeText(csv)
    val uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
    )
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/csv"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, "Motormila Pro report")
        putExtra(Intent.EXTRA_TEXT, "Motormila Pro snapshot, lanes, districts, and arbitrage export.")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Share Pro CSV"))
}


/** Non-Pro view while paid plans are not on sale: what Pro will add + launch list. */
@Composable
private fun ProComingSoon() {
    val c = lk.motormila.app.ui.theme.MmColors.current
    val type = lk.motormila.app.ui.theme.MmType.current
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = lk.motormila.app.ui.common.ScreenPadding,
        verticalArrangement = Arrangement.spacedBy(lk.motormila.app.ui.theme.MmSpacing.cardGap),
    ) {
        item {
            lk.motormila.app.ui.common.MmTag(
                stringResource(R.string.scr_price_badge),
                color = c.onDealGreat,
                container = c.dealGreatContainer,
            )
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.scr_pro_soon_title), style = type.displayM, color = c.textPrimary)
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.scr_pro_soon_body), style = type.bodyM, color = c.textSecondary)
        }
        item {
            lk.motormila.app.ui.components.MmCard(Modifier.fillMaxWidth()) {
                lk.motormila.app.ui.pricing.PricingCatalog.proFeatures.forEach { f ->
                    Row(Modifier.padding(vertical = 4.dp)) {
                        Icon(
                            androidx.compose.material.icons.Icons.Filled.Check,
                            contentDescription = null,
                            tint = c.success,
                        )
                        Spacer(Modifier.padding(start = 8.dp))
                        Text(stringResource(f), style = type.bodyM, color = c.textPrimary)
                    }
                }
                Spacer(Modifier.height(16.dp))
                lk.motormila.app.ui.common.ProNotifyBlock()
            }
        }
    }
}
