package lk.motormila.app.ui.compare

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import io.mockk.*
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.*
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.domain.repository.ListingRepository
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CompareMissingEntryTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mockk<ListingRepository>()
    private lateinit var vm: CompareViewModel
    private var persisted = "30,10,20,40"

    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() {
        if (::vm.isInitialized) vm.viewModelScope.cancel()
        Dispatchers.resetMain()
    }

    private fun openTray() {
        val context = mockk<Context>()
        val prefs = mockk<SharedPreferences>()
        val editor = mockk<SharedPreferences.Editor>(relaxUnitFun = true)
        every { context.getSharedPreferences("motormila_compare", Context.MODE_PRIVATE) } returns prefs
        every { prefs.getString("ids", "") } answers { persisted }
        every { prefs.edit() } returns editor
        every { editor.putString("ids", any()) } answers { persisted = secondArg(); editor }
        vm = CompareViewModel(repository, context, SavedStateHandle())
    }

    @Test fun partialLoadKeepsFailedSlotsAddressableUntilRetriedOrRemoved() = runTest(dispatcher) {
        coEvery { repository.getDetail(any()) } coAnswers {
            val id = firstArg<Int>()
            if (id == 10 || id == 40) throw IOException()
            ListingDto(id = id).toDomain()
        }
        openTray()
        runCurrent()
        val slots = vm.state.value.entries
        assertEquals(listOf(30, 10, 20, 40), slots.map { it.id })
        assertEquals(listOf(10, 40), slots.filter { it.listing == null && !it.loading }.map { it.id })
        assertEquals("30,10,20,40", persisted)
        coEvery { repository.getDetail(10) } returns ListingDto(id = 10).toDomain()
        vm.onEvent(CompareUiEvent.Retry(10))
        vm.onEvent(CompareUiEvent.Remove(40))
        runCurrent()
        assertEquals(listOf(30, 10, 20), vm.state.value.entries.map { it.listing?.id })
        assertEquals("30,10,20", persisted)
        coVerify(exactly = 1) { repository.getDetail(30) }
        vm.syncIds(listOf(30, 10, 20, 50))
        runCurrent()
        assertEquals(listOf(30, 10, 20, 50), vm.state.value.ids)
    }

    @Test fun allFailedTrayIsNotMistakenForAnEmptyTray() = runTest(dispatcher) {
        persisted = "30,10"
        coEvery { repository.getDetail(any()) } throws IOException()
        openTray()
        runCurrent()
        assertEquals(listOf(30, 10), vm.state.value.entries.filter { it.listing == null && !it.loading }.map { it.id })
        vm.onEvent(CompareUiEvent.Remove(30))
        assertEquals(listOf(10), vm.state.value.ids)
        assertEquals("10", persisted)
    }

    @Test fun removingDuringLoadCannotResurrectTheRemovedColumn() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        coEvery { repository.getDetail(any()) } coAnswers {
            val id = firstArg<Int>()
            if (id == 10) gate.await()
            ListingDto(id = id).toDomain()
        }
        openTray()
        runCurrent()
        vm.onEvent(CompareUiEvent.Remove(10))
        gate.complete(Unit)
        runCurrent()
        assertEquals(listOf(30, 20, 40), vm.state.value.entries.map { it.listing?.id })
        assertEquals("30,20,40", persisted)
    }
}
