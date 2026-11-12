package lk.motormila.app.ui.ev

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ElectricCar
import androidx.compose.material.icons.filled.Power
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shield
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.ChargingStation
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.ui.components.BrandLogo
import lk.motormila.app.ui.components.BrandLogoSize
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaBg
import lk.motormila.app.ui.theme.MotormilaGood
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaWarn
import lk.motormila.app.ui.theme.rememberHaptics

private val RadiusOptionsKm = listOf(10, 25, 50, 100)

@Suppress("UNUSED_PARAMETER")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EvHubScreen(
    onBack: () -> Unit,
    onSearchModels: (query: String) -> Unit,
    onOpenListing: (Int) -> Unit,
    onChargersClick: () -> Unit = {},
    viewModel: EvHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val backCd = stringResource(R.string.hub_back)
    val refreshCd = stringResource(R.string.hub_ev_cd_refresh)

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null && (state.ev != null || state.chargers.isNotEmpty())) {
            snacks.showSnackbar(message)
            viewModel.onEvent(EvHubUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.hub_ev_title),
        onBack = {
            if (!reducedMotion) haptics.tick()
            onBack()
        },
        snackbarHostState = snacks,
        // The hero already shows the title: compact glass bar only (audit B10).
        largeTitle = false,
    ) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(EvHubUiEvent.Refresh) },
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = refreshCd },
        ) {
            when {
                state.isLoading -> EvHubSkeleton()
                state.error != null && state.ev == null && state.chargers.isEmpty() ->
                    ErrorState(
                        message = state.error ?: stringResource(R.string.hub_ev_error_title),
                        onRetry = { viewModel.onEvent(EvHubUiEvent.Refresh) },
                        modifier = Modifier.fillMaxSize(),
                    )
                state.ev == null && state.chargers.isEmpty() && state.fuelMix.isEmpty() ->
                    EmptyState(
                        title = stringResource(R.string.hub_ev_empty_title),
                        body = stringResource(R.string.hub_ev_empty_body),
                        ctaLabel = stringResource(R.string.hub_retry),
                        onCta = { viewModel.onEvent(EvHubUiEvent.Refresh) },
                        icon = Icons.Filled.ElectricCar,
                        modifier = Modifier.fillMaxSize(),
                    )
                else -> EvHubBody(
                    state = state,
                    onSearchModels = onSearchModels,
                    onRadius = { viewModel.onEvent(EvHubUiEvent.ChargerRadiusChanged(it)) },
                    onHaptic = { if (!reducedMotion) haptics.tick() },
                    onChargersClick = onChargersClick,
                )
            }
        }
    }
}

@Composable
private fun EvHubSkeleton() {
    val loadingCd = stringResource(R.string.hub_loading)
    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = loadingCd },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(5) { LoadingSkeletonCard() }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EvHubBody(
    state: EvHubUiState,
    onSearchModels: (String) -> Unit,
    onRadius: (Int) -> Unit,
    onHaptic: () -> Unit,
    onChargersClick: () -> Unit,
) {
    val ev = state.ev
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item { EvHero() }
        item {
            EvStatsGrid(
                count = ev?.count ?: 0,
                sharePct = ev?.sharePct ?: 0.0,
                avgPriceLkr = ev?.avgPriceLkr,
            )
        }
        if (state.fuelMix.isNotEmpty()) {
            item { FuelMixSection(state.fuelMix) }
        }
        if (state.visibleModels.isNotEmpty()) {
            item {
                TopModelsSection(
                    models = state.visibleModels,
                    showUpgrade = !state.unlocked && (state.hiddenModelCount > 0 || state.visibleModels.isNotEmpty()),
                    onSearchModels = { query ->
                        onHaptic()
                        onSearchModels(query)
                    },
                )
            }
        }
        item { TcoCard(state) }
        item { DecisionModules() }
        item { OwnershipGuidelines() }
        item {
            ChargersSection(
                chargers = state.chargers,
                radiusKm = state.chargerRadiusKm,
                onRadius = { km ->
                    onHaptic()
                    onRadius(km)
                },
                onSeeAll = {
                    onHaptic()
                    onChargersClick()
                },
            )
        }
        item {
            val browseLabel = stringResource(R.string.hub_ev_browse_cta)
            MotormilaPrimaryButton(
                label = browseLabel,
                leadingIcon = Icons.Filled.Search,
                onClick = {
                    onHaptic()
                    onSearchModels("electric")
                },
            )
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun EvHero() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        MotormilaEyebrow(stringResource(R.string.hub_ev_eyebrow))
        Text(
            text = stringResource(R.string.hub_ev_headline),
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
                color = MotormilaOnSurface,
            ),
        )
        Text(
            text = stringResource(R.string.hub_ev_description),
            style = MaterialTheme.typography.bodyMedium.copy(
                color = MotormilaSecondaryText,
                lineHeight = 20.sp,
            ),
        )
    }
}

@Composable
private fun EvStatsGrid(count: Int, sharePct: Double, avgPriceLkr: Double?) {
    val countCd = stringResource(R.string.hub_ev_cd_stat_count, count)
    val shareCd = stringResource(R.string.hub_ev_cd_stat_share, sharePct)
    val medianText = avgPriceLkr?.let { lk.motormila.app.ui.common.mn(it) } ?: stringResource(R.string.hub_na)
    val medianCd = stringResource(R.string.hub_ev_cd_stat_median, medianText)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MotormilaMetricTile(
            label = stringResource(R.string.hub_ev_count_label),
            value = LkrFormat.count(count),
            note = stringResource(R.string.hub_ev_count_note),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = countCd },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MotormilaMetricTile(
                label = stringResource(R.string.hub_ev_share_label),
                value = stringResource(R.string.hub_ev_share_value, sharePct),
                note = stringResource(R.string.hub_ev_share_note),
                modifier = Modifier.weight(1f).semantics { contentDescription = shareCd },
            )
            MotormilaMetricTile(
                label = stringResource(R.string.hub_ev_median_label),
                value = medianText,
                note = stringResource(R.string.hub_ev_median_note),
                modifier = Modifier.weight(1f).semantics { contentDescription = medianCd },
            )
        }
    }
}

internal fun fuelShareLabel(pct: Double?): String = when {
    pct == null -> "—"
    pct > 0.0 && pct < 1.0 -> "<1%"
    else -> "${kotlin.math.round(pct).toInt()}%"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FuelMixSection(mix: List<FuelMixBucket>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.hub_ev_fuel_mix).uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MotormilaSecondaryText,
            ),
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // A share, not a change: no "+" sign ("+95 %" read like a delta, B14);
            // largest share first.
            mix.sortedByDescending { it.pct }.forEach { bucket ->
                MotormilaMetricTile(
                    label = bucket.fuelType,
                    value = fuelShareLabel(bucket.pct),
                )
            }
        }
    }
}

@Composable
private fun TopModelsSection(
    models: List<String>,
    showUpgrade: Boolean,
    onSearchModels: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = stringResource(R.string.hub_ev_top_models).uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MotormilaSecondaryText,
            ),
        )
        models.forEach { model ->
            val searchCd = stringResource(R.string.hub_ev_search_model, model)
            MotormilaSurface(
                onClick = { onSearchModels(model) },
                modifier = Modifier.semantics { contentDescription = searchCd },
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(Icons.Filled.Bolt, contentDescription = null, tint = MotormilaPrimaryBright)
                    Column(Modifier.weight(1f)) {
                        Text(model, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        Text(
                            stringResource(R.string.hub_ev_model_listings, model),
                            style = MaterialTheme.typography.labelSmall,
                            color = MotormilaSecondaryText,
                        )
                    }
                    Icon(Icons.Filled.Search, contentDescription = null, tint = MotormilaPrimaryBright)
                }
            }
        }
        if (showUpgrade) {
            UpgradeStrip(
                title = stringResource(R.string.hub_ev_upgrade_title),
                body = stringResource(R.string.hub_ev_upgrade_body),
            )
        }
    }
}

@Composable
private fun TcoCard(state: EvHubUiState) {
    val saving = lk.motormila.app.ui.common.mn(state.annualFuelSavingLkr)
    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.TrendingDown, contentDescription = null, tint = MotormilaPrimary)
            Text(
                text = stringResource(R.string.hub_ev_tco_eyebrow).uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = MotormilaPrimaryBright,
                ),
            )
        }
        Text(
            stringResource(R.string.hub_ev_tco_title),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        )
        Text(
            stringResource(
                R.string.hub_ev_tco_body,
                saving,
                TCO_EV_PER_KM_LKR,
                TCO_PETROL_PER_KM_LKR,
                TCO_KM_PER_YEAR / 1000,
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MotormilaSecondaryText,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MotormilaMetricTile(
                label = stringResource(R.string.hub_ev_tco_petrol_label),
                value = stringResource(R.string.hub_ev_tco_per_km, TCO_PETROL_PER_KM_LKR),
                modifier = Modifier.weight(1f),
            )
            MotormilaMetricTile(
                label = stringResource(R.string.hub_ev_tco_ev_label),
                value = stringResource(R.string.hub_ev_tco_per_km, TCO_EV_PER_KM_LKR),
                modifier = Modifier.weight(1f),
            )
        }
        MotormilaMetricTile(
            label = stringResource(R.string.hub_ev_tco_savings_label),
            value = saving,
            note = state.paybackYears?.let { stringResource(R.string.hub_ev_tco_payback_value, it) }
                ?: stringResource(R.string.hub_ev_tco_disclaimer),
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            stringResource(R.string.hub_ev_tco_disclaimer),
            style = MaterialTheme.typography.labelSmall,
            color = MotormilaSecondaryText,
        )
    }
}

@Composable
private fun DecisionModules() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = stringResource(R.string.hub_ev_modules).uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MotormilaSecondaryText,
            ),
        )
        ModuleCard(
            icon = Icons.Filled.BatteryChargingFull,
            step = stringResource(R.string.hub_ev_module_battery_step),
            title = stringResource(R.string.hub_ev_module_battery_title),
            body = stringResource(R.string.hub_ev_module_battery_body),
            tint = MotormilaPrimaryBright,
        )
        ModuleCard(
            icon = Icons.Filled.Shield,
            step = stringResource(R.string.hub_ev_module_duty_step),
            title = stringResource(R.string.hub_ev_module_duty_title),
            body = stringResource(R.string.hub_ev_module_duty_body),
            tint = MotormilaGood,
        )
        ModuleCard(
            icon = Icons.Filled.Power,
            step = stringResource(R.string.hub_ev_module_charging_step),
            title = stringResource(R.string.hub_ev_module_charging_title),
            body = stringResource(R.string.hub_ev_module_charging_body),
            tint = MotormilaWarn,
        )
    }
}

@Composable
private fun ModuleCard(
    icon: ImageVector,
    step: String,
    title: String,
    body: String,
    tint: Color,
) {
    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(icon, contentDescription = null, tint = tint)
                Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
            }
            Text(step, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, color = tint))
        }
        Text(body, style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText, lineHeight = 18.sp))
    }
}

@Composable
private fun OwnershipGuidelines() {
    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            stringResource(R.string.hub_ev_ownership),
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
        )
        OwnershipTile(
            stringResource(R.string.hub_ev_own_battery_label),
            stringResource(R.string.hub_ev_own_battery_value),
            stringResource(R.string.hub_ev_own_battery_note),
        )
        OwnershipTile(
            stringResource(R.string.hub_ev_own_home_label),
            stringResource(R.string.hub_ev_own_home_value),
            stringResource(R.string.hub_ev_own_home_note),
        )
        OwnershipTile(
            stringResource(R.string.hub_ev_own_resale_label),
            stringResource(R.string.hub_ev_own_resale_value),
            stringResource(R.string.hub_ev_own_resale_note),
        )
    }
}

@Composable
private fun OwnershipTile(label: String, value: String, note: String) {
    MotormilaSurface(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                color = MotormilaSecondaryText,
            ),
        )
        Text(value, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        Text(note, style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
    }
}

@Composable
private fun ChargersSection(
    chargers: List<ChargingStation>,
    radiusKm: Int,
    onRadius: (Int) -> Unit,
    onSeeAll: () -> Unit = {},
) {
    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.Bolt, contentDescription = null, tint = MotormilaPrimary)
            Column {
                Text(
                    stringResource(R.string.hub_ev_chargers_title),
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                )
                Text(
                    stringResource(R.string.hub_ev_chargers_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MotormilaSecondaryText,
                )
            }
        }
        Text(
            stringResource(R.string.hub_ev_chargers_radius),
            style = MaterialTheme.typography.labelSmall,
            color = MotormilaSecondaryText,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RadiusOptionsKm.forEach { km ->
                MotormilaChoiceChip(
                    label = stringResource(R.string.hub_ev_radius_km, km),
                    selected = radiusKm == km,
                    onClick = { onRadius(km) },
                )
            }
        }
        if (chargers.isEmpty()) {
            Text(
                stringResource(R.string.hub_ev_chargers_empty_body),
                style = MaterialTheme.typography.bodySmall,
                color = MotormilaSecondaryText,
            )
        } else {
            chargers.forEach { station ->
                ChargerRow(station)
            }
        }
        MotormilaPrimaryButton(
            label = "Open charger map",
            onClick = onSeeAll,
        )
    }
}

@Composable
private fun ChargerRow(station: ChargingStation) {
    val distance = station.distanceKm?.let { stringResource(R.string.hub_ev_charger_distance, it) }
        ?: stringResource(R.string.hub_ev_charger_nearby)
    val place = listOfNotNull(station.town, station.address).firstOrNull().orEmpty()
    val rowCd = stringResource(R.string.hub_ev_cd_charger, station.name, distance)
    MotormilaSurface(
        modifier = Modifier.semantics { contentDescription = rowCd },
        contentPadding = PaddingValues(12.dp),
    ) {
        Row(
            Modifier.heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Filled.Bolt, contentDescription = null, tint = MotormilaGood, modifier = Modifier.size(16.dp))
            Column(Modifier.weight(1f)) {
                Text(station.name, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                if (place.isNotBlank()) {
                    Text(place, style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
                }
                if (station.connectors.isNotEmpty()) {
                    Text(
                        station.connectors.joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                }
            }
            Text(
                distance,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontFeatureSettings = "tnum",
                    color = MotormilaPrimaryBright,
                ),
            )
        }
    }
}

@Composable
private fun UpgradeStrip(title: String, body: String) {
    MotormilaSurface(
        highlighted = true,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold, color = MotormilaPrimaryBright))
        Text(body, style = MaterialTheme.typography.bodySmall, color = MotormilaSecondaryText)
    }
}
