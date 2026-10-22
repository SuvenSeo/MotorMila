package lk.motormila.app.ui.search

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import androidx.paging.PagingData
import androidx.paging.cachedIn
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.repository.AlertsRepository
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.domain.repository.ListingSorts
import lk.motormila.app.domain.usecase.GetListingsPagingUseCase
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.domain.usecase.ToggleWatchlistUseCase
import lk.motormila.app.ui.navigation.Search
import lk.motormila.app.ui.navigation.searchArgsToQuery
import lk.motormila.app.domain.model.VehicleCategory
import lk.motormila.app.domain.model.VehicleCategoryRules
import javax.inject.Inject

/** Launch rule: every browse list a user lands on starts on Cars. */
fun defaultSearchQuery(): ListingQuery = ListingQuery(vehicleCategory = VehicleCategory.DEFAULT.apiValue)

/**
 * Deep links / hubs carry make/model/keyword but no category. Default them to
 * Cars unless the intent is clearly another vehicle type (Bajaj RE, Honda Dio,
 * TVS…), in which case show All so the result is never empty by surprise.
 */
fun ListingQuery.withDefaultCategory(): ListingQuery {
    if (vehicleCategory != null) return this
    val carIntent = VehicleCategoryRules.isCarLike(null, make, model, keyword)
    return copy(vehicleCategory = if (carIntent) VehicleCategory.DEFAULT.apiValue else null)
}

/** Web parity (Compare.tsx / compareSlug.ts): tray holds at most 3 ids. */
const val MAX_COMPARE_IDS = 3

/** Shown when "Create alert from these filters" is used while signed out. */
const val SIGN_IN_FOR_ALERTS = "Sign in to create price alerts."

data class SearchUiState(
    val query: String = "",
    val filters: ListingQuery = defaultSearchQuery(),
    val suggestions: List<Listing> = emptyList(),
    val recentSearches: List<String> = emptyList(),
    val compareIds: List<Int> = emptyList(),
    val showFilterSheet: Boolean = false,
    val makes: List<String> = emptyList(),
    val districts: List<String> = emptyList(),
    val alertSaved: Boolean = false,
    val error: String? = null,
    /** Free tier has no deal_score — backend forces `newest` (BestPicks.tsx parity). */
    val isPro: Boolean = false,
    /** One-shot: SearchScreen launches the system recogniser then [SearchViewModel.consumeVoice]. */
    val pendingVoice: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val getListingsPaging: GetListingsPagingUseCase,
    private val toggleWatchlist: ToggleWatchlistUseCase,
    private val observeSession: ObserveSessionUseCase,
    private val listings: ListingRepository,
    private val alerts: AlertsRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private val queryFlow = MutableStateFlow("")
    private val pagingKey = MutableStateFlow(defaultSearchQuery())

    /** True while results come from the offline snapshot (backend down). */
    val fromSnapshot: kotlinx.coroutines.flow.StateFlow<Boolean> get() = getListingsPaging.fromSnapshot

    /** Paging3 stream; re-created on query/filter/sort change, cached in VM scope. */
    val paging: Flow<PagingData<Listing>> = pagingKey
        .flatMapLatest { getListingsPaging(it) }
        .cachedIn(viewModelScope)

    init {
        runCatching { savedStateHandle.toRoute<Search>() }.getOrNull()?.let { applyRouteArgs(it) }
        viewModelScope.launch {
            observeSession().collect { session ->
                val isPro = session?.isPro == true
                val current = _state.value
                val nextFilters = if (!isPro && current.filters.sort != ListingSorts.NEWEST) {
                    current.filters.copy(sort = ListingSorts.NEWEST)
                } else {
                    current.filters
                }
                _state.value = current.copy(isPro = isPro, filters = nextFilters)
                if (nextFilters != current.filters) {
                    pagingKey.value = nextFilters
                }
            }
        }
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(
                    makes = listings.makes(),
                    districts = listOf(
                        "Colombo", "Gampaha", "Kandy", "Galle", "Kurunegala",
                        "Jaffna", "Negombo", "Matara", "Anuradhapura", "Badulla",
                    ),
                )
            } catch (_: Exception) {
            }
        }
        // Debounced suggestions.
        viewModelScope.launch {
            queryFlow.debounce(300).distinctUntilChanged().collect { q ->
                if (q.isBlank()) {
                    _state.value = _state.value.copy(suggestions = emptyList())
                } else {
                    try {
                        _state.value = _state.value.copy(suggestions = listings.suggestions(q))
                    } catch (_: Exception) {
                    }
                }
            }
        }
    }

    fun onQueryChange(q: String) {
        queryFlow.value = q
        _state.value = _state.value.copy(query = q)
    }

    fun onSearch(q: String) {
        val trimmed = q.trim()
        if (trimmed.isNotBlank()) {
            val recents = (listOf(trimmed) + _state.value.recentSearches).distinct().take(8)
            _state.value = _state.value.copy(recentSearches = recents)
        }
        applyFilters(_state.value.filters.copy(keyword = trimmed.ifBlank { null }))
    }

    fun applyIncomingQuery(query: ListingQuery) {
        val text = query.keyword?.trim().orEmpty()
        if (text.isNotBlank()) {
            onQueryChange(text)
            val recents = (listOf(text) + _state.value.recentSearches).distinct().take(8)
            _state.value = _state.value.copy(recentSearches = recents)
        }
        applyFilters(query.copy(keyword = text.ifBlank { null }))
    }

    fun consumeVoice() {
        savedStateHandle[VOICE_CONSUMED_KEY] = true
        _state.value = _state.value.copy(pendingVoice = false)
    }

    fun applyFilters(query: ListingQuery) {
        _state.value = _state.value.copy(filters = query, showFilterSheet = false, error = null)
        pagingKey.value = query
    }

    fun onSortChange(sort: String) {
        // Free tier has no deal_score/median — backend forces `newest`.
        if (!_state.value.isPro && sort != ListingSorts.NEWEST) {
            applyFilters(_state.value.filters.copy(sort = ListingSorts.NEWEST))
            _state.value = _state.value.copy(
                error = "Free plan sorts by newest — upgrade to Pro for deal-score sort",
            )
            return
        }
        applyFilters(_state.value.filters.copy(sort = sort))
    }

    fun openFilters() {
        _state.value = _state.value.copy(showFilterSheet = true)
    }

    fun closeFilters() {
        _state.value = _state.value.copy(showFilterSheet = false)
    }

    fun resetFilters() {
        // Clears refinements; the browse category the user picked stays.
        applyFilters(
            ListingQuery(
                keyword = _state.value.query.ifBlank { null },
                vehicleCategory = _state.value.filters.vehicleCategory,
            ),
        )
    }

    /** Category chip row (Cars default · All · Bikes · …). */
    fun onCategoryChange(category: VehicleCategory) {
        if (_state.value.filters.vehicleCategory == category.apiValue) return
        applyFilters(_state.value.filters.copy(vehicleCategory = category.apiValue))
    }

    fun toggleCompare(id: Int) {
        val current = _state.value.compareIds.toMutableList()
        if (current.contains(id)) current.remove(id)
        else if (current.size < MAX_COMPARE_IDS) current.add(id)
        else {
            _state.value = _state.value.copy(
                error = "Compare tray is full (max $MAX_COMPARE_IDS) — remove one first",
            )
            return
        }
        _state.value = _state.value.copy(compareIds = current)
    }

    fun clearCompare() {
        _state.value = _state.value.copy(compareIds = emptyList())
    }

    fun toggleWatch(listing: Listing) {
        viewModelScope.launch {
            try {
                toggleWatchlist(listing)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    /** Create a price alert from the current filters. */
    fun createAlertFromFilters() {
        val f = _state.value.filters
        viewModelScope.launch {
            val session = runCatching { observeSession().first() }.getOrNull()
            if (session == null) {
                // Alerts are server-side; a signed-out create used to fail with no visible feedback.
                _state.value = _state.value.copy(error = SIGN_IN_FOR_ALERTS)
                return@launch
            }
            try {
                alerts.create(
                    AlertInput(
                        make = f.make,
                        model = f.model,
                        maxPriceLkr = f.priceMax,
                        district = f.district,
                    ),
                )
                _state.value = _state.value.copy(alertSaved = true)
            } catch (e: kotlin.coroutines.cancellation.CancellationException) {
                throw e
            } catch (e: Exception) {
                val mapped = lk.motormila.app.core.network.ErrorMapper.map(e)
                val msg = if (mapped is lk.motormila.app.core.common.AppError.Unauthorized) {
                    SIGN_IN_FOR_ALERTS
                } else {
                    "Couldn't save alert. ${mapped.message}"
                }
                _state.value = _state.value.copy(error = msg)
            }
        }
    }

    fun consumeAlertSaved() {
        _state.value = _state.value.copy(alertSaved = false)
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    private fun applyRouteArgs(route: Search) {
        val incoming = searchArgsToQuery(route)
        val keyword = incoming.keyword
        val hasArgs = keyword != null ||
            incoming.district != null ||
            incoming.make != null ||
            incoming.model != null ||
            !route.sort.isNullOrBlank()
        if (hasArgs) {
            applyIncomingQuery(incoming.withDefaultCategory())
            if (keyword != null) {
                onSearch(keyword)
            }
        }
        if (route.voice && savedStateHandle.get<Boolean>(VOICE_CONSUMED_KEY) != true) {
            _state.value = _state.value.copy(pendingVoice = true)
        }
    }

    companion object {
        private const val VOICE_CONSUMED_KEY = "pending_voice_consumed"
    }
}
