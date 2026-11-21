package lk.motormila.app.data.local.db

import androidx.room.Database
import androidx.room.RoomDatabase
import lk.motormila.app.data.local.db.dao.AlertDao
import lk.motormila.app.data.local.db.dao.ListingDao
import lk.motormila.app.data.local.db.dao.PriceHistoryDao
import lk.motormila.app.data.local.db.dao.StatsCacheDao
import lk.motormila.app.data.local.db.dao.WatchlistDao
import lk.motormila.app.data.local.db.entity.AlertEntity
import lk.motormila.app.data.local.db.entity.DistrictStatEntity
import lk.motormila.app.data.local.db.entity.ListingEntity
import lk.motormila.app.data.local.db.entity.PricePointEntity
import lk.motormila.app.data.local.db.entity.RemoteKeysEntity
import lk.motormila.app.data.local.db.entity.StatsCacheEntity
import lk.motormila.app.data.local.db.entity.WatchlistEntity

/**
 * Room v2. Entities: listings, price_points, watchlist, alerts,
 * district_stats, remote_keys, stats_cache.
 *
 * No destructive migration in release: debug builds may
 * `fallbackToDestructiveMigration()` (see DatabaseModule); release builds
 * crash loudly on missing migrations instead of wiping user data.
 */
@Database(
    entities = [
        ListingEntity::class,
        PricePointEntity::class,
        WatchlistEntity::class,
        AlertEntity::class,
        DistrictStatEntity::class,
        RemoteKeysEntity::class,
        StatsCacheEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class MotormilaDatabase : RoomDatabase() {
    abstract fun listingDao(): ListingDao
    abstract fun watchlistDao(): WatchlistDao
    abstract fun alertDao(): AlertDao
    abstract fun priceHistoryDao(): PriceHistoryDao
    abstract fun statsCacheDao(): StatsCacheDao
}
