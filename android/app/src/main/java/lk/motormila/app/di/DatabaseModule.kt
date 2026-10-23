package lk.motormila.app.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import lk.motormila.app.BuildConfig
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.MotormilaMigrations

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): MotormilaDatabase {
        val builder = Room.databaseBuilder(context, MotormilaDatabase::class.java, "motormila.db")
            .addMigrations(*MotormilaMigrations.ALL)
            // Downgrades only happen when a user sideloads an older build over
            // a newer one; the newer schema is unreadable, so start clean.
            .fallbackToDestructiveMigrationOnDowngrade()
        // Upgrade without a migration: destructive in debug only. Release
        // has NO destructive fallback (watchlists/alerts must survive); a
        // missing migration is caught by the schema-export + migration tests.
        if (BuildConfig.QA_HOOKS) builder.fallbackToDestructiveMigration()
        return builder.build()
    }

    @Provides fun listingDao(db: MotormilaDatabase) = db.listingDao()
    @Provides fun watchlistDao(db: MotormilaDatabase) = db.watchlistDao()
    @Provides fun alertDao(db: MotormilaDatabase) = db.alertDao()
    @Provides fun priceHistoryDao(db: MotormilaDatabase) = db.priceHistoryDao()
    @Provides fun statsCacheDao(db: MotormilaDatabase) = db.statsCacheDao()
}
