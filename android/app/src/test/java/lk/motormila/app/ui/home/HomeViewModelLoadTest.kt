package lk.motormila.app.ui.home

import androidx.lifecycle.viewModelScope
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.repository.WatchlistRepository
import lk.motormila.app.domain.usecase.GetPriceDropsUseCase
import lk.motormila.app.domain.usecase.ObserveWatchlistUseCase
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelLoadTest {
    private val dispatcher = StandardTestDispatcher()
    private val saves = MutableStateFlow<List<WatchItem>>(emptyList())
    private val stats: StatsRepository = mockk()
    private lateinit var vm: HomeViewModel

    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() {
        if (::vm.isInitialized) vm.viewModelScope.cancel()
        Dispatchers.resetMain()
    }

    private fun openHome() {
        val repo = mockk<WatchlistRepository>()
        every { repo.observe() } returns saves
        vm = HomeViewModel(GetPriceDropsUseCase(stats), ObserveWatchlistUseCase(repo))
    }

    @Test fun deviceShortlistTracksRemovalEvenIfTheFeedHangs() = runTest(dispatcher) {
        coEvery { stats.priceDrops(any(), any()) } coAnswers { awaitCancellation() }
        val stable = saved(id = 1, added = 300L)
        val olderDrop = saved(id = 2, added = 100L).copy(previousPriceLkr = 6_000_000.0)
        val newerDrop = olderDrop.copy(id = 3, listingId = 3, addedAtEpochMs = 200L)
        saves.value = listOf(olderDrop, stable, newerDrop)
        openHome()
        runCurrent()
        assertTrue(vm.state.value.isLoading)
        assertTrue(vm.state.value.shortlistReady)
        assertEquals(3, vm.state.value.savedVehicle?.listingId)
        saves.value = listOf(stable)
        runCurrent()
        assertEquals(1, vm.state.value.savedVehicle?.listingId)
        advanceTimeBy(21_000L)
        runCurrent()
        assertFalse(vm.state.value.isLoading)
        assertTrue(vm.state.value.showCachedBadge)
        assertEquals(1, vm.state.value.savedVehicle?.listingId)
        saves.value = emptyList()
        runCurrent()
        assertNull(vm.state.value.savedVehicle)
    }

    @Test fun failedRefreshKeepsRecordedChangeButSuccessfulEmptyRefreshClearsIt() = runTest(dispatcher) {
        coEvery { stats.priceDrops(any(), any()) } returns listOf(recordedDrop())
        openHome()
        runCurrent()
        assertNotNull(vm.state.value.recordedDrop)
        coEvery { stats.priceDrops(any(), any()) } throws IOException()
        vm.refresh()
        runCurrent()
        assertFalse(vm.state.value.isRefreshing)
        assertTrue(vm.state.value.showCachedBadge)
        assertEquals(766358, vm.state.value.recordedDrop?.listing?.id)
        vm.dismissCachedBadge()
        assertFalse(vm.state.value.showCachedBadge)
        coEvery { stats.priceDrops(any(), any()) } returns emptyList()
        vm.retry()
        runCurrent()
        assertNull(vm.state.value.recordedDrop)
        assertFalse(vm.state.value.showCachedBadge)
    }
}
