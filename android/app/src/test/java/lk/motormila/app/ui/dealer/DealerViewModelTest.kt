package lk.motormila.app.ui.dealer

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import lk.motormila.app.data.local.datastore.SettingsStore
import lk.motormila.app.domain.model.DealerClaim
import lk.motormila.app.domain.repository.DealerRepository
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DealerViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val settings: SettingsStore = mockk(relaxed = true)
    private val repository: DealerRepository = mockk(relaxed = true)

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
        every { settings.observe() } returns MutableStateFlow(SettingsStore.Settings())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun claim_sendsPatternAndClaimedUrl() {
        coEvery {
            repository.claim(any(), any(), any(), any(), any())
        } returns DealerClaim(
            claimId = "1",
            status = "pending",
            message = "ok",
            displayName = "Island Motors",
            matchedListings = 2,
            claimedUrl = "https://ikman.lk/ad/1",
            sellerNamePattern = "Axio *",
        )
        coEvery { repository.myClaimStatus() } returns null

        val vm = DealerViewModel(settings, repository)
        vm.onEvent(
            DealerUiEvent.FormChanged(
                DealerClaimForm(
                    displayName = "Island Motors",
                    phone = "0771234567",
                    email = "yard@example.com",
                    pattern = "Axio *",
                    url = "https://ikman.lk/ad/1",
                ),
            ),
        )
        vm.onEvent(DealerUiEvent.Claim)

        coVerify {
            repository.claim(
                dealerName = "Island Motors",
                contactEmail = "yard@example.com",
                contactPhone = "0771234567",
                sellerNamePattern = "Axio *",
                claimedUrl = "https://ikman.lk/ad/1",
            )
        }
        assertEquals("Island Motors", vm.state.value.claimedName)
        assertEquals("pending", vm.state.value.claimStatus?.status)
    }
}
