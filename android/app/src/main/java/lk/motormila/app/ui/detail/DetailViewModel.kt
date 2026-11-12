package lk.motormila.app.ui.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.HistoryReport
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.SellerProfile
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.domain.repository.WatchlistRepository
import lk.motormila.app.domain.usecase.GetListingDetailUseCase
import lk.motormila.app.domain.usecase.GetSimilarUseCase
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import javax.inject.Inject

import androidx.navigation.toRoute
import lk.motormila.app.ui.navigation.ListingDetail

data class DetailUiState(
    val isLoading: Boolean = true,
    val listing: Listing? = null,
    val similar: List<Listing> = emptyList(),
    val history: PriceHistory? = null,
    val report: HistoryReport? = null,
    val fmv: Fmv? = null,
    val seller: SellerProfile? = null,
    val isWatched: Boolean = false,
    val isPro: Boolean = false,
    val isOffline: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class DetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val getDetail: GetListingDetailUseCase,
    private val getSimilar: GetSimilarUseCase,
    private val observeSession: ObserveSessionUseCase,
    private val listings: ListingRepository,
    private val watchlist: WatchlistRepository,
) : ViewModel() {

    var listingId: Int = runCatching { savedStateHandle.toRoute<ListingDetail>().id }.getOrNull()
        ?: savedStateHandle.get<Int>("id")
        ?: savedStateHandle.get<Int>("listingId")
        ?: 0
        private set

    // Seeded from the card the user tapped (see ListingPreviewCache): the
    // first frame already has the photo / title / price the card showed, so
    // the container transform has real targets from frame one.
    private val _state = MutableStateFlow(
        lk.motormila.app.ui.navigation.ListingPreviewCache.get(listingId)?.let { seed ->
            DetailUiState(isLoading = true, listing = seed)
        } ?: DetailUiState(),
    )

    /** Id of the load in flight / finished, so the screen's LaunchedEffect does not refetch. */
    private var loadedId: Int = 0

    /** Secondary payloads (FMV, history…) wait until the open transition has settled. */
    private var shownAtMs: Long = 0L
    val state: StateFlow<DetailUiState> = _state.asStateFlow()

    init {
        observePro()
        if (listingId > 0) {
            load()
        }
    }

    private fun observePro() {
        viewModelScope.launch {
            observeSession().collect { session ->
                _state.value = _state.value.copy(isPro = session?.isPro == true)
            }
        }
    }

    fun load(id: Int = listingId) {
        if (id > 0) {
            listingId = id
        }
        if (listingId == 0) {
            _state.value = _state.value.copy(isLoading = false, error = "Missing listing id")
            return
        }
        // init already started this id; the screen's LaunchedEffect(listingId)
        // used to start a second, identical load whose late state updates
        // re-laid the page out mid-transition.
        if (loadedId == listingId && _state.value.error == null) return
        loadedId = listingId
        shownAtMs = android.os.SystemClock.uptimeMillis()
        viewModelScope.launch {
            val seed = _state.value.listing?.takeIf { it.id == listingId }
                ?: lk.motormila.app.ui.navigation.ListingPreviewCache.get(listingId)
            _state.value = if (seed != null) {
                _state.value.copy(isLoading = true, error = null, listing = seed)
            } else {
                _state.value.copy(
                    isLoading = true, error = null,
                    listing = _state.value.listing?.takeIf { it.id == listingId },
                    similar = emptyList(), history = null, report = null, fmv = null, seller = null,
                )
            }
            try {
                val detail = getDetail(listingId)
                holdForTransition()
                _state.value = _state.value.copy(listing = detail, isLoading = false)
                observeWatchedOnce()
                // Secondary payloads load independently; one failure must not blank the page.
                launch { loadSimilar() }
                launch { loadHistory() }
                launch { loadFmv() }
                launch { loadSeller() }
            } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
                throw ce
            } catch (e: Exception) {
                // Live call failed and the listing isn't in the offline snapshot either:
                // report the live failure (timeout / no connection / 404), not the
                // internal "not in the offline snapshot" fallback message.
                val cause = e.suppressed.firstOrNull() ?: e
                _state.value = _state.value.copy(
                    isLoading = false,
                    isOffline = true,
                    error = lk.motormila.app.core.network.ErrorMapper.map(cause).message
                        .takeIf { it.isNotBlank() } ?: "Couldn't load listing",
                )
            }
        }
    }

    fun retry() {
        loadedId = 0
        load()
    }

    /**
     * Content that changes the page layout (full detail, FMV gauge, history,
     * similar rail) is applied only after the open transition (~450 ms) has
     * settled, so the container transform never re-lays out mid-flight.
     */
    private suspend fun holdForTransition() {
        val wait = TRANSITION_HOLD_MS - (android.os.SystemClock.uptimeMillis() - shownAtMs)
        if (wait > 0) kotlinx.coroutines.delay(wait)
    }

    private suspend fun loadSimilar() {
        try {
            val similar = getSimilar(listingId)
            holdForTransition()
            _state.value = _state.value.copy(similar = similar)
        } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
            throw ce
        } catch (_: Exception) {
        }
    }

    private suspend fun loadHistory() {
        try {
            val deferredHistory = viewModelScope.async { listings.priceHistory(listingId) }
            val deferredReport = viewModelScope.async { listings.historyReport(listingId) }
            val history = deferredHistory.await()
            val report = deferredReport.await()
            holdForTransition()
            _state.value = _state.value.copy(history = history, report = report)
        } catch (_: Exception) {
        }
    }

    private suspend fun loadFmv() {
        try {
            val fmv = listings.fmv(listingId)
            holdForTransition()
            _state.value = _state.value.copy(fmv = fmv)
        } catch (_: Exception) {
        }
    }

    private suspend fun loadSeller() {
        try {
            val seller = listings.sellerProfile(listingId)
            holdForTransition()
            _state.value = _state.value.copy(seller = seller)
        } catch (_: Exception) {
        }
    }

    private var watchedJob: kotlinx.coroutines.Job? = null

    private fun observeWatchedOnce() {
        // Cancel any prior collector before starting a new one — load()/retry()
        // must not stack infinite collectors.
        watchedJob?.cancel()
        watchedJob = viewModelScope.launch {
            watchlist.isWatched(listingId).collect { watched ->
                _state.value = _state.value.copy(isWatched = watched)
            }
        }
    }

    fun toggleWatch() {
        val listing = _state.value.listing ?: return
        viewModelScope.launch {
            try {
                if (_state.value.isWatched) watchlist.remove(listing.id)
                else watchlist.add(listing)
            } catch (_: Exception) {
            }
        }
    }

    private companion object {
        const val TRANSITION_HOLD_MS = 480L
    }
}
