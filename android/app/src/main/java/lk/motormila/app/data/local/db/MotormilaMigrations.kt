package lk.motormila.app.data.local.db

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

object MotormilaMigrations {
    val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // v1 rows have no verifiable owner. Discard only this server mirror;
            // keep the device-local watchlist and all other tables intact.
            db.execSQL("DROP TABLE alerts")
            db.execSQL("CREATE TABLE alerts (owner TEXT NOT NULL, id INTEGER NOT NULL, make TEXT, model TEXT, maxPriceLkr REAL, district TEXT, notifyPhone TEXT, notifyEmail TEXT, notifyTelegramChatId TEXT, notifyChannels TEXT, active INTEGER NOT NULL, createdAt TEXT, deliveryMode TEXT, quietHoursEnabled INTEGER, PRIMARY KEY(owner, id))")
        }
    }

    val ALL: Array<Migration> = arrayOf(MIGRATION_1_2)
}
