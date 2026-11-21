package lk.motormila.app.ui.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import lk.motormila.app.R
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.usecase.GetDistrictPricesUseCase
import lk.motormila.app.domain.usecase.GetInsightsUseCase
import lk.motormila.app.domain.usecase.GetPriceDropsUseCase
import lk.motormila.app.domain.usecase.GetStatsSummaryUseCase
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.domain.usecase.ToggleWatchlistUseCase
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
    // Same plausibility rule as deals: a 75% "cut" is a mis-typed price, not a drop.
    filter { kotlin.math.abs(it.dropPct) <= MAX_PLAUSIBLE_DEAL_PCT }
        .carsOnlyOrFirst { VehicleCategoryRules.isCarLike(it.listing) }


data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val summary: StatsSummary = StatsSummary(),
    val insights: Insights = Insights(),
    val priceDrops: List<PriceDrop> = emptyList(),
    val districts: List<DistrictStat> = emptyList(),
    val isPro: Boolean = false,
    val isOffline: Boolean = false,
    val showCachedBadge: Boolean = false,
    val error: String? = null,
) {
    /** True once any headline payload has landed (live or kept from an earlier load). */
    val hasMarketData: Boolean
        get() = summary.totalListings > 0 || insights.hotDeals.isNotEmpty() || priceDrops.isNotEmpty()
}

/** 4-tuple for the parallel refresh (destructurable). */
private data class Quad<A, B, C, D>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val getStatsSummary: GetStatsSummaryUseCase,
    private val getInsights: GetInsightsUseCase,
    private val getPriceDrops: GetPriceDropsUseCase,
    private val getDistrictPrices: GetDistrictPricesUseCase,
    private val observeSession: ObserveSessionUseCase,
    private val toggleWatchlist: ToggleWatchlistUseCase,
    // Kept for constructor compatibility (tests, Hilt graph). Home no longer
    // fetches the fuel mix: nothing on Home displays it (EV hub owns it).
    @Suppress("UNUSED_PARAMETER") stats: StatsRepository,
    // Nullable + default keeps manual (test) construction source-compatible;
    // Hilt always injects the real application context.
    @ApplicationContext private val appContext: Context? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    /** The one load/refresh in flight; a new one (retry, pull) cancels it. */
    private var loadJob: Job? = null

    private fun str(resId: Int, fallback: String): String =
        appContext?.getString(resId) ?: fallback

    init {
        observePro()
        load()
        armStuckLoadWatchdog()
    }

    private fun observePro() {
        viewModelScope.launch {
            observeSession().collect { session ->
                _state.update { it.copy(isPro = session?.isPro == true) }
            }
        }
    }

    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isLoading = true, isRefreshing = false, error = null) }
            try {
                // Hard bound: no single hanging call (dead radio, captive portal,
                // stalled snapshot fetch) may keep the skeleton up forever.
                // Each section is bounded on its own (see bounded()); partial results apply.
                coroutineScope {
                    val summaryDef = async { bounded { getStatsSummary() } }
                    val insightsDef = async { bounded { getInsights().carsFirst() } }
                    val dropsDef = async { bounded { getPriceDrops().carsFirst() } }
                    val districtsDef = async { bounded { getDistrictPrices() } }

                    // Headline sections first: publish as soon as they land so a
                    // slow secondary section never holds Home in skeleton/offline.
                    val summary = summaryDef.await()
                    val insights = insightsDef.await()
                    if (summary == null && insights == null) {
                        // Last good values stay in state; the UI shows them with
                        // the cached badge, or an error state when there are none.
                        _state.update {
                            it.copy(
                                isLoading = false,
                                isOffline = true,
                                showCachedBadge = it.hasMarketData,
                                error = str(R.string.v19_home_err_reach, "Couldn't reach MotorMila"),
                            )
                        }
                    } else {
                        _state.update {
                            it.copy(
                                isLoading = false,
                                summary = summary ?: it.summary,
                                insights = insights ?: it.insights,
                                isOffline = false,
                                showCachedBadge = false,
                                error = null,
                            )
                        }
                    }

                    val drops = dropsDef.await()
                    val districts = districtsDef.await()
                    _state.update {
                        it.copy(
                            priceDrops = drops ?: it.priceDrops,
                            districts = districts ?: it.districts,
                        )
                    }
                }
            } catch (e: CancellationException) {
                // Superseded by a retry / refresh: that job owns the state now.
                throw e
            } catch (e: Exception) {
                // Offline: keep last good values, flag cached badge when we have them.
                _state.update {
                    it.copy(
                        isLoading = false,
                        isOffline = true,
                        showCachedBadge = it.hasMarketData,
                        error = e.message ?: str(R.string.v19_home_err_reach, "Couldn't reach MotorMila"),
                    )
                }
            }
        }
    }

    fun refresh() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true, error = null) }
            try {
                // Same hard bound as load(): refresh must always settle.
                val (summary, insights, drops, districts) = coroutineScope {
                    val summaryDef = async { bounded { getStatsSummary() } }
                    val insightsDef = async { bounded { getInsights().carsFirst() } }
                    val dropsDef = async { bounded { getPriceDrops().carsFirst() } }
                    val districtsDef = async { bounded { getDistrictPrices() } }
                    Quad(
                        summaryDef.await(),
                        insightsDef.await(),
                        dropsDef.await(),
                        districtsDef.await(),
                    )
                }

                val reached = summary != null || insights != null
                _state.update {
                    it.copy(
                        summary = summary ?: it.summary,
                        insights = insights ?: it.insights,
                        priceDrops = drops ?: it.priceDrops,
                        districts = districts ?: it.districts,
                        isLoading = false,
                        isRefreshing = false,
                        isOffline = !reached,
                        showCachedBadge = !reached && it.hasMarketData,
                        error = if (reached) null else str(R.string.v19_home_err_refresh, "Couldn't refresh"),
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        isOffline = true,
                        showCachedBadge = it.hasMarketData,
                        error = e.message ?: str(R.string.v19_home_err_refresh, "Couldn't refresh"),
                    )
                }
            }
        }
    }

    /** Retry cancels whatever load is still hanging and starts a fresh one. */
    fun retry() = load()

    /**
     * Per-section bound: one slow endpoint (cold HF backend, sequential
     * district enrichment) must not discard the sections that did load.
     * Previously a single withTimeout(20 s) around all five calls threw and
     * flagged the whole Home as offline with "0 cars listed" (QA 2026-10-21).
     * Cancellation (the section timeout, or a superseding retry) is rethrown
     * so withTimeoutOrNull / the parent job see it instead of a null result.
     */
    private suspend fun <T> bounded(block: suspend () -> T): T? =
        withTimeoutOrNull(SECTION_TIMEOUT_MS) {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
        }

    private companion object {
        const val SECTION_TIMEOUT_MS = 20_000L
    }

    fun dismissCachedBadge() {
        _state.update { it.copy(showCachedBadge = false) }
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
            _state.update { s ->
                if (s.isLoading && s.summary.totalListings == 0 && !s.isRefreshing) {
                    s.copy(
                        isLoading = false,
                        isOffline = true,
                        showCachedBadge = s.hasMarketData,
                        error = str(R.string.v19_home_err_slow, "Taking too long to reach MotorMila"),
                    )
                } else {
                    s
                }
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
}
