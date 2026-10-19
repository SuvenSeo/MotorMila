package lk.motormila.app.ui.bestpicks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.PagingData
import androidx.paging.cachedIn
import androidx.paging.filter
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingSorts
import lk.motormila.app.domain.usecase.GetListingsPagingUseCase
import lk.motormila.app.domain.usecase.GetPriceDropsUseCase
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.domain.usecase.ObserveWatchlistUseCase
import lk.motormila.app.domain.usecase.ToggleWatchlistUseCase

const val MIN_DEAL_SCORE = 8.0
const val MIN_REASONABLE_PRICE_LKR = 100_000.0
const val FREE_BEST_PICKS_LIMIT = 6
const val FREE_PRICE_DROPS_LIMIT = 3
const val PRO_PRICE_DROPS_LIMIT = 8

enum class BestPicksSort {
    DEAL_SCORE,
    RECENCY,
}

data class BestPicksUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val unlocked: Boolean = false,
    val sort: BestPicksSort = BestPicksSort.RECENCY,
    val priceDrops: List<PriceDrop> = emptyList(),
    val freePicks: List<Listing> = emptyList(),
    val watchedIds: Set<Int> = emptySet(),
    val offline: Boolean = false,
    val error: String? = null,
)

sealed interface BestPicksUiEvent {
    data object Refresh : BestPicksUiEvent
    data class SortChanged(val sort: BestPicksSort) : BestPicksUiEvent
    data class ToggleWatch(val listing: Listing) : BestPicksUiEvent
    data object DismissError : BestPicksUiEvent
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class BestPicksViewModel @Inject constructor(
    private val getPriceDrops: GetPriceDropsUseCase,
    private val getListingsPaging: GetListingsPagingUseCase,
    private val toggleWatchlist: ToggleWatchlistUseCase,
    observeSession: ObserveSessionUseCase,
    observeWatchlist: ObserveWatchlistUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(BestPicksUiState())
    val state: StateFlow<BestPicksUiState> = _state.asStateFlow()

    private val unlocked = MutableStateFlow(false)
    private val sortKey = MutableStateFlow(BestPicksSort.RECENCY)

    /** True while picks come from the offline snapshot (backend down). */
    val fromSnapshot: kotlinx.coroutines.flow.StateFlow<Boolean> get() = getListingsPaging.fromSnapshot

    val paging: Flow<PagingData<Listing>> = combine(unlocked, sortKey) { pro, sort ->
        if (!pro) {
            null
        } else {
            ListingQuery(
                sort = when (sort) {
                    BestPicksSort.DEAL_SCORE -> ListingSorts.DEAL_SCORE
                    BestPicksSort.RECENCY -> ListingSorts.NEWEST
                },
                vehicleCategory = "cars",
            )
        }
    }.flatMapLatest { query ->
        if (query == null) {
            flowOf(PagingData.empty())
        } else {
            getListingsPaging(query).map { pagingData ->
                pagingData.filter { listing ->
                    val price = listing.priceLkr ?: return@filter false
                    if (price < MIN_REASONABLE_PRICE_LKR) return@filter false
                    if (query.sort == ListingSorts.DEAL_SCORE) {
                        (listing.dealScore ?: 0.0) >= MIN_DEAL_SCORE
                    } else {
                        true
                    }
                }
            }
        }
    }.cachedIn(viewModelScope)

    init {
        viewModelScope.launch {
            var first = true
            observeSession().collect { session ->
                val next = session?.isPro == true || session?.isAdmin == true
                val becamePro = next && !unlocked.value
                unlocked.value = next
                _state.update {
                    it.copy(
                        unlocked = next,
                        sort = if (becamePro) BestPicksSort.DEAL_SCORE else it.sort,
                    )
                }
                if (becamePro) {
                    sortKey.value = BestPicksSort.DEAL_SCORE
                }
                load(refresh = !first)
                first = false
            }
        }
        viewModelScope.launch {
            observeWatchlist().collect { items ->
                _state.update { it.copy(watchedIds = items.map { row -> row.listingId }.toSet()) }
            }
        }
    }

    fun onEvent(event: BestPicksUiEvent) {
        when (event) {
            BestPicksUiEvent.Refresh -> load(refresh = true)
            is BestPicksUiEvent.SortChanged -> {
                if (event.sort == BestPicksSort.DEAL_SCORE && !_state.value.unlocked) {
                    return
                }
                sortKey.value = event.sort
                _state.update { it.copy(sort = event.sort) }
            }
            is BestPicksUiEvent.ToggleWatch -> viewModelScope.launch {
                runCatching { toggleWatchlist(event.listing) }
            }
            BestPicksUiEvent.DismissError -> _state.update { it.copy(error = null) }
        }
    }

    private fun load(refresh: Boolean) {
        viewModelScope.launch {
            _state.update {
                it.copy(isLoading = !refresh, isRefreshing = refresh, error = null, offline = false)
            }
            loadDrops(markIdle = true)
        }
    }

    private suspend fun loadDrops(markIdle: Boolean = false) {
        val limit = if (_state.value.unlocked) PRO_PRICE_DROPS_LIMIT else FREE_PRICE_DROPS_LIMIT
        runCatching { getPriceDrops(days = 7, limit = limit) }
            .onSuccess { drops ->
                val picks = drops.map { it.listing }
                    .distinctBy { it.id }
                    .take(FREE_BEST_PICKS_LIMIT)
                _state.update {
                    it.copy(
                        isLoading = if (markIdle) false else it.isLoading,
                        isRefreshing = if (markIdle) false else it.isRefreshing,
                        priceDrops = drops,
                        freePicks = picks,
                        error = null,
                    )
                }
            }
            .onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(
                        isLoading = if (markIdle) false else it.isLoading,
                        isRefreshing = if (markIdle) false else it.isRefreshing,
                        offline = mapped is AppError.Network,
                        error = mapped.message,
                    )
                }
            }
    }
}
