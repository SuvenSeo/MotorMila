package lk.motormila.app.data.remote.paging

import androidx.paging.PagingSource
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.test.runTest
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.dto.PagedListingsDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.data.repository.filterSnapshotListings
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.repository.ListingQuery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Search / Best Picks paging: page 1 falls back to the public snapshot when the API fails. */
class ListingPagingFallbackTest {

    private val snapshotRows = listOf(
        ListingDto(id = 1, make = "Toyota", model = "Aqua", priceLkr = 8_450_000.0, district = "Colombo"),
        ListingDto(id = 2, make = "Honda", model = "Fit", priceLkr = 6_100_000.0, district = "Kandy"),
        ListingDto(id = 3, make = "Toyota", model = "Prius", priceLkr = 12_000_000.0, district = "Colombo"),
    )

    private fun failingApi(error: Throwable = IOException("backend down")): MotormilaApiService {
        val api = mockk<MotormilaApiService>()
        coEvery {
            api.searchListings(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
            )
        } throws error
        return api
    }

    private fun refresh() = PagingSource.LoadParams.Refresh<Int>(key = null, loadSize = 20, placeholdersEnabled = false)

    private fun source(
        api: MotormilaApiService,
        query: ListingQuery,
        snapshot: (suspend () -> List<Listing>)?,
        flags: MutableList<Boolean>,
    ) = ListingPagingSource(
        api = api,
        query = query,
        snapshotFallback = snapshot,
        onSourceChanged = { flags += it },
    )

    @Test
    fun apiDown_page1ServesFilteredSnapshot() = runTest {
        val flags = mutableListOf<Boolean>()
        val query = ListingQuery(make = "toyota")
        val result = source(
            failingApi(), query,
            snapshot = { filterSnapshotListings(snapshotRows, query).map { it.toDomain() } },
            flags = flags,
        ).load(refresh())

        assertTrue(result is PagingSource.LoadResult.Page)
        val page = result as PagingSource.LoadResult.Page
        assertEquals(listOf(1, 3), page.data.map { it.id })
        assertNull("snapshot is a single page", page.nextKey)
        assertEquals(listOf(true), flags) // UI shows the "offline snapshot" banner
    }

    @Test
    fun apiDown_laterPagesStayErrors() = runTest {
        val result = source(failingApi(), ListingQuery(), snapshot = { emptyList() }, flags = mutableListOf())
            .load(PagingSource.LoadParams.Append(key = 2, loadSize = 20, placeholdersEnabled = false))
        assertTrue(result is PagingSource.LoadResult.Error)
    }

    @Test
    fun apiAndSnapshotDown_isHonestError() = runTest {
        val result = source(
            failingApi(), ListingQuery(),
            snapshot = { throw IOException("cdn down") },
            flags = mutableListOf(),
        ).load(refresh())
        assertTrue(result is PagingSource.LoadResult.Error)
        assertEquals("backend down", (result as PagingSource.LoadResult.Error).throwable.message)
    }

    @Test
    fun apiUp_usesLiveDataAndClearsSnapshotFlag() = runTest {
        val api = mockk<MotormilaApiService>()
        coEvery {
            api.searchListings(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
            )
        } returns PagedListingsDto(items = snapshotRows.take(2), total = 40, page = 1, size = 20, pages = 2)
        val flags = mutableListOf<Boolean>()
        val page = source(api, ListingQuery(), snapshot = { error("must not be called") }, flags = flags)
            .load(refresh()) as PagingSource.LoadResult.Page
        assertEquals(listOf(1, 2), page.data.map { it.id })
        assertEquals(2, page.nextKey)
        assertEquals(listOf(false), flags)
    }
}
