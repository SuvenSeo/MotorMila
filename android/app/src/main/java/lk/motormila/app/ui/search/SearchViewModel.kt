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
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

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

const val MAX_COMPARE_IDS = lk.motormila.app.ui.compare.COMPARE_CAPACITY

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
    val isSignedIn: Boolean = false,
    val alertOwner: String? = null,
    val alertDraft: ListingQuery? = null,
    val alertSaving: Boolean = false,
    val alertError: String? = null,
    val error: String? = null,
    /** Free tier has no deal_score — backend forces `newest` (BestPicks.tsx parity). */
    val isPro: Boolean = false,
    /** One-shot: SearchScreen launches the system recogniser then [SearchViewModel.consumeVoice]. */
    val pendingVoice: Boolean = false,
    /** Saved listing ids (card heart state), same source as Best Picks. */
    val watchedIds: Set<Int> = emptySet(),
    /** Live backend total for the applied query (result-count line); null while unknown/offline. */
    val resultTotal: Int? = null,
    /** Free user tapped the locked Best-deal sort: show the Pro upsell sheet (no silent downgrade). */
    val showProUpsell: Boolean = false,
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

    private var alertSaveJob: Job? = null
    private val queryFlow = MutableStateFlow("")
    private val pagingKey = MutableStateFlow(defaultSearchQuery())

    /** Typed keyword, debounced into the paging key so results update live (not only on IME submit). */
    private val liveKeyword = MutableStateFlow<String?>(null)

    /** True while results come from the offline snapshot (backend down). */
    val fromSnapshot: kotlinx.coroutines.flow.StateFlow<Boolean> get() = getListingsPaging.fromSnapshot

    /** Paging3 stream; re-created on query/filter/sort change, cached in VM scope. */
    val paging: Flow<PagingData<Listing>> = pagingKey
        .flatMapLatest { getListingsPaging(it) }
        .cachedIn(viewModelScope)

    init {
        // Recent searches survive process death / config change (SavedStateHandle).
        savedStateHandle.get<ArrayList<String>>(RECENT_SEARCHES_KEY)
            ?.filter { it.isNotBlank() }?.distinct()?.take(8)
            ?.let { _state.value = _state.value.copy(recentSearches = it) }
        val route = runCatching { savedStateHandle.toRoute<Search>() }.getOrNull()
        // Nav args seed a new entry; a restored entry already has the buyer's later edits.
        val restored = restoreSavedFilters()
        if (restored != null) {
            _state.value = _state.value.copy(query = restored.keyword.orEmpty())
            applyFilters(restored)
        } else route?.let { applyRouteArgs(it) }
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
                val owner = session?.email?.trim()?.lowercase()
                val next = if (current.alertOwner != null && current.alertOwner != owner) {
                    alertSaveJob?.cancel()
                    current.copy(alertDraft = null, alertError = null, alertSaving = false, alertSaved = false, showFilterSheet = false)
                } else current // A guest may finish reviewing after signing in.
                _state.value = next.copy(isSignedIn = session != null, alertOwner = owner, isPro = isPro, filters = nextFilters)
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
                val makes = listings.makes()
                _state.value = _state.value.copy(makes = makes)
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
                        val suggestions = listings.suggestions(q)
                        if (q == queryFlow.value) _state.value = _state.value.copy(suggestions = suggestions)
                    } catch (_: Exception) {
                    }
                }
            }
        }
        // Live results: the typed keyword joins the paging key after a 400 ms
        // pause, so results follow typing instead of waiting for IME submit.
        viewModelScope.launch {
            liveKeyword.debounce(400).distinctUntilChanged().collect { kw ->
                val current = _state.value.filters
                if (current.keyword != kw) {
                    val next = current.copy(keyword = kw)
                    _state.value = _state.value.copy(filters = next)
                    pagingKey.value = next
                    saveFilters(next)
                }
            }
        }
        // Result-count line: live backend total for the applied query.
        viewModelScope.launch {
            pagingKey.debounce(350).distinctUntilChanged().collect { q ->
                val total = runCatching { listings.count(q) }.getOrNull()
                // A newer query may have landed while counting; don't overwrite it.
                if (pagingKey.value == q) {
                    _state.value = _state.value.copy(resultTotal = total)
                }
            }
        }
        // Seed the live keyword with whatever the route / restored filters set,
        // so the first debounce emission is a no-op instead of clearing it.
        liveKeyword.value = _state.value.filters.keyword
    }

    fun onQueryChange(q: String) {
        queryFlow.value = q
        _state.value = _state.value.copy(query = q)
        val kw = q.trim().ifBlank { null }
        // Clearing the field (✕ or deleting the text) drops the keyword filter too,
        // otherwise the results stay filtered by a query the field no longer shows.
        if (kw == null && _state.value.filters.keyword != null) {
            applyFilters(_state.value.filters.copy(keyword = null))
        }
        liveKeyword.value = kw
    }

    fun onSearch(q: String) {
        val trimmed = q.trim()
        _state.value = _state.value.copy(query = trimmed)
        // Commit immediately (IME / pinned row); align the debounce so a stale
        // pending keyword can't re-apply after the explicit search.
        liveKeyword.value = trimmed.ifBlank { null }
        if (trimmed.isNotBlank()) {
            val recents = (listOf(trimmed) + _state.value.recentSearches).distinct().take(8)
            _state.value = _state.value.copy(recentSearches = recents)
            persistRecents(recents)
        }
        applyFilters(_state.value.filters.copy(keyword = trimmed.ifBlank { null }))
    }

    fun applyIncomingQuery(query: ListingQuery) {
        val text = query.keyword?.trim().orEmpty()
        liveKeyword.value = text.ifBlank { null }
        if (text.isNotBlank()) {
            onQueryChange(text)
            val recents = (listOf(text) + _state.value.recentSearches).distinct().take(8)
            _state.value = _state.value.copy(recentSearches = recents)
            persistRecents(recents)
        }
        applyFilters(query.copy(keyword = text.ifBlank { null }))
    }

    /** Per-row remove in the recent-searches dropdown. */
    fun removeRecent(query: String) {
        val recents = _state.value.recentSearches.filterNot { it == query }
        _state.value = _state.value.copy(recentSearches = recents)
        persistRecents(recents)
    }

    /** Clear-history action in the recent-searches dropdown. */
    fun clearRecents() {
        _state.value = _state.value.copy(recentSearches = emptyList())
        persistRecents(emptyList())
    }

    private fun persistRecents(recents: List<String>) {
        savedStateHandle[RECENT_SEARCHES_KEY] = ArrayList(recents)
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
            q.keyword.orEmpty(), q.vehicleCategory.orEmpty(),
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
            keyword = saved.getOrNull(5)?.ifBlank { null },
            vehicleCategory = if (saved.size >= 7) saved[6].ifBlank { null } else VehicleCategory.DEFAULT.apiValue,
        ).withWebFilters(saved[4].ifBlank { null })
    }

    fun onSortChange(sort: String) {
        // Free tier has no deal_score — only that sort is Pro; price/km/newest stay free.
        // Instead of a silent downgrade + error toast, the UI opens a Pro upsell.
        if (!_state.value.isPro && sort == ListingSorts.DEAL_SCORE) {
            _state.value = _state.value.copy(showProUpsell = true)
            return
        }
        applyFilters(_state.value.filters.copy(sort = sort))
    }

    fun dismissProUpsell() {
        _state.value = _state.value.copy(showProUpsell = false)
    }

    fun openFilters() {
        // Flush the visible keyword before opening a draft; a late debounce
        // must not reset the sheet after the first filter edit.
        val q = _state.value.filters.copy(keyword = liveKeyword.value)
        if (q != _state.value.filters) applyFilters(q)
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
            _state.value = _state.value.copy(error = ERR_COMPARE_FULL)
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

    fun reviewAlert(draft: ListingQuery) {
        if (!_state.value.alertSaving) _state.value = _state.value.copy(alertDraft = draft, alertError = null)
    }

    fun dismissAlertReview() {
        if (!_state.value.alertSaving) _state.value = _state.value.copy(alertDraft = null, alertError = null)
    }

    /** The confirmation and the request use one snapshot. No write on preview or sign-in. */
    internal fun confirmAlert(review: SearchAlertReview, expectedOwner: String?) {
        val current = _state.value
        if (expectedOwner == null || current.alertOwner != expectedOwner || current.alertSaving || current.alertDraft != review.draft) return
        val rule = review.rule ?: return
        _state.value = current.copy(alertSaving = true, alertError = null)
        alertSaveJob = viewModelScope.launch {
            try {
                alerts.create(rule, expectedOwner)
                ensureActive()
                _state.value = _state.value.copy(alertSaved = true, alertDraft = null, showFilterSheet = false)
            } catch (e: kotlin.coroutines.cancellation.CancellationException) {
                throw e
            } catch (e: Exception) {
                ensureActive()
                val mapped = lk.motormila.app.core.network.ErrorMapper.map(e)
                val key = if (mapped is lk.motormila.app.core.common.AppError.Unauthorized) {
                    SIGN_IN_FOR_ALERTS
                } else ERR_ALERT_SAVE_PREFIX + mapped.message
                _state.value = _state.value.copy(alertError = key)
            } finally {
                if (isActive) _state.value = _state.value.copy(alertSaving = false)
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
        private const val RECENT_SEARCHES_KEY = "search_recent_searches_v1"

        /** Stable error keys localised by SearchScreen (v19_search.xml). */
        const val ERR_COMPARE_FULL = "search_err_compare_full"
        const val ERR_ALERT_SAVE_PREFIX = "search_err_alert_save:"
    }
}
