package lk.motormila.app.ui.home

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lk.motormila.app.domain.model.DistrictInsight
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.MakeInsight
import lk.motormila.app.domain.model.MakeModelInsight
import lk.motormila.app.domain.model.MarketSignal
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.PriceIndex
import lk.motormila.app.domain.model.SelfSignupStatus
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.model.TrendSeries
import lk.motormila.app.domain.model.UserSession
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.repository.WatchlistRepository
import lk.motormila.app.domain.usecase.GetDistrictPricesUseCase
import lk.motormila.app.domain.usecase.GetInsightsUseCase
import lk.motormila.app.domain.usecase.GetPriceDropsUseCase
import lk.motormila.app.domain.usecase.GetStatsSummaryUseCase
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.domain.usecase.ToggleWatchlistUseCase
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Functional tests for [HomeViewModel] loading behaviour.
 *
 * Plain JVM tests (no emulator, no Robolectric): [Dispatchers.setMain] swaps
 * the Main dispatcher for a [StandardTestDispatcher] so virtual time controls
 * the 20s per-section [withTimeoutOrNull] bound deterministically.
 *
 * The v1.6.2 regression net: [HomeViewModel.load] hard-bounds the parallel
 * fetch with `withTimeout(20s)`, so even a repository that hangs forever
 * must settle the UI to an error/offline state instead of eternal skeletons.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelLoadTest {

    private val testDispatcher = StandardTestDispatcher()

    /**
     * StatsRepository fake with per-call behaviour hooks.
     * NOTE: hook properties use a `Fn` suffix — a property named `summary`
     * would collide with `fun summary()` and recurse infinitely.
     */
    private class FakeStatsRepository(
        var summaryFn: suspend () -> StatsSummary = { StatsSummary() },
        var insightsFn: suspend () -> Insights = { Insights() },
        var priceDropsFn: suspend () -> List<PriceDrop> = { emptyList() },
        var districtPricesFn: suspend () -> List<DistrictStat> = { emptyList() },
        var fuelMixFn: suspend () -> List<FuelMixBucket> = { emptyList() },
    ) : StatsRepository {
        override suspend fun summary(): StatsSummary = summaryFn()
        override fun summaryStream(): Flow<StatsSummary> = flowOf(StatsSummary())
        override suspend fun insights(): Insights = insightsFn()
        override suspend fun trends(
            make: String?, model: String?, condition: String?,
            district: String?, months: Int,
        ): TrendSeries = throw UnsupportedOperationException()
        override suspend fun priceIndex(): PriceIndex = throw UnsupportedOperationException()
        override suspend fun districtPrices(): List<DistrictStat> = districtPricesFn()
        override suspend fun districtVelocity(): List<DistrictVelocity> = emptyList()
        override suspend fun priceDrops(days: Int, limit: Int): List<PriceDrop> = priceDropsFn()
        override suspend fun fuelMix(): List<FuelMixBucket> = fuelMixFn()
        override suspend fun marketSignals(limit: Int): List<MarketSignal> = emptyList()
        override suspend fun marketSignal(id: Int): MarketSignal = throw UnsupportedOperationException()
        override fun liveListings(limit: Int): Flow<List<Listing>> = flowOf(emptyList())
        override suspend fun evInsight(make: String?, model: String?): TrendSeries =
            throw UnsupportedOperationException()
        override suspend fun districtInsight(district: String): DistrictInsight =
            throw UnsupportedOperationException()
        override suspend fun makeInsight(make: String): MakeInsight =
            throw UnsupportedOperationException()
        override suspend fun makeModelInsight(make: String, model: String): MakeModelInsight =
            throw UnsupportedOperationException()
    }

    private class FakeAuthRepository : AuthRepository {
        override fun session(): Flow<UserSession?> = flowOf(null)
        override suspend fun me(): UserSession? = null
        override suspend fun login(email: String, password: String): UserSession =
            throw UnsupportedOperationException()
        override suspend fun signup(
            name: String, email: String, password: String, inviteToken: String?,
        ): UserSession = throw UnsupportedOperationException()
        override suspend fun selfSignupStatus(): SelfSignupStatus =
            throw UnsupportedOperationException()
        override suspend fun selfSignup(name: String, email: String, password: String): UserSession =
            throw UnsupportedOperationException()
        override suspend fun logout() = Unit
        override suspend fun restore(): UserSession? = null
    }

    private class FakeWatchlistRepository : WatchlistRepository {
        override fun observe(): Flow<List<WatchItem>> = flowOf(emptyList())
        override fun isWatched(listingId: Int): Flow<Boolean> = flowOf(false)
        override suspend fun toggle(listing: Listing): Boolean = true
        override suspend fun add(listing: Listing) = Unit
        override suspend fun remove(listingId: Int) = Unit
        override suspend fun clear() = Unit
        override suspend fun refreshPrices() = Unit
    }

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel(stats: FakeStatsRepository): HomeViewModel = HomeViewModel(
        getStatsSummary = GetStatsSummaryUseCase(stats),
        getInsights = GetInsightsUseCase(stats),
        getPriceDrops = GetPriceDropsUseCase(stats),
        getDistrictPrices = GetDistrictPricesUseCase(stats),
        observeSession = ObserveSessionUseCase(FakeAuthRepository()),
        toggleWatchlist = ToggleWatchlistUseCase(FakeWatchlistRepository()),
        stats = stats,
    )

    @Test
    fun load_withHangingRepository_settlesToError_notEternalLoading() = runTest(testDispatcher) {
        // Every home call hangs forever (dead radio / stalled socket).
        val hanging = FakeStatsRepository(
            summaryFn = { awaitCancellation() },
            insightsFn = { awaitCancellation() },
            priceDropsFn = { awaitCancellation() },
            districtPricesFn = { awaitCancellation() },
            fuelMixFn = { awaitCancellation() },
        )
        val vm = viewModel(hanging)

        // Initial state: loading skeleton up.
        assertTrue(vm.state.value.isLoading)

        // Advance virtual time well past the 20s withTimeout bound.
        advanceTimeBy(TimeUnit.SECONDS.toMillis(25))

        // The UI must have settled — never an eternal skeleton.
        val state = vm.state.value
        assertFalse("isLoading must be false after the load timeout", state.isLoading)
        assertNotNull("an error/offline signal must be surfaced", state.error)
    }

    @Test
    fun load_withOneSlowSection_keepsOtherSections_andIsNotOffline() = runTest(testDispatcher) {
        // QA 2026-10-21: district enrichment took ~27 s on the live backend; the old
        // all-or-nothing withTimeout(20 s) threw and Home showed "Offline — 0 cars".
        val repo = FakeStatsRepository(
            summaryFn = { StatsSummary(totalListings = 86_296) },
            insightsFn = { Insights(newListings24h = 342) },
            districtPricesFn = { awaitCancellation() },
        )
        val vm = viewModel(repo)
        // Headline numbers publish immediately, not after the slow section.
        advanceTimeBy(1_000)
        assertFalse(vm.state.value.isLoading)
        assertEquals(86_296, vm.state.value.summary.totalListings)

        advanceTimeBy(TimeUnit.SECONDS.toMillis(25))

        val state = vm.state.value
        assertFalse(state.isLoading)
        assertFalse("one slow section must not flag Home offline", state.isOffline)
        assertNull(state.error)
        assertEquals(86_296, state.summary.totalListings)
        assertEquals(342, state.insights.newListings24h)
    }

    /**
     * Non-hanging tests use an unconfined dispatcher: fakes return immediately,
     * so the whole load completes eagerly without virtual-time control.
     */
    private fun runEagerTest(block: () -> Unit) {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        try {
            block()
        } finally {
            Dispatchers.setMain(testDispatcher)
        }
    }

    @Test
    fun fakeSanity_returnsData() = runTest {
        val working = FakeStatsRepository(
            summaryFn = { StatsSummary(totalListings = 325_984, goodDealsCount = 1_284) },
        )
        // Direct call, no ViewModel — verifies the fake itself.
        val useCase = GetStatsSummaryUseCase(working)
        // runCatching mirrors the ViewModel's call pattern exactly.
        val result = runCatching { useCase() }.getOrNull()
        assertNotNull("fake should return data", result)
        assertEquals(325_984, result!!.totalListings)
    }

    @Test
    fun load_withWorkingRepository_publishesData() = runEagerTest {
        val working = FakeStatsRepository(
            summaryFn = { StatsSummary(totalListings = 325_984, goodDealsCount = 1_284) },
            insightsFn = { Insights(newListings24h = 342) },
        )
        val vm = viewModel(working)
        val state = vm.state.value

        assertFalse("isLoading=${state.isLoading}", state.isLoading)
        assertNull("error=${state.error}", state.error)
        assertEquals(325_984, state.summary.totalListings)
        assertEquals(342, state.insights.newListings24h)
    }

    @Test
    fun load_withFailingRepository_showsOfflineError() = runEagerTest {
        val failing = FakeStatsRepository(
            summaryFn = { throw java.io.IOException("no route to host") },
            insightsFn = { throw java.io.IOException("no route to host") },
        )
        val vm = viewModel(failing)

        val state = vm.state.value
        assertFalse(state.isLoading)
        assertNotNull(state.error)
    }

    @Test
    fun refresh_reloadsDataAndClearsRefreshing() = runEagerTest {
        var call = 0
        val repo = FakeStatsRepository(
            summaryFn = {
                call++
                StatsSummary(totalListings = 100_000 + call)
            },
        )
        val vm = viewModel(repo)
        assertEquals(100_001, vm.state.value.summary.totalListings)

        vm.refresh()

        val state = vm.state.value
        assertFalse(state.isRefreshing)
        assertEquals(100_002, state.summary.totalListings)
        assertNull(state.error)
    }
}
