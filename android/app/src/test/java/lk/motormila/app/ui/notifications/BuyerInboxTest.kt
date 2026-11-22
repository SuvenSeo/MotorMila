package lk.motormila.app.ui.notifications

import io.mockk.*
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import lk.motormila.app.data.remote.dto.NotificationDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.domain.model.UserSession
import lk.motormila.app.domain.repository.AlertsRepository
import lk.motormila.app.domain.repository.AuthRepository
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BuyerInboxTest {
    @Test fun readReceiptAndListingRouteUseDifferentIds() {
        val read = mutableListOf<Int>()
        val opened = mutableListOf<Int>()
        NotificationDto(id = 9, link = "/listings/42").toDomain().openFromInbox({ read.add(it) }, { opened.add(it) })
        NotificationDto(id = 10, link = "/alerts?next=/listings/12").toDomain().openFromInbox({ read.add(it) }, { opened.add(it) })
        assertEquals(listOf(9, 10), read)
        assertEquals(listOf(42), opened)
    }

    @Test fun refreshUsesReturnedRowsAndOnlyConfirmedReadsChangeBadge() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        try {
            val sessions = MutableStateFlow<UserSession?>(mockk(relaxed = true))
            val auth = mockk<AuthRepository> { every { session() } returns sessions }
            val repo = mockk<AlertsRepository>()
            val first = NotificationDto(id = 3).toDomain()
            val second = NotificationDto(id = 9).toDomain()
            coEvery { repo.notifications(50) } returns listOf(first)
            val vm = NotificationsViewModel(repo, auth)
            coEvery { repo.notifications(50) } returns listOf(first, second)
            vm.onEvent(NotificationsUiEvent.Refresh)
            assertEquals(2, vm.state.value.unreadCount)
            coEvery { repo.markNotificationRead(9) } throws IOException()
            vm.onEvent(NotificationsUiEvent.MarkRead(9))
            assertEquals(2, vm.state.value.unreadCount)
            assertNotNull(vm.state.value.error)
            coEvery { repo.markNotificationRead(9) } returns Unit
            vm.onEvent(NotificationsUiEvent.MarkRead(9))
            assertEquals(1, vm.state.value.unreadCount)
            coEvery { repo.markAllNotificationsRead() } returns 1
            vm.onEvent(NotificationsUiEvent.MarkAllRead)
            assertEquals(0, vm.state.value.unreadCount)
            sessions.value = null
            assertTrue(vm.state.value.items.isEmpty())
        } finally { Dispatchers.resetMain() }
    }
}
