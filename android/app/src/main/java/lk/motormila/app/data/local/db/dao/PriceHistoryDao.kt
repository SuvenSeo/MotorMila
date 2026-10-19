package lk.motormila.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
import lk.motormila.app.data.local.db.entity.DistrictStatEntity
import lk.motormila.app.data.local.db.entity.PricePointEntity
import lk.motormila.app.data.local.db.entity.RemoteKeysEntity
import lk.motormila.app.data.local.db.entity.StatsCacheEntity

@Dao
interface PriceHistoryDao {
    @Query("SELECT * FROM price_points WHERE listingId = :listingId ORDER BY scrapedAt ASC")
    suspend fun forListing(listingId: Int): List<PricePointEntity>

    @Query("SELECT * FROM price_points WHERE listingId = :listingId ORDER BY scrapedAt ASC")
    fun observeForListing(listingId: Int): Flow<List<PricePointEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<PricePointEntity>)

    @Query("DELETE FROM price_points WHERE listingId = :listingId")
    suspend fun clearForListing(listingId: Int)
}

@Dao
interface StatsCacheDao {
    @Query("SELECT * FROM district_stats ORDER BY count DESC")
    fun observeDistricts(): Flow<List<DistrictStatEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertDistricts(rows: List<DistrictStatEntity>)

    @Query("SELECT * FROM stats_cache WHERE `key` = :key")
    suspend fun get(key: String): StatsCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(row: StatsCacheEntity)

    @Query("SELECT * FROM remote_keys WHERE queryHash = :hash")
    suspend fun remoteKeys(hash: String): RemoteKeysEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRemoteKeys(row: RemoteKeysEntity)

    @Query("DELETE FROM remote_keys WHERE queryHash = :hash")
    suspend fun clearRemoteKeys(hash: String)

    @Query("DELETE FROM remote_keys")
    suspend fun clearAllRemoteKeys()
}
