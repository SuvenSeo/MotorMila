package lk.motormila.app.ui.pulse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.domain.model.MarketSignal
import lk.motormila.app.ui.components.ErrorState
import lk.motormila.app.ui.components.LoadingSkeletonCard
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.rememberHaptics

@Composable
fun OfficialPulseDetailScreen(
    onBack: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onOpenGuide: (String) -> Unit,
    viewModel: OfficialPulseDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()

    lk.motormila.app.ui.common.MmScreen(
        title = stringResource(R.string.hub_pulse_detail_title),
        onBack = {
            if (!reducedMotion) haptics.tick()
            onBack()
        },
    ) {
        when {
            state.isLoading -> Column(Modifier.fillMaxSize().padding(16.dp)) {
                LoadingSkeletonCard()
            }
            state.error != null || state.signal == null -> ErrorState(
                message = state.error ?: stringResource(R.string.hub_pulse_detail_missing),
                onRetry = { viewModel.refresh() },
                modifier = Modifier.fillMaxSize(),
            )
            else -> {
                val signal = state.signal!!
                val title = signalDetailTitle(signal)
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        "${PulseLabels.humanize(signal.source)} · ${PulseLabels.signalTypeLabel(signal.signalType)}",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            color = MotormilaPrimaryBright,
                        ),
                    )
                    Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(
                        signalDetailValue(signal),
                        style = MaterialTheme.typography.headlineMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontFeatureSettings = "tnum",
                        ),
                    )
                    Text(
                        signal.observedAt.take(10),
                        style = MaterialTheme.typography.bodySmall,
                        color = MotormilaSecondaryText,
                    )
                    MotormilaSurface(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(stringResource(R.string.hub_pulse_detail_metric), fontWeight = FontWeight.SemiBold)
                        Text(PulseLabels.metricLabel(signal.metric), color = MotormilaSecondaryText)
                    }
                    MotormilaPrimaryButton(
                        label = stringResource(R.string.hub_pulse_read_guides),
                        onClick = {
                            if (!reducedMotion) haptics.tick()
                            onOpenGuide(
                                PulseGuides.match(signal.source, signal.signalType)?.key
                                    ?: "dmt_registrations",
                            )
                        },
                    )
                    val url = signal.sourceUrl
                    if (!url.isNullOrBlank()) {
                        MotormilaGhostButton(
                            label = stringResource(R.string.hub_pulse_open_source),
                            leadingIcon = Icons.AutoMirrored.Filled.OpenInNew,
                            onClick = {
                                if (!reducedMotion) haptics.tick()
                                onOpenUrl(url)
                            },
                        )
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

private fun signalDetailTitle(signal: MarketSignal): String = PulseLabels.title(signal)

private fun signalDetailValue(signal: MarketSignal): String {
    return PulseLabels.value(signal) { lk.motormila.app.ui.common.mn(it) } ?: "N/A"
}
