package lk.motormila.app.data.remote

import lk.motormila.app.data.remote.dto.DistrictPricesDto
import lk.motormila.app.data.remote.dto.DistrictVelocityDto
import lk.motormila.app.data.remote.dto.FuelMixDto
import lk.motormila.app.data.remote.dto.HybridBandsDto
import lk.motormila.app.data.remote.dto.InsightsDto
import lk.motormila.app.data.remote.dto.LiveMarketDto
import lk.motormila.app.data.remote.dto.PermitsSnapshotDto
import lk.motormila.app.data.remote.dto.PriceDropsDto
import lk.motormila.app.data.remote.dto.PriceIndexDto
import lk.motormila.app.data.remote.dto.PriceSparklinesDto
import lk.motormila.app.data.remote.dto.StatsSummaryDto
import lk.motormila.app.data.remote.dto.TrendSeriesDto
import retrofit2.http.GET

/**
 * Static snapshot fallback served from the production site
 * (`https://motormila.pages.dev/snapshots/latest/`, rebuilt by the
 * restore-catalog workflow). Shapes are identical to the live endpoint
 * payloads because the export calls the same builders — existing DTOs parse
 * both. No auth: these files are public by design.
 *
 * Used ONLY when the live API call throws (Neon outage). Live stays first.
 */
interface SnapshotApiService {

    @GET("stats-summary.json")
    suspend fun statsSummary(): StatsSummaryDto

    @GET("live-market.json")
    suspend fun liveMarket(): LiveMarketDto

    @GET("district-prices.json")
    suspend fun districtPrices(): DistrictPricesDto

    @GET("district-velocity.json")
    suspend fun districtVelocity(): DistrictVelocityDto

    @GET("dashboard-insights.json")
    suspend fun insights(): InsightsDto

    @GET("price-drops.json")
    suspend fun priceDrops(): PriceDropsDto

    @GET("fuel-mix.json")
    suspend fun fuelMix(): FuelMixDto

    @GET("hybrid-bands.json")
    suspend fun hybridBands(): HybridBandsDto

    @GET("price-index.json")
    suspend fun priceIndex(): PriceIndexDto

    @GET("price-trends.json")
    suspend fun priceTrends(): TrendSeriesDto

    @GET("permits.json")
    suspend fun permits(): PermitsSnapshotDto

    @GET("price-sparklines.json")
    suspend fun priceSparklines(): PriceSparklinesDto
}
