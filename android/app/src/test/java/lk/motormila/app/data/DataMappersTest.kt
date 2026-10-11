package lk.motormila.app.data

import lk.motormila.app.data.remote.dto.DistrictInsightDto
import lk.motormila.app.data.remote.dto.DistrictPriceDto
import lk.motormila.app.data.remote.dto.DistrictTopModelDto
import lk.motormila.app.data.remote.dto.FmvDto
import lk.motormila.app.data.remote.dto.FuelMixBucketDto
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.dto.MakeInsightDto
import lk.motormila.app.data.remote.dto.MakeModelInsightDto
import lk.motormila.app.data.remote.dto.NotificationDto
import lk.motormila.app.data.remote.dto.StatsSummaryDto
import lk.motormila.app.data.remote.dto.TrendPointDto
import lk.motormila.app.data.remote.dto.PriceIndexDto
import lk.motormila.app.data.remote.dto.PriceIndexPointDto
import lk.motormila.app.data.remote.mapper.toDomain
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import lk.motormila.app.domain.model.DealBand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure-JVM contract tests for DTO -> domain mappers (DATA_CONTRACT §1).
 * No Android/Room/Hilt dependencies — safe for testDebugUnitTest.
 */
class DataMappersTest {

    @Test
    fun listing_freeTierNullsStayNullAndLockDealBand() {
        val domain = ListingDto(
            id = 7,
            make = "Toyota",
            model = "Aqua",
            dealScore = null,
            marketMedianLkr = null,
            engineCapacity = 1500,
        ).toDomain()
        assertNull(domain.dealScore)
        assertNull(domain.marketMedianLkr)
        assertEquals(DealBand.LOCKED, domain.dealBand())
        assertEquals(1500.0, domain.engineCc)
    }

    @Test
    fun listing_scoredDealBands() {
        assertEquals(DealBand.GREAT, ListingDto(dealScore = 8.5).toDomain().dealBand())
        assertEquals(DealBand.FAIR, ListingDto(dealScore = 2.0).toDomain().dealBand())
        assertEquals(DealBand.HIGH, ListingDto(dealScore = -3.0).toDomain().dealBand())
    }

    @Test
    fun fmv_nullScoreLocksBand() {
        val fmv = FmvDto(fmvLkr = 5_000_000.0, dealScore = null).toDomain()
        assertEquals(DealBand.LOCKED, fmv.band)
        assertNull(fmv.dealScore)
    }

    @Test
    fun trendPoint_parsesPeriodString() {
        val point = TrendPointDto(year = null, month = null, period = "2024-03").toDomain()
        assertEquals(2024, point.year)
        assertEquals(3, point.month)
    }

    @Test
    fun districtStat_defaultsLatLngToZero() {
        val stat = DistrictPriceDto(district = "Colombo").toDomain()
        assertEquals(0.0, stat.lat, 0.0)
        assertEquals(0.0, stat.lng, 0.0)
    }

    @Test
    fun statsSummary_fallsBackToDistrictCount() {
        val summary = StatsSummaryDto(districtsCovered = 0, districtCount = 25).toDomain()
        assertEquals(25, summary.districtsCovered)
    }

    @Test
    fun fuelMix_shareFractionScaledToPct() {
        val bucket = FuelMixBucketDto(fuelType = "petrol", count = 30, pct = 0.0, share = 0.3).toDomain()
        assertEquals(30.0, bucket.pct, 0.001)
    }

    @Test
    fun notification_listingLinkParsesId() {
        val n = NotificationDto(
            id = 1,
            title = "Price drop",
            link = "https://motormila.pages.dev/listings/42",
            read = false,
            createdAt = "2026-01-01T00:00:00Z",
        ).toDomain()
        assertEquals("listing", n.kind)
        assertEquals(42, n.listingId)
    }

    @Test
    fun notification_plainLinkIsAlertKind() {
        val n = NotificationDto(
            id = 2,
            title = "New matches",
            link = null,
            read = true,
            createdAt = "2026-01-01T00:00:00Z",
        ).toDomain()
        assertEquals("alert", n.kind)
        assertNull(n.listingId)
    }

    @Test
    fun makeInsight_mapsTopModelsAndTrend() {
        val domain = MakeInsightDto(
            make = "Toyota",
            listingCount = 12,
            avgPriceLkr = 4_000_000.0,
            medianPriceLkr = 3_800_000.0,
            topModels = listOf(
                DistrictTopModelDto(make = "Toyota", model = "Aqua", listingCount = 5, avgPriceLkr = 6_000_000.0),
            ),
            trendPoints = listOf(TrendPointDto(year = 2026, month = 1, listingCount = 4)),
        ).toDomain()
        assertEquals("Toyota", domain.make)
        assertEquals(12, domain.listingCount)
        assertEquals("Aqua", domain.topModels.single().model)
        assertEquals(2026, domain.trend.single().year)
    }

    @Test
    fun makeModelInsight_nullMakeFallsBackEmpty() {
        val domain = MakeModelInsightDto(
            make = null,
            model = "Axio",
            listingCount = 3,
            coverageScope = "district_fallback",
        ).toDomain()
        assertEquals("", domain.make)
        assertEquals("Axio", domain.model)
        assertEquals("district_fallback", domain.coverageScope)
    }

    @Test
    fun districtInsight_mapsTopModels() {
        val domain = DistrictInsightDto(
            district = "Colombo",
            listingCount = 80,
            topModels = listOf(
                DistrictTopModelDto(make = "Honda", model = "Vezel", listingCount = 9, avgPriceLkr = 12_000_000.0),
            ),
        ).toDomain()
        assertEquals("Colombo", domain.district)
        assertEquals("Vezel", domain.topModels.single().model)
        assertEquals(9, domain.topModels.single().listingCount)
    }

    @Test
    fun priceIndex_parsesSegmentJsonArray() {
        val dto = PriceIndexDto(
            basePeriod = "2023-01",
            latestPeriod = "2024-06",
            points = listOf(
                PriceIndexPointDto(
                    period = "2024-06",
                    indexValue = 112.4,
                    medianPriceLkr = 8_000_000.0,
                    listingCount = 40,
                    momChangePct = 1.2,
                ),
            ),
            segments = mapOf(
                "hybrid" to buildJsonArray {
                    add(
                        buildJsonObject {
                            put("period", "2024-06")
                            put("index_value", 108.0)
                            put("median_price_lkr", 9_000_000.0)
                            put("listing_count", 12)
                            put("mom_change_pct", -0.5)
                        },
                    )
                },
            ),
            methodology = "Hedonic median of verified listings",
        )
        val domain = dto.toDomain()
        assertEquals("2023-01", domain.basePeriod)
        assertEquals(112.4, domain.points.single().indexValue, 0.0)
        assertEquals(1, domain.segments["hybrid"]?.size)
        assertEquals(108.0, domain.segments.getValue("hybrid").single().indexValue, 0.0)
        assertEquals(-0.5, domain.segments.getValue("hybrid").single().momChangePct)
        assertEquals("Hedonic median of verified listings", domain.methodology)
    }
}
