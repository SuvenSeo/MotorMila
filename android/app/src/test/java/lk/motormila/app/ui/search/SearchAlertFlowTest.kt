package lk.motormila.app.ui.search

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lk.motormila.app.domain.model.UserSession
import lk.motormila.app.domain.repository.AlertsRepository
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.domain.usecase.ObserveWatchlistUseCase
import lk.motormila.app.ui.components.FilterDraft
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SearchAlertFlowTest {
    private val dispatcher = StandardTestDispatcher()
    private val session = MutableStateFlow<UserSession?>(null)
    private val alerts = mockk<AlertsRepository>(relaxed = true)
    private lateinit var vm: SearchViewModel

    @Before fun openSearch() {
        Dispatchers.setMain(dispatcher)
        val sessions = mockk<ObserveSessionUseCase>()
        every { sessions() } returns session
        val watches = mockk<ObserveWatchlistUseCase>()
        every { watches() } returns flowOf(emptyList())
        val listings = mockk<ListingRepository>(relaxed = true)
        coEvery { listings.count(any()) } returns null
        vm = SearchViewModel(mockk(), mockk(), sessions, listings, alerts, SavedStateHandle(), watches)
    }

    @After fun closeSearch() {
        vm.viewModelScope.cancel()
        Dispatchers.resetMain()
    }

    @Test fun reviewAndSignInDoNotSaveUntilTheLatestDraftIsConfirmed() = runTest(dispatcher) {
        runCurrent()
        val applied = ListingQuery(make = "Toyota", district = "Kandy", priceMax = 9e6)
        vm.applyFilters(applied)
        vm.openFilters()
        val draft = FilterDraft.from(applied).copy(priceMax = 6e6, fuelType = "hybrid").toQuery(applied)
        vm.reviewAlert(draft)
        val review = SearchAlertReview(draft)
        vm.confirmAlert(review) // still signed out
        session.value = UserSession("test@example.invalid", null, "free", "user", null, "test", null)
        runCurrent()
        vm.confirmAlert(SearchAlertReview(applied)) // stale confirmation
        runCurrent()
        coVerify(exactly = 0) { alerts.create(any()) }
        assertEquals(applied, vm.state.value.filters)
        assertEquals(draft, vm.state.value.alertDraft)
        vm.confirmAlert(review)
        vm.confirmAlert(review) // double tap
        runCurrent()
        coVerify(exactly = 1) { alerts.create(requireNotNull(review.rule)) }
        assertTrue(vm.state.value.alertSaved)
        assertEquals(applied, vm.state.value.filters)
        assertNull(vm.state.value.alertDraft)
    }
}
