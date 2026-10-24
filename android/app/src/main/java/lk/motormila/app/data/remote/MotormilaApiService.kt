package lk.motormila.app.data.remote

import lk.motormila.app.data.remote.dto.AlertDto
import lk.motormila.app.data.remote.dto.AnalyticsEventRequestDto
import lk.motormila.app.data.remote.dto.AnalyticsEventResponseDto
import lk.motormila.app.data.remote.dto.ArbitrageGapDto
import lk.motormila.app.data.remote.dto.BenchmarkUrlsRequestDto
import lk.motormila.app.data.remote.dto.ChargingStationsDto
import lk.motormila.app.data.remote.dto.CheckoutIntentRequestDto
import lk.motormila.app.data.remote.dto.CheckoutIntentResponseDto
import lk.motormila.app.data.remote.dto.CreateAlertRequestDto
import lk.motormila.app.data.remote.dto.CustomEstimateDto
import lk.motormila.app.data.remote.dto.CustomEstimateInputDto
import lk.motormila.app.data.remote.dto.DealerClaimRequestDto
import lk.motormila.app.data.remote.dto.DealerClaimResponseDto
import lk.motormila.app.data.remote.dto.DealerVerifyRequestDto
import lk.motormila.app.data.remote.dto.DistrictInsightDto
import lk.motormila.app.data.remote.dto.DistrictPriceDto
import lk.motormila.app.data.remote.dto.DistrictPricesDto
import lk.motormila.app.data.remote.dto.DistrictProfileDto
import lk.motormila.app.data.remote.dto.DistrictVelocityDto
import lk.motormila.app.data.remote.dto.EstimateDto
import lk.motormila.app.data.remote.dto.EvInsightDto
import lk.motormila.app.data.remote.dto.FeedbackRequestDto
import lk.motormila.app.data.remote.dto.FeedbackResponseDto
import lk.motormila.app.data.remote.dto.FmvDto
import lk.motormila.app.data.remote.dto.FuelMixBucketDto
import lk.motormila.app.data.remote.dto.FuelMixDto
import lk.motormila.app.data.remote.dto.GeoDto
import lk.motormila.app.data.remote.dto.HistoryReportDto
import lk.motormila.app.data.remote.dto.HybridBandDto
import lk.motormila.app.data.remote.dto.HybridBandsDto
import lk.motormila.app.data.remote.dto.ImportEligibilityRequestDto
import lk.motormila.app.data.remote.dto.ImportEligibilityResponseDto
import lk.motormila.app.data.remote.dto.ImportEraSliceDto
import lk.motormila.app.data.remote.dto.ImportPriceDto
import lk.motormila.app.data.remote.dto.SourceQualityDto
import lk.motormila.app.data.remote.dto.InsightsDto
import lk.motormila.app.data.remote.dto.InsuranceRequestDto
import lk.motormila.app.data.remote.dto.InsuranceResponseDto
import lk.motormila.app.data.remote.dto.InvitePreviewDto
import lk.motormila.app.data.remote.dto.LandedCostRequestDto
import lk.motormila.app.data.remote.dto.LandedCostResponseDto
import lk.motormila.app.data.remote.dto.LaneDetailDto
import lk.motormila.app.data.remote.dto.ListingDto
import lk.motormila.app.data.remote.dto.ListingSearchSuggestionDto
import lk.motormila.app.data.remote.dto.LiveMarketDto
import lk.motormila.app.data.remote.dto.LoginRequest
import lk.motormila.app.data.remote.dto.MacroDto
import lk.motormila.app.data.remote.dto.MakeInsightDto
import lk.motormila.app.data.remote.dto.MakeRowDto
import lk.motormila.app.data.remote.dto.ModelRowDto
import lk.motormila.app.data.remote.dto.MakeModelInsightDto
import lk.motormila.app.data.remote.dto.MarkAllReadDto
import lk.motormila.app.data.remote.dto.MarketSignalDto
import lk.motormila.app.data.remote.dto.MarketSummaryDto
import lk.motormila.app.data.remote.dto.MatchResponseDto
import lk.motormila.app.data.remote.dto.MeResponse
import lk.motormila.app.data.remote.dto.MyListingCreateDto
import lk.motormila.app.data.remote.dto.MyListingDto
import lk.motormila.app.data.remote.dto.NotificationDto
import lk.motormila.app.data.remote.dto.OkResponse
import lk.motormila.app.data.remote.dto.OwnershipBundleRequestDto
import lk.motormila.app.data.remote.dto.OwnershipBundleResponseDto
import lk.motormila.app.data.remote.dto.PagedListingsDto
import lk.motormila.app.data.remote.dto.PermitDto
import lk.motormila.app.data.remote.dto.PriceDropsDto
import lk.motormila.app.data.remote.dto.PriceHistoryDto
import lk.motormila.app.data.remote.dto.PriceIndexDto
import lk.motormila.app.data.remote.dto.ProSnapshotDto
import lk.motormila.app.data.remote.dto.RevenueLicenceRequestDto
import lk.motormila.app.data.remote.dto.RevenueLicenceResponseDto
import lk.motormila.app.data.remote.dto.SafetyResearchDto
import lk.motormila.app.data.remote.dto.SellerProfileDto
import lk.motormila.app.data.remote.dto.SignupRequest
import lk.motormila.app.data.remote.dto.SourceQualityRowDto
import lk.motormila.app.data.remote.dto.SourceRowDto
import lk.motormila.app.data.remote.dto.StatsSummaryDto
import lk.motormila.app.data.remote.dto.TcoRequestDto
import lk.motormila.app.data.remote.dto.TcoResponseDto
import lk.motormila.app.data.remote.dto.TokenResponse
import lk.motormila.app.data.remote.dto.TransferFeesRequestDto
import lk.motormila.app.data.remote.dto.TransferFeesResponseDto
import lk.motormila.app.data.remote.dto.TrendSeriesDto
import lk.motormila.app.data.remote.dto.UrlBenchmarkResultDto
import lk.motormila.app.data.remote.dto.VehicleNewsItemDto
import lk.motormila.app.data.remote.dto.VehicleSafetyDto
import lk.motormila.app.data.remote.dto.VehicleLaneDto
import lk.motormila.app.data.remote.dto.AdminAnalyticsDto
import lk.motormila.app.data.remote.dto.AdminCacheClearDto
import lk.motormila.app.data.remote.dto.AdminDealerDto
import lk.motormila.app.data.remote.dto.AdminDealersResponseDto
import lk.motormila.app.data.remote.dto.AdminFeedbackDto
import lk.motormila.app.data.remote.dto.AdminFeedbackResponseDto
import lk.motormila.app.data.remote.dto.AdminFeedbackUpdateDto
import lk.motormila.app.data.remote.dto.AdminInviteCreateDto
import lk.motormila.app.data.remote.dto.AdminInviteDto
import lk.motormila.app.data.remote.dto.AdminInvitesResponseDto
import lk.motormila.app.data.remote.dto.AdminOverviewDto
import lk.motormila.app.data.remote.dto.AdminPermitDto
import lk.motormila.app.data.remote.dto.AdminPermitUpsertDto
import lk.motormila.app.data.remote.dto.AdminPermitsResponseDto
import lk.motormila.app.data.remote.dto.AdminPipelineResponseDto
import lk.motormila.app.data.remote.dto.AdminPipelineTriggerDto
import lk.motormila.app.data.remote.dto.AdminPipelineTriggerRequestDto
import lk.motormila.app.data.remote.dto.AdminRevcarPilotDto
import lk.motormila.app.data.remote.dto.AdminSystemDto
import lk.motormila.app.data.remote.dto.AdminUserDto
import lk.motormila.app.data.remote.dto.AdminUserUpdateDto
import lk.motormila.app.data.remote.dto.AdminUsersResponseDto
import lk.motormila.app.data.remote.dto.AlertChannelsUpdateDto
import lk.motormila.app.data.remote.dto.SelfSignupRequestDto
import lk.motormila.app.data.remote.dto.SelfSignupStatusDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.PUT
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Account deletion route (backend-sec adds it). Single constant so the path
 * can be changed in one place: DELETE {BASE_URL}/auth/me.
 */
const val ACCOUNT_DELETE_PATH = "auth/me"

/** Server-side Google Play purchase verification (backend/app/routers/play_billing.py). */
/** Public web page for deleting an account without the app (Play Data safety URL). */
const val WEB_DELETE_ACCOUNT_URL = "https://motormila.pages.dev/delete-account"

const val PLAY_VERIFY_PATH = "billing/play/verify"

/**
 * Full Motormila backend contract. Base = BuildConfig.BASE_URL ("/api/v1").
 * Every function is suspend and returns a DTO; repositories map errors via
 * ErrorMapper and DTOs via the data remote mapper package.
 *
 * Route reference: backend/app/api/v1/endpoints (per-source modules) + models/schemas.py.
 */
interface MotormilaApiService {

    // ------------------------------------------------------------------ auth
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): TokenResponse

    @POST("auth/signup")
    suspend fun signup(@Body body: SignupRequest): TokenResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    @GET("auth/invite/{token}")
    suspend fun invitePreview(@Path("token") token: String): InvitePreviewDto

    @GET("auth/self-signup/status")
    suspend fun selfSignupStatus(): SelfSignupStatusDto

    @POST("auth/self-signup")
    suspend fun selfSignup(@Body body: SelfSignupRequestDto): TokenResponse

    @POST("auth/logout")
    suspend fun logout(): OkResponse

    /** Permanently deletes the signed-in account (Play account-deletion policy). */
    @HTTP(method = "DELETE", path = ACCOUNT_DELETE_PATH, hasBody = true)
    suspend fun deleteAccount(
        @Body body: lk.motormila.app.data.remote.dto.DeleteAccountRequestDto,
    ): Response<Unit>

    // -------------------------------------------------------------- listings
    @GET("listings")
    suspend fun searchListings(
        @Query("q") q: String? = null,
        @Query("source") source: String? = null,
        @Query("make") make: String? = null,
        @Query("model") model: String? = null,
        @Query("year_min") yearMin: Int? = null,
        @Query("year_max") yearMax: Int? = null,
        @Query("price_min") priceMin: Double? = null,
        @Query("price_max") priceMax: Double? = null,
        @Query("mileage_max") mileageMax: Int? = null,
        @Query("fuel_type") fuelType: String? = null,
        @Query("transmission") transmission: String? = null,
        @Query("condition") condition: String? = null,
        @Query("body_type") bodyType: String? = null,
        @Query("district") district: String? = null,
        @Query("vehicle_category") vehicleCategory: String? = null,
        @Query("price_availability") priceAvailability: String? = null,
        @Query("sort") sort: String? = null,
        @Query("page") page: Int = 1,
        @Query("size") size: Int = 20,
        @Query("include_archive") includeArchive: Boolean? = null,
    ): PagedListingsDto

    @GET("listings/{id}")
    suspend fun getListing(@Path("id") id: Int): ListingDto

    @GET("listings/{id}/similar")
    suspend fun getSimilar(
        @Path("id") id: Int,
        @Query("limit") limit: Int = 8,
    ): List<ListingDto>

    @GET("listings/{id}/price-history")
    suspend fun getPriceHistory(@Path("id") id: Int): PriceHistoryDto

    @GET("listings/{id}/history-report")
    suspend fun getHistoryReport(@Path("id") id: Int): HistoryReportDto

    @GET("listings/{id}/seller-profile")
    suspend fun getSellerProfile(@Path("id") id: Int): SellerProfileDto

    @GET("listings/{id}/fmv")
    suspend fun getFmv(@Path("id") id: Int): FmvDto

    @GET("listings/{id}/safety-research")
    suspend fun getListingSafety(@Path("id") id: Int): SafetyResearchDto

    @GET("listings/{id}/geo")
    suspend fun getListingGeo(@Path("id") id: Int): GeoDto

    /** `vehicle_category` is ignored by backends older than launch-polish (then the client ranks cars first). */
    @GET("listings/price-drops")
    suspend fun getPriceDrops(
        @Query("days") days: Int = 7,
        @Query("vehicle_category") vehicleCategory: String? = null,
    ): PriceDropsDto

    @GET("listings/sources")
    suspend fun getSources(): List<SourceRowDto>

    @GET("listings/makes")
    suspend fun getMakes(): List<MakeRowDto>

    @GET("listings/models")
    suspend fun getModels(@Query("make") make: String): List<ModelRowDto>

    @POST("listings/mine")
    suspend fun createMyListing(@Body body: MyListingCreateDto): MyListingDto

    @GET("listings/search-suggestions")
    suspend fun getSearchSuggestions(
        @Query("q") q: String,
        @Query("limit") limit: Int = 8,
    ): List<ListingSearchSuggestionDto>

    @GET("listings/estimate")
    suspend fun estimate(
        @Query("make") make: String,
        @Query("model") model: String,
        @Query("year") year: Int,
        @Query("mileage") mileage: Int? = null,
        @Query("condition") condition: String? = null,
    ): EstimateDto

    @POST("listings/custom-estimate")
    suspend fun customEstimate(@Body body: CustomEstimateInputDto): CustomEstimateDto

    // ----------------------------------------------------------------- stats
    @GET("stats/summary")
    suspend fun statsSummary(): StatsSummaryDto

    @GET("stats/live")
    suspend fun liveMarket(): LiveMarketDto

    @GET("stats/district-prices")
    suspend fun districtPrices(): DistrictPricesDto

    @GET("stats/district-velocity")
    suspend fun districtVelocity(): DistrictVelocityDto

    @GET("stats/trends")
    suspend fun trends(
        @Query("make") make: String? = null,
        @Query("model") model: String? = null,
        @Query("condition") condition: String? = null,
        @Query("district") district: String? = null,
        @Query("months") months: Int = 12,
    ): TrendSeriesDto

    @GET("stats/price-index")
    suspend fun priceIndex(): PriceIndexDto

    @GET("stats/insights")
    suspend fun insights(): InsightsDto

    @GET("stats/district-insight")
    suspend fun districtInsight(@Query("district") district: String): DistrictInsightDto

    @GET("stats/make-model-insight")
    suspend fun makeModelInsight(
        @Query("make") make: String,
        @Query("model") model: String,
    ): MakeModelInsightDto

    @GET("stats/make-insight")
    suspend fun makeInsight(@Query("make") make: String): MakeInsightDto

    @GET("stats/model-price-history")
    suspend fun modelPriceHistory(
        @Query("make") make: String,
        @Query("model") model: String,
    ): TrendSeriesDto

    @GET("stats/fuel-mix")
    suspend fun fuelMix(): FuelMixDto

    @GET("stats/hybrid-bands")
    suspend fun hybridBands(): HybridBandsDto

    @GET("stats/source-quality")
    suspend fun sourceQuality(): SourceQualityDto

    @GET("stats/ev-insight")
    suspend fun evInsight(
        @Query("make") make: String? = null,
        @Query("model") model: String? = null,
        @Query("top_n") topN: Int = 5,
    ): EvInsightDto

    @GET("stats/import-era-split")
    suspend fun importEraSplit(@Query("top_n") topN: Int = 10): List<ImportEraSliceDto>

    // ---------------------------------------------------------------- market
    @GET("market/signals")
    suspend fun marketSignals(
        @Query("source") source: String? = null,
        @Query("signal_type") signalType: String? = null,
        @Query("limit") limit: Int = 100,
    ): List<MarketSignalDto>

    @GET("market/signals/{id}")
    suspend fun marketSignal(@Path("id") id: Int): MarketSignalDto

    @GET("market/summary")
    suspend fun marketSummary(): MarketSummaryDto

    @GET("market/import-prices")
    suspend fun importPrices(
        @Query("source") source: String? = null,
        @Query("limit") limit: Int = 50,
    ): List<ImportPriceDto>

    @GET("vehicles/safety-research")
    suspend fun vehicleSafety(
        @Query("make") make: String,
        @Query("model") model: String,
        @Query("year") year: Int? = null,
    ): VehicleSafetyDto

    @GET("ev/charging-stations")
    suspend fun chargingStations(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radius_km") radiusKm: Double = 25.0,
    ): ChargingStationsDto

    // ------------------------------------------------------------ calculators
    @POST("calculators/landed-cost")
    suspend fun landedCost(@Body body: LandedCostRequestDto): LandedCostResponseDto

    @POST("calculators/tco")
    suspend fun tco(@Body body: TcoRequestDto): TcoResponseDto

    @POST("calculators/revenue-licence")
    suspend fun revenueLicence(@Body body: RevenueLicenceRequestDto): RevenueLicenceResponseDto

    @POST("calculators/third-party-insurance")
    suspend fun thirdPartyInsurance(@Body body: InsuranceRequestDto): InsuranceResponseDto

    @POST("calculators/transfer-fees")
    suspend fun transferFees(@Body body: TransferFeesRequestDto): TransferFeesResponseDto

    @POST("calculators/import-eligibility")
    suspend fun importEligibility(@Body body: ImportEligibilityRequestDto): ImportEligibilityResponseDto

    @POST("calculators/ownership-bundle")
    suspend fun ownershipBundle(@Body body: OwnershipBundleRequestDto): OwnershipBundleResponseDto

    @GET("calculators/macro")
    suspend fun macro(): MacroDto

    @GET("calculators/permits")
    suspend fun permits(): List<PermitDto>

    @GET("calculators/vehicle-news")
    suspend fun vehicleNews(@Query("limit") limit: Int = 8): List<VehicleNewsItemDto>

    // -------------------------------------------------------------------- pro
    @GET("pro/market-snapshot")
    suspend fun proMarketSnapshot(): ProSnapshotDto

    @GET("pro/vehicle-lanes")
    suspend fun proVehicleLanes(
        @Query("make") make: String? = null,
        @Query("model") model: String? = null,
        @Query("district") district: String? = null,
        @Query("condition") condition: String? = null,
        @Query("limit") limit: Int = 20,
    ): List<VehicleLaneDto>

    @GET("pro/districts")
    suspend fun proDistricts(@Query("limit") limit: Int = 25): List<DistrictProfileDto>

    @GET("pro/vehicle-lane-detail")
    suspend fun proVehicleLaneDetail(
        @Query("make") make: String,
        @Query("model") model: String,
    ): LaneDetailDto

    @GET("pro/district-detail")
    suspend fun proDistrictDetail(@Query("district") district: String): LaneDetailDto

    @GET("pro/arbitrage-gaps")
    suspend fun proArbitrageGaps(
        @Query("make") make: String,
        @Query("model") model: String? = null,
    ): List<ArbitrageGapDto>

    // ----------------------------------------------------------------- alerts
    @GET("alerts")
    suspend fun listAlerts(): List<AlertDto>

    @POST("alerts")
    suspend fun createAlert(@Body body: CreateAlertRequestDto): AlertDto

    @DELETE("alerts/{id}")
    suspend fun deleteAlert(@Path("id") id: Int)

    /** In-place edit (same id). Older backends answer 405 — see AlertsRepositoryImpl.update. */
    @PUT("alerts/{id}")
    suspend fun updateAlert(@Path("id") id: Int, @Body body: CreateAlertRequestDto): AlertDto

    /** Matches ALL of the caller's alerts server-side; filter client-side by id. */
    @POST("alerts/match")
    suspend fun matchAlerts(): MatchResponseDto

    @PATCH("alerts/{id}/channels")
    suspend fun updateAlertChannels(
        @Path("id") id: Int,
        @Body body: AlertChannelsUpdateDto,
    ): AlertDto

    // ----------------------------------------------------------- notifications
    @GET("notifications")
    suspend fun listNotifications(): List<NotificationDto>

    @POST("notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: Int): NotificationDto

    @POST("notifications/read-all")
    suspend fun markAllNotificationsRead(): MarkAllReadDto

    // --------------------------------------------------------------- feedback
    @POST("feedback")
    suspend fun feedback(@Body body: FeedbackRequestDto): FeedbackResponseDto

    // ----------------------------------------------------------------- dealer
    @POST("dealer/benchmark-urls")
    suspend fun benchmarkUrls(@Body body: BenchmarkUrlsRequestDto): List<UrlBenchmarkResultDto>

    @POST("dealer/claim")
    suspend fun claimDealer(@Body body: DealerClaimRequestDto): DealerClaimResponseDto

    @GET("dealer/me")
    suspend fun dealerMe(@Query("claim_token") claimToken: String): DealerClaimResponseDto

    @POST("dealer/verify")
    suspend fun verifyDealer(@Body body: DealerVerifyRequestDto): DealerClaimResponseDto

    // ---------------------------------------------------------------- billing
    @POST("billing/checkout-intent")
    suspend fun checkoutIntent(@Body body: CheckoutIntentRequestDto): CheckoutIntentResponseDto

    /** Verify a Play purchase token server-side; the server grants the plan + acknowledges. */
    @POST(PLAY_VERIFY_PATH)
    suspend fun verifyPlayPurchase(
        @Body body: lk.motormila.app.data.remote.dto.PlayVerifyRequestDto,
    ): lk.motormila.app.data.remote.dto.PlayVerifyResponseDto

    // ------------------------------------------------------------------ admin
    @GET("admin/overview")
    suspend fun adminOverview(): AdminOverviewDto

    @GET("admin/users")
    suspend fun adminUsers(
        @Query("q") q: String? = null,
        @Query("plan") plan: String? = null,
        @Query("limit") limit: Int = 80,
        @Query("offset") offset: Int = 0,
    ): AdminUsersResponseDto

    @PATCH("admin/users/{id}")
    suspend fun updateAdminUser(
        @Path("id") id: Int,
        @Body body: AdminUserUpdateDto,
    ): AdminUserDto

    @GET("admin/invites")
    suspend fun adminInvites(
        @Query("status") status: String? = null,
        @Query("limit") limit: Int = 80,
    ): AdminInvitesResponseDto

    @POST("admin/invites")
    suspend fun createAdminInvite(@Body body: AdminInviteCreateDto): AdminInviteDto

    @DELETE("admin/invites/{id}")
    suspend fun revokeAdminInvite(@Path("id") id: Int): OkResponse

    @GET("admin/pipeline")
    suspend fun adminPipeline(@Query("limit") limit: Int = 50): AdminPipelineResponseDto

    @POST("admin/pipeline/trigger")
    suspend fun triggerAdminPipeline(@Body body: AdminPipelineTriggerRequestDto): AdminPipelineTriggerDto

    @GET("admin/analytics")
    suspend fun adminAnalytics(): AdminAnalyticsDto

    @GET("admin/feedback")
    suspend fun adminFeedback(
        @Query("limit") limit: Int = 100,
        @Query("status") status: String? = null,
    ): AdminFeedbackResponseDto

    @PATCH("admin/feedback/{id}")
    suspend fun updateAdminFeedback(
        @Path("id") id: Int,
        @Body body: AdminFeedbackUpdateDto,
    ): AdminFeedbackDto

    @GET("admin/dealers")
    suspend fun adminDealers(
        @Query("limit") limit: Int = 100,
        @Query("status") status: String? = null,
    ): AdminDealersResponseDto

    @POST("admin/dealers/{id}/verify")
    suspend fun verifyAdminDealer(@Path("id") id: Int): AdminDealerDto

    @GET("admin/permits")
    suspend fun adminPermits(): AdminPermitsResponseDto

    @POST("admin/permits")
    suspend fun upsertAdminPermit(@Body body: AdminPermitUpsertDto): AdminPermitDto

    @GET("admin/system")
    suspend fun adminSystem(): AdminSystemDto

    @DELETE("admin/cache")
    suspend fun clearAdminCache(@Query("key") key: String? = null): AdminCacheClearDto

    @POST("admin/enrichment/revcardata")
    suspend fun runRevcarDataPilot(): AdminRevcarPilotDto

    // ----------------------------------------------------------------- events
    // (recordEvent removed — analytics not wired; do not re-add without a backend contract)
}
