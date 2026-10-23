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
import lk.motormila.app.domain.usecase.ObserveWatchlistUseCase
import lk.motormila.app.ui.navigation.Search
import lk.motormila.app.ui.navigation.searchArgsToQuery
import lk.motormila.app.ui.navigation.toWebFilters
import lk.motormila.app.ui.navigation.withWebFilters
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

/** All 25 districts (same set as web src/data/districts.ts), busiest markets first. */
val SRI_LANKA_DISTRICTS: List<String> = listOf(
    "Colombo", "Gampaha", "Kandy", "Kurunegala", "Galle", "Kalutara", "Matara", "Ratnapura",
    "Kegalle", "Puttalam", "Anuradhapura", "Badulla", "Hambantota", "Nuwara Eliya", "Matale",
    "Jaffna", "Polonnaruwa", "Ampara", "Batticaloa", "Trincomalee", "Monaragala", "Vavuniya",
    "Kilinochchi", "Mannar", "Mullaitivu",
)

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
    /** Models of [modelsMake] for the dependent Model picker. */
    val models: List<String> = emptyList(),
    val modelsMake: String? = null,
    /** Listing sources (ikman, riyasewana…) for the Source filter. */
    val sources: List<String> = emptyList(),
    val alertSaved: Boolean = false,
    val error: String? = null,
    /** Free tier has no deal_score — backend forces `newest` (BestPicks.tsx parity). */
    val isPro: Boolean = false,
    /** One-shot: SearchScreen launches the system recogniser then [SearchViewModel.consumeVoice]. */
    val pendingVoice: Boolean = false,
    /** Saved listing ids (card heart state), same source as Best Picks. */
    val watchedIds: Set<Int> = emptySet(),
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
    private val observeWatchlist: ObserveWatchlistUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState(districts = SRI_LANKA_DISTRICTS))
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    /** Ids whose entrance already played (survives Search leaving composition while Detail is open). */
    val revealedIds: HashSet<Int> = HashSet()

    private val queryFlow = MutableStateFlow("")
    private val pagingKey = MutableStateFlow(defaultSearchQuery())

    /** True while results come from the offline snapshot (backend down). */
    val fromSnapshot: kotlinx.coroutines.flow.StateFlow<Boolean> get() = getListingsPaging.fromSnapshot

    /** Paging3 stream; re-created on query/filter/sort change, cached in VM scope. */
    val paging: Flow<PagingData<Listing>> = pagingKey
        .flatMapLatest { getListingsPaging(it) }
        .cachedIn(viewModelScope)

    init {
        val route = runCatching { savedStateHandle.toRoute<Search>() }.getOrNull()
        route?.let { applyRouteArgs(it) }
        // Filters survive process death / config change (SavedStateHandle),
        // unless this entry was opened with explicit args.
        if (_state.value.filters == defaultSearchQuery()) {
            restoreSavedFilters()?.let { applyFilters(it) }
        }
        viewModelScope.launch {
            observeSession().collect { session ->
                val isPro = session?.isPro == true
                val current = _state.value
                // Only the deal-score sort is Pro (backend downgrades it for free plans).
                val nextFilters = if (!isPro && current.filters.sort == ListingSorts.DEAL_SCORE) {
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
            runCatching {
                observeWatchlist().collect { rows ->
                    _state.value = _state.value.copy(watchedIds = rows.map { it.listingId }.toSet())
                }
            }
        }
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(
                    makes = listings.makes(),
                )
            } catch (_: Exception) {
            }
        }
        viewModelScope.launch {
            runCatching { listings.sources() }.getOrNull()?.let { src ->
                _state.value = _state.value.copy(sources = src.filter { it.isNotBlank() }.distinct())
            }
        }
        _state.value.filters.make?.let { loadModels(it) }
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
        // Clearing the field (✕ or deleting the text) drops the keyword filter too,
        // otherwise the results stay filtered by a query the field no longer shows.
        if (q.isBlank() && _state.value.filters.keyword != null) {
            applyFilters(_state.value.filters.copy(keyword = null))
        }
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
        saveFilters(query)
    }

    /** Models for the dependent Model picker (cached per make). */
    fun loadModels(make: String?) {
        if (make.isNullOrBlank()) {
            _state.value = _state.value.copy(models = emptyList(), modelsMake = null)
            return
        }
        if (_state.value.modelsMake == make && _state.value.models.isNotEmpty()) return
        _state.value = _state.value.copy(models = emptyList(), modelsMake = make)
        viewModelScope.launch {
            val models = runCatching { listings.models(make) }.getOrDefault(emptyList())
            if (_state.value.modelsMake == make) {
                _state.value = _state.value.copy(models = models.filter { it.isNotBlank() }.distinct())
            }
        }
    }

    /** Live total for the sheet's "Show N results" (backend `total`); null when unknown/offline. */
    suspend fun countFor(query: ListingQuery): Int? = listings.count(query)

    /** Removes one active filter (the dismissible chips above the results). */
    fun removeFilter(key: String) {
        val f = _state.value.filters
        applyFilters(
            when (key) {
                "make" -> f.copy(make = null, model = null)
                "model" -> f.copy(model = null)
                "price" -> f.copy(priceMin = null, priceMax = null)
                "year" -> f.copy(yearMin = null, yearMax = null)
                "mileage" -> f.copy(mileageMax = null)
                "fuel" -> f.copy(fuelType = null)
                "transmission" -> f.copy(transmission = null)
                "condition" -> f.copy(condition = null)
                "body" -> f.copy(bodyType = null)
                "district" -> f.copy(district = null)
                "source" -> f.copy(source = null)
                "noprice" -> f.copy(priceAvailability = null)
                "archive" -> f.copy(includeArchive = false)
                else -> f
            },
        )
    }

    private fun saveFilters(q: ListingQuery) {
        savedStateHandle[SAVED_FILTERS_KEY] = arrayListOf(
            q.make.orEmpty(), q.model.orEmpty(), q.district.orEmpty(), q.sort, q.toWebFilters().orEmpty(),
        )
    }

    private fun restoreSavedFilters(): ListingQuery? {
        val saved = savedStateHandle.get<ArrayList<String>>(SAVED_FILTERS_KEY) ?: return null
        if (saved.size < 5) return null
        return ListingQuery(
            make = saved[0].ifBlank { null },
            model = saved[1].ifBlank { null },
            district = saved[2].ifBlank { null },
            sort = saved[3].ifBlank { ListingSorts.NEWEST },
            vehicleCategory = VehicleCategory.DEFAULT.apiValue,
        ).withWebFilters(saved[4].ifBlank { null })
    }

    fun onSortChange(sort: String) {
        // Free tier has no deal_score — only that sort is Pro; price/km/newest stay free.
        if (!_state.value.isPro && sort == ListingSorts.DEAL_SCORE) {
            applyFilters(_state.value.filters.copy(sort = ListingSorts.NEWEST))
            _state.value = _state.value.copy(
                error = "Best-deal sort is a Pro feature — upgrade to Pro to sort by deal score",
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
            !route.filters.isNullOrBlank() ||
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
        private const val SAVED_FILTERS_KEY = "search_filters_v1"
    }
}
