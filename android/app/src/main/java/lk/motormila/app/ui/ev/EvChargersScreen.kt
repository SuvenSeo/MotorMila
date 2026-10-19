package lk.motormila.app.ui.ev

import lk.motormila.app.R
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.core.geo.SriLankaDistricts
import lk.motormila.app.core.ui.ErrorRetry
import lk.motormila.app.core.ui.SkeletonList
import lk.motormila.app.domain.model.ChargingStation
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.MotormilaTopBar
import lk.motormila.app.ui.theme.MotormilaGoodText
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaSecondaryText

private val RadiusKm = listOf(10, 25, 50, 100)

@Composable
fun EvChargersScreen(
    onBack: () -> Unit,
    onOpenUrl: (String) -> Unit,
    viewModel: EvChargersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize()) {
        MotormilaTopBar(title = "EV chargers", onBack = onBack)
        when {
            state.isLoading && state.stations.isEmpty() -> SkeletonList()
            state.error != null && state.stations.isEmpty() ->
                ErrorRetry(state.error ?: "Error", onRetry = { viewModel.onEvent(EvChargersUiEvent.Retry) })
            else -> {
                LazyColumn(
                    Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        MotormilaEyebrow("OPEN CHARGE MAP")
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Chargers near ${state.district}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 26.sp,
                            color = MotormilaOnSurface,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Cached Sri Lanka Open Charge Map points. Confirm status before you travel.",
                            fontSize = 13.sp,
                            color = MotormilaSecondaryText,
                            lineHeight = 19.sp,
                        )
                    }
                    item {
                        Text(stringResource(R.string.ui_alerts_district), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MotormilaSecondaryText)
                        Spacer(Modifier.height(6.dp))
                        Row(
                            Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            SriLankaDistricts.names.forEach { name ->
                                MotormilaChoiceChip(
                                    label = name,
                                    selected = state.district == name,
                                    onClick = { viewModel.onEvent(EvChargersUiEvent.DistrictChanged(name)) },
                                    compact = true,
                                )
                            }
                        }
                    }
                    item {
                        Text(stringResource(R.string.ui_ev_radius), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MotormilaSecondaryText)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            RadiusKm.forEach { km ->
                                MotormilaChoiceChip(
                                    label = "${km} km",
                                    selected = state.radiusKm == km,
                                    onClick = { viewModel.onEvent(EvChargersUiEvent.RadiusChanged(km)) },
                                    compact = true,
                                )
                            }
                        }
                    }
                    if (state.stations.isEmpty()) {
                        item {
                            MotormilaSurface {
                                Text(stringResource(R.string.ui_ev_no_chargers_in_this_radius), color = MotormilaSecondaryText)
                            }
                        }
                    }
                    items(state.stations, key = { it.name + (it.address ?: "") }) { station ->
                        ChargerCard(station, onOpenUrl)
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun ChargerCard(station: ChargingStation, onOpenUrl: (String) -> Unit) {
    val distance = station.distanceKm?.let { String.format("%.1f km", it) } ?: "Nearby"
    MotormilaSurface {
        Text(station.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = MotormilaOnSurface)
        val place = listOfNotNull(station.town, station.address).joinToString(" · ")
        if (place.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(place, fontSize = 12.sp, color = MotormilaSecondaryText)
        }
        Spacer(Modifier.height(6.dp))
        Text("$distance · ${station.status ?: "Status unlisted"}", fontSize = 12.sp, color = MotormilaGoodText)
        if (station.connectors.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(station.connectors.joinToString(" · "), fontSize = 12.sp, color = MotormilaSecondaryText)
        }
        val lat = station.lat
        val lng = station.lng
        if (lat != null && lng != null) {
            Spacer(Modifier.height(10.dp))
            MotormilaGhostButton("Open in OpenStreetMap") {
                onOpenUrl("https://www.openstreetmap.org/?mlat=$lat&mlon=$lng#map=16/$lat/$lng")
            }
        }
    }
}
