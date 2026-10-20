package lk.motormila.app.domain.model

/** Mirrors backend `StatsSummary` (GET /stats/summary). */
data class StatsSummary(
    val totalListings: Int = 0,
    val avgPriceLkr: Double? = null,
    val priceChangeMom: Double? = null,
    val goodDealsCount: Int = 0,
    val listingsThisWeek: Int = 0,
    val districtsCovered: Int = 0,
    val sourceCount: Int = 0,
    val lastUpdated: String? = null,
)

/** One map/market point. Mirrors backend district-prices point. */
data class DistrictStat(
    val district: String,
    val lat: Double,
    val lng: Double,
    val count: Int,
    val avgPriceLkr: Double?,
    val medianPriceLkr: Double?,
    val topMake: String? = null,
    val topModel: String? = null,
    val topModelCount: Int? = null,
)

/** One monthly aggregate point. Mirrors backend trends point. */
data class TrendPoint(
    val year: Int,
    val month: Int,
    val avgPriceLkr: Double?,
    val medianPriceLkr: Double?,
    val listingCount: Int,
) {
    val periodKey: String get() = "%04d-%02d".format(year, month)
}

/** Trend series with backend coverage-scope fallback metadata. */
data class TrendSeries(
    val points: List<TrendPoint> = emptyList(),
    /** "exact" | "condition_fallback" | "district_fallback" | "national_fallback" | "partial" | "current_snapshot" | "none". */
    val coverageScope: String = "exact",
    val coverageNote: String? = null,
)

/** One mix-adjusted index point. Mirrors backend `PriceIndexPoint`. */
data class PriceIndexPoint(
    val period: String,
    val indexValue: Double,
    val medianPriceLkr: Double,
    val listingCount: Int,
    val momChangePct: Double?,
)

/** Mirrors backend `PriceIndexResponse` (free tier: newest N months, no segments). */
data class PriceIndex(
    val basePeriod: String? = null,
    val latestPeriod: String? = null,
    val points: List<PriceIndexPoint> = emptyList(),
    val segments: Map<String, List<PriceIndexPoint>> = emptyMap(),
    val methodology: String = "",
)

/** Dashboard insights payload. Mirrors `DashboardInsightsResponse`. */
data class Insights(
    val newListings24h: Int = 0,
    val segmentPerformance: List<SegmentPerformance> = emptyList(),
    val trendingModels: List<TrendingModel> = emptyList(),
    val hotDeals: List<HotDeal> = emptyList(),
)

data class SegmentPerformance(
    val segment: String,
    val listingCount: Int,
    val avgPriceLkr: Double,
    val changePct30d: Double?,
)

data class TrendingModel(
    val make: String,
    val model: String,
    val listingCount: Int,
    val avgPriceLkr: Double,
    val movementPct: Double?,
    val thumbnailUrl: String?,
)

data class HotDeal(
    val id: Int,
    val make: String,
    val model: String,
    val year: Int?,
    val district: String?,
    val source: String,
    val priceLkr: Double,
    val dealScore: Double,
    val thumbnailUrl: String?,
)

/** One recorded price cut. Mirrors backend `PriceDropItem`. */
data class PriceDrop(
    val listing: Listing,
    val previousPriceLkr: Double,
    val newPriceLkr: Double,
    val dropPct: Double,
    val droppedAt: String,
)

/** District velocity point. Mirrors `DistrictVelocityPoint`. */
data class DistrictVelocity(
    val district: String,
    val lat: Double,
    val lng: Double,
    val listingCount: Int,
    val new7dCount: Int,
    val velocityScore: Double,
)

/** Fuel-mix bucket. Mirrors backend `/stats/fuel-mix` bucket. */
data class FuelMixBucket(
    val fuelType: String,
    val count: Int,
    val pct: Double,
)

/** Generic market signal row. Mirrors backend `MarketSignalRead`. */
data class MarketSignal(
    val id: Int,
    val source: String,
    val signalType: String,
    val metric: String,
    val valueNumeric: Double?,
    val unit: String?,
    val observedAt: String,
    val sourceUrl: String? = null,
    val category: String? = null,
    val periodYear: Int? = null,
    val periodMonth: Int? = null,
)

/** EV charging station near a geo point. Mirrors backend `ChargingStationDto`. */
data class ChargingStation(
    val name: String,
    val address: String?,
    val town: String?,
    val distanceKm: Double?,
    val status: String?,
    val connectors: List<String>,
    val lat: Double? = null,
    val lng: Double? = null,
)

/** Vehicle news card. Mirrors backend `VehicleNewsItemDto`. */
data class VehicleNews(
    val id: String,
    val title: String,
    val source: String,
    val timeLabel: String,
    val url: String?,
)

/** EV market rollup derived from `/stats/ev-insight` + `/stats/fuel-mix`. */
data class EvStats(
    val count: Int,
    val sharePct: Double,
    /** Mean asking price of live EV listings (backend `avg_price_lkr`) — an average, not a median. */
    val avgPriceLkr: Double?,
    /** Hybrid (Aqua) benchmark median; null until the backend serves it. */
    val aquaMedianLkr: Double?,
    val topModels: List<String>,
)

/** Market-pulse feed card derived from a `MarketSignal`. */
data class PulseSignal(
    val id: String,
    val title: String,
    val tag: String,
    val body: String,
    val timeLabel: String,
)

/** Import permit row. Mirrors backend `PermitDto` (GET /calculators/permits). */
data class Permit(
    val id: Int?,
    val name: String,
    val type: String,
    val marketPriceLkr: Double,
)

/** Ranked make/model row used on make, district, and model hubs. */
data class HubTopModel(
    val make: String,
    val model: String,
    val listingCount: Int,
    val avgPriceLkr: Double,
)

/** GET /stats/district-insight. */
data class DistrictInsight(
    val district: String,
    val listingCount: Int,
    val avgPriceLkr: Double?,
    val medianPriceLkr: Double?,
    val changePct30d: Double?,
    val topModels: List<HubTopModel> = emptyList(),
)

/** GET /stats/make-insight. */
data class MakeInsight(
    val make: String,
    val listingCount: Int,
    val avgPriceLkr: Double?,
    val medianPriceLkr: Double?,
    val topModels: List<HubTopModel> = emptyList(),
    val trend: List<TrendPoint> = emptyList(),
)

/** GET /stats/make-model-insight. */
data class MakeModelInsight(
    val make: String,
    val model: String,
    val listingCount: Int,
    val avgPriceLkr: Double?,
    val medianPriceLkr: Double?,
    val minPriceLkr: Double?,
    val maxPriceLkr: Double?,
    val trend: List<TrendPoint> = emptyList(),
    val coverageScope: String = "exact",
    val coverageNote: String? = null,
)
