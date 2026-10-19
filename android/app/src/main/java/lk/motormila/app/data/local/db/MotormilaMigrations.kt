package lk.motormila.app.data.local.db

import androidx.room.migration.Migration

/**
 * Every Room schema change MUST add a [Migration] here (release builds have
 * no destructive fallback: wiping a user's watchlist/alerts is not allowed).
 *
 * How to bump the schema:
 * 1. Change the entity, bump `version` in [MotormilaDatabase].
 * 2. Build once: Room KSP writes `app/schemas/lk.motormila.app.data.local.db.MotormilaDatabase/<N>.json`
 *    (configured via `ksp { arg("room.schemaLocation", ...) }`). Commit it.
 * 3. Add `val MIGRATION_<N-1>_<N> = object : Migration(N-1, N) { override fun migrate(db) { db.execSQL(...) } }`
 *    and append it to [ALL].
 * 4. Add a `MigrationTestHelper` test in src/androidTest (room-testing is already a dependency).
 *
 * Cache-only tables (listings, price_points, stats_cache, district_stats,
 * remote_keys) may be dropped/recreated inside a migration; watchlist and
 * alerts must be preserved.
 */
object MotormilaMigrations {
    /** Current schema is v1: no migrations yet. */
    val ALL: Array<Migration> = emptyArray()
}
