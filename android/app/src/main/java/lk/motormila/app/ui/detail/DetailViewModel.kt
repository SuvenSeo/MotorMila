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

    private val _state = MutableStateFlow(DetailUiState())
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
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val detail = getDetail(listingId)
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
                _state.value = _state.value.copy(
                    isLoading = false,
                    isOffline = true,
                    error = e.message ?: "Couldn't load listing",
                )
            }
        }
    }

    fun retry() = load()

    private suspend fun loadSimilar() {
        try {
            _state.value = _state.value.copy(similar = getSimilar(listingId))
        } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
            throw ce
        } catch (_: Exception) {
        }
    }

    private suspend fun loadHistory() {
        try {
            val deferredHistory = viewModelScope.async { listings.priceHistory(listingId) }
            val deferredReport = viewModelScope.async { listings.historyReport(listingId) }
            _state.value = _state.value.copy(
                history = deferredHistory.await(),
                report = deferredReport.await(),
            )
        } catch (_: Exception) {
        }
    }

    private suspend fun loadFmv() {
        try {
            _state.value = _state.value.copy(fmv = listings.fmv(listingId))
        } catch (_: Exception) {
        }
    }

    private suspend fun loadSeller() {
        try {
            _state.value = _state.value.copy(seller = listings.sellerProfile(listingId))
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
}
