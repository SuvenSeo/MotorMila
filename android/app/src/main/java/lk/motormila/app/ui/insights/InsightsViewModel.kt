package lk.motormila.app.ui.insights

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.EvStats
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.PriceIndex
import lk.motormila.app.domain.model.PriceIndexPoint
import lk.motormila.app.domain.model.PulseSignal
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.model.TrendPoint
import lk.motormila.app.domain.model.VehicleNews
import lk.motormila.app.domain.repository.InsightsRepository
import lk.motormila.app.domain.repository.StatsRepository

data class TrendSelectors(
    val make: String = "",
    val model: String = "",
    val condition: String = "Any",
    val district: String = "All districts",
)

data class InsightsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val offline: Boolean = false,
    val selectors: TrendSelectors = TrendSelectors(),
    val summary: StatsSummary? = null,
    val trends: List<TrendPoint> = emptyList(),
    val trendCoverageNote: String? = null,
    val index: List<PriceIndexPoint> = emptyList(),
    val priceIndex: PriceIndex = PriceIndex(),
    val districts: List<DistrictStat> = emptyList(),
    val velocities: List<DistrictVelocity> = emptyList(),
    val fuelMix: List<FuelMixBucket> = emptyList(),
    val priceDrops: List<PriceDrop> = emptyList(),
    val ev: EvStats? = null,
    val chargerRadiusKm: Int = 25,
    val chargers: List<String> = emptyList(),
    val pulse: List<PulseSignal> = emptyList(),
    val news: List<VehicleNews> = emptyList(),
    val error: String? = null,
)

sealed interface InsightsUiEvent {
    data object Refresh : InsightsUiEvent
    data class SelectorsChanged(val selectors: TrendSelectors) : InsightsUiEvent
    data class ChargerRadiusChanged(val km: Int) : InsightsUiEvent
    data object DismissError : InsightsUiEvent
}

@HiltViewModel
class InsightsViewModel @Inject constructor(
    private val repository: InsightsRepository,
    private val stats: StatsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(InsightsUiState())
    val state: StateFlow<InsightsUiState> = _state.asStateFlow()

    /** Lightweight live ticker (empty when offline). */
    val live: StateFlow<List<Listing>> = stats.liveListings(limit = 8)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        load()
    }

    fun onEvent(event: InsightsUiEvent) {
        when (event) {
            InsightsUiEvent.Refresh -> load(refresh = true)
            is InsightsUiEvent.SelectorsChanged -> {
                _state.update { it.copy(selectors = event.selectors) }
                loadTrends()
            }
            is InsightsUiEvent.ChargerRadiusChanged -> {
                _state.update { it.copy(chargerRadiusKm = event.km) }
                loadChargers()
            }
            InsightsUiEvent.DismissError -> _state.update { it.copy(error = null, offline = false) }
        }
    }

    /** Blank/"Any"/"All districts" selector values mean "no filter" for the API. */
    private fun TrendSelectors.toFilter(name: String): String? {
        val raw = when (name) {
            "make" -> make
            "model" -> model
            "condition" -> condition
            "district" -> district
            else -> ""
        }.trim()
        if (raw.isBlank()) return null
        if (raw.equals("Any", ignoreCase = true)) return null
        if (raw.equals("All districts", ignoreCase = true)) return null
        return raw
    }

    private fun formatCharger(name: String, distanceKm: Double?): String =
        "$name · ${distanceKm?.let { "%.1f km".format(it) } ?: "nearby"}"

    private fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = !refresh, isRefreshing = refresh, error = null, offline = false) }
            runCatching {
                // Hard bound (HomeViewModel parity): no hanging call may keep
                // skeletons up forever. Parallelize — the old sequential chain
                // could take 12 x timeout before settling.
                withTimeout(20_000) {
                    val s = _state.value.selectors
                    val trendsDef = async {
                        repository.trends(
                            make = s.toFilter("make"),
                            model = s.toFilter("model"),
                            condition = s.toFilter("condition"),
                            district = s.toFilter("district"),
                        )
                    }
                    val indexDef = async { repository.index() }
                    val districtsDef = async { repository.districts() }
                    // Auxiliary sections fail independently — one outage must not blank the rest.
                    val velocitiesDef = async { runCatching { repository.velocities() }.getOrDefault(emptyList()) }
                    val fuelMixDef = async { runCatching { repository.fuelMix() }.getOrDefault(emptyList()) }
                    val summaryDef = async { runCatching { stats.summary() }.getOrNull() }
                    val priceDropsDef = async { runCatching { stats.priceDrops() }.getOrDefault(emptyList()) }
                    val evDef = async { runCatching { repository.evStats() }.getOrNull() }
                    val km = _state.value.chargerRadiusKm
                    val chargersDef = async {
                        runCatching { repository.chargers(radiusKm = km.toDouble()) }
                            .getOrDefault(emptyList())
                            .map { formatCharger(it.name, it.distanceKm) }
                    }
                    val pulseDef = async {
                        runCatching { repository.signals() }
                            .getOrDefault(emptyList())
                            .map {
                                PulseSignal(
                                    id = it.id.toString(),
                                    title = it.metric.ifBlank { it.signalType },
                                    tag = it.source,
                                    body = "${it.signalType} · ${it.valueNumeric?.toString().orEmpty()} ${it.unit.orEmpty()}".trim(),
                                    timeLabel = it.observedAt.take(10),
                                )
                            }
                    }
                    val newsDef = async { runCatching { repository.news() }.getOrDefault(emptyList()) }

                    val trends = trendsDef.await()
                    val index = indexDef.await()
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            offline = false,
                            summary = summaryDef.await(),
                            trends = trends.points,
                            trendCoverageNote = trends.coverageNote,
                            index = index.points,
                            priceIndex = index,
                            districts = districtsDef.await(),
                            velocities = velocitiesDef.await(),
                            fuelMix = fuelMixDef.await(),
                            priceDrops = priceDropsDef.await(),
                            ev = evDef.await(),
                            chargers = chargersDef.await(),
                            pulse = pulseDef.await(),
                            news = newsDef.await(),
                        )
                    }
                }
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        offline = mapped is AppError.Network,
                        error = mapped.message,
                    )
                }
            }
        }
    }

    private fun loadTrends() {
        viewModelScope.launch {
            runCatching {
                val s = _state.value.selectors
                repository.trends(
                    make = s.toFilter("make"),
                    model = s.toFilter("model"),
                    condition = s.toFilter("condition"),
                    district = s.toFilter("district"),
                )
            }.onSuccess { result ->
                _state.update { it.copy(trends = result.points, trendCoverageNote = result.coverageNote) }
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(offline = mapped is AppError.Network, error = mapped.message)
                }
            }
        }
    }

    private fun loadChargers() {
        viewModelScope.launch {
            runCatching { repository.chargers(radiusKm = _state.value.chargerRadiusKm.toDouble()) }
                .onSuccess { list ->
                    _state.update { it.copy(chargers = list.map { formatCharger(it.name, it.distanceKm) }) }
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update { it.copy(offline = mapped is AppError.Network, error = mapped.message) }
                }
        }
    }
}
