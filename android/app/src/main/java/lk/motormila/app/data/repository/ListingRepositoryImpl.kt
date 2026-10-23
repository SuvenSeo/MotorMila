package lk.motormila.app.data.repository

import androidx.paging.ExperimentalPagingApi
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.map
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.SnapshotApiService
import lk.motormila.app.data.remote.mapper.toCustomEstimateDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.data.remote.mapper.toEntities
import lk.motormila.app.data.remote.mapper.toEntity
import lk.motormila.app.data.remote.paging.ListingPagingSource
import lk.motormila.app.data.remote.paging.ListingRemoteMediator
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.HistoryReport
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PlateLookupResult
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.SellerProfile
import lk.motormila.app.domain.model.Valuation
import lk.motormila.app.domain.model.ValuationInput
import lk.motormila.app.domain.repository.ListingQuery
import lk.motormila.app.domain.repository.ListingRepository

/**
 * Listings: network-first, Room as read-through cache.
 * - [paging]: Paging3. Default network-only [ListingPagingSource]; pass
 *   `cached=true` for the Room-backed [ListingRemoteMediator] (15-min TTL).
 * - Detail/similar/history/fmv/seller: fetched fresh, detail upserted to Room.
 * - Search/detail/similar/history fall back to the public Vercel snapshots
 *   when the live API throws (Neon outage) — see [withSnapshotFallback].
 */
@Singleton
class ListingRepositoryImpl @Inject constructor(
    private val api: MotormilaApiService,
    private val snapshots: SnapshotApiService,
    private val db: MotormilaDatabase,
    @IoDispatcher private val io: CoroutineDispatcher,
) : ListingRepository {

    private val _pagingFromSnapshot = kotlinx.coroutines.flow.MutableStateFlow(false)
    override val pagingFromSnapshot: kotlinx.coroutines.flow.StateFlow<Boolean> = _pagingFromSnapshot

    fun paging(query: ListingQuery, cached: Boolean): Flow<PagingData<Listing>> =
        if (!cached) {
            Pager(PagingConfig(pageSize = 20, enablePlaceholders = false)) {
                ListingPagingSource(
                    api = api,
                    query = query,
                    // Backend outage: page 1 falls back to the public snapshot
                    // (same filter as searchPage) instead of a dead Search/Best Picks.
                    snapshotFallback = {
                        filterSnapshotListings(snapshots.liveMarket().latestListings, query)
                            .map { it.toDomain() }
                    },
                    onSourceChanged = { fromSnapshot -> _pagingFromSnapshot.value = fromSnapshot },
                )
            }.flow
        } else {
            @OptIn(ExperimentalPagingApi::class)
            Pager(
                config = PagingConfig(pageSize = 20, enablePlaceholders = false),
                remoteMediator = ListingRemoteMediator(api, db, query),
                pagingSourceFactory = {
                    db.listingDao().pagingByQuery(
                        q = query.keyword?.ifBlank { null }?.let { "%$it%" },
                        make = query.make,
                        district = query.district,
                        source = query.source,
                    )
                },
            ).flow.map { paging -> paging.map { it.toDomain() } }
        }

    override fun paging(query: ListingQuery): Flow<PagingData<Listing>> = paging(query, cached = false)

    override suspend fun searchPage(query: ListingQuery, page: Int, size: Int): List<Listing> = withContext(io) {
        withSnapshotFallback(
            live = {
                api.searchListings(
                    q = query.keyword,
                    source = query.source,
                    make = query.make,
                    model = query.model,
                    yearMin = query.yearMin,
                    yearMax = query.yearMax,
                    priceMin = query.priceMin,
                    priceMax = query.priceMax,
                    mileageMax = query.mileageMax,
                    fuelType = query.fuelType,
                    transmission = query.transmission,
                    condition = query.condition,
                    bodyType = query.bodyType,
                    district = query.district,
                    vehicleCategory = query.vehicleCategory,
                    priceAvailability = query.priceAvailability,
                    includeArchive = query.includeArchive.takeIf { it },
                    sort = query.sort,
                    page = page,
                    size = size,
                ).items.map { it.toDomain() }
            },
            snapshot = {
                val rows = snapshots.liveMarket().latestListings
                filterSnapshotListings(rows, query).map { it.toDomain() }
            },
        )
    }

    override suspend fun count(query: ListingQuery): Int? = withContext(io) {
        runCatching {
            api.searchListings(
                q = query.keyword?.ifBlank { null },
                source = query.source,
                make = query.make,
                model = query.model,
                yearMin = query.yearMin,
                yearMax = query.yearMax,
                priceMin = query.priceMin,
                priceMax = query.priceMax,
                mileageMax = query.mileageMax,
                fuelType = query.fuelType,
                transmission = query.transmission,
                condition = query.condition,
                bodyType = query.bodyType,
                district = query.district,
                vehicleCategory = query.vehicleCategory,
                priceAvailability = query.priceAvailability,
                includeArchive = query.includeArchive.takeIf { it },
                sort = query.sort,
                page = 1,
                size = 1,
            ).total
        }.getOrNull()
    }

    override suspend fun getDetail(id: Int): Listing = withContext(io) {
        val domain = withSnapshotFallback(
            live = { api.getListing(id).toDomain() },
            snapshot = {
                snapshots.liveMarket().latestListings.firstOrNull { it.id == id }?.toDomain()
                    ?: error("Listing $id is not in the offline snapshot")
            },
        )
        db.listingDao().upsert(domain.toEntity())
        domain
    }

    override suspend fun similar(id: Int, limit: Int): List<Listing> = withContext(io) {
        withSnapshotFallback(
            live = { api.getSimilar(id, limit).map { it.toDomain() } },
            snapshot = { similarFromSnapshot(snapshots.liveMarket().latestListings, id, limit) },
        )
    }

    override suspend fun priceHistory(id: Int): PriceHistory = withContext(io) {
        withSnapshotFallback(
            live = {
                val dto = api.getPriceHistory(id)
                db.priceHistoryDao().clearForListing(id)
                db.priceHistoryDao().insertAll(dto.toEntities())
                dto.toDomain()
            },
            snapshot = {
                priceHistoryFromSparklines(snapshots.priceSparklines(), id)
                    ?: error("Listing $id has no offline price history")
            },
        )
    }

    override suspend fun historyReport(id: Int): HistoryReport = withContext(io) {
        api.getHistoryReport(id).toDomain()
    }

    override suspend fun fmv(id: Int): Fmv = withContext(io) {
        val dto = api.getFmv(id)
        val asking = runCatching { db.listingDao().getById(id)?.priceLkr }.getOrNull()
        dto.toDomain(askingFallbackLkr = asking ?: 0.0)
    }

    override suspend fun sellerProfile(id: Int): SellerProfile = withContext(io) {
        api.getSellerProfile(id).toDomain()
    }

    // Filter dropdowns: live, then the public snapshot lists, then empty.
    override suspend fun sources(): List<String> = withContext(io) {
        runCatching {
            withSnapshotFallback({ api.getSources() }, { snapshots.listingSources() }).map { it.source }
        }.getOrElse { emptyList() }.filter { it.isNotBlank() }
    }

    override suspend fun makes(): List<String> = withContext(io) {
        runCatching {
            withSnapshotFallback({ api.getMakes() }, { snapshots.listingMakes() }).map { it.make }
        }.getOrElse { emptyList() }.filter { it.isNotBlank() }
    }

    override suspend fun models(make: String): List<String> = withContext(io) {
        runCatching {
            withSnapshotFallback(
                { api.getModels(make) },
                { modelsForMake(snapshots.listingModels(), make) },
            ).map { it.model }
        }.getOrElse { emptyList() }.filter { it.isNotBlank() }
    }

    override suspend fun suggestions(query: String, limit: Int): List<Listing> = withContext(io) {
        withSnapshotFallback(
            live = { api.getSearchSuggestions(query, limit).map { it.toDomain() } },
            snapshot = {
                filterSnapshotListings(
                    snapshots.liveMarket().latestListings,
                    ListingQuery(keyword = query),
                ).take(limit.coerceAtLeast(1)).map { it.toDomain() }
            },
        )
    }

    override suspend fun estimate(input: ValuationInput): Valuation = withContext(io) {
        api.estimate(input.make, input.model, input.year, input.mileageKm, input.condition).toDomain()
    }

    override suspend fun customEstimate(input: ValuationInput): Valuation = withContext(io) {
        api.customEstimate(input.toCustomEstimateDto()).toDomain()
    }

    override suspend fun lookupByPlate(plate: String): PlateLookupResult = withContext(io) {
        val page = runCatching { api.searchListings(q = plate, size = 10) }.getOrNull()
        val match = page?.items?.firstOrNull()?.toDomain()
        if (match == null) {
            return@withContext PlateLookupResult(
                plate = plate,
                listingId = null,
                title = plate,
                priceLkr = null,
                thumbnailUrl = null,
                fmvLkr = null,
                matchNote = "No live match for $plate — showing closest",
                listingsFound = 0,
            )
        }
        val fmv = runCatching {
            api.getFmv(match.id).toDomain(askingFallbackLkr = match.priceLkr ?: 0.0).fmvLkr
        }.getOrNull()
        PlateLookupResult(
            plate = plate,
            listingId = match.id,
            title = match.title.ifBlank { plate },
            priceLkr = match.priceLkr,
            thumbnailUrl = match.thumbnailUrl,
            fmvLkr = fmv,
            matchNote = "Top match for plate $plate",
            listingsFound = page?.total?.takeIf { it > 0 } ?: 1,
        )
    }
}
