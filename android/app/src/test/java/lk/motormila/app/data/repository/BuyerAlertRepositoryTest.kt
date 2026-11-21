package lk.motormila.app.data.repository

import io.mockk.*
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.runTest
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.dao.AlertDao
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.AlertDto
import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.model.UserSession
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class BuyerAlertRepositoryTest {
    private val api = mockk<MotormilaApiService>()
    private val dao = mockk<AlertDao>(relaxed = true)
    private val db = mockk<MotormilaDatabase> { every { alertDao() } returns dao }
    private val buyer = mockk<UserSession>(relaxed = true) { every { email } returns "a@example.invalid" }
    private val sessions = mockk<SessionStore> {
        coEvery { snapshot() } returns buyer
        every { cachedToken } returns buyer.token
    }
    private val repo = AlertsRepositoryImpl(api, db, Dispatchers.Unconfined, sessions)

    @Test fun guestNeverConsultsAlertCache() = runTest {
        every { sessions.observe() } returns flowOf(null)
        assertTrue(repo.observeAlerts().first().isEmpty())
        verify(exactly = 0) { dao.observe(any()) }
    }

    @Test fun changedSessionDiscardsInFlightRefresh() = runTest {
        coEvery { api.listAlerts(guard = any()) } coAnswers {
            coEvery { sessions.snapshot() } returns null
            listOf(AlertDto(id = 4))
        }
        assertTrue(runCatching { repo.refresh() }.isFailure)
        coVerify(exactly = 0) { dao.replace(any(), any()) }
    }

    @Test fun remoteDeleteAndPauseFailureKeepLastConfirmedRow() = runTest {
        coEvery { api.deleteAlert(9, any()) } throws IOException()
        coEvery { api.setAlertActive(9, any(), any()) } throws IOException()
        assertTrue(runCatching { repo.delete(9) }.isFailure)
        assertTrue(runCatching { repo.setActive(9, false) }.isFailure)
        coVerify(exactly = 0) { dao.delete(any(), any()) }
        coVerify(exactly = 0) { dao.upsert(any()) }
    }

    @Test fun newerServerReceivesOnlyExplicitFreeChannels() = runTest {
        coEvery { api.createAlert(match { it.notifyChannels == "email,push" }, any()) } returns AlertDto(id = 3, notifyChannels = "push,email")
        assertEquals(3, repo.create(AlertInput(notifyChannels = "email,push")).id)
        coVerify(exactly = 1) { api.createAlert(any(), any()) }
    }

    private fun taggedGate() = HttpException(Response.error<Any>(403,
        """{"detail":"Multi-channel alert notifications require a signed-in Pro plan."}""".toResponseBody(null)))

    @Test fun taggedServerCannotSilentlyEnablePush() = runTest {
        coEvery { api.createAlert(any(), any()) } throws taggedGate()
        assertTrue(runCatching { repo.create(AlertInput(notifyChannels = "inapp")) }.exceptionOrNull() is UnsupportedFreeChannels)
        coVerify(exactly = 0) { api.createAlert(match { it.notifyChannels == null }, any()) }
    }

    @Test fun onlyExactLegacyDefaultMayRetryAfterTaggedRejection() = runTest {
        coEvery { api.createAlert(match { it.notifyChannels != null }, any()) } throws taggedGate()
        coEvery { api.createAlert(match { it.notifyChannels == null }, any()) } returns AlertDto(id = 3)
        assertEquals(3, repo.create(AlertInput(notifyChannels = "inapp,push")).id)
        coVerify(exactly = 2) { api.createAlert(any(), any()) }
    }
}
