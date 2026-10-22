package lk.motormila.app.data.repository

import lk.motormila.app.domain.model.VehicleCategoryRules
import lk.motormila.app.domain.model.carsOnlyOrFirst

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.entity.DistrictStatEntity
import lk.motormila.app.data.local.db.entity.StatsCacheEntity
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.SnapshotApiService
import lk.motormila.app.core.calc.OfflineCalculators
import lk.motormila.app.data.remote.dto.ChargingStationsDto
import lk.motormila.app.data.remote.dto.GeoDto
import lk.motormila.app.data.remote.dto.HybridBandsDto
import lk.motormila.app.data.remote.dto.ImportEligibilityRequestDto
import lk.motormila.app.data.remote.dto.ImportEligibilityResponseDto
import lk.motormila.app.data.remote.dto.ImportEraSliceDto
import lk.motormila.app.data.remote.dto.ImportPriceDto
import lk.motormila.app.data.remote.dto.InsuranceRequestDto
import lk.motormila.app.data.remote.dto.InsuranceResponseDto
import lk.motormila.app.data.remote.dto.LiveMarketDto
import lk.motormila.app.data.remote.dto.MacroDto
import lk.motormila.app.data.remote.dto.MarketSignalDto
import lk.motormila.app.data.remote.dto.MarketSummaryDto
import lk.motormila.app.data.remote.dto.OwnershipBundleRequestDto
import lk.motormila.app.data.remote.dto.OwnershipBundleResponseDto
import lk.motormila.app.data.remote.dto.PermitDto
import lk.motormila.app.data.remote.dto.RevenueLicenceRequestDto
import lk.motormila.app.data.remote.dto.RevenueLicenceResponseDto
import lk.motormila.app.data.remote.dto.SafetyResearchDto
import lk.motormila.app.data.remote.dto.SourceQualityDto
import lk.motormila.app.data.remote.dto.TransferFeesRequestDto
import lk.motormila.app.data.remote.dto.TransferFeesResponseDto
import lk.motormila.app.data.remote.dto.VehicleNewsItemDto
import lk.motormila.app.data.remote.dto.VehicleSafetyDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.data.remote.mapper.toTrendSeries
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.DistrictInsight
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.MakeInsight
import lk.motormila.app.domain.model.MakeModelInsight
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.MarketSignal
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.PriceIndex
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.model.TrendSeries
import lk.motormila.app.domain.model.TrendingModel
import lk.motormila.app.domain.repository.StatsRepository

/**
 * Stats: network-first with a 15-min JSON cache (stats_cache) for summary;
 * district prices mirrored into district_stats for offline map rendering.
 * Every read below falls back to the public Vercel snapshots when the live
 * API throws (Neon outage) — see [withSnapshotFallback].
 */
@Singleton
class StatsRepositoryImpl @Inject constructor(
    private val api: MotormilaApiService,
    private val snapshots: SnapshotApiService,
    private val db: MotormilaDatabase,
    @IoDispatcher private val io: CoroutineDispatcher,
) : StatsRepository {

    companion object {
        const val TTL_MS = 15 * 60 * 1000L
        const val DISTRICT_ENRICH_BUDGET_MS = 6_000L
        const val SUMMARY_KEY = "stats_summary"
    }

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun summary(): StatsSummary = withContext(io) {
        val fresh = withSnapshotFallback(
            live = { api.statsSummary().toDomain() },
            snapshot = { snapshots.statsSummary().toDomain() },
        )
        db.statsCacheDao().put(
            StatsCacheEntity(SUMMARY_KEY, json.encodeToString(fresh.toCache()), System.currentTimeMillis()),
        )
        fresh
    }

    override fun summaryStream(): Flow<StatsSummary> = flow {
        emit(cachedSummary() ?: StatsSummary())
        while (true) {
            delay(60_000)
            emit(runCatching { summary() }.getOrNull() ?: continue)
        }
    }

    override suspend fun insights(): Insights = withContext(io) {
        withSnapshotFallback(
            live = { api.insights().toDomain() },
            snapshot = { snapshots.insights().toDomain() },
        )
    }

    override suspend fun trends(make: String?, model: String?, condition: String?, district: String?, months: Int): TrendSeries =
        withContext(io) {
            runCatching { api.trends(make, model, condition, district, months).toDomain() }
                .getOrElse {
                    // Fallback: model-level history when filtered trends are unavailable.
                    if (!make.isNullOrBlank() && !model.isNullOrBlank()) {
                        api.modelPriceHistory(make, model).toDomain().copy(coverageScope = "partial")
                    } else throw it
                }
        }

    override suspend fun priceIndex(): PriceIndex = withContext(io) {
        withSnapshotFallback(
            live = { api.priceIndex().toDomain() },
            snapshot = { snapshots.priceIndex().toDomain() },
        )
    }

    override suspend fun districtPrices(): List<DistrictStat> = withContext(io) {
        val now = System.currentTimeMillis()
        val dtos = withSnapshotFallback(
            live = { api.districtPrices().points },
            snapshot = { snapshots.districtPrices().points },
        )
        db.statsCacheDao().upsertDistricts(
            dtos.map {
                DistrictStatEntity(it.district, it.count, it.avgPriceLkr, it.medianPriceLkr, now)
            },
        )
        // Union with district-insight top-models (best-effort, capped to the top
        // 6 districts by count to avoid a request storm; failures keep base rows).
        // Best-effort and time-boxed. Sequential calls (~4-5 s each on the HF
        // backend) used to take ~27 s and blew Home's 20 s load budget, so Home
        // showed "Offline — 0 cars listed" on every launch (QA 2026-10-21).
        // Running them in parallel saturated the single-worker backend instead
        // (every call timed out and starved other screens), so stay sequential
        // and stop at a total budget; districts not reached keep base rows.
        val top = dtos.sortedByDescending { it.count }.take(6)
        val insights = HashMap<String, lk.motormila.app.data.remote.dto.DistrictInsightDto?>()
        withTimeoutOrNull(DISTRICT_ENRICH_BUDGET_MS) {
            for (dto in top) {
                insights[dto.district] = try {
                    api.districtInsight(dto.district)
                } catch (e: kotlin.coroutines.cancellation.CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
            }
        }
        dtos.map { dto ->
            val base = dto.toDomain()
            val insight = insights[dto.district]
            val topModel = insight?.topModels?.maxByOrNull { it.listingCount }
            if (insight == null || topModel == null) base
            else base.copy(
                topMake = topModel.make,
                topModel = topModel.model,
                topModelCount = topModel.listingCount,
            )
        }
    }

    fun observeCachedDistricts(): Flow<List<DistrictStat>> =
        db.statsCacheDao().observeDistricts().map { rows ->
            rows.map {
                DistrictStat(it.district, 0.0, 0.0, it.count, it.avgPriceLkr, it.medianPriceLkr)
            }
        }

    override suspend fun districtVelocity(): List<DistrictVelocity> = withContext(io) {
        withSnapshotFallback(
            live = { api.districtVelocity().points.map { it.toDomain() } },
            snapshot = { snapshots.districtVelocity().points.map { it.toDomain() } },
        )
    }

    override suspend fun priceDrops(days: Int, limit: Int): List<PriceDrop> = withContext(io) {
        withSnapshotFallback(
            // Cars first (launch rule): ask the backend for car drops; older
            // backends ignore the param and callers rank client-side.
            live = {
                api.getPriceDrops(days, lk.motormila.app.domain.model.VehicleCategory.DEFAULT.apiValue)
                    .items.take(limit).map { it.toDomain() }
            },
            snapshot = { snapshots.priceDrops().items.take(limit).map { it.toDomain() } },
        )
    }

    override suspend fun fuelMix(): List<FuelMixBucket> = withContext(io) {
        val rows = withSnapshotFallback(
            live = { api.fuelMix().buckets },
            snapshot = { snapshots.fuelMix().buckets },
        )
        val total = rows.sumOf { it.count }.coerceAtLeast(1)
        rows.map { it.toDomain(total) }
    }

    override suspend fun marketSignals(limit: Int): List<MarketSignal> = withContext(io) {
        api.marketSignals(limit = limit).map { it.toDomain() }
    }

    override suspend fun marketSignal(id: Int): MarketSignal = withContext(io) {
        runCatching { api.marketSignal(id).toDomain().takeIf { it.id == id } }.getOrNull()
            ?: api.marketSignals(limit = 200).map { it.toDomain() }.firstOrNull { it.id == id }
            ?: error("Market signal $id was not found")
    }

    override fun liveListings(limit: Int): Flow<List<Listing>> = flow {
        while (true) {
            val items = runCatching {
                // Cars first: the live strip is a first-impression surface.
                api.searchListings(
                    sort = "newest",
                    vehicleCategory = lk.motormila.app.domain.model.VehicleCategory.DEFAULT.apiValue,
                    page = 1,
                    size = limit.coerceIn(1, 50),
                ).items.map { it.toDomain() }
            }.getOrElse {
                runCatching {
                    snapshots.liveMarket().latestListings.map { it.toDomain() }
                        .carsOnlyOrFirst(min = 3) { VehicleCategoryRules.isCarLike(it) }
                        .take(limit.coerceIn(1, 50))
                }.getOrNull().orEmpty()
            }
            emit(items)
            delay(60_000)
        }
    }

    override suspend fun evInsight(make: String?, model: String?): TrendSeries = withContext(io) {
        api.evInsight(make, model).toTrendSeries()
    }

    /** EV model leaderboard helper (no domain interface; UI reads impl directly). */
    suspend fun evModels(topN: Int = 5): List<TrendingModel> = withContext(io) {
        api.evInsight(topN = topN).topModels.map { it.toDomain() }
    }

    // ------------------------------------------------- extra suspend helpers
    // DATA_CONTRACT §2: thin passthroughs over the remaining stats / market /
    // calculator endpoints. No domain-interface change: UI agents inject
    // StatsRepositoryImpl directly (same pattern as [evModels]).
    // Error policy: exceptions propagate untouched so callers map them with
    // ErrorMapper -> AppError (401/403/404/422/429/503 covered). Helpers never
    // synthesize fake payloads or 500s; list helpers return raw DTO lists.

    /** GET /stats/hybrid-bands — hybrid price bands (snapshot fallback). */
    suspend fun hybridBands(): HybridBandsDto = withContext(io) {
        withSnapshotFallback(
            live = { api.hybridBands() },
            snapshot = { snapshots.hybridBands() },
        )
    }

    /** GET /stats/source-quality — per-source listing quality rows. */
    suspend fun sourceQuality(): SourceQualityDto = withContext(io) {
        api.sourceQuality()
    }

    /** GET /stats/import-era-split — import-era distribution slices. */
    suspend fun importEraSplit(topN: Int = 10): List<ImportEraSliceDto> = withContext(io) {
        api.importEraSplit(topN)
    }

    override suspend fun districtInsight(district: String): DistrictInsight = withContext(io) {
        api.districtInsight(district).toDomain()
    }

    override suspend fun makeModelInsight(make: String, model: String): MakeModelInsight = withContext(io) {
        api.makeModelInsight(make, model).toDomain()
    }

    override suspend fun makeInsight(make: String): MakeInsight = withContext(io) {
        api.makeInsight(make).toDomain()
    }

    /** GET /stats/model-price-history — raw model trend (see [trends] fallback). */
    suspend fun modelPriceHistory(make: String, model: String): TrendSeries = withContext(io) {
        api.modelPriceHistory(make, model).toDomain()
    }

    /** GET /stats/live — one-shot live-market snapshot (see [liveListings] poll). */
    suspend fun liveMarket(): LiveMarketDto = withContext(io) {
        api.liveMarket()
    }

    /** GET /market/summary — signal coverage summary. */
    suspend fun marketSummary(): MarketSummaryDto = withContext(io) {
        api.marketSummary()
    }

    /** GET /market/import-prices — observed import price rows. */
    suspend fun importPrices(source: String? = null, limit: Int = 50): List<ImportPriceDto> = withContext(io) {
        api.importPrices(source, limit)
    }

    /** GET /listings/{id}/safety-research — recall/complaint research (DTO passthrough). */
    suspend fun listingSafety(id: Int): SafetyResearchDto = withContext(io) {
        api.getListingSafety(id)
    }

    /** GET /listings/{id}/geo — listing geocode (DTO passthrough; see GeoDto.lat/lng). */
    suspend fun listingGeo(id: Int): GeoDto = withContext(io) {
        api.getListingGeo(id)
    }

    /** GET /vehicles/safety-research — make/model/year safety research. */
    suspend fun vehicleSafety(make: String, model: String, year: Int? = null): VehicleSafetyDto = withContext(io) {
        api.vehicleSafety(make, model, year)
    }

    /** GET /ev/charging-stations — raw DTO (see InsightsRepository.chargers for domain). */
    suspend fun evCharging(lat: Double, lng: Double, radiusKm: Double = 25.0): ChargingStationsDto = withContext(io) {
        api.chargingStations(lat, lng, radiusKm)
    }

    /** GET /calculators/macro — live FX reference (used by Valuation landed-cost). */
    suspend fun macro(): MacroDto = withContext(io) {
        api.macro()
    }

    /** GET /calculators/permits — permit price list (snapshot, then benchmarks). */
    suspend fun permits(): List<PermitDto> = withContext(io) {
        runCatching { api.permits() }
            .getOrElse { snapshots.permits().items }
            .ifEmpty { OfflineCalculators.benchmarkPermits() }
    }

    /** GET /calculators/vehicle-news — vehicle news items. */
    suspend fun vehicleNews(limit: Int = 8): List<VehicleNewsItemDto> = withContext(io) {
        api.vehicleNews(limit)
    }

    /** POST /calculators/revenue-licence — licence fee estimate. */
    suspend fun revenueLicence(body: RevenueLicenceRequestDto): RevenueLicenceResponseDto = withContext(io) {
        api.revenueLicence(body)
    }

    /** POST /calculators/third-party-insurance — insurance premium estimate. */
    suspend fun thirdPartyInsurance(body: InsuranceRequestDto): InsuranceResponseDto = withContext(io) {
        api.thirdPartyInsurance(body)
    }

    /** POST /calculators/transfer-fees — ownership transfer fee estimate. */
    suspend fun transferFees(body: TransferFeesRequestDto): TransferFeesResponseDto = withContext(io) {
        api.transferFees(body)
    }

    /** POST /calculators/import-eligibility — import age-rule check. */
    suspend fun importEligibility(body: ImportEligibilityRequestDto): ImportEligibilityResponseDto = withContext(io) {
        api.importEligibility(body)
    }

    /** POST /calculators/ownership-bundle — first-year ownership cost bundle. */
    suspend fun ownershipBundle(body: OwnershipBundleRequestDto): OwnershipBundleResponseDto = withContext(io) {
        api.ownershipBundle(body)
    }

    private suspend fun cachedSummary(): StatsSummary? {
        val row = db.statsCacheDao().get(SUMMARY_KEY) ?: return null
        if (System.currentTimeMillis() - row.updatedAtMs > TTL_MS) return null
        return runCatching { json.decodeFromString<StatsSummaryCache>(row.json).toDomain() }.getOrNull()
    }

    @kotlinx.serialization.Serializable
    private data class StatsSummaryCache(
        val totalListings: Int = 0,
        val avgPriceLkr: Double? = null,
        val priceChangeMom: Double? = null,
        val goodDealsCount: Int = 0,
        val listingsThisWeek: Int = 0,
        val districtsCovered: Int = 0,
        val sourceCount: Int = 0,
        val lastUpdated: String? = null,
    ) {
        fun toDomain() = StatsSummary(totalListings, avgPriceLkr, priceChangeMom, goodDealsCount, listingsThisWeek, districtsCovered, sourceCount, lastUpdated)
    }

    private fun StatsSummary.toCache() = StatsSummaryCache(totalListings, avgPriceLkr, priceChangeMom, goodDealsCount, listingsThisWeek, districtsCovered, sourceCount, lastUpdated)
}
