package lk.motormila.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.usecase.GetDistrictPricesUseCase
import lk.motormila.app.domain.usecase.GetInsightsUseCase
import lk.motormila.app.domain.usecase.GetPriceDropsUseCase
import lk.motormila.app.domain.usecase.GetStatsSummaryUseCase
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.domain.usecase.ToggleWatchlistUseCase
import lk.motormila.app.domain.model.VehicleCategory
import lk.motormila.app.domain.model.VehicleCategoryRules
import lk.motormila.app.domain.model.carsOnlyOrFirst
import javax.inject.Inject

/**
 * First impression is cars: Home rails come from endpoints without a category
 * param, so keep car-like items only (or rank them first when too few).
 */
/** Deals claiming more than this % below typical are treated as data errors on Home. */
internal const val MAX_PLAUSIBLE_DEAL_PCT = 60.0

internal fun Insights.carsFirst(): Insights = copy(
    hotDeals = hotDeals
        // "96% below typical" is a mis-parsed price, not a deal: never lead with it.
        .filter { it.dealScore <= MAX_PLAUSIBLE_DEAL_PCT }
        .carsOnlyOrFirst { VehicleCategoryRules.isCarLike(null, it.make, it.model) },
    trendingModels = trendingModels.carsOnlyOrFirst { VehicleCategoryRules.isCarLike(null, it.make, it.model) },
)

internal fun List<PriceDrop>.carsFirst(): List<PriceDrop> =
    carsOnlyOrFirst { VehicleCategoryRules.isCarLike(it.listing) }


data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val summary: StatsSummary = StatsSummary(),
    val insights: Insights = Insights(),
    val priceDrops: List<PriceDrop> = emptyList(),
    val districts: List<DistrictStat> = emptyList(),
    val fuelMix: List<FuelMixBucket> = emptyList(),
    val isPro: Boolean = false,
    val isOffline: Boolean = false,
    val showCachedBadge: Boolean = false,
    val error: String? = null,
)

/** 5-tuple for the parallel home load (destructurable). */
private data class Quint<A, B, C, D, E>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D,
    val fifth: E,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val getStatsSummary: GetStatsSummaryUseCase,
    private val getInsights: GetInsightsUseCase,
    private val getPriceDrops: GetPriceDropsUseCase,
    private val getDistrictPrices: GetDistrictPricesUseCase,
    private val observeSession: ObserveSessionUseCase,
    private val toggleWatchlist: ToggleWatchlistUseCase,
    private val stats: StatsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    /** Live ticker for the home live-strip (empty when offline). */
    val liveStrip: StateFlow<List<Listing>> = stats.liveListings(limit = 10)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        observePro()
        load()
        armStuckLoadWatchdog()
    }

    private fun observePro() {
        viewModelScope.launch {
            observeSession().collect { session ->
                _state.value = _state.value.copy(isPro = session?.isPro == true)
            }
        }
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                // Hard bound: no single hanging call (dead radio, captive portal,
                // stalled snapshot fetch) may keep the skeleton up forever.
                // Each section is bounded on its own (see bounded()); partial results apply.
                coroutineScope {
                    val summaryDef = async { bounded { getStatsSummary() } }
                    val insightsDef = async { bounded { getInsights().carsFirst() } }
                    val dropsDef = async { bounded { getPriceDrops().carsFirst() } }
                    val districtsDef = async { bounded { getDistrictPrices() } }
                    val fuelDef = async { bounded { stats.fuelMix() } }

                    // Headline sections first: publish as soon as they land so a
                    // slow secondary section never holds Home in skeleton/offline.
                    val summary = summaryDef.await()
                    val insights = insightsDef.await()
                    if (summary == null && insights == null) {
                        _state.value = _state.value.copy(
                            isLoading = false,
                            isOffline = true,
                            showCachedBadge = true,
                            error = "Couldn't reach Motormila",
                        )
                    } else {
                        _state.value = _state.value.copy(
                            isLoading = false,
                            summary = summary ?: _state.value.summary,
                            insights = insights ?: _state.value.insights,
                            isOffline = false,
                            showCachedBadge = false,
                            error = null,
                        )
                    }

                    val drops = dropsDef.await()
                    val districts = districtsDef.await()
                    val fuel = fuelDef.await()
                    _state.value = _state.value.copy(
                        priceDrops = drops ?: _state.value.priceDrops,
                        districts = districts ?: _state.value.districts,
                        fuelMix = fuel ?: _state.value.fuelMix,
                    )
                }
            } catch (e: Exception) {
                // Offline: keep last good values, flag cached badge.
                _state.value = _state.value.copy(
                    isLoading = false,
                    isOffline = true,
                    showCachedBadge = true,
                    error = e.message ?: "Couldn't reach Motormila",
                )
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isRefreshing = true, error = null)
            try {
                // Same hard bound as load(): refresh must always settle.
                val (summary, insights, drops, districts, fuel) = coroutineScope {
                    val summaryDef = async { bounded { getStatsSummary() } }
                    val insightsDef = async { bounded { getInsights().carsFirst() } }
                    val dropsDef = async { bounded { getPriceDrops().carsFirst() } }
                    val districtsDef = async { bounded { getDistrictPrices() } }
                    val fuelDef = async { bounded { stats.fuelMix() } }
                    Quint(
                        summaryDef.await(),
                        insightsDef.await(),
                        dropsDef.await(),
                        districtsDef.await(),
                        fuelDef.await(),
                    )
                }

                _state.value = _state.value.copy(
                    summary = summary ?: _state.value.summary,
                    insights = insights ?: _state.value.insights,
                    priceDrops = drops ?: _state.value.priceDrops,
                    districts = districts ?: _state.value.districts,
                    fuelMix = fuel ?: _state.value.fuelMix,
                    isRefreshing = false,
                    isOffline = false,
                    showCachedBadge = false,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isRefreshing = false,
                    isOffline = true,
                    showCachedBadge = true,
                    error = e.message ?: "Couldn't refresh",
                )
            }
        }
    }

    fun retry() = load()

    /**
     * Per-section bound: one slow endpoint (cold HF backend, sequential
     * district enrichment) must not discard the sections that did load.
     * Previously a single withTimeout(20 s) around all five calls threw and
     * flagged the whole Home as offline with "0 cars listed" (QA 2026-10-21).
     */
    private suspend fun <T> bounded(block: suspend () -> T): T? =
        withTimeoutOrNull(SECTION_TIMEOUT_MS) { runCatching { block() }.getOrNull() }

    private companion object {
        const val SECTION_TIMEOUT_MS = 20_000L
    }

    fun dismissCachedBadge() {
        _state.value = _state.value.copy(showCachedBadge = false)
    }

    /**
     * Stuck-load watchdog: if a cold-started backend (or a dead device radio)
     * leaves every home request hanging, the skeleton would otherwise sit
     * forever. After [timeoutMs] with nothing loaded, flip to the error state
     * so the user gets a retry affordance instead of an eternal spinner.
     */
    fun armStuckLoadWatchdog(timeoutMs: Long = 12_000L) {
        viewModelScope.launch {
            kotlinx.coroutines.delay(timeoutMs)
            val s = _state.value
            if (s.isLoading && s.summary.totalListings == 0 && !s.isRefreshing) {
                _state.value = s.copy(
                    isLoading = false,
                    isOffline = true,
                    showCachedBadge = true,
                    error = "Taking too long to reach Motormila",
                )
            }
        }
    }

    fun onToggleWatch(listing: Listing) {
        viewModelScope.launch {
            try {
                toggleWatchlist(listing)
            } catch (_: Exception) {
                // Watchlist writes are local-first; surface nothing on home.
            }
        }
    }

    /** Feed query for the home "Latest" feed section (newest first). */
    fun feedQuery(): ListingQuery =
        ListingQuery(sort = "newest", vehicleCategory = VehicleCategory.DEFAULT.apiValue)
}
