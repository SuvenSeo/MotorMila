package lk.motormila.app.data.remote.mapper

import lk.motormila.app.data.local.db.entity.ListingEntity
import lk.motormila.app.data.local.db.entity.PricePointEntity
import lk.motormila.app.data.remote.dto.ComparableVehicleDto
import lk.motormila.app.data.remote.dto.CustomEstimateDto
import lk.motormila.app.data.remote.dto.CustomEstimateInputDto
import lk.motormila.app.data.remote.dto.EstimateDto
import lk.motormila.app.data.remote.dto.FmvDto
import lk.motormila.app.data.remote.dto.GeoDto
import lk.motormila.app.data.remote.dto.HistoryReportDto
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.dto.ListingSearchSuggestionDto
import lk.motormila.app.data.remote.dto.PriceHistoryDto
import lk.motormila.app.data.remote.dto.PriceHistoryPointDto
import lk.motormila.app.data.remote.dto.SafetyResearchDto
import lk.motormila.app.data.remote.dto.SellerProfileDto
import lk.motormila.app.data.remote.dto.VehicleSafetyDto
import lk.motormila.app.domain.model.Comparable
import lk.motormila.app.domain.model.DealBand
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.HistoryReport
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.PricePoint
import lk.motormila.app.domain.model.RelatedListing
import lk.motormila.app.domain.model.ReportFlag
import lk.motormila.app.domain.model.SellerProfile
import lk.motormila.app.domain.model.Valuation
import lk.motormila.app.domain.model.ValuationInput

/**
 * DTO <-> domain <-> entity mappings for listings, FMV, history, seller.
 * Free-plan rule: backend nulls deal_score/market_median -> domain keeps nulls
 * and [Listing.dealBand] reports LOCKED. Never default them to 0.
 */
fun ListingDto.toDomain(): Listing = Listing(
    id = id,
    title = title ?: "",
    make = make,
    model = model,
    year = year,
    priceLkr = priceLkr,
    mileageKm = mileage?.toDouble(),
    fuelType = fuelType,
    transmission = transmission,
    condition = condition,
    bodyType = bodyType,
    district = district,
    city = city,
    source = source,
    thumbnailUrl = thumbnailUrl,
    images = images.orEmpty(),
    dealScore = dealScore,
    marketMedianLkr = marketMedianLkr,
    isActive = isActive,
    scrapedAt = scrapedAt,
    firstSeenAt = firstSeenAt,
    lastSeenAt = lastSeenAt,
    detailUrl = detailUrl ?: url,
    externalUrl = externalUrl ?: url,
    engineCc = engineCapacity?.toDouble(),
)

fun ListingSearchSuggestionDto.toDomain(): Listing = Listing(
    id = id,
    title = "",
    make = make,
    model = model,
    year = year,
    priceLkr = priceLkr,
    mileageKm = null,
    fuelType = null,
    transmission = null,
    condition = null,
    bodyType = null,
    district = district,
    city = null,
    source = source,
    thumbnailUrl = thumbnailUrl,
    images = emptyList(),
    dealScore = null,
    marketMedianLkr = null,
    isActive = true,
    scrapedAt = null,
    firstSeenAt = null,
    lastSeenAt = null,
    detailUrl = url,
    externalUrl = url,
    engineCc = null,
)

fun Listing.toEntity(cachedAtMs: Long = System.currentTimeMillis()): ListingEntity =
    ListingEntity(
        id = id,
        title = title,
        make = make,
        model = model,
        year = year,
        priceLkr = priceLkr,
        mileageKm = mileageKm,
        fuelType = fuelType,
        transmission = transmission,
        condition = condition,
        bodyType = bodyType,
        district = district,
        city = city,
        source = source,
        thumbnailUrl = thumbnailUrl,
        imagesCsv = images.joinToString("||"),
        dealScore = dealScore,
        marketMedianLkr = marketMedianLkr,
        isActive = isActive,
        scrapedAt = scrapedAt,
        firstSeenAt = firstSeenAt,
        lastSeenAt = lastSeenAt,
        detailUrl = detailUrl,
        externalUrl = externalUrl,
        engineCc = engineCc,
        cachedAtMs = cachedAtMs,
    )

fun ListingEntity.toDomain(): Listing = Listing(
    id = id,
    title = title,
    make = make,
    model = model,
    year = year,
    priceLkr = priceLkr,
    mileageKm = mileageKm,
    fuelType = fuelType,
    transmission = transmission,
    condition = condition,
    bodyType = bodyType,
    district = district,
    city = city,
    source = source,
    thumbnailUrl = thumbnailUrl,
    images = imagesCsv.split("||").filter { it.isNotBlank() },
    dealScore = dealScore,
    marketMedianLkr = marketMedianLkr,
    isActive = isActive,
    scrapedAt = scrapedAt,
    firstSeenAt = firstSeenAt,
    lastSeenAt = lastSeenAt,
    detailUrl = detailUrl,
    externalUrl = externalUrl,
    engineCc = engineCc,
)

fun PriceHistoryPointDto.toDomain(): PricePoint = PricePoint(priceLkr = priceLkr, scrapedAt = scrapedAt)

fun PriceHistoryDto.toDomain(): PriceHistory = PriceHistory(
    listingId = listingId,
    points = points.map { it.toDomain() },
    firstPriceLkr = firstPriceLkr,
    currentPriceLkr = currentPriceLkr,
    changePct = changePct,
    cutCount = cutCount,
    raiseCount = raiseCount,
    highestPriceLkr = highestPriceLkr,
    lowestPriceLkr = lowestPriceLkr,
    lastChangeAt = lastChangeAt,
    trackedPoints = trackedPoints,
)

fun PriceHistoryDto.toEntities(): List<PricePointEntity> =
    points.map { PricePointEntity(listingId = listingId, priceLkr = it.priceLkr, scrapedAt = it.scrapedAt) }

fun List<PricePointEntity>.toDomainHistory(listingId: Int): PriceHistory {
    val pts = map { PricePoint(priceLkr = it.priceLkr, scrapedAt = it.scrapedAt) }
    return PriceHistory(
        listingId = listingId,
        points = pts,
        firstPriceLkr = pts.firstOrNull()?.priceLkr,
        currentPriceLkr = pts.lastOrNull()?.priceLkr,
        trackedPoints = pts.size,
    )
}

fun HistoryReportDto.toDomain(): HistoryReport = HistoryReport(
    listingId = listingId,
    firstSeenAt = firstSeenAt,
    lastSeenAt = lastSeenAt,
    daysOnMarket = daysOnMarket,
    isActive = isActive,
    pricePoints = pricePoints.map { it.toDomain() },
    priceCuts = priceCuts,
    totalChangePct = totalChangePct,
    relatedListings = relatedListings.map {
        RelatedListing(
            id = it.id, source = it.source, title = it.title,
            priceLkr = it.priceLkr, mileageKm = it.mileage,
            firstSeenAt = it.firstSeenAt, isActive = it.isActive,
            confidence = it.confidence,
        )
    },
    flags = flags.map { ReportFlag(kind = it.kind, severity = it.severity, detail = it.detail) },
    disclaimer = disclaimer,
)

fun SellerProfileDto.toDomain(): SellerProfile = SellerProfile(
    source = source, sourceUrl = sourceUrl, sellerName = sellerName,
    sellerType = sellerType, memberSince = memberSince,
    listingCount = listingCount, reviewCount = reviewCount, rating = rating,
    phoneNumbers = phoneNumbers, whatsappNumbers = whatsappNumbers,
    verifiedBadges = verifiedBadges, fetchedAt = fetchedAt,
)

/**
 * FMV dict keys vary by backend method (adjusted-median vs OLS-ML).
 * Resolution order: explicit fmv -> predicted -> market median fallback (LOCKED).
 */
fun FmvDto.toDomain(askingFallbackLkr: Double = 0.0): Fmv {
    val asking = askingLkr ?: askingPriceLkr ?: askingFallbackLkr
    val fmv = fmvLkr ?: predictedPriceLkr
    val delta = deltaPct ?: priceGapPct?.let { -it }
    val score = dealScore
    val band = when {
        fmv == null || score == null -> DealBand.LOCKED
        score >= 8 -> DealBand.GREAT
        score >= 0 -> DealBand.FAIR
        else -> DealBand.HIGH
    }
    val label = label ?: verdict ?: when (band) {
        DealBand.GREAT -> "great_deal"
        DealBand.FAIR -> "fair"
        DealBand.HIGH -> "overpriced"
        DealBand.LOCKED -> "locked"
    }
    return Fmv(
        askingLkr = asking,
        fmvLkr = fmv,
        dealScore = score,
        deltaPct = delta,
        band = band,
        label = label,
        method = method ?: methodology,
        sampleCount = sampleCount ?: comparableCount ?: 0,
        confidence = confidence ?: "low",
    )
}

fun ComparableVehicleDto.toDomain(): Comparable = Comparable(
    id = id, title = title, priceLkr = priceLkr, district = district,
    dealScore = dealScore, detailUrl = detailUrl, externalUrl = externalUrl,
)

fun CustomEstimateDto.toDomain(): Valuation = Valuation(
    vehicleLabel = vehicleLabel,
    lowLkr = estimatedLowLkr,
    medianLkr = estimatedMedianLkr,
    highLkr = estimatedHighLkr,
    confidence = confidence,
    verdict = verdict,
    verdictLabel = verdictLabel,
    deltaPct = deltaPct,
    comparableCount = comparableCount,
    methodology = methodology,
    comparables = comparables.map { it.toDomain() },
)

/** Quick GET /estimate band mapped onto Valuation (no comparables). */
fun EstimateDto.toDomain(): Valuation {
    // Backend keys: estimated_price_lkr, price_range_low/high, comparable_listings
    val median = estimatedPriceLkr ?: 0.0
    val low = priceRangeLow ?: median
    val high = priceRangeHigh ?: median
    val verdict = when {
        median <= 0.0 -> "unknown"
        low < median && high > median -> "fair"
        else -> "fair"
    }
    return Valuation(
        vehicleLabel = listOfNotNull(make, model, year?.toString()).joinToString(" "),
        lowLkr = low,
        medianLkr = median,
        highLkr = high,
        confidence = if (comparableListings >= 5) "medium" else "low",
        verdict = verdict,
        verdictLabel = "",
        deltaPct = null,
        comparableCount = comparableListings,
        methodology = "",
        comparables = emptyList(),
    )
}

fun ValuationInput.toCustomEstimateDto(): CustomEstimateInputDto = CustomEstimateInputDto(
    make = make, model = model, year = year, mileageKm = mileageKm,
    condition = condition, transmission = transmission, fuelType = fuelType,
    bodyType = bodyType, district = district, askingPriceLkr = askingPriceLkr,
)

/** Listing geo + safety pass-throughs for the detail sheet (kept as DTOs; no domain models defined). */
fun GeoDto.lat(): Double? = lat ?: latitude
fun GeoDto.lng(): Double? = lng ?: longitude
fun SafetyResearchDto.summaryText(): String = summary ?: ""
fun VehicleSafetyDto.summaryText(): String = summary ?: ""
