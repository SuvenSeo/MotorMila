package lk.motormila.app.ui.pulse

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.CellTower
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.MarketSignal
import lk.motormila.app.domain.model.Permit
import lk.motormila.app.domain.model.VehicleNews
import lk.motormila.app.ui.components.EmptyState
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaPillTabs
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPrimary
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaRadius
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.MotormilaSurfaceHigh
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OfficialPulseScreen(
    onBack: () -> Unit,
    onOpenUrl: (url: String) -> Unit,
    onOpenSignal: (Int) -> Unit = {},
    viewModel: OfficialPulseViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val backCd = stringResource(R.string.hub_back)
    val refreshCd = stringResource(R.string.hub_pulse_cd_refresh)

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null && (state.signals.isNotEmpty() || state.news.isNotEmpty() || state.permits.isNotEmpty())) {
            snacks.showSnackbar(message)
            viewModel.onEvent(OfficialPulseUiEvent.DismissError)
        }
    }

    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.hub_pulse_title),
        onBack = {
            if (!reducedMotion) haptics.tick()
            onBack()
        },
        snackbarHostState = snacks,
    ) {
        Column(Modifier.fillMaxSize()) {
            PulseTabs(
                selected = state.section,
                onSelect = { section ->
                    if (!reducedMotion) haptics.tick()
                    viewModel.onEvent(OfficialPulseUiEvent.SectionChanged(section))
                },
            )
            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { viewModel.onEvent(OfficialPulseUiEvent.Refresh) },
                modifier = Modifier
                    .fillMaxSize()
                    .semantics { contentDescription = refreshCd },
            ) {
                when {
                    state.isLoading -> PulseSkeleton()
                    state.error != null && state.signals.isEmpty() && state.news.isEmpty() && state.permits.isEmpty() ->
                        ErrorState(
                            message = state.error ?: stringResource(R.string.hub_pulse_error_title),
                            onRetry = { viewModel.onEvent(OfficialPulseUiEvent.Refresh) },
                            modifier = Modifier.fillMaxSize(),
                        )
                    else -> when (state.section) {
                        PulseSection.SIGNALS -> SignalsPane(
                            state = state,
                            onOpenSignal = onOpenSignal,
                            onFilter = { viewModel.onEvent(OfficialPulseUiEvent.SourceFilterChanged(it)) },
                            onHaptic = { if (!reducedMotion) haptics.tick() },
                        )
                        PulseSection.NEWS -> NewsPane(
                            state = state,
                            onOpenUrl = onOpenUrl,
                            onHaptic = { if (!reducedMotion) haptics.tick() },
                        )
                        PulseSection.PERMITS -> PermitsPane(state)
                    }
                }
            }
        }
    }
}

@Composable
private fun PulseTabs(selected: PulseSection, onSelect: (PulseSection) -> Unit) {
    val tabs = listOf(
        PulseSection.SIGNALS to stringResource(R.string.hub_pulse_tab_signals),
        PulseSection.NEWS to stringResource(R.string.hub_pulse_tab_news),
        PulseSection.PERMITS to stringResource(R.string.hub_pulse_tab_permits),
    )
    val selectedIndex = tabs.indexOfFirst { it.first == selected }.coerceAtLeast(0)
    MotormilaPillTabs(
        tabs = tabs.map { it.second },
        selected = selectedIndex,
        onSelect = { onSelect(tabs[it].first) },
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun PulseSkeleton() {
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

@Composable
private fun PulseHero() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        Surface(
            shape = MotormilaRadius.pill,
            color = MotormilaSurfaceHigh,
            border = BorderStroke(1.dp, MotormilaOutline),
        ) {
            Text(
                text = "• ${stringResource(R.string.hub_pulse_eyebrow).uppercase()}",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = MotormilaPrimaryBright,
                ),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        Text(
            text = stringResource(R.string.hub_pulse_headline),
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
                color = MotormilaOnSurface,
            ),
        )
        Text(
            text = stringResource(R.string.hub_pulse_description),
            style = MaterialTheme.typography.bodyMedium.copy(
                color = MotormilaSecondaryText,
                lineHeight = 20.sp,
            ),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SignalsPane(
    state: OfficialPulseUiState,
    onOpenSignal: (Int) -> Unit,
    onFilter: (String) -> Unit,
    onHaptic: () -> Unit,
) {
    val visible = state.visibleSignals
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item { PulseHero() }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Surface(
                    shape = MotormilaRadius.lg,
                    color = MotormilaSurfaceHigh,
                    border = BorderStroke(1.dp, MotormilaOutline),
                    modifier = Modifier.weight(1f),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            stringResource(R.string.hub_pulse_signals_count, state.signals.size),
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                }
                Surface(
                    shape = MotormilaRadius.lg,
                    color = MotormilaSurfaceHigh,
                    border = BorderStroke(1.dp, MotormilaOutline),
                    modifier = Modifier.weight(1f),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            stringResource(R.string.hub_pulse_sources_count, state.sourceKeys.size),
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                }
            }
        }
        if (state.sourceKeys.isNotEmpty()) {
            item {
                val filterAria = stringResource(R.string.hub_pulse_filter_aria)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.semantics { contentDescription = filterAria },
                ) {
                    SourceChip(
                        label = stringResource(R.string.hub_pulse_all_sources),
                        selected = state.sourceFilter == OfficialPulseUiState.SOURCE_ALL,
                        onClick = {
                            onHaptic()
                            onFilter(OfficialPulseUiState.SOURCE_ALL)
                        },
                    )
                    state.sourceKeys.forEach { key ->
                        SourceChip(
                            label = pulseSourceLabel(key),
                            selected = state.sourceFilter.equals(key, ignoreCase = true),
                            onClick = {
                                onHaptic()
                                onFilter(key)
                            },
                        )
                    }
                }
            }
        }
        if (visible.isEmpty()) {
            item {
                EmptyState(
                    title = stringResource(R.string.hub_pulse_signals_empty_title),
                    body = if (state.sourceFilter == OfficialPulseUiState.SOURCE_ALL) {
                        stringResource(R.string.hub_pulse_signals_empty_body)
                    } else {
                        stringResource(R.string.hub_pulse_signals_filtered_empty)
                    },
                    ctaLabel = null,
                    onCta = null,
                    icon = Icons.Filled.CellTower,
                )
            }
        } else {
            items(visible, key = { it.id }) { signal ->
                SignalCard(signal = signal, onOpenSignal = onOpenSignal, onHaptic = onHaptic)
            }
            if (!state.unlocked) {
                item {
                    PulseUpgradeStrip()
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun SourceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    MotormilaChoiceChip(
        label = label,
        selected = selected,
        onClick = onClick,
        compact = true,
    )
}

@Composable
private fun SignalCard(
    signal: MarketSignal,
    onOpenSignal: (Int) -> Unit,
    onHaptic: () -> Unit,
) {
    val title = signalTitle(signal)
    val url = signal.sourceUrl
    val cardCd = stringResource(R.string.hub_pulse_cd_signal, title)
    val openCd = stringResource(R.string.hub_pulse_cd_open_url, title)
    MotormilaSurface(
        onClick = {
            onHaptic()
            onOpenSignal(signal.id)
        },
        modifier = Modifier.semantics { contentDescription = cardCd },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
            Text(
                text = "${pulseSourceLabel(signal.source)} · ${PulseLabels.signalTypeLabel(signal.signalType)}",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp,
                    color = MotormilaPrimaryBright,
                ),
            )
            Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
            Text(
                formatPulseValue(signal),
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontFeatureSettings = "tnum",
                ),
            )
            Text(
                pulsePeriodLabel(signal),
                style = MaterialTheme.typography.labelSmall,
                color = MotormilaSecondaryText,
            )
            if (!url.isNullOrBlank()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = openCd },
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.OpenInNew,
                        contentDescription = null,
                        tint = MotormilaPrimaryBright,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        stringResource(R.string.hub_pulse_open_source),
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = MotormilaPrimaryBright,
                        ),
                    )
                }
            }
    }
}

@Composable
private fun NewsPane(
    state: OfficialPulseUiState,
    onOpenUrl: (String) -> Unit,
    onHaptic: () -> Unit,
) {
    val visible = state.visibleNews
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item { PulseHero() }
        if (visible.isEmpty()) {
            item {
                EmptyState(
                    title = stringResource(R.string.hub_pulse_news_empty_title),
                    body = stringResource(R.string.hub_pulse_news_empty_body),
                    ctaLabel = null,
                    onCta = null,
                    icon = Icons.Filled.Article,
                )
            }
        } else {
            items(visible, key = { it.id }) { item ->
                NewsCard(item = item, onOpenUrl = onOpenUrl, onHaptic = onHaptic)
            }
            if (!state.unlocked) {
                item { PulseUpgradeStrip() }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun NewsCard(
    item: VehicleNews,
    onOpenUrl: (String) -> Unit,
    onHaptic: () -> Unit,
) {
    val url = item.url
    val newsCd = stringResource(R.string.hub_pulse_cd_news, item.title)
    MotormilaSurface(
        onClick = if (!url.isNullOrBlank()) {
            {
                onHaptic()
                onOpenUrl(url)
            }
        } else {
            null
        },
        modifier = Modifier.semantics { contentDescription = newsCd },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
            Text(
                text = item.source.ifBlank { stringResource(R.string.hub_pulse_news_source_fallback) }.uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp,
                    color = MotormilaPrimaryBright,
                ),
            )
            Text(item.title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
            if (item.timeLabel.isNotBlank()) {
                Text(item.timeLabel, style = MaterialTheme.typography.labelSmall, color = MotormilaSecondaryText)
            }
            if (!url.isNullOrBlank()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.OpenInNew,
                        contentDescription = null,
                        tint = MotormilaPrimaryBright,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        stringResource(R.string.hub_pulse_open_source),
                        style = MaterialTheme.typography.labelMedium.copy(color = MotormilaPrimaryBright),
                    )
                }
            }
    }
}

@Composable
private fun PermitsPane(state: OfficialPulseUiState) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OfflineBanner(visible = state.offline) }
        item { PulseHero() }
        if (state.permits.isEmpty()) {
            item {
                EmptyState(
                    title = stringResource(R.string.hub_pulse_permits_empty_title),
                    body = stringResource(R.string.hub_pulse_permits_empty_body),
                    ctaLabel = null,
                    onCta = null,
                )
            }
        } else {
            items(
                state.permits,
                key = { permit -> permit.id ?: "${permit.name}-${permit.type}".hashCode() },
            ) { permit ->
                PermitCard(permit)
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun PermitCard(permit: Permit) {
    val price = lk.motormila.app.ui.common.mn(permit.marketPriceLkr)
    val cd = stringResource(R.string.hub_pulse_cd_permit, permit.name, price)
    MotormilaSurface(modifier = Modifier.semantics { contentDescription = cd }) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(permit.name, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                if (permit.type.isNotBlank()) {
                    Text(
                        permit.type,
                        style = MaterialTheme.typography.labelSmall,
                        color = MotormilaSecondaryText,
                    )
                }
            }
            Text(
                price,
                style = MaterialTheme.typography.titleSmall.copy(
                    fontWeight = FontWeight.Bold,
                    fontFeatureSettings = "tnum",
                    color = MotormilaPrimaryBright,
                ),
            )
        }
    }
}

@Composable
private fun PulseUpgradeStrip() {
    MotormilaSurface(
        highlighted = true,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
            Text(
                stringResource(R.string.hub_pulse_upgrade_title),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold, color = MotormilaPrimaryBright),
            )
            Text(
                stringResource(R.string.hub_pulse_upgrade_body),
                style = MaterialTheme.typography.bodySmall,
                color = MotormilaSecondaryText,
            )
    }
}

@Composable
private fun pulseSourceLabel(raw: String): String {
    val key = raw.lowercase().trim()
    return when (key) {
        "dmt" -> stringResource(R.string.hub_pulse_source_dmt)
        "customs" -> stringResource(R.string.hub_pulse_source_customs)
        "import_parity" -> stringResource(R.string.hub_pulse_source_import_parity)
        "import_reference" -> stringResource(R.string.hub_pulse_source_import_reference)
        "cbsl" -> stringResource(R.string.hub_pulse_source_cbsl)
        "dcs" -> stringResource(R.string.hub_pulse_source_dcs)
        else -> raw.replace('_', ' ').replaceFirstChar { it.titlecase() }
    }
}

@Composable
private fun signalTitle(signal: MarketSignal): String = PulseLabels.title(signal)

@Composable
private fun formatPulseValue(signal: MarketSignal): String {
    return PulseLabels.value(signal) { lk.motormila.app.ui.common.mn(it) } ?: stringResource(R.string.hub_na)
}

@Composable
private fun pulsePeriodLabel(signal: MarketSignal): String {
    val year = signal.periodYear
    val month = signal.periodMonth
    if (year != null && month != null && month in 1..12) {
        val stamp = "%04d-%02d".format(year, month)
        // The metric is already the card title; the period line stays just the period.
        return stringResource(R.string.hub_pulse_period, stamp)
    }
    val observed = signal.observedAt.take(10)
    val latest = stringResource(R.string.hub_pulse_latest)
    return if (observed.isBlank()) latest else "$latest · $observed"
}
