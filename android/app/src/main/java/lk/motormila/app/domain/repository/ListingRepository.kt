package lk.motormila.app.domain.repository

import androidx.paging.PagingData
import kotlinx.coroutines.flow.Flow
import lk.motormila.app.domain.model.Comparable
import lk.motormila.app.domain.model.Fmv
import lk.motormila.app.domain.model.HistoryReport
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.PlateLookupResult
import lk.motormila.app.domain.model.PriceHistory
import lk.motormila.app.domain.model.SellerProfile
import lk.motormila.app.domain.model.Valuation
import lk.motormila.app.domain.model.ValuationInput

/**
 * Search/filter query. Mirrors GET /listings query params
 * (backend/app/api/v1/endpoints/listings.py :: search_listings).
 */
data class ListingQuery(
    val keyword: String? = null,
    val source: String? = null,
    val make: String? = null,
    val model: String? = null,
    val yearMin: Int? = null,
    val yearMax: Int? = null,
    val priceMin: Double? = null,
    val priceMax: Double? = null,
    val mileageMax: Int? = null,
    val fuelType: String? = null,
    val transmission: String? = null,
    val condition: String? = null,
    val bodyType: String? = null,
    val district: String? = null,
    val vehicleCategory: String? = null,
    /** "newest" | "deal_score" | "price_asc" | "price_desc" | "mileage_asc". */
    val sort: String = "newest",
    /** Web parity: null = priced inventory (backend default), "unavailable" = "No price" listings. */
    val priceAvailability: String? = null,
    /** Web parity: include delisted/sold rows (the 360K+ price archive). */
    val includeArchive: Boolean = false,
) {
    val isEmpty: Boolean
        get() = keyword.isNullOrBlank() && source.isNullOrBlank() && make.isNullOrBlank() &&
            model.isNullOrBlank() && yearMin == null && yearMax == null &&
            priceMin == null && priceMax == null && mileageMax == null &&
            fuelType.isNullOrBlank() && transmission.isNullOrBlank() &&
            condition.isNullOrBlank() && bodyType.isNullOrBlank() &&
            district.isNullOrBlank() && vehicleCategory.isNullOrBlank() &&
            priceAvailability.isNullOrBlank() && !includeArchive
}

/** Sort options for the search sort row. */
object ListingSorts {
    const val NEWEST = "newest"
    const val DEAL_SCORE = "deal_score"
    const val PRICE_ASC = "price_asc"
    const val PRICE_DESC = "price_desc"
    const val MILEAGE_ASC = "mileage_asc"
    val ALL = listOf(NEWEST, DEAL_SCORE, PRICE_ASC, PRICE_DESC, MILEAGE_ASC)
}

interface ListingRepository {
    /** Paged search stream. Data builder implements with Paging3 + remote mediator/cache. */
    fun paging(query: ListingQuery): Flow<PagingData<Listing>>

    /**
     * True while the current paged search is served from the public offline
     * snapshot (live API failed on page 1). Drives the "showing snapshot" banner.
     */
    val pagingFromSnapshot: kotlinx.coroutines.flow.StateFlow<Boolean>
        get() = kotlinx.coroutines.flow.MutableStateFlow(false)

    /** First-page snapshot for hub rails (make / model / district). */
    suspend fun searchPage(query: ListingQuery, page: Int = 1, size: Int = 8): List<Listing>

    suspend fun getDetail(id: Int): Listing

    suspend fun similar(id: Int, limit: Int = 8): List<Listing>

    suspend fun priceHistory(id: Int): PriceHistory

    suspend fun historyReport(id: Int): HistoryReport

    suspend fun fmv(id: Int): Fmv

    suspend fun sellerProfile(id: Int): SellerProfile

    suspend fun sources(): List<String>

    suspend fun makes(): List<String>

    /** Total matches for [query] (backend `total`), for the live "Show N results" count; null when unknown. */
    suspend fun count(query: ListingQuery): Int? = null

    suspend fun models(make: String): List<String>

    suspend fun suggestions(query: String, limit: Int = 8): List<Listing>

    suspend fun estimate(input: ValuationInput): Valuation

    suspend fun customEstimate(input: ValuationInput): Valuation

    /** Best-effort plate lookup: top search hit for [plate] + its FMV. */
    suspend fun lookupByPlate(plate: String): PlateLookupResult
}
