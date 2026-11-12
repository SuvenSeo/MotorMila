package lk.motormila.app.ui.district

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.core.network.runCatchingWithTimeout
import lk.motormila.app.domain.model.DistrictInsight
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.domain.repository.ListingSorts
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.usecase.ObserveWatchlistUseCase
import lk.motormila.app.domain.usecase.ToggleWatchlistUseCase
import lk.motormila.app.ui.navigation.DistrictHub

const val RECENT_LISTINGS_SIZE = 8

data class DistrictHubUiState(
    val routeDistrict: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val insight: DistrictInsight? = null,
    val listings: List<Listing> = emptyList(),
    val nearby: List<NearbyDistrict> = emptyList(),
    val watchedIds: Set<Int> = emptySet(),
    val velocityTop: List<DistrictVelocity> = emptyList(),
    val offline: Boolean = false,
    val error: String? = null,
) {
    val displayName: String
        get() = displayDistrictName(insight?.district, routeDistrict)

    val searchDistrict: String
        get() = insight?.district?.trim()?.takeIf { it.isNotBlank() } ?: routeDistrict

    val hasContent: Boolean
        get() = insight != null || listings.isNotEmpty() || nearby.isNotEmpty()
}

sealed interface DistrictHubUiEvent {
    data object Refresh : DistrictHubUiEvent
    data class ToggleWatch(val listing: Listing) : DistrictHubUiEvent
    data object DismissError : DistrictHubUiEvent
}

@HiltViewModel
class DistrictHubViewModel @Inject constructor(
    private val stats: StatsRepository,
    private val listings: ListingRepository,
    private val toggleWatchlist: ToggleWatchlistUseCase,
    observeWatchlist: ObserveWatchlistUseCase,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val routeDistrict: String = readRouteDistrict(savedStateHandle)

    private val _state = MutableStateFlow(DistrictHubUiState(routeDistrict = routeDistrict))
    val state: StateFlow<DistrictHubUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            observeWatchlist()
                .catch { }
                .collect { items ->
                    _state.update { it.copy(watchedIds = items.map { row -> row.listingId }.toSet()) }
                }
        }
        load()
    }

    fun onEvent(event: DistrictHubUiEvent) {
        when (event) {
            DistrictHubUiEvent.Refresh -> load(refresh = true)
            is DistrictHubUiEvent.ToggleWatch -> viewModelScope.launch {
                runCatching { toggleWatchlist(event.listing) }
            }
            DistrictHubUiEvent.DismissError -> _state.update { it.copy(error = null) }
        }
    }

    private fun load(refresh: Boolean = false) {
        val district = routeDistrict
        if (district.isBlank()) {
            _state.update {
                it.copy(isLoading = false, isRefreshing = false, error = null, offline = false)
            }
            return
        }
        viewModelScope.launch {
            _state.update {
                it.copy(isLoading = !refresh, isRefreshing = refresh, error = null, offline = false)
            }
            val insightDef = async { runCatchingWithTimeout { stats.districtInsight(district) } }
            val listingsDef = async {
                runCatchingWithTimeout {
                    listings.searchPage(
                        ListingQuery(district = district, sort = ListingSorts.NEWEST),
                        page = 1,
                        size = RECENT_LISTINGS_SIZE,
                    )
                }
            }
            val pricesDef = async { runCatchingWithTimeout { stats.districtPrices() } }
            val velocityDef = async { runCatchingWithTimeout { stats.districtVelocity() } }

            val insightResult = insightDef.await()
            val listingsResult = listingsDef.await()
            val prices = pricesDef.await().getOrDefault(emptyList())
            val velocities = velocityDef.await().getOrDefault(emptyList())

            val insight = insightResult.getOrNull()
            val page = listingsResult.getOrDefault(emptyList())
            val velocityTop = velocities
                .sortedByDescending { it.listingCount }
                .take(8)
            val nearby = nearbyDistricts(
                currentNames = listOfNotNull(
                    district,
                    insight?.district?.takeIf { it.isNotBlank() },
                    titleCaseDistrict(district).takeIf { it.isNotBlank() },
                ),
                prices = prices,
                velocities = velocities,
            )
            val failure = insightResult.exceptionOrNull() ?: listingsResult.exceptionOrNull()
            val hasContent = insight != null || page.isNotEmpty() || nearby.isNotEmpty()

            if (!hasContent && failure != null) {
                val mapped = ErrorMapper.map(failure)
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        insight = null,
                        listings = emptyList(),
                        nearby = nearby,
                        velocityTop = velocityTop,
                        offline = mapped is AppError.Network,
                        error = mapped.message,
                    )
                }
            } else {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        insight = insight,
                        listings = page,
                        nearby = nearby,
                        velocityTop = velocityTop,
                        offline = failure != null && ErrorMapper.map(failure) is AppError.Network,
                        error = null,
                    )
                }
            }
        }
    }

    private fun readRouteDistrict(savedStateHandle: SavedStateHandle): String {
        val fromKey = savedStateHandle.get<String>("district")
        val fromRoute = runCatching { savedStateHandle.toRoute<DistrictHub>().district }.getOrNull()
        val raw = listOf(fromKey, fromRoute)
            .mapNotNull { candidate ->
                candidate?.trim()?.takeIf { value ->
                    value.isNotEmpty() && !value.equals("null", ignoreCase = true)
                }
            }
            .firstOrNull()
            .orEmpty()
        return decodeDistrictSlug(raw)
    }
}
