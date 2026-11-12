package lk.motormila.app.ui.alerts

import androidx.lifecycle.SavedStateHandle
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import lk.motormila.app.domain.model.Alert
import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.model.UserSession
import lk.motormila.app.domain.repository.AlertsRepository
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.domain.repository.ListingRepository
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class AlertsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val repository: AlertsRepository = mockk(relaxed = true)
    private val listings: ListingRepository = mockk(relaxed = true)
    private val auth: AuthRepository = mockk()

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
        every { repository.observeAlerts() } returns flowOf(emptyList())
        coEvery { repository.unreadCount() } returns flowOf(0)
        every { auth.session() } returns flowOf(proSession())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun create_proSendsWhatsappTelegramAndChannelCsv() {
        coEvery { repository.create(any()) } returns sampleAlert()
        val vm = viewModel()
        vm.onEvent(
            AlertsUiEvent.FormChanged(
                AlertForm(
                    make = "Toyota",
                    maxPrice = "8m",
                    whatsappPhone = "0771234567",
                    telegramChatId = "99",
                    whatsapp = true,
                    telegram = true,
                    inapp = true,
                    email = true,
                    push = true,
                    digest = true,
                    quietHours = true,
                ),
            ),
        )
        vm.onEvent(AlertsUiEvent.Create)

        coVerify {
            repository.create(
                match { input: AlertInput ->
                    input.notifyPhone == "0771234567" &&
                        input.notifyTelegramChatId == "99" &&
                        input.notifyChannels == "inapp,email,whatsapp,telegram,push" &&
                        input.deliveryMode == "digest" &&
                        input.quietHoursEnabled == true
                },
            )
        }
        assertEquals(1, vm.state.value.justCreatedId)
    }

    @Test
    fun create_freeWhatsappShowsProErrorAndSkipsApi() {
        every { auth.session() } returns flowOf(freeSession())
        val vm = viewModel()
        vm.onEvent(
            AlertsUiEvent.FormChanged(
                AlertForm(
                    make = "Honda",
                    maxPrice = "5m",
                    whatsapp = true,
                    whatsappPhone = "0770000000",
                ),
            ),
        )
        vm.onEvent(AlertsUiEvent.Create)

        coVerify(exactly = 0) { repository.create(any()) }
        assertTrue(vm.state.value.error?.contains("Pro") == true)
    }

    @Test
    fun create_signedOutShowsSignInPromptAndSkipsApi() {
        every { auth.session() } returns flowOf(null)
        val vm = viewModel()
        assertFalse(vm.state.value.signedIn)
        vm.onEvent(AlertsUiEvent.FormChanged(AlertForm(make = "Toyota", maxPrice = "8m")))
        vm.onEvent(AlertsUiEvent.Create)

        coVerify(exactly = 0) { repository.create(any()) }
        assertTrue(vm.state.value.signInRequired)
        assertFalse(vm.state.value.creating)
    }

    @Test
    fun create_unauthorizedResponseShowsSignInPrompt() {
        coEvery { repository.create(any()) } throws HttpException(
            Response.error<Any>(401, "{}".toResponseBody(null)),
        )
        val vm = viewModel()
        vm.onEvent(AlertsUiEvent.FormChanged(AlertForm(make = "Toyota", maxPrice = "8m")))
        vm.onEvent(AlertsUiEvent.Create)

        assertTrue(vm.state.value.signInRequired)
        assertFalse(vm.state.value.creating)
        assertNull(vm.state.value.justCreatedId)
    }

    @Test
    fun toggleAlertChannel_proPatchesSortedChannels() {
        val existing = sampleAlert(notifyChannels = "push,email")
        every { repository.observeAlerts() } returns flowOf(listOf(existing))
        coEvery { repository.updateChannels(any(), any(), any(), any()) } returns existing
        val vm = viewModel()

        vm.onEvent(AlertsUiEvent.ToggleAlertChannel(existing.id, "whatsapp"))

        coVerify {
            repository.updateChannels(
                id = existing.id,
                channels = listOf("email", "whatsapp", "push"),
                deliveryMode = null,
                quietHoursEnabled = null,
            )
        }
    }

    @Test
    fun toggleAlertChannel_freeDoesNotPatch() {
        every { auth.session() } returns flowOf(freeSession())
        every { repository.observeAlerts() } returns flowOf(listOf(sampleAlert()))
        val vm = viewModel()

        vm.onEvent(AlertsUiEvent.ToggleAlertChannel(1, "telegram"))

        coVerify(exactly = 0) { repository.updateChannels(any(), any(), any(), any()) }
        assertTrue(vm.state.value.error?.contains("Pro") == true)
    }

    private fun viewModel(): AlertsViewModel = AlertsViewModel(
        repository = repository,
        listings = listings,
        authRepository = auth,
        savedStateHandle = SavedStateHandle(),
    )

    private fun sampleAlert(
        id: Int = 1,
        notifyChannels: String? = "inapp,push",
    ): Alert = Alert(
        id = id,
        make = "Toyota",
        model = "Aqua",
        maxPriceLkr = 8_000_000.0,
        district = "Colombo",
        notifyPhone = "0771234567",
        notifyEmail = null,
        notifyTelegramChatId = "99",
        notifyChannels = notifyChannels,
        deliveryMode = "instant",
        quietHoursEnabled = true,
        createdAt = "2026-01-01T00:00:00Z",
    )

    private fun proSession(): UserSession = UserSession(
        email = "pro@example.com",
        name = "Pro",
        plan = "pro",
        role = "user",
        subscriptionStatus = "active",
        token = "t",
        expiresAt = null,
    )

    private fun freeSession(): UserSession = proSession().copy(plan = "free", email = "free@example.com")
}
