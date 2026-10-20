package lk.motormila.app.ui.dealer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.format.formatLkr
import lk.motormila.app.core.format.formatPct
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SectionTitle
import lk.motormila.app.domain.model.UrlBenchmarkResult
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DealerScreen(
    onContactSupport: () -> Unit,
    viewModel: DealerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()

    LaunchedEffect(state.error) {
        state.error?.let {
            if (!reducedMotion) haptics.reject()
            snacks.showSnackbar(it)
            viewModel.onEvent(DealerUiEvent.DismissError)
        }
    }
    LaunchedEffect(state.benchmark, state.claimStatus) {
        if ((state.benchmark != null || state.claimStatus != null) && !reducedMotion) {
            haptics.confirm()
        }
    }

    lk.motormila.app.ui.common.MmScreen(title = "Dealer tools", snackbarHostState = snacks) {
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = { viewModel.onEvent(DealerUiEvent.RefreshClaim) },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { OfflineBanner(visible = state.offline) }
                if (state.claimToken == null) {
                    item { ClaimForm(state, viewModel) }
                    if (state.error != null) {
                        // Inline retry (the snackbar also fires via LaunchedEffect above).
                        item {
                            ErrorRetry(
                                state.error ?: "Error",
                                onRetry = { viewModel.onEvent(DealerUiEvent.Claim) },
                            )
                        }
                    }
                } else {
                    item { ProfileCard(state, viewModel, onContactSupport) }
                    item { ClaimStatusCard(state) }
                    item { BenchmarkCard(state, viewModel) }
                    item { PlaybookCard() }
                }
            }
        }
    }
}

@Composable
private fun ClaimStatusCard(state: DealerUiState) {
    val status = state.claimStatus
    MotormilaSurface(
        modifier = Modifier.semantics {
            contentDescription = "Dealer claim status ${status?.status ?: "unverified"}"
        },
    ) {
        SectionTitle("Claim status")
        if (state.verifyingClaim && status == null) {
            Text(stringResource(R.string.dealer_verifying), style = MaterialTheme.typography.bodyMedium)
        } else if (state.pendingManualVerification && status == null) {
            Text(
                stringResource(R.string.dealer_pending_manual),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (status != null) {
            BenchmarkRow("Status", status.status.ifBlank { "pending" })
            if (status.message.isNotBlank()) {
                Text(
                    status.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            status.displayName?.takeIf { it.isNotBlank() }?.let { BenchmarkRow("Yard", it) }
            status.matchedListings?.let { BenchmarkRow("Matched listings", it.toString()) }
            status.sellerNamePattern?.takeIf { it.isNotBlank() }?.let { BenchmarkRow("Pattern", it) }
            status.claimedUrl?.takeIf { it.isNotBlank() }?.let { BenchmarkRow("Claimed URL", it) }
        } else {
            Text(
                stringResource(R.string.dealer_claim_saved),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ClaimForm(state: DealerUiState, viewModel: DealerViewModel) {
    val f = state.form
    MotormilaSurface {
        SectionTitle("Claim your dealership")
        DealerField("Display name", f.displayName) {
            viewModel.onEvent(DealerUiEvent.FormChanged(f.copy(displayName = it)))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DealerField("Phone", f.phone, Modifier.weight(1f)) {
                viewModel.onEvent(DealerUiEvent.FormChanged(f.copy(phone = it)))
            }
            DealerField("Email", f.email, Modifier.weight(1f)) {
                viewModel.onEvent(DealerUiEvent.FormChanged(f.copy(email = it)))
            }
        }
        DealerField("Stock pattern (e.g. Axio *)", f.pattern) {
            viewModel.onEvent(DealerUiEvent.FormChanged(f.copy(pattern = it)))
        }
        DealerField("Listing URL proving ownership", f.url) {
            viewModel.onEvent(DealerUiEvent.FormChanged(f.copy(url = it)))
        }
        Spacer(Modifier.height(8.dp))
        MotormilaPrimaryButton(
            label = "Claim dealership",
            loading = state.claiming,
            onClick = { viewModel.onEvent(DealerUiEvent.Claim) },
        )
    }
}

@Composable
private fun ProfileCard(state: DealerUiState, viewModel: DealerViewModel, onContactSupport: () -> Unit) {
    MotormilaSurface(
        modifier = Modifier.semantics { contentDescription = "Claimed dealer ${state.claimedName}" },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Verified, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f).padding(start = 8.dp)) {
                Text(state.claimedName.ifBlank { "Claimed dealer" }, style = MaterialTheme.typography.titleMedium)
                Text(
                    "Token ${state.claimToken?.take(8)}… · verified",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            MotormilaGhostButton(
                label = "Release",
                fillMaxWidth = false,
                onClick = { viewModel.onEvent(DealerUiEvent.SignOut) },
            )
        }
        MotormilaGhostButton(
            label = "Something wrong? Contact support",
            fillMaxWidth = false,
            onClick = onContactSupport,
        )
    }
}

@Composable
private fun BenchmarkCard(state: DealerUiState, viewModel: DealerViewModel) {
    val urlCount = state.benchmarkUrls.lines().count { it.isNotBlank() }
    MotormilaSurface {
        SectionTitle("Benchmark — paste listing URLs")
        OutlinedTextField(
            value = state.benchmarkUrls,
            onValueChange = { viewModel.onEvent(DealerUiEvent.BenchmarkUrlsChanged(it)) },
            label = { Text(stringResource(R.string.ui_dealer_one_url_per_line_ikman)) },
            supportingText = {
                Text(if (urlCount > 0) "$urlCount URL${if (urlCount == 1) "" else "s"} queued" else "No URLs yet")
            },
            minLines = 3,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .semantics { contentDescription = "Benchmark listing URLs, one per line" },
        )
        Spacer(Modifier.height(8.dp))
        MotormilaPrimaryButton(
            label = "Run benchmark",
            loading = state.benchmarking,
            onClick = { viewModel.onEvent(DealerUiEvent.RunBenchmark) },
        )
        state.benchmark?.let { b ->
            Spacer(Modifier.height(12.dp))
            BenchmarkRow("Dealer", b.dealerName.ifBlank { "Your yard" })
            BenchmarkRow("Live listings", b.listingCount.toString())
            BenchmarkRow("Average", lk.motormila.app.ui.common.mn(b.avgPriceLkr))
            BenchmarkRow("Median", lk.motormila.app.ui.common.mn(b.medianPriceLkr))
            BenchmarkRow("District", b.district ?: "—")
            b.avgDealScore?.let { score ->
                Spacer(Modifier.height(4.dp))
                Text(
                    "Deal score ${formatPct(score, 1)} — included in the yard average above.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } ?: Text(
                if (urlCount > 0) {
                    "Aggregated across $urlCount pasted URL${if (urlCount == 1) "" else "s"}."
                } else {
                    "Paste listing URLs above to include them in the yard average."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (b.urlResults.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                SectionTitle("Per URL")
                b.urlResults.forEach { row -> UrlBenchmarkRow(row) }
            }
        }
    }
}

@Composable
private fun BenchmarkRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp).heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun UrlBenchmarkRow(row: UrlBenchmarkResult) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .heightIn(min = 48.dp)
            .semantics { contentDescription = "Benchmark ${row.url}" },
    ) {
        Text(
            row.url,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.ui_dealer_price), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(lk.motormila.app.ui.common.mn(row.listingPrice), style = MaterialTheme.typography.titleSmall)
        }
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.ui_dealer_median), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(lk.motormila.app.ui.common.mn(row.marketMedian), style = MaterialTheme.typography.titleSmall)
        }
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.ui_dealer_gap), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(formatPct(row.priceGapPct, 1), style = MaterialTheme.typography.titleSmall)
        }
        row.error?.takeIf { it.isNotBlank() }?.let { err ->
            Text(
                err,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun PlaybookCard() {
    MotormilaSurface {
        SectionTitle("Pricing playbook")
        listOf(
            "Price 3–5% under FMV for sub-14-day turns.",
            "Refresh photos + re-list every 21 days to reset velocity.",
            "Match the district median trim — over-specced stock sits.",
        ).forEach { tip -> Text("• $tip", style = MaterialTheme.typography.bodyMedium) }
    }
}

@Composable
private fun DealerField(label: String, value: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 4.dp),
    )
}
