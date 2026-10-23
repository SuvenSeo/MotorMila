package lk.motormila.app.ui.make

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
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.MakeInsight
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.domain.repository.ListingSorts
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.usecase.ObserveWatchlistUseCase
import lk.motormila.app.domain.usecase.ToggleWatchlistUseCase
import lk.motormila.app.ui.navigation.MakeHub

data class MakeHubUiState(
    val makeSlug: String = "",
    val displayMake: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val insight: MakeInsight? = null,
    val listings: List<Listing> = emptyList(),
    val watchedIds: Set<Int> = emptySet(),
    val offline: Boolean = false,
    val error: String? = null,
) {
    val searchMake: String
        get() = searchArg(insight?.make, makeSlug)
}

sealed interface MakeHubUiEvent {
    data object Refresh : MakeHubUiEvent
    data class ToggleWatch(val listing: Listing) : MakeHubUiEvent
    data object DismissError : MakeHubUiEvent
}

@HiltViewModel
class MakeHubViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val stats: StatsRepository,
    private val listings: ListingRepository,
    private val toggleWatchlist: ToggleWatchlistUseCase,
    observeWatchlist: ObserveWatchlistUseCase,
) : ViewModel() {

    private val route = runCatching { savedStateHandle.toRoute<MakeHub>() }.getOrNull()
    private val makeSlug: String = route?.make.orEmpty()

    private val _state = MutableStateFlow(
        MakeHubUiState(
            makeSlug = makeSlug,
            displayMake = titleCaseSlug(makeSlug),
        ),
    )
    val state: StateFlow<MakeHubUiState> = _state.asStateFlow()

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

    fun onEvent(event: MakeHubUiEvent) {
        when (event) {
            MakeHubUiEvent.Refresh -> load(refresh = true)
            is MakeHubUiEvent.ToggleWatch -> viewModelScope.launch {
                runCatching { toggleWatchlist(event.listing) }
                    .onFailure { e ->
                        _state.update { it.copy(error = ErrorMapper.map(e).message) }
                    }
            }
            MakeHubUiEvent.DismissError -> _state.update { it.copy(error = null) }
        }
    }

    private fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            if (makeSlug.isBlank()) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = AppError.NotFound().message,
                    )
                }
                return@launch
            }
            _state.update {
                it.copy(
                    isLoading = !refresh,
                    isRefreshing = refresh,
                    error = null,
                    offline = false,
                )
            }
            val insightDef = async { runCatchingWithTimeout { stats.makeInsight(makeSlug) } }
            val listingsDef = async {
                runCatchingWithTimeout {
                    listings.searchPage(
                        ListingQuery(make = makeSlug, sort = ListingSorts.NEWEST),
                        page = 1,
                        size = MAKE_HUB_RECENT_LIMIT,
                    )
                }
            }
            val insightResult = insightDef.await()
            val listingsResult = listingsDef.await()
            val insight = insightResult.getOrNull() ?: _state.value.insight.takeIf { refresh }
            val recent = listingsResult.getOrNull()
                ?: _state.value.listings.takeIf { refresh }.orEmpty()
            val failure = insightResult.exceptionOrNull() ?: listingsResult.exceptionOrNull()
            applyLoadResult(
                insight = insight,
                recent = recent,
                failure = failure,
                refresh = refresh,
            )
        }
    }

    private fun applyLoadResult(
        insight: MakeInsight?,
        recent: List<Listing>,
        failure: Throwable?,
        refresh: Boolean,
    ) {
        if (insight == null && recent.isEmpty() && failure != null && !refresh) {
            val mapped = ErrorMapper.map(failure)
            _state.update {
                it.copy(
                    isLoading = false,
                    isRefreshing = false,
                    offline = mapped is AppError.Network,
                    error = mapped.message,
                )
            }
            return
        }
        val mapped = failure?.let { ErrorMapper.map(it) }
        _state.update {
            it.copy(
                isLoading = false,
                isRefreshing = false,
                insight = insight,
                listings = recent,
                displayMake = hubDisplayName(insight?.make, makeSlug),
                offline = mapped is AppError.Network,
                error = mapped?.message?.takeIf { insight == null || recent.isEmpty() },
            )
        }
    }
}
