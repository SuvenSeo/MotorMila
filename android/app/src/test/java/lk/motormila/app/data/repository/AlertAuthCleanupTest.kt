package lk.motormila.app.data.repository

import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import lk.motormila.app.core.notifications.NotificationHelper
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.TokenResponse
import lk.motormila.app.data.remote.dto.UserDto
import org.junit.Test
import retrofit2.Response

class AlertAuthCleanupTest {
    private val tray = mockk<NotificationHelper>(relaxUnitFun = true)
    private val sessions = mockk<SessionStore>(relaxed = true)
    private val api = mockk<MotormilaApiService>(relaxed = true)
    private val auth = AuthRepositoryImpl(tray, api, sessions, mockk(relaxed = true), mockk(relaxed = true),
        Dispatchers.Unconfined, mockk(relaxed = true))

    @Test fun successfulLoginClearsOldAlertsBeforePublishingTheNewAccount() = runTest {
        coEvery { api.login(any()) } returns TokenResponse(UserDto(email = "b@example.invalid"), "fixture")
        auth.login("b@example.invalid", "fixture")
        coVerifyOrder { tray.clearPostedAlerts(); sessions.saveSession(any()) }
    }

    @Test fun logoutDeletionAndAcceptedRejectionClearAlertsButStaleRejectionDoesNot() = runTest {
        coEvery { sessions.snapshot() } returns null
        coEvery { sessions.clearIfRejected("old") } returns false
        auth.clearRejectedSession("old")
        verify(exactly = 0) { tray.clearPostedAlerts() }
        coEvery { sessions.clearIfRejected("current") } returns true
        auth.clearRejectedSession("current")
        verify(exactly = 1) { tray.clearPostedAlerts() }
        auth.logout()
        verify(exactly = 2) { tray.clearPostedAlerts() }
        coEvery { api.deleteAccount(any()) } returns Response.success(Unit)
        auth.deleteAccount(null)
        verify(exactly = 3) { tray.clearPostedAlerts() }
    }
}
