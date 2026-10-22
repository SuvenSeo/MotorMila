package lk.motormila.app.ui.calc

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.repository.CostLine
import lk.motormila.app.domain.repository.LandedCost
import lk.motormila.app.domain.repository.Tco
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaPillTabs
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface as MotormilaPane
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.components.SlidingLkr
import lk.motormila.app.ui.theme.MotormilaOnPrimary
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.MotormilaWarn
import lk.motormila.app.ui.theme.pressKeyHaptic
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalculatorScreen(
    onBack: () -> Unit,
    onUpgrade: () -> Unit,
    viewModel: CalculatorViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val backCd = stringResource(R.string.calc_cd_back)

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            snacks.showSnackbar(message)
            viewModel.onEvent(CalculatorUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.calc_title),
        onBack = {
            if (!reducedMotion) haptics.tick()
            onBack()
        },
        snackbarHostState = snacks,
    ) {
        Column(Modifier.fillMaxSize()) {
            OfflineBanner(visible = state.offline)
            CalculatorTabs(
                selected = state.tab,
                unlocked = state.unlocked,
                onSelect = { tab ->
                    if (!reducedMotion) haptics.tick()
                    viewModel.onEvent(CalculatorUiEvent.TabSelected(tab))
                },
            )
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item { CalculatorHero() }
                item {
                    when (state.tab.takeIf { it in calculatorTabsFor(state.unlocked) } ?: CalculatorTab.LANDED) {
                        CalculatorTab.LANDED -> LandedPane(
                            state = state,
                            onForm = { viewModel.onEvent(CalculatorUiEvent.LandedFormChanged(it)) },
                            onCalculate = {
                                if (!reducedMotion) haptics.tick()
                                viewModel.onEvent(CalculatorUiEvent.CalculateLanded)
                            },
                        )
                        CalculatorTab.TCO -> ProGate(
                            unlocked = state.unlocked,
                            onUpgrade = {
                                if (!reducedMotion) haptics.tick()
                                onUpgrade()
                            },
                        ) {
                            TcoPane(
                                state = state,
                                onForm = { viewModel.onEvent(CalculatorUiEvent.TcoFormChanged(it)) },
                                onCalculate = {
                                    if (!reducedMotion) haptics.tick()
                                    viewModel.onEvent(CalculatorUiEvent.CalculateTco)
                                },
                            )
                        }
                        CalculatorTab.LEASE -> ProGate(
                            unlocked = state.unlocked,
                            onUpgrade = {
                                if (!reducedMotion) haptics.tick()
                                onUpgrade()
                            },
                        ) {
                            LeasePane(
                                state = state,
                                onForm = { viewModel.onEvent(CalculatorUiEvent.LeaseFormChanged(it)) },
                                onCalculate = {
                                    if (!reducedMotion) haptics.tick()
                                    viewModel.onEvent(CalculatorUiEvent.CalculateLease)
                                },
                            )
                        }
                        CalculatorTab.OWNERSHIP -> ProGate(
                            unlocked = state.unlocked,
                            onUpgrade = {
                                if (!reducedMotion) haptics.tick()
                                onUpgrade()
                            },
                        ) {
                            OwnershipPane(
                                state = state,
                                onForm = { viewModel.onEvent(CalculatorUiEvent.OwnershipFormChanged(it)) },
                                onCalculate = {
                                    if (!reducedMotion) haptics.tick()
                                    viewModel.onEvent(CalculatorUiEvent.CalculateOwnership)
                                },
                            )
                        }
                        CalculatorTab.PERMITS -> ProGate(
                            unlocked = state.unlocked,
                            onUpgrade = {
                                if (!reducedMotion) haptics.tick()
                                onUpgrade()
                            },
                        ) {
                            PermitsPane(
                                state = state,
                                onRefresh = {
                                    if (!reducedMotion) haptics.tick()
                                    viewModel.onEvent(CalculatorUiEvent.LoadPermits)
                                },
                            )
                        }
                        CalculatorTab.DEPRECIATION -> ProGate(
                            unlocked = state.unlocked,
                            onUpgrade = {
                                if (!reducedMotion) haptics.tick()
                                onUpgrade()
                            },
                        ) {
                            DepreciationPane(
                                state = state,
                                onForm = { viewModel.onEvent(CalculatorUiEvent.DepreciationFormChanged(it)) },
                                onCalculate = {
                                    if (!reducedMotion) haptics.tick()
                                    viewModel.onEvent(CalculatorUiEvent.CalculateDepreciation)
                                },
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
private fun CalculatorTabs(
    selected: CalculatorTab,
    unlocked: Boolean,
    onSelect: (CalculatorTab) -> Unit,
) {
    // Web parity (Calculator.tsx visibleTabsFor): locked tabs are hidden, not
    // teased (Pro isn't on sale), and Permits/Depreciation stay hidden for
    // everyone — they are hard-coded benchmark tables, not real calculators.
    val tabs = calculatorTabsFor(unlocked).map { tab ->
        tab to when (tab) {
            CalculatorTab.LANDED -> stringResource(R.string.calc_tab_landed)
            CalculatorTab.TCO -> stringResource(R.string.calc_tab_tco)
            CalculatorTab.LEASE -> stringResource(R.string.calc_tab_lease)
            CalculatorTab.OWNERSHIP -> stringResource(R.string.calc_tab_ownership)
            CalculatorTab.PERMITS -> stringResource(R.string.calc_tab_permits)
            CalculatorTab.DEPRECIATION -> stringResource(R.string.calc_tab_depreciation)
        }
    }
    if (tabs.size < 2) return
    val selectedIndex = tabs.indexOfFirst { it.first == selected }.coerceAtLeast(0)
    MotormilaPillTabs(
        tabs = tabs.map { it.second },
        selected = selectedIndex,
        onSelect = { onSelect(tabs[it].first) },
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun CalculatorHero() {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(top = 8.dp),
    ) {
        Surface(
            shape = MotormilaRadius.pill,
            color = MotormilaSurfaceHigh,
            border = BorderStroke(1.dp, MotormilaOutline),
        ) {
            Text(
                text = "• ${stringResource(R.string.calc_eyebrow).uppercase()}",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = MotormilaPrimaryBright,
                ),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        Text(
            text = stringResource(R.string.calc_headline),
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
                color = MotormilaOnSurface,
            ),
        )
        Text(
            text = stringResource(R.string.calc_description),
            style = MaterialTheme.typography.bodyMedium.copy(
                color = MotormilaSecondaryText,
                lineHeight = 20.sp,
            ),
        )
    }
}

/** Visible calculator tabs for a plan (unit-tested). */
internal fun calculatorTabsFor(unlocked: Boolean): List<CalculatorTab> =
    if (unlocked) listOf(CalculatorTab.LANDED, CalculatorTab.LEASE, CalculatorTab.TCO, CalculatorTab.OWNERSHIP)
    else listOf(CalculatorTab.LANDED)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProGate(
    unlocked: Boolean,
    onUpgrade: () -> Unit,
    content: @Composable () -> Unit,
) {
    if (unlocked) {
        content()
    } else {
        TcoLockedCard(onUpgrade = onUpgrade)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LandedPane(
    state: CalculatorUiState,
    onForm: (LandedForm) -> Unit,
    onCalculate: () -> Unit,
) {
    val form = state.landedForm
    val haptics = rememberHaptics()
    val calculateCd = stringResource(R.string.calc_cd_calculate_landed)
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MotormilaPane(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Filled.AccountBalanceWallet,
                        contentDescription = null,
                        tint = MotormilaPrimary,
                    )
                    Column {
                        Text(
                            stringResource(R.string.calc_import_config),
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        )
                        Text(
                            stringResource(R.string.calc_import_config_hint),
                            style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                        )
                    }
                }
                CalcTextField(
                    label = stringResource(R.string.calc_cif_lkr),
                    value = form.cifLkr,
                    keyboardType = KeyboardType.Number,
                    onChange = { onForm(form.copy(cifLkr = it)) },
                )
                AmountPreview(form.cifLkr)
                CalcTextField(
                    label = stringResource(R.string.calc_engine_cc),
                    value = form.engineCc,
                    keyboardType = KeyboardType.Number,
                    onChange = { onForm(form.copy(engineCc = it)) },
                )
                if (CalculatorInputs.showHybridCliff(form)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Filled.Warning,
                            contentDescription = null,
                            tint = MotormilaWarn,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            stringResource(R.string.calc_hybrid_cliff),
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = MotormilaWarn,
                                fontWeight = FontWeight.SemiBold,
                            ),
                        )
                    }
                }
                Text(
                    stringResource(R.string.calc_fuel_category),
                    style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CalculatorFuelType.entries.forEach { fuel ->
                        val label = fuelLabel(fuel)
                        val fuelCd = stringResource(R.string.calc_cd_fuel, label)
                        MotormilaChoiceChip(
                            label = label,
                            selected = form.fuelType == fuel,
                            onClick = { onForm(form.copy(fuelType = fuel)) },
                            compact = true,
                            modifier = Modifier.semantics { contentDescription = fuelCd },
                        )
                    }
                }
                CalcTextField(
                    label = stringResource(R.string.calc_year_optional),
                    value = form.year,
                    keyboardType = KeyboardType.Number,
                    onChange = { onForm(form.copy(year = it)) },
                )
                Text(
                    stringResource(R.string.calc_fx_hint),
                    style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                )
                ValidationText(state.validation)
                MotormilaPrimaryButton(
                    label = if (state.calculatingLanded) {
                        stringResource(R.string.calc_calculating)
                    } else {
                        stringResource(R.string.calc_calculate_landed)
                    },
                    onClick = onCalculate,
                    enabled = !state.calculatingLanded,
                    loading = state.calculatingLanded,
                    modifier = Modifier.semantics { contentDescription = calculateCd }.pressKeyHaptic(haptics),
                )
        }
        LandedResultCard(result = state.landed, calculating = state.calculatingLanded)
    }
}

@Composable
private fun TcoPane(
    state: CalculatorUiState,
    onForm: (TcoForm) -> Unit,
    onCalculate: () -> Unit,
) {
    val form = state.tcoForm
    val haptics = rememberHaptics()
    val calculateCd = stringResource(R.string.calc_cd_calculate_tco)
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MotormilaPane(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Filled.Speed, contentDescription = null, tint = MotormilaPrimary)
                    Column {
                        Text(
                            stringResource(R.string.calc_tco_assumptions),
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        )
                        Text(
                            stringResource(R.string.calc_tco_assumptions_hint),
                            style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                        )
                    }
                }
                CalcTextField(
                    label = stringResource(R.string.calc_purchase_price),
                    value = form.priceLkr,
                    keyboardType = KeyboardType.Number,
                    onChange = { onForm(form.copy(priceLkr = it)) },
                )
                AmountPreview(form.priceLkr)
                CalcTextField(
                    label = stringResource(R.string.calc_monthly_km),
                    value = form.monthlyKm,
                    keyboardType = KeyboardType.Number,
                    onChange = { onForm(form.copy(monthlyKm = it)) },
                )
                CalcTextField(
                    label = stringResource(R.string.calc_km_per_litre),
                    value = form.kmPerLitre,
                    keyboardType = KeyboardType.Decimal,
                    onChange = { onForm(form.copy(kmPerLitre = it)) },
                )
                CalcTextField(
                    label = stringResource(R.string.calc_years),
                    value = form.years,
                    keyboardType = KeyboardType.Number,
                    onChange = { onForm(form.copy(years = it)) },
                )
                ValidationText(state.validation)
                MotormilaPrimaryButton(
                    label = if (state.calculatingTco) {
                        stringResource(R.string.calc_calculating)
                    } else {
                        stringResource(R.string.calc_calculate_tco)
                    },
                    onClick = onCalculate,
                    enabled = !state.calculatingTco,
                    loading = state.calculatingTco,
                    modifier = Modifier.semantics { contentDescription = calculateCd }.pressKeyHaptic(haptics),
                )
        }
        TcoResultCard(result = state.tco, calculating = state.calculatingTco)
    }
}

@Composable
private fun TcoLockedCard(onUpgrade: () -> Unit) {
    val upgradeCd = stringResource(R.string.calc_cd_upgrade)
    MotormilaPane(
        highlighted = true,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Lock, contentDescription = null, tint = MotormilaPrimaryBright)
                Text(
                    stringResource(R.string.calc_tco_locked_title),
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontWeight = FontWeight.Bold,
                        color = MotormilaPrimaryBright,
                    ),
                )
            }
            Text(
                stringResource(R.string.calc_tco_locked_body),
                style = MaterialTheme.typography.bodySmall,
                color = MotormilaSecondaryText,
            )
            MotormilaPrimaryButton(
                label = stringResource(R.string.calc_upgrade),
                onClick = onUpgrade,
                modifier = Modifier.semantics { contentDescription = upgradeCd },
            )
    }
}

@Composable
private fun LandedResultCard(result: LandedCost?, calculating: Boolean) {
    MotormilaPane(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                stringResource(R.string.calc_breakdown),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                stringResource(R.string.calc_breakdown_hint),
                style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
            )
            when {
                calculating && result == null -> {
                    // Skeleton (not a spinner): result rows shimmer in place.
                    CalcResultSkeleton()
                }
                result == null -> {
                    Text(
                        stringResource(R.string.calc_empty_result),
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
                }
                else -> {
                    CostLineRow(stringResource(R.string.calc_base_cif), result.cifLkr)
                    result.breakdown.forEach { line ->
                        if (line.amountLkr > 0) {
                            CostLineRow(costLineLabel(line), line.amountLkr)
                        }
                    }
                    Surface(
                        shape = MotormilaRadius.lg,
                        color = MotormilaPrimary.copy(alpha = 0.08f),
                        border = BorderStroke(1.dp, MotormilaPrimary.copy(alpha = 0.25f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                stringResource(R.string.calc_est_landed).uppercase(),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp,
                                    color = MotormilaPrimaryBright,
                                ),
                            )
                            // Animated digits in millions (web parity: number-flow in Mn).
                            lk.motormila.app.ui.components.MmPrice(
                                value = result.totalLkr,
                                style = lk.motormila.app.ui.theme.MmType.current.priceL,
                            )
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    stringResource(R.string.calc_total_taxes),
                                    style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                                )
                                Text(
                                    "+${lk.motormila.app.ui.components.MmPriceFormat.compact(result.dutyLkr + result.vatLkr + result.palLkr)}",
                                    style = MaterialTheme.typography.labelMedium.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontFeatureSettings = "tnum",
                                        color = MotormilaPrimaryBright,
                                    ),
                                )
                            }
                        }
                    }
                    Text(
                        stringResource(R.string.calc_indicative),
                        style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                    )
                }
            }
    }
}

@Composable
private fun TcoResultCard(result: Tco?, calculating: Boolean) {
    MotormilaPane(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                stringResource(R.string.calc_tco_breakdown),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                stringResource(R.string.calc_tco_breakdown_hint),
                style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
            )
            when {
                calculating && result == null -> {
                    // Skeleton (not a spinner): result rows shimmer in place.
                    CalcResultSkeleton()
                }
                result == null -> {
                    Text(
                        stringResource(R.string.calc_empty_result),
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
                }
                else -> {
                    CostLineRow(stringResource(R.string.calc_tco_purchase), result.purchaseLkr)
                    CostLineRow(stringResource(R.string.calc_tco_fuel), result.fuelLkr)
                    CostLineRow(stringResource(R.string.calc_tco_service), result.serviceLkr)
                    Surface(
                        shape = MotormilaRadius.lg,
                        color = MotormilaPrimary.copy(alpha = 0.08f),
                        border = BorderStroke(1.dp, MotormilaPrimary.copy(alpha = 0.25f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                stringResource(R.string.calc_tco_monthly).uppercase(),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp,
                                    color = MotormilaPrimaryBright,
                                ),
                            )
                            Text(
                                lk.motormila.app.ui.components.MmPriceFormat.monthly(result.monthlyLkr),
                                style = MaterialTheme.typography.headlineMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontFeatureSettings = "tnum",
                                    color = MotormilaOnSurface,
                                ),
                            )
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    stringResource(R.string.calc_tco_total),
                                    style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                                )
                                Text(
                                    lk.motormila.app.ui.components.MmPriceFormat.compact(result.totalLkr),
                                    style = MaterialTheme.typography.titleSmall.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontFeatureSettings = "tnum",
                                        color = MotormilaPrimaryBright,
                                    ),
                                )
                            }
                        }
                    }
                    Text(
                        stringResource(R.string.calc_indicative),
                        style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                    )
                }
            }
    }
}

@Composable
private fun LeasePane(
    state: CalculatorUiState,
    onForm: (LeaseForm) -> Unit,
    onCalculate: () -> Unit,
) {
    val form = state.leaseForm
    val haptics = rememberHaptics()
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MotormilaPane(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                stringResource(R.string.calc_lease_title),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                stringResource(R.string.calc_lease_hint),
                style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
            )
            CalcTextField(
                label = stringResource(R.string.calc_purchase_price),
                value = form.priceLkr,
                keyboardType = KeyboardType.Number,
                onChange = { onForm(form.copy(priceLkr = it)) },
            )
            AmountPreview(form.priceLkr)
            CalcTextField(
                label = stringResource(R.string.calc_lease_down_pct),
                value = form.downPct,
                keyboardType = KeyboardType.Decimal,
                onChange = { onForm(form.copy(downPct = it)) },
            )
            CalcTextField(
                label = stringResource(R.string.calc_lease_rate_pct),
                value = form.ratePct,
                keyboardType = KeyboardType.Decimal,
                onChange = { onForm(form.copy(ratePct = it)) },
            )
            CalcTextField(
                label = stringResource(R.string.calc_years),
                value = form.years,
                keyboardType = KeyboardType.Number,
                onChange = { onForm(form.copy(years = it)) },
            )
            ValidationText(state.validation)
            MotormilaPrimaryButton(
                label = stringResource(R.string.calc_calculate_lease),
                onClick = onCalculate,
                modifier = Modifier.pressKeyHaptic(haptics),
            )
        }
        state.lease?.let { quote ->
            MotormilaPane(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CostLineRow(stringResource(R.string.calc_lease_principal), quote.principalLkr)
                CostLineRow(stringResource(R.string.calc_lease_monthly), quote.monthlyLkr, monthly = true)
                CostLineRow(stringResource(R.string.calc_lease_interest), quote.totalInterestLkr)
                CostLineRow(stringResource(R.string.calc_lease_total_paid), quote.totalPaidLkr)
                if (quote.ltvBreached) {
                    Text(
                        stringResource(R.string.calc_lease_ltv_warn),
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = MotormilaWarn,
                            fontWeight = FontWeight.SemiBold,
                        ),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OwnershipPane(
    state: CalculatorUiState,
    onForm: (OwnershipForm) -> Unit,
    onCalculate: () -> Unit,
) {
    val form = state.ownershipForm
    val haptics = rememberHaptics()
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MotormilaPane(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                stringResource(R.string.calc_ownership_title),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                stringResource(R.string.calc_ownership_hint),
                style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
            )
            CalcTextField(
                label = stringResource(R.string.calc_engine_cc),
                value = form.engineCc,
                keyboardType = KeyboardType.Number,
                onChange = { onForm(form.copy(engineCc = it)) },
            )
            Text(
                stringResource(R.string.calc_fuel_category),
                style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CalculatorFuelType.entries.forEach { fuel ->
                    MotormilaChoiceChip(
                        label = fuelLabel(fuel),
                        selected = form.fuelType == fuel,
                        onClick = { onForm(form.copy(fuelType = fuel)) },
                        compact = true,
                    )
                }
            }
            CalcTextField(
                label = stringResource(R.string.calc_ownership_consideration),
                value = form.considerationLkr,
                keyboardType = KeyboardType.Number,
                onChange = { onForm(form.copy(considerationLkr = it)) },
            )
            MotormilaChoiceChip(
                label = stringResource(R.string.calc_ownership_include_transfer),
                selected = form.includeTransfer,
                onClick = { onForm(form.copy(includeTransfer = !form.includeTransfer)) },
            )
            ValidationText(state.validation)
            MotormilaPrimaryButton(
                label = if (state.calculatingOwnership) {
                    stringResource(R.string.calc_calculating)
                } else {
                    stringResource(R.string.calc_calculate_ownership)
                },
                onClick = onCalculate,
                enabled = !state.calculatingOwnership,
                loading = state.calculatingOwnership,
                modifier = Modifier.pressKeyHaptic(haptics),
            )
        }
        state.ownership?.let { bundle ->
            MotormilaPane(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CostLineRow(stringResource(R.string.calc_ownership_revenue), bundle.revenueLicenceLkr)
                CostLineRow(stringResource(R.string.calc_ownership_insurance), bundle.insuranceLkr)
                CostLineRow(stringResource(R.string.calc_ownership_transfer), bundle.transferFeesLkr)
                CostLineRow(stringResource(R.string.calc_ownership_emission), bundle.emissionTestLkr)
                CostLineRow(stringResource(R.string.calc_ownership_total), bundle.firstYearTotalLkr)
                if (bundle.notes.isNotBlank()) {
                    Text(
                        bundle.notes,
                        style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                    )
                }
            }
        }
    }
}

@Composable
private fun PermitsPane(
    state: CalculatorUiState,
    onRefresh: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MotormilaPane(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                stringResource(R.string.calc_permits_title),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                stringResource(R.string.calc_permits_hint),
                style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
            )
            MotormilaPrimaryButton(
                label = if (state.loadingPermits) {
                    stringResource(R.string.calc_calculating)
                } else {
                    stringResource(R.string.calc_permits_refresh)
                },
                onClick = onRefresh,
                enabled = !state.loadingPermits,
                loading = state.loadingPermits,
            )
        }
        when {
            state.loadingPermits && state.permits.isEmpty() -> {
                MotormilaPane {
                    CalcResultSkeleton()
                }
            }
            state.permits.isEmpty() -> {
                MotormilaPane {
                    Text(
                        stringResource(R.string.calc_permits_empty),
                        style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
                    )
                }
            }
            else -> {
                state.permits.forEach { permit ->
                    MotormilaPane(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            permit.name,
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                        )
                        Text(
                            permit.type.ifBlank { "—" },
                            style = MaterialTheme.typography.labelSmall.copy(color = MotormilaSecondaryText),
                        )
                        Text(
                            lk.motormila.app.ui.components.MmPriceFormat.compact(permit.marketPriceLkr),
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontFeatureSettings = "tnum",
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DepreciationPane(
    state: CalculatorUiState,
    onForm: (DepreciationForm) -> Unit,
    onCalculate: () -> Unit,
) {
    val form = state.depreciationForm
    val haptics = rememberHaptics()
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MotormilaPane(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                stringResource(R.string.calc_depreciation_title),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                stringResource(R.string.calc_depreciation_hint),
                style = MaterialTheme.typography.bodySmall.copy(color = MotormilaSecondaryText),
            )
            CalcTextField(
                label = stringResource(R.string.calc_purchase_price),
                value = form.priceLkr,
                keyboardType = KeyboardType.Number,
                onChange = { onForm(form.copy(priceLkr = it)) },
            )
            AmountPreview(form.priceLkr)
            ValidationText(state.validation)
            MotormilaPrimaryButton(
                label = stringResource(R.string.calc_calculate_depreciation),
                onClick = onCalculate,
                modifier = Modifier.pressKeyHaptic(haptics),
            )
        }
        if (state.depreciation.isNotEmpty()) {
            MotormilaPane(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                state.depreciation.forEach { point ->
                    CostLineRow(point.yearLabel, point.valueLkr)
                }
            }
        }
    }
}

@Composable
private fun CostLineRow(label: String, amountLkr: Double, monthly: Boolean = false) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium.copy(color = MotormilaSecondaryText))
        Text(
            if (monthly) lk.motormila.app.ui.components.MmPriceFormat.monthly(amountLkr)
            else lk.motormila.app.ui.components.MmPriceFormat.compact(amountLkr),
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = FontWeight.SemiBold,
                fontFeatureSettings = "tnum",
            ),
        )
    }
}

@Composable
private fun costLineLabel(line: CostLine): String = when (line.label.lowercase()) {
    "cid" -> stringResource(R.string.calc_line_cid)
    "surcharge" -> stringResource(R.string.calc_line_surcharge)
    "excise" -> stringResource(R.string.calc_line_excise)
    "sscl (pal)", "sscl" -> stringResource(R.string.calc_line_sscl)
    "vat" -> stringResource(R.string.calc_line_vat)
    "luxury tax" -> stringResource(R.string.calc_line_luxury)
    else -> line.label
}

@Composable
private fun fuelLabel(fuel: CalculatorFuelType): String = when (fuel) {
    CalculatorFuelType.PETROL -> stringResource(R.string.calc_fuel_petrol)
    CalculatorFuelType.DIESEL -> stringResource(R.string.calc_fuel_diesel)
    CalculatorFuelType.HYBRID -> stringResource(R.string.calc_fuel_hybrid)
    CalculatorFuelType.ELECTRIC -> stringResource(R.string.calc_fuel_electric)
}

@Composable
private fun ValidationText(reason: CalculatorValidation?) {
    val message = validationMessage(reason) ?: return
    Text(
        text = message,
        style = MaterialTheme.typography.labelSmall.copy(
            color = MotormilaWarn,
            fontWeight = FontWeight.SemiBold,
        ),
    )
}

@Composable
private fun validationMessage(reason: CalculatorValidation?): String? {
    if (reason == null) return null
    return stringResource(
        when (reason) {
            CalculatorValidation.CIF_REQUIRED -> R.string.calc_error_cif
            CalculatorValidation.ENGINE_CC_REQUIRED -> R.string.calc_error_engine_cc
            CalculatorValidation.YEAR_INVALID -> R.string.calc_error_year
            CalculatorValidation.PRICE_REQUIRED -> R.string.calc_error_price
            CalculatorValidation.MONTHLY_KM_REQUIRED -> R.string.calc_error_monthly_km
            CalculatorValidation.KM_PER_LITRE_REQUIRED -> R.string.calc_error_kmpl
            CalculatorValidation.YEARS_INVALID -> R.string.calc_error_years
            CalculatorValidation.DOWN_PCT_INVALID -> R.string.calc_error_down_pct
            CalculatorValidation.RATE_PCT_INVALID -> R.string.calc_error_rate_pct
            CalculatorValidation.CONSIDERATION_REQUIRED -> R.string.calc_error_consideration
        },
    )
}

@Composable
private fun AmountPreview(raw: String) {
    val amount = CalculatorInputs.parsePositiveAmount(raw) ?: return
    Text(
        text = "= " + lk.motormila.app.ui.components.MmPriceFormat.compact(amount),
        style = MaterialTheme.typography.labelSmall.copy(
            fontFeatureSettings = "tnum",
            color = MotormilaSecondaryText,
        ),
    )
}

@Composable
private fun CalcTextField(
    label: String,
    value: String,
    keyboardType: KeyboardType,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        shape = MotormilaRadius.lg,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MotormilaPrimary,
            unfocusedBorderColor = MotormilaOutline,
            focusedContainerColor = MotormilaSurface,
            unfocusedContainerColor = MotormilaSurface,
            focusedTextColor = MotormilaOnSurface,
            unfocusedTextColor = MotormilaOnSurface,
            focusedLabelColor = MotormilaPrimaryBright,
            unfocusedLabelColor = MotormilaSecondaryText,
        ),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
    )
}


/** Shimmer placeholder for calculator / permit result blocks (replaces spinners). */
@Composable
private fun CalcResultSkeleton() {
    val calculatingCd = androidx.compose.ui.res.stringResource(lk.motormila.app.R.string.calculating_cd)
    Column(
        Modifier
            .fillMaxWidth()
            .semantics { contentDescription = calculatingCd },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        lk.motormila.app.ui.components.MmSkeleton(width = 140.dp, height = 12.dp)
        lk.motormila.app.ui.components.MmSkeleton(Modifier.fillMaxWidth(), height = 28.dp)
        lk.motormila.app.ui.components.MmSkeleton(width = 200.dp, height = 12.dp)
    }
}
