package lk.motormila.app.data.repository

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import lk.motormila.app.data.local.datastore.SettingsStore
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.BenchmarkUrlsRequestDto
import lk.motormila.app.data.remote.dto.DealerClaimRequestDto
import lk.motormila.app.data.remote.dto.DealerVerifyRequestDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.DealerBenchmark
import lk.motormila.app.domain.model.DealerClaim
import lk.motormila.app.domain.repository.DealerRepository

/**
 * Dealer yard tools. Claim token from POST /dealer/claim is persisted in
 * SettingsStore so [myClaimStatus] survives process death.
 */
@Singleton
class DealerRepositoryImpl @Inject constructor(
    private val api: MotormilaApiService,
    private val settings: SettingsStore,
    @IoDispatcher private val io: CoroutineDispatcher,
) : DealerRepository {

    override suspend fun claim(
        dealerName: String,
        contactEmail: String,
        contactPhone: String?,
        sellerNamePattern: String?,
        claimedUrl: String?,
    ): DealerClaim =
        withContext(io) {
            val res = api.claimDealer(
                DealerClaimRequestDto(
                    displayName = dealerName,
                    contactEmail = contactEmail,
                    contactPhone = contactPhone,
                    sellerNamePattern = sellerNamePattern,
                    claimedUrl = claimedUrl,
                ),
            )
            res.claimToken?.let { settings.setDealerClaimToken(it) }
            res.toDomain()
        }

    override suspend fun benchmark(dealerName: String): DealerBenchmark = withContext(io) {
        // Backend benchmarks URLs, not names: without URLs we can only return a shell.
        // Yard-tools UI should call benchmarkUrls(urls) below.
        DealerBenchmark(
            dealerName = dealerName,
            listingCount = 0,
            avgPriceLkr = null,
            medianPriceLkr = null,
            avgDealScore = null,
            district = null,
        )
    }

    /** URL-level benchmark aggregation for the yard-tools UI. */
    suspend fun benchmarkUrls(dealerName: String, urls: List<String>): DealerBenchmark = withContext(io) {
        val rows = api.benchmarkUrls(BenchmarkUrlsRequestDto(urls)).map { it.toDomain() }
        val medians = rows.mapNotNull { it.marketMedian }
        DealerBenchmark(
            dealerName = dealerName,
            listingCount = rows.size,
            avgPriceLkr = rows.mapNotNull { it.listingPrice }.average().takeIf { it.isFinite() && rows.isNotEmpty() },
            medianPriceLkr = medians.sorted().let { s -> if (s.isEmpty()) null else s[s.size / 2] },
            avgDealScore = null,
            district = null,
            urlResults = rows,
        )
    }

    override suspend fun myClaimStatus(): DealerClaim? = withContext(io) {
        val token = settings.observe().first().dealerClaimToken ?: return@withContext null
        val res = runCatching { api.dealerMe(token) }.getOrNull() ?: return@withContext null
        res.toDomain()
    }

    /**
     * POST /dealer/verify — ADMIN-ONLY on the backend (requires admin_token);
     * a dealer's own session always gets 403. Not called from the dealer UI:
     * dealers see "pending manual verification" until an admin verifies them
     * (Admin → Dealers uses POST /admin/dealers/{id}/verify).
     */
    @Deprecated("Admin-only endpoint; dealer UI never calls it.")
    suspend fun verifyDealer(claimToken: String, code: String? = null): DealerClaim = withContext(io) {
        api.verifyDealer(DealerVerifyRequestDto(claimToken, code)).toDomain()
    }
}
