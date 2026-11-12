package lk.motormila.app.ui.permits

import lk.motormila.app.ui.theme.tabular
import androidx.compose.material3.LocalTextStyle
import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.format.LkrFormat
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.domain.model.Permit
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaMetricTile
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.motormilaReveal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermitsScreen(
    onBack: () -> Unit,
    onOpenCalculator: () -> Unit,
    viewModel: PermitsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    lk.motormila.app.ui.common.MmScreen(title = "Permit market", onBack = onBack) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onEvent(PermitsUiEvent.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.isLoading && state.permits.isEmpty() -> SkeletonList()
                state.error != null && state.permits.isEmpty() ->
                    ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(PermitsUiEvent.Refresh) })
                else -> PermitsBody(
                    permits = state.permits,
                    onOpenCalculator = onOpenCalculator,
                )
            }
        }
    }
}

@Composable
private fun PermitsBody(
    permits: List<Permit>,
    onOpenCalculator: () -> Unit,
) {
    val typeCount = PermitLabels.uniqueTypeCount(permits.map { it.type })
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(Modifier.motormilaReveal()) {
                MotormilaEyebrow("PERMIT TRACKER")
                Spacer(Modifier.height(12.dp))
                Text(
                    "Vehicle permit market.",
                    color = MotormilaOnSurface,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Indicative black-market and transferable permit prices in the Sri Lankan import lane. Verify with a licensed importer before you transact.",
                    color = MotormilaSecondaryText,
                    fontSize = 14.sp,
                    lineHeight = 21.sp,
                )
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                MotormilaMetricTile(
                    label = "Entries",
                    value = if (permits.isEmpty()) "—" else permits.size.toString(),
                    modifier = Modifier.weight(1f),
                )
                MotormilaMetricTile(
                    label = "Types",
                    value = if (permits.isEmpty()) "—" else typeCount.toString(),
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (permits.isEmpty()) {
            item {
                MotormilaSurface {
                    Text(stringResource(R.string.ui_permits_no_permit_data_yet), fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = MotormilaOnSurface)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Permit prices are seeded by administrators or the permitsale scraper. The calculator still models landed cost without this table.",
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                        color = MotormilaSecondaryText,
                    )
                }
            }
        } else {
            itemsIndexed(permits, key = { _, permit -> permit.id ?: "${permit.name}-${permit.type}" }) { index, permit ->
                PermitRowCard(permit, delayMillis = 40 * (index + 1))
            }
        }
        item {
            MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = 80)) {
                Text(stringResource(R.string.ui_permits_indicative_prices_only), fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = MotormilaOnSurface)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Permit prices move with demand, regulation, and FX. These figures are research baselines and may not match a live desk quote.",
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                    color = MotormilaSecondaryText,
                )
            }
        }
        item {
            MotormilaGhostButton("Import & landed-cost calculator", onClick = onOpenCalculator)
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun PermitRowCard(permit: Permit, delayMillis: Int) {
    MotormilaSurface(modifier = Modifier.motormilaReveal(delayMillis = delayMillis)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(permit.name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = MotormilaOnSurface)
                Spacer(Modifier.height(4.dp))
                Text(
                    PermitLabels.displayType(permit.type),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MotormilaSecondaryText,
                )
            }
            Text(
                lk.motormila.app.ui.common.mn(permit.marketPriceLkr),
                style = LocalTextStyle.current.tabular(),
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = MotormilaPrimaryBright,
            )
        }
    }
}
