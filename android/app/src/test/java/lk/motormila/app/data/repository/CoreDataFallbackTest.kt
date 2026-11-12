package lk.motormila.app.data.repository

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.dao.AlertDao
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.SnapshotApiService
import lk.motormila.app.data.remote.dto.AlertDto
import lk.motormila.app.data.remote.dto.MakeRowDto
import lk.motormila.app.data.remote.dto.ModelRowDto
import lk.motormila.app.data.remote.dto.PermitDto
import lk.motormila.app.data.remote.dto.PermitsSnapshotDto
import lk.motormila.app.data.remote.dto.PriceIndexDto
import lk.motormila.app.data.remote.dto.TrendPointDto
import lk.motormila.app.data.remote.dto.TrendSeriesDto
import lk.motormila.app.domain.model.AlertInput
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** Snapshot fallbacks for Insights + filter lists, and in-place alert update. */
class CoreDataFallbackTest {

    private val down = IOException("backend down")

    private fun http(code: Int) = HttpException(Response.error<Any>(code, "".toResponseBody(null)))

    // ------------------------------------------------------------ insights
    @Test
    fun insights_fall_back_to_snapshot_when_live_fails() = runTest {
        val api = mockk<MotormilaApiService>()
        val snaps = mockk<SnapshotApiService>()
        coEvery { api.priceIndex() } throws down
        coEvery { api.permits() } throws down
        coEvery { api.trends(any(), any(), any(), any(), any()) } throws down
        coEvery { snaps.priceIndex() } returns PriceIndexDto(latestPeriod = "2026-10")
        coEvery { snaps.permits() } returns PermitsSnapshotDto(items = listOf(PermitDto(permitName = "Govt officer")))
        coEvery { snaps.priceTrends() } returns TrendSeriesDto(points = listOf(TrendPointDto(year = 2026, month = 10)))
        val repo = InsightsRepositoryImpl(api, snaps, Dispatchers.Unconfined)

        assertEquals("Govt officer", repo.permits().single().name)
        repo.index() // no throw
        assertEquals(1, repo.trends().points.size)
    }

    @Test
    fun filtered_trends_never_use_the_market_wide_snapshot() = runTest {
        val api = mockk<MotormilaApiService>()
        val snaps = mockk<SnapshotApiService>()
        coEvery { api.trends(any(), any(), any(), any(), any()) } throws down
        coEvery { snaps.priceTrends() } returns TrendSeriesDto()
        val repo = InsightsRepositoryImpl(api, snaps, Dispatchers.Unconfined)
        try {
            repo.trends(make = "Toyota")
            fail("expected live error")
        } catch (e: IOException) {
            assertEquals(down.message, e.message)
        }
        coVerify(exactly = 0) { snaps.priceTrends() }
    }

    // --------------------------------------------------------- filter lists
    @Test
    fun makes_and_models_fall_back_to_snapshot_lists() = runTest {
        val api = mockk<MotormilaApiService>()
        val snaps = mockk<SnapshotApiService>()
        coEvery { api.getMakes() } throws down
        coEvery { api.getModels(any()) } throws down
        coEvery { snaps.listingMakes() } returns listOf(MakeRowDto("Toyota", 10), MakeRowDto("", 1))
        coEvery { snaps.listingModels() } returns mapOf("Toyota" to listOf(ModelRowDto("Aqua", 4)))
        val repo = ListingRepositoryImpl(api, snaps, mockk(relaxed = true), Dispatchers.Unconfined)

        assertEquals(listOf("Toyota"), repo.makes())
        assertEquals(listOf("Aqua"), repo.models("toyota"))
    }

    @Test
    fun modelsForMake_is_case_insensitive_and_empty_when_unknown() {
        val map = mapOf("Land Rover" to listOf(ModelRowDto("Defender", 2)))
        assertEquals("Defender", modelsForMake(map, " land rover ").single().model)
        assertTrue(modelsForMake(map, "Tesla").isEmpty())
    }

    // ---------------------------------------------------------------- alerts
    private fun alertsRepo(api: MotormilaApiService, dao: AlertDao): AlertsRepositoryImpl {
        val db = mockk<MotormilaDatabase>()
        every { db.alertDao() } returns dao
        return AlertsRepositoryImpl(api, db, Dispatchers.Unconfined)
    }

    @Test
    fun alert_update_is_in_place_put_with_no_delete_or_create() = runTest {
        val api = mockk<MotormilaApiService>()
        val dao = mockk<AlertDao>(relaxed = true)
        coEvery { api.updateAlert(7, any()) } returns AlertDto(id = 7, make = "Honda", active = true)
        val updated = alertsRepo(api, dao).update(7, AlertInput(make = "Honda"))

        assertEquals(7, updated.id)
        assertEquals("Honda", updated.make)
        coVerify(exactly = 0) { api.deleteAlert(any()) }
        coVerify(exactly = 0) { api.createAlert(any()) }
        coVerify(exactly = 0) { dao.delete(any()) }
    }

    @Test
    fun alert_update_errors_leave_the_original_untouched() = runTest {
        val api = mockk<MotormilaApiService>()
        val dao = mockk<AlertDao>(relaxed = true)
        coEvery { api.updateAlert(7, any()) } throws http(403)
        try {
            alertsRepo(api, dao).update(7, AlertInput(make = "Honda", notifyEmail = "a@b.lk"))
            fail("expected 403")
        } catch (e: HttpException) {
            assertEquals(403, e.code())
        }
        coVerify(exactly = 0) { api.deleteAlert(any()) }
        coVerify(exactly = 0) { dao.delete(any()) }
    }

    @Test
    fun alert_update_falls_back_to_create_first_only_on_pre_put_backend() = runTest {
        val api = mockk<MotormilaApiService>(relaxed = true)
        val dao = mockk<AlertDao>(relaxed = true)
        coEvery { api.updateAlert(7, any()) } throws http(405)
        coEvery { api.createAlert(any()) } returns AlertDto(id = 8, make = "Honda", active = true)
        val updated = alertsRepo(api, dao).update(7, AlertInput(make = "Honda"))

        assertEquals(8, updated.id)
        coVerify { api.createAlert(any()) }
        coVerify { api.deleteAlert(7) }
        assertTrue(isUpdateUnsupported(405))
        assertFalse(isUpdateUnsupported(404))
        assertFalse(isUpdateUnsupported(429))
    }
}
