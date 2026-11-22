package lk.motormila.app.ui.home

import android.content.Context
import android.content.SharedPreferences
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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.entity.WatchlistEntity
import lk.motormila.app.data.repository.SavedCheck
import lk.motormila.app.data.repository.WatchlistRepositoryImpl
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.usecase.GetPriceDropsUseCase
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelLoadTest {
    private val dispatcher = StandardTestDispatcher()
    private val saves = MutableStateFlow<List<WatchItem>>(emptyList())
    private val unavailableIds = MutableStateFlow(emptySet<Int>())
    private val stats: StatsRepository = mockk()
    private lateinit var vm: HomeViewModel

    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() {
        if (::vm.isInitialized) vm.viewModelScope.cancel()
        Dispatchers.resetMain()
    }

    private fun openHome() {
        val repo = mockk<WatchlistRepositoryImpl>()
        every { repo.observeCheckedSaves() } returns combine(saves, unavailableIds) { rows, gone ->
            rows.map { it to if (it.listingId in gone) SavedCheck(100L, unavailable = true) else null }
        }
        vm = HomeViewModel(GetPriceDropsUseCase(stats), repo)
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

    @Test fun recordedUnavailabilityRestoresTheNextSaveAndDoesNotResurfaceInTheFeed() = runTest(dispatcher) {
        val gone = saved().copy(previousPriceLkr = 6_000_000.0)
        val alternative = saved(id = 2)
        val drop = recordedDrop()
        val nextDrop = drop.copy(listing = drop.listing.copy(id = 3))
        coEvery { stats.priceDrops(any(), any()) } returns listOf(drop, nextDrop)
        saves.value = listOf(gone, alternative)
        unavailableIds.value = setOf(gone.listingId)
        openHome()
        runCurrent()
        assertEquals(alternative, vm.state.value.savedVehicle)
        assertEquals(nextDrop, vm.state.value.recordedDrop)
        unavailableIds.value += alternative.listingId
        runCurrent()
        assertNull(vm.state.value.savedVehicle)
        assertEquals(nextDrop, vm.state.value.recordedDrop)
        unavailableIds.value = emptySet()
        runCurrent()
        assertEquals(gone, vm.state.value.savedVehicle)
    }

    @Test fun localReadMatchesGoneFlagToThisSaveNotAPreviousSaveOfTheSameAd() = runTest(dispatcher) {
        val row = WatchlistEntity(listingId = 9, lastKnownPriceLkr = 4_000_000.0, addedAtMs = 10L)
        val rows = MutableStateFlow(listOf(row))
        val db = mockk<MotormilaDatabase>()
        every { db.watchlistDao().observeAll() } returns rows
        val prefs = mockk<SharedPreferences>()
        every { prefs.getLong("checked-9", 0L) } returns 100L
        every { prefs.getLong("saved-9", -1L) } returns 10L
        every { prefs.getBoolean("gone-9", false) } returns true
        val context = mockk<Context>()
        every { context.getSharedPreferences("saved_ad_checks", Context.MODE_PRIVATE) } returns prefs
        coEvery { stats.priceDrops(any(), any()) } returns emptyList()
        vm = HomeViewModel(GetPriceDropsUseCase(stats), WatchlistRepositoryImpl(mockk(), db, dispatcher, context))
        runCurrent()
        assertTrue(vm.state.value.shortlistReady)
        assertEquals(setOf(9), vm.state.value.unavailableSavedIds)
        assertNull(vm.state.value.savedVehicle)
        rows.value = listOf(row.copy(addedAtMs = 200L))
        runCurrent()
        assertEquals(9, vm.state.value.savedVehicle?.listingId)
        assertTrue(vm.state.value.unavailableSavedIds.isEmpty())
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
