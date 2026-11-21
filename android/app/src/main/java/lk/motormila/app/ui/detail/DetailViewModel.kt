package lk.motormila.app.ui.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
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

/**
 * Tri-state for the detail screen's secondary payloads (similar, history,
 * FMV, seller). FAILED surfaces an inline retry instead of a permanent
 * "Loading…" (audit P1-B).
 */
enum class DetailLoadState { LOADING, LOADED, FAILED }

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
    /** True ONLY for genuine network failures (drives the OfflineBanner + retry). */
    val isOffline: Boolean = false,
    val error: String? = null,
    val similarState: DetailLoadState = DetailLoadState.LOADING,
    val historyState: DetailLoadState = DetailLoadState.LOADING,
    val fmvState: DetailLoadState = DetailLoadState.LOADING,
    val sellerState: DetailLoadState = DetailLoadState.LOADING,
    /** The listing itself is gone (404/NotFound): dedicated "no longer available" state, never a futile Retry. */
    val notFound: Boolean = false,
    /** One-shot watchlist toggle failure; the screen shows a snackbar and clears it via [DetailViewModel.clearWatchError]. */
    val watchError: String? = null,
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

    private var loadJob: kotlinx.coroutines.Job? = null
    private var watchedJob: kotlinx.coroutines.Job? = null

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
        loadJob?.cancel()
        watchedJob?.cancel()
        loadedId = listingId
        shownAtMs = android.os.SystemClock.uptimeMillis()
        val seed = _state.value.listing?.takeIf { it.id == id }
            ?: lk.motormila.app.ui.navigation.ListingPreviewCache.get(id)
        _state.value = DetailUiState(listing = seed, isPro = _state.value.isPro)
        observeWatchedOnce()
        loadJob = viewModelScope.launch {
            try {
                val detail = getDetail(id)
                holdForTransition()
                _state.value = _state.value.copy(listing = detail, isLoading = false)
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
                val mapped = lk.motormila.app.core.network.ErrorMapper.map(cause)
                // 404/NotFound (live or snapshot path) → the listing is gone: a
                // dedicated "no longer available" state, not ErrorState + futile Retry.
                val gone = mapped is lk.motormila.app.core.common.AppError.NotFound ||
                    lk.motormila.app.core.network.ErrorMapper.map(e) is lk.motormila.app.core.common.AppError.NotFound
                _state.value = _state.value.copy(
                    isLoading = false,
                    notFound = gone,
                    fmvState = DetailLoadState.FAILED,
                    historyState = DetailLoadState.FAILED,
                    sellerState = DetailLoadState.FAILED,
                    similarState = DetailLoadState.FAILED,
                    // OfflineBanner is for genuine network errors only — a 404 or a
                    // server fault is not "offline".
                    isOffline = mapped is lk.motormila.app.core.common.AppError.Network,
                    error = if (gone) null else mapped.message
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
        val id = listingId
        _state.value = _state.value.copy(similarState = DetailLoadState.LOADING)
        try {
            val similar = getSimilar(id)
            holdForTransition()
            if (id != listingId) return // an in-place swap started a newer load
            _state.value = _state.value.copy(similar = similar, similarState = DetailLoadState.LOADED)
        } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
            throw ce
        } catch (_: Exception) {
            if (id != listingId) return
            _state.value = _state.value.copy(similarState = DetailLoadState.FAILED)
        }
    }

    private suspend fun loadHistory() {
        val id = listingId
        _state.value = _state.value.copy(historyState = DetailLoadState.LOADING)
        try {
            val history = listings.priceHistory(id)
            holdForTransition()
            if (id != listingId) return
            _state.value = _state.value.copy(history = history, historyState = DetailLoadState.LOADED)
            // Optional ownership flags must not hide a successfully fetched price movement.
            val report = try {
                listings.historyReport(id)
            } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
                throw ce
            } catch (_: Exception) {
                null
            }
            if (id == listingId) _state.value = _state.value.copy(report = report)
        } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
            throw ce
        } catch (_: Exception) {
            if (id != listingId) return
            _state.value = _state.value.copy(historyState = DetailLoadState.FAILED)
        }
    }

    private suspend fun loadFmv() {
        val id = listingId
        _state.value = _state.value.copy(fmvState = DetailLoadState.LOADING)
        try {
            val fmv = listings.fmv(id)
            holdForTransition()
            if (id != listingId) return
            _state.value = _state.value.copy(fmv = fmv, fmvState = DetailLoadState.LOADED)
        } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
            throw ce
        } catch (_: Exception) {
            if (id != listingId) return
            _state.value = _state.value.copy(fmvState = DetailLoadState.FAILED)
        }
    }

    private suspend fun loadSeller() {
        val id = listingId
        _state.value = _state.value.copy(sellerState = DetailLoadState.LOADING)
        try {
            val seller = listings.sellerProfile(id)
            holdForTransition()
            if (id != listingId) return
            _state.value = _state.value.copy(seller = seller, sellerState = DetailLoadState.LOADED)
        } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
            throw ce
        } catch (_: Exception) {
            if (id != listingId) return
            _state.value = _state.value.copy(sellerState = DetailLoadState.FAILED)
        }
    }

    /** Inline retries for the secondary payloads (audit P1-B: no permanent "Loading…"). */
    fun retrySimilar() { viewModelScope.launch { loadSimilar() } }
    fun retryHistory() { viewModelScope.launch { loadHistory() } }
    fun retryFmv() { viewModelScope.launch { loadFmv() } }
    fun retrySeller() { viewModelScope.launch { loadSeller() } }

    /** Acknowledge the one-shot watchlist failure after the snackbar has shown it. */
    fun clearWatchError() {
        _state.value = _state.value.copy(watchError = null)
    }

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
                watchlist.toggle(listing)
            } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
                throw ce
            } catch (e: Exception) {
                // Surface the failure (snackbar on the screen) instead of silently
                // leaving the heart icon in the wrong state.
                _state.value = _state.value.copy(
                    watchError = lk.motormila.app.core.network.ErrorMapper.map(e).message,
                )
            }
        }
    }

    private companion object {
        const val TRANSITION_HOLD_MS = 480L
    }
}
