package lk.motormila.app.ui.ev

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import kotlin.math.ceil
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.model.ChargingStation
import lk.motormila.app.domain.model.EvStats
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.domain.repository.InsightsRepository
import lk.motormila.app.domain.usecase.ObserveSessionUseCase

const val COLOMBO_LAT = 6.9271
const val COLOMBO_LNG = 79.8612
const val TCO_PETROL_PER_KM_LKR = 28
const val TCO_EV_PER_KM_LKR = 6
const val TCO_KM_PER_YEAR = 20_000
const val FREE_EV_MODELS_LIMIT = 3

data class EvHubUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val unlocked: Boolean = false,
    val ev: EvStats? = null,
    val fuelMix: List<FuelMixBucket> = emptyList(),
    val chargers: List<ChargingStation> = emptyList(),
    val chargerRadiusKm: Int = 25,
    val originLat: Double = COLOMBO_LAT,
    val originLng: Double = COLOMBO_LNG,
    val offline: Boolean = false,
    val error: String? = null,
) {
    val annualFuelSavingLkr: Double
        get() = (TCO_PETROL_PER_KM_LKR - TCO_EV_PER_KM_LKR).toDouble() * TCO_KM_PER_YEAR

    val visibleModels: List<String>
        get() {
            val all = ev?.topModels.orEmpty()
            return if (unlocked) all else all.take(FREE_EV_MODELS_LIMIT)
        }

    val hiddenModelCount: Int
        get() {
            val all = ev?.topModels.orEmpty().size
            return if (unlocked) 0 else (all - FREE_EV_MODELS_LIMIT).coerceAtLeast(0)
        }

    val paybackYears: Int?
        get() {
            val median = ev?.avgPriceLkr ?: return null
            val aqua = ev?.aquaMedianLkr ?: return null
            val premium = median - aqua
            val saving = annualFuelSavingLkr
            if (premium <= 0 || saving <= 0) return null
            return ceil(premium / saving).toInt()
        }
}

sealed interface EvHubUiEvent {
    data object Refresh : EvHubUiEvent
    data class ChargerRadiusChanged(val km: Int) : EvHubUiEvent
    data object DismissError : EvHubUiEvent
}

@HiltViewModel
class EvHubViewModel @Inject constructor(
    private val repository: InsightsRepository,
    observeSession: ObserveSessionUseCase,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(EvHubUiState())
    val state: StateFlow<EvHubUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            observeSession().collect { session ->
                val unlocked = session?.isPro == true || session?.isAdmin == true
                _state.update { it.copy(unlocked = unlocked) }
            }
        }
        load()
    }

    fun onEvent(event: EvHubUiEvent) {
        when (event) {
            EvHubUiEvent.Refresh -> load(refresh = true)
            is EvHubUiEvent.ChargerRadiusChanged -> {
                _state.update { it.copy(chargerRadiusKm = event.km) }
                loadChargers()
            }
            EvHubUiEvent.DismissError -> _state.update { it.copy(error = null) }
        }
    }

    private fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            _state.update {
                it.copy(isLoading = !refresh, isRefreshing = refresh, error = null, offline = false)
            }
            val (lat, lng) = lastKnownOrColombo()
            val radius = _state.value.chargerRadiusKm.toDouble()
            val evDef = async { runCatching { repository.evStats() } }
            val mixDef = async { runCatching { repository.fuelMix() } }
            val chargersDef = async { runCatching { repository.chargers(lat, lng, radius) } }

            val evResult = evDef.await()
            val mixResult = mixDef.await()
            val chargersResult = chargersDef.await()
            val failure = evResult.exceptionOrNull()
                ?: mixResult.exceptionOrNull()
                ?: chargersResult.exceptionOrNull()

            val ev = evResult.getOrNull()
            val mix = mixResult.getOrDefault(emptyList())
            val chargers = chargersResult.getOrDefault(emptyList())

            if (ev == null && chargers.isEmpty() && mix.isEmpty() && failure != null) {
                val mapped = ErrorMapper.map(failure)
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        originLat = lat,
                        originLng = lng,
                        offline = mapped is AppError.Network,
                        error = mapped.message,
                    )
                }
            } else {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        ev = ev,
                        fuelMix = mix,
                        chargers = chargers,
                        originLat = lat,
                        originLng = lng,
                        offline = failure != null && ErrorMapper.map(failure) is AppError.Network,
                        error = null,
                    )
                }
            }
        }
    }

    private fun loadChargers() {
        viewModelScope.launch {
            val (lat, lng) = lastKnownOrColombo()
            runCatching {
                repository.chargers(lat, lng, _state.value.chargerRadiusKm.toDouble())
            }.onSuccess { list ->
                _state.update {
                    it.copy(chargers = list, originLat = lat, originLng = lng, error = null)
                }
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(offline = mapped is AppError.Network, error = mapped.message)
                }
            }
        }
    }

    /** Last-known GPS if the runtime permission is already granted; otherwise Colombo. */
    private fun lastKnownOrColombo(): Pair<Double, Double> {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
            return COLOMBO_LAT to COLOMBO_LNG
        }
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return COLOMBO_LAT to COLOMBO_LNG
        val loc = runCatching {
            manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                ?: manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: manager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)
        }.getOrNull()
        return if (loc != null) loc.latitude to loc.longitude else COLOMBO_LAT to COLOMBO_LNG
    }
}
