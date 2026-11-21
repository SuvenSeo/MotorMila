package lk.motormila.app.data.repository

import android.content.Context
import androidx.room.withTransaction
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import lk.motormila.app.data.remote.dto.ListingDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.entity.WatchlistEntity
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.domain.repository.WatchlistRepository
import retrofit2.HttpException

/** Last time this app checked the saved ad, not a claim that the source was scraped then. */
internal data class SavedCheck(val at: Long, val unavailable: Boolean)

@Singleton
class WatchlistRepositoryImpl @Inject constructor(
    private val api: MotormilaApiService,
    private val db: MotormilaDatabase,
    @IoDispatcher private val io: CoroutineDispatcher,
    @ApplicationContext context: Context,
) : WatchlistRepository {
    private val dao get() = db.watchlistDao()
    // Advisory metadata only. A new save of the same ID must never inherit an old check.
    private val checks = context.getSharedPreferences("saved_ad_checks", Context.MODE_PRIVATE)
    private val checkRevision = MutableStateFlow(0L)

    override fun observe(): Flow<List<WatchItem>> = dao.observeAll().map { rows -> rows.map { it.savedItem() } }

    internal fun observeChecks(): Flow<Map<Int, SavedCheck>> =
        combine(dao.observeAll(), checkRevision) { rows, _ ->
            rows.mapNotNull { row ->
                val id = row.listingId
                val at = checks.getLong("checked-$id", 0L)
                if (at <= 0 || checks.getLong("saved-$id", -1L) != row.addedAtMs) null
                else id to SavedCheck(at, checks.getBoolean("gone-$id", false))
            }.toMap()
        }

    override fun isWatched(listingId: Int): Flow<Boolean> = dao.isWatched(listingId)

    override suspend fun toggle(listing: Listing): Boolean = withContext(io) {
        db.withTransaction {
            if (dao.getAll().any { it.listingId == listing.id }) {
                dao.delete(listing.id)
                forgetCheck(listing.id)
                false
            } else {
                dao.upsert(listing.newSavedRow())
                true
            }
        }
    }

    override suspend fun add(listing: Listing) = withContext(io) {
        db.withTransaction {
            // Retried/double-tapped Save is idempotent. Do not re-baseline the original ask.
            if (dao.getAll().none { it.listingId == listing.id }) dao.upsert(listing.newSavedRow())
        }
    }

    internal suspend fun restore(item: WatchItem) = withContext(io) {
        db.withTransaction {
            if (dao.getAll().none { it.listingId == item.listingId }) dao.upsert(item.restoredRow())
        }
    }

    override suspend fun remove(listingId: Int) = withContext(io) {
        dao.delete(listingId)
        forgetCheck(listingId)
    }

    private fun forgetCheck(listingId: Int) {
        checks.edit().remove("saved-$listingId").remove("checked-$listingId").remove("gone-$listingId").apply()
    }

    override suspend fun clear() = withContext(io) {
        dao.clear()
        checks.edit().clear().apply()
    }

    override suspend fun refreshPrices() = withContext(io) {
        val rows = dao.getAll()
        // Four requests at a time, only on explicit refresh. No per-card FMV traffic.
        val observations = rows.chunked(4).flatMap { batch ->
            batch.map { row -> async { checkAd(row) } }.awaitAll().filterNotNull()
        }
        val accepted = db.withTransaction {
            val current = dao.getAll().associateBy { it.listingId }
            observations.filter { observation ->
                current[observation.row.listingId]?.addedAtMs == observation.row.addedAtMs
            }.onEach { observation ->
                val row = current.getValue(observation.row.listingId)
                dao.upsert(row.withObservedAsk(observation.fresh?.priceLkr, observation.fresh?.district, observation.gone))
            }
        }
        // Only mark a check successful after its price has been committed to Room.
        val editor = checks.edit()
        accepted.forEach { observation ->
            val row = observation.row
            editor.putLong("saved-${row.listingId}", row.addedAtMs).putLong("checked-${row.listingId}", observation.at)
                .putBoolean("gone-${row.listingId}", observation.gone)
        }
        editor.apply()
        checkRevision.update { it + 1 }
        if (observations.size < rows.size) throw java.io.IOException()
    }

    private data class Observation(val row: WatchlistEntity, val fresh: ListingDto?, val at: Long) {
        val gone: Boolean get() = fresh?.isActive != true
    }

    private suspend fun checkAd(row: WatchlistEntity): Observation? {
        val fresh = try {
            api.getListing(row.listingId).takeIf { it.id == row.listingId } ?: return null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (e !is HttpException || (e.code() != 404 && e.code() != 410)) return null
            null
        }
        return Observation(row, fresh, System.currentTimeMillis())
    }

}

private fun Double?.validAsk(): Double? = this?.takeIf { it.isFinite() && it > 0 }

internal fun WatchlistEntity.withObservedAsk(price: Double?, district: String?, gone: Boolean) = copy(
    lastKnownPriceLkr = if (gone) price.validAsk() ?: lastKnownPriceLkr else price.validAsk(),
    district = district ?: this.district, fmvLkr = null, underFmv = null,
)

private fun Listing.newSavedRow() = WatchlistEntity(
    listingId = id, title = displayName, thumbnailUrl = heroImageUrl,
    priceAtAddLkr = priceLkr.validAsk(), lastKnownPriceLkr = priceLkr.validAsk(),
    addedAtMs = System.currentTimeMillis(), district = district,
)

// Legacy rows can contain a naked discount or an old FMV. Neither is a publishable verdict.
internal fun WatchlistEntity.savedItem() = WatchItem(
    id = listingId, title = title, thumbnailUrl = thumbnailUrl, district = district,
    priceLkr = lastKnownPriceLkr.validAsk(), previousPriceLkr = priceAtAddLkr.validAsk(),
    addedAtEpochMs = addedAtMs, fmvLkr = null, underFmvFraction = null,
)

internal fun WatchItem.restoredRow() = WatchlistEntity(
    listingId = listingId, title = title, thumbnailUrl = thumbnailUrl, district = district,
    lastKnownPriceLkr = priceLkr, priceAtAddLkr = previousPriceLkr, addedAtMs = addedAtEpochMs,
)
