package lk.motormila.app.data.repository

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.SnapshotApiService
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.ChargingStation
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.EvStats
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.domain.model.MarketSignal
import lk.motormila.app.domain.model.Permit
import lk.motormila.app.domain.model.PriceIndex
import lk.motormila.app.domain.model.TrendSeries
import lk.motormila.app.domain.model.VehicleNews
import lk.motormila.app.domain.repository.InsightsRepository

/**
 * Insights aggregates over stats/market/EV/calculator endpoints.
 * Errors propagate; the ViewModel isolates per-section failures.
 * Index / districts / velocity / fuel mix / permits / unfiltered trends fall
 * back to the public snapshot (same builders, same DTOs) when the live API
 * throws, so Insights, Price Index, Permits and EV hub survive a backend
 * outage. Filtered trends have no snapshot equivalent and still throw.
 */
@Singleton
class InsightsRepositoryImpl @Inject constructor(
    private val api: MotormilaApiService,
    private val snapshots: SnapshotApiService,
    @IoDispatcher private val io: CoroutineDispatcher,
) : InsightsRepository {

    override suspend fun trends(
        make: String?,
        model: String?,
        condition: String?,
        district: String?,
        months: Int,
    ): TrendSeries = withContext(io) {
        val unfiltered = make.isNullOrBlank() && model.isNullOrBlank() &&
            condition.isNullOrBlank() && district.isNullOrBlank()
        val live = suspend {
            api.trends(
                make = make?.ifBlank { null },
                model = model?.ifBlank { null },
                condition = condition?.ifBlank { null },
                district = district?.ifBlank { null },
                months = months,
            ).toDomain()
        }
        // The snapshot is the market-wide series only; never pass it off as a
        // make/model/district trend.
        if (unfiltered) withSnapshotFallback(live, { snapshots.priceTrends().toDomain() }) else live()
    }

    override suspend fun index(): PriceIndex = withContext(io) {
        withSnapshotFallback({ api.priceIndex().toDomain() }, { snapshots.priceIndex().toDomain() })
    }

    override suspend fun districts(): List<DistrictStat> = withContext(io) {
        withSnapshotFallback({ api.districtPrices().points }, { snapshots.districtPrices().points })
            .map { it.toDomain() }
    }

    override suspend fun velocities(): List<DistrictVelocity> = withContext(io) {
        withSnapshotFallback({ api.districtVelocity().points }, { snapshots.districtVelocity().points })
            .map { it.toDomain() }
    }

    override suspend fun fuelMix(): List<FuelMixBucket> = withContext(io) {
        val rows = withSnapshotFallback({ api.fuelMix().buckets }, { snapshots.fuelMix().buckets })
        val total = rows.sumOf { it.count }.coerceAtLeast(1)
        rows.map { it.toDomain(total) }
    }

    override suspend fun signals(limit: Int): List<MarketSignal> = withContext(io) {
        api.marketSignals(limit = limit).map { it.toDomain() }
    }

    override suspend fun chargers(lat: Double, lng: Double, radiusKm: Double): List<ChargingStation> =
        withContext(io) {
            api.chargingStations(lat, lng, radiusKm).stations.map {
                ChargingStation(
                    name = it.name ?: it.title ?: "Charger",
                    address = it.address,
                    town = it.town,
                    distanceKm = it.distanceKm,
                    status = it.status,
                    connectors = it.connectionTypes,
                    lat = it.lat ?: it.latitude,
                    lng = it.lng ?: it.longitude,
                )
            }
        }

    override suspend fun news(limit: Int): List<VehicleNews> = withContext(io) {
        api.vehicleNews(limit).mapIndexed { index, item ->
            VehicleNews(
                id = "$index-${item.title.hashCode()}",
                title = item.title,
                source = item.source ?: "",
                timeLabel = item.publishedAt?.take(10) ?: "",
                url = item.url,
            )
        }
    }

    override suspend fun evStats(): EvStats = withContext(io) {
        val ev = api.evInsight()
        val mix = runCatching {
            val rows = withSnapshotFallback({ api.fuelMix().buckets }, { snapshots.fuelMix().buckets })
            val total = rows.sumOf { it.count }.coerceAtLeast(1)
            rows.map { it.toDomain(total) }
        }.getOrDefault(emptyList())
        val electricShare = mix.firstOrNull { it.fuelType.contains("elect", ignoreCase = true) }?.pct ?: 0.0
        EvStats(
            count = ev.listingCount,
            sharePct = electricShare,
            medianLkr = ev.avgPriceLkr,
            aquaMedianLkr = null,
            savingsPerYearLkr = (300.0 / 12 - 6) * 50 * 365,
            topModels = ev.topModels.map { "${it.make} ${it.model}".trim() },
        )
    }

    override suspend fun permits(): List<Permit> = withContext(io) {
        withSnapshotFallback({ api.permits() }, { snapshots.permits().items }).map { dto ->
            Permit(
                id = dto.id,
                name = dto.permitName,
                type = dto.permitType,
                marketPriceLkr = dto.marketPriceLkr,
            )
        }
    }
}
