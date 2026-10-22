package lk.motormila.app.data.remote.mapper

import lk.motormila.app.data.remote.dto.DistrictInsightDto
import lk.motormila.app.data.remote.dto.DistrictPriceDto
import lk.motormila.app.data.remote.dto.DistrictTopModelDto
import lk.motormila.app.data.remote.dto.DistrictVelocityPointDto
import lk.motormila.app.data.remote.dto.MakeInsightDto
import lk.motormila.app.data.remote.dto.MakeModelInsightDto
import lk.motormila.app.data.remote.dto.EvInsightDto
import lk.motormila.app.data.remote.dto.FuelMixBucketDto
import lk.motormila.app.data.remote.dto.HotDealDto
import lk.motormila.app.data.remote.dto.InsightsDto
import lk.motormila.app.data.remote.dto.MarketSignalDto
import lk.motormila.app.data.remote.dto.PriceDropItemDto
import lk.motormila.app.data.remote.dto.PriceIndexDto
import lk.motormila.app.data.remote.dto.PriceIndexPointDto
import lk.motormila.app.data.remote.dto.SegmentPerformanceDto
import lk.motormila.app.data.remote.dto.StatsSummaryDto
import lk.motormila.app.data.remote.dto.TrendPointDto
import lk.motormila.app.data.remote.dto.TrendSeriesDto
import lk.motormila.app.data.remote.dto.TrendingModelDto
import lk.motormila.app.domain.model.DistrictInsight
import lk.motormila.app.domain.model.DistrictStat
import lk.motormila.app.domain.model.DistrictVelocity
import lk.motormila.app.domain.model.HubTopModel
import lk.motormila.app.domain.model.MakeInsight
import lk.motormila.app.domain.model.MakeModelInsight
import lk.motormila.app.domain.model.FuelMixBucket
import lk.motormila.app.domain.model.HotDeal
import lk.motormila.app.domain.model.Insights
import lk.motormila.app.domain.model.MarketSignal
import lk.motormila.app.domain.model.PriceDrop
import lk.motormila.app.domain.model.PriceIndex
import lk.motormila.app.domain.model.PriceIndexPoint
import lk.motormila.app.domain.model.SegmentPerformance
import lk.motormila.app.domain.model.StatsSummary
import lk.motormila.app.domain.model.TrendPoint
import lk.motormila.app.domain.model.TrendSeries
import lk.motormila.app.domain.model.TrendingModel
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Stats/market mappings. Backend months may arrive as "YYYY-MM" period strings. */
fun StatsSummaryDto.toDomain(): StatsSummary = StatsSummary(
    totalListings = totalListings,
    avgPriceLkr = avgPriceLkr,
    priceChangeMom = priceChangeMom,
    goodDealsCount = goodDealsCount,
    listingsThisWeek = listingsThisWeek,
    districtsCovered = districtsCovered.takeIf { it != 0 } ?: districtCount ?: 0,
    sourceCount = sourceCount,
    lastUpdated = lastUpdated,
)

fun DistrictPriceDto.toDomain(): DistrictStat = DistrictStat(
    district = district,
    lat = lat ?: 0.0,
    lng = lng ?: 0.0,
    count = count,
    avgPriceLkr = avgPriceLkr,
    medianPriceLkr = medianPriceLkr,
    topMake = topMake,
    topModel = topModel,
    topModelCount = topModelCount,
)

fun DistrictVelocityPointDto.toDomain(): DistrictVelocity = DistrictVelocity(
    district = district, lat = lat, lng = lng,
    listingCount = listingCount, new7dCount = new7dCount,
    velocityScore = velocityScore,
)

fun TrendPointDto.toDomain(): TrendPoint {
    var y = year
    var m = month
    if ((y == null || m == null) && period != null) {
        val parts = period.split("-")
        y = parts.getOrNull(0)?.toIntOrNull()
        m = parts.getOrNull(1)?.toIntOrNull()
    }
    return TrendPoint(
        year = y ?: 0,
        month = m ?: 0,
        avgPriceLkr = avgPriceLkr,
        medianPriceLkr = medianPriceLkr,
        listingCount = listingCount,
    )
}

fun TrendSeriesDto.toDomain(): TrendSeries =
    TrendSeries(points = points.map { it.toDomain() }, coverageScope = coverageScope, coverageNote = coverageNote)

fun PriceIndexPointDto.toDomain(): PriceIndexPoint = PriceIndexPoint(
    period = period,
    indexValue = indexValue,
    medianPriceLkr = medianPriceLkr,
    listingCount = listingCount,
    momChangePct = momChangePct,
)

fun PriceIndexDto.toDomain(): PriceIndex {
    val overall = points.map { it.toDomain() }
    val parsedSegments = LinkedHashMap<String, List<PriceIndexPoint>>()
    segments.forEach { (key, element) ->
        val arr = element as? JsonArray ?: return@forEach
        val pts = arr.mapNotNull { item ->
            val obj = item as? JsonObject ?: return@mapNotNull null
            val period = obj.string("period") ?: return@mapNotNull null
            PriceIndexPoint(
                period = period,
                indexValue = obj.double("index_value") ?: 0.0,
                medianPriceLkr = obj.double("median_price_lkr") ?: 0.0,
                listingCount = obj.int("listing_count") ?: 0,
                momChangePct = obj.double("mom_change_pct"),
            )
        }
        if (pts.isNotEmpty()) parsedSegments[key] = pts
    }
    return PriceIndex(
        basePeriod = basePeriod,
        latestPeriod = latestPeriod,
        points = overall,
        segments = parsedSegments,
        methodology = methodology,
    )
}

private fun JsonObject.string(key: String): String? =
    this[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull

private fun JsonObject.double(key: String): Double? =
    this[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.doubleOrNull

private fun JsonObject.int(key: String): Int? =
    this[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.intOrNull

fun SegmentPerformanceDto.toDomain(): SegmentPerformance = SegmentPerformance(
    segment = segment, listingCount = listingCount,
    avgPriceLkr = avgPriceLkr, changePct30d = changePct30d,
)

fun TrendingModelDto.toDomain(): TrendingModel = TrendingModel(
    make = make, model = model, listingCount = listingCount,
    avgPriceLkr = avgPriceLkr, movementPct = movementPct, thumbnailUrl = thumbnailUrl,
)

fun HotDealDto.toDomain(): HotDeal = HotDeal(
    id = id, make = make, model = model, year = year, district = district,
    source = source, priceLkr = priceLkr, dealScore = dealScore, thumbnailUrl = thumbnailUrl,
)

fun InsightsDto.toDomain(): Insights = Insights(
    newListings24h = newListings24h,
    segmentPerformance = segmentPerformance.map { it.toDomain() },
    trendingModels = trendingModels.map { it.toDomain() },
    hotDeals = hotDeals.map { it.toDomain() },
)

fun PriceDropItemDto.toDomain(): PriceDrop = PriceDrop(
    listing = listing.toDomain(),
    previousPriceLkr = previousPriceLkr,
    newPriceLkr = newPriceLkr,
    dropPct = dropPct,
    droppedAt = droppedAt,
)

fun FuelMixBucketDto.toDomain(total: Int = 0): FuelMixBucket {
    val pctValue = if (pct != 0.0) pct else (share ?: 0.0).let { if (it <= 1.0) it * 100.0 else it }
    return FuelMixBucket(fuelType = fuelType, count = count, pct = pctValue)
}

fun MarketSignalDto.toDomain(): MarketSignal = MarketSignal(
    id = id,
    source = source,
    signalType = signalType,
    metric = metric,
    valueNumeric = valueNumeric,
    unit = unit,
    observedAt = observedAt,
    sourceUrl = sourceUrl.takeIf { it.isNotBlank() },
    category = category,
    periodYear = periodYear,
    periodMonth = periodMonth,
)

/** EV insight endpoint returns top models + trend; surfaced as TrendSeries. */
fun EvInsightDto.toTrendSeries(): TrendSeries =
    TrendSeries(points = trendPoints.map { it.toDomain() }, coverageScope = "exact", coverageNote = null)

fun DistrictTopModelDto.toHubTopModel(): HubTopModel = HubTopModel(
    make = make,
    model = model,
    listingCount = count?.takeIf { it > 0 } ?: listingCount,
    avgPriceLkr = avgPriceLkr,
)

fun DistrictInsightDto.toDomain(): DistrictInsight = DistrictInsight(
    district = district,
    listingCount = listingCount,
    avgPriceLkr = avgPriceLkr,
    medianPriceLkr = medianPriceLkr,
    changePct30d = changePct30d,
    topModels = topModels.map { it.toHubTopModel() },
)

fun MakeInsightDto.toDomain(): MakeInsight = MakeInsight(
    make = make,
    listingCount = total?.takeIf { it > 0 } ?: listingCount,
    avgPriceLkr = avgPriceLkr,
    medianPriceLkr = medianPriceLkr,
    topModels = topModels.map { it.toHubTopModel() },
    trend = trendPoints.map { it.toDomain() },
)

fun MakeModelInsightDto.toDomain(): MakeModelInsight = MakeModelInsight(
    make = make.orEmpty(),
    model = model.orEmpty(),
    listingCount = total?.takeIf { it > 0 } ?: listingCount,
    avgPriceLkr = avgPriceLkr,
    medianPriceLkr = medianPriceLkr,
    minPriceLkr = minPriceLkr,
    maxPriceLkr = maxPriceLkr,
    trend = trendPoints.map { it.toDomain() },
    coverageScope = coverageScope,
    coverageNote = coverageNote,
)
