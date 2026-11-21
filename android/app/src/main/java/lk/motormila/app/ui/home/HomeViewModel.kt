package lk.motormila.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import lk.motormila.app.data.repository.WatchlistRepositoryImpl
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.model.VehicleCategoryRules
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.domain.model.carsOnlyOrFirst
import lk.motormila.app.domain.usecase.GetPriceDropsUseCase

// Legacy BestPicksViewModel caller; Buy does not rank price cuts by percentage or category.
internal fun List<PriceDrop>.carsFirst(): List<PriceDrop> =
    filter { kotlin.math.abs(it.dropPct) <= 60.0 }
        .carsOnlyOrFirst { VehicleCategoryRules.isCarLike(it.listing) }

data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val priceDrops: List<PriceDrop> = emptyList(),
    val savedVehicle: WatchItem? = null,
    val unavailableSavedIds: Set<Int> = emptySet(),
    val shortlistReady: Boolean = true,
    val showCachedBadge: Boolean = false,
    // Source-compatible with the existing Home screenshot fixtures. Buy neither loads nor
    // presents national aggregates: they are not evidence about a particular vehicle.
    val summary: StatsSummary = StatsSummary(),
    val insights: Insights = Insights(),
    val districts: List<DistrictStat> = emptyList(),
) {
    internal val recordedDrop: PriceDrop?
        get() = priceDrops.firstOrNull {
            it.listing.id != savedVehicle?.listingId && it.listing.id !in unavailableSavedIds && it.isDocumentedDrop()
        }
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val getPriceDrops: GetPriceDropsUseCase,
    watchlist: WatchlistRepositoryImpl,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState(shortlistReady = false))
    val state: StateFlow<HomeUiState> = _state.asStateFlow()
    private var loadJob: Job? = null

    init {
        // Local observation only. Opening Buy must not refresh every watched vehicle or
        // require sign-in/network before the buyer can resume a listing.
        viewModelScope.launch {
            watchlist.observeCheckedSaves().catch { emit(emptyList()) }.collect { rows ->
                val (gone, availableOrUnchecked) = rows.partition { (_, check) -> check?.unavailable == true }
                val resume = availableOrUnchecked.map { it.first }.resumeVehicle()
                val goneIds = gone.map { it.first.listingId }.toSet()
                _state.update { it.copy(shortlistReady = true, savedVehicle = resume, unavailableSavedIds = goneIds) }
            }
        }
        load(refreshing = false)
    }

    fun refresh() = load(refreshing = true)
    fun retry() = load(refreshing = false)
    fun dismissCachedBadge() = _state.update { it.copy(showCachedBadge = false) }

    private fun load(refreshing: Boolean) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isLoading = !refreshing, isRefreshing = refreshing) }
            val drops = try {
                withTimeoutOrNull(20_000L) { getPriceDrops() }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                null
            }
            _state.update {
                it.copy(isLoading = false, isRefreshing = false, showCachedBadge = drops == null,
                    priceDrops = drops ?: it.priceDrops)
            }
        }
    }
}
