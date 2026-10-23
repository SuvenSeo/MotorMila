package lk.motormila.app.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import lk.motormila.app.data.repository.AdminRepositoryImpl
import lk.motormila.app.data.repository.AlertsRepositoryImpl
import lk.motormila.app.data.repository.AuthRepositoryImpl
import lk.motormila.app.data.repository.DealerRepositoryImpl
import lk.motormila.app.data.repository.InsightsRepositoryImpl
import lk.motormila.app.data.repository.ListingRepositoryImpl
import lk.motormila.app.data.repository.ProRepositoryImpl
import lk.motormila.app.data.repository.StatsRepositoryImpl
import lk.motormila.app.data.repository.ValuationRepositoryImpl
import lk.motormila.app.data.repository.WatchlistRepositoryImpl
import lk.motormila.app.domain.repository.AdminRepository
import lk.motormila.app.domain.repository.AlertsRepository
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.domain.repository.DealerRepository
import lk.motormila.app.domain.repository.InsightsRepository
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.domain.repository.ProRepository
import lk.motormila.app.domain.repository.StatsRepository
import lk.motormila.app.domain.repository.ValuationRepository
import lk.motormila.app.domain.repository.WatchlistRepository

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds @Singleton abstract fun auth(repo: AuthRepositoryImpl): AuthRepository
    @Binds @Singleton abstract fun listings(repo: ListingRepositoryImpl): ListingRepository
    @Binds @Singleton abstract fun stats(repo: StatsRepositoryImpl): StatsRepository
    @Binds @Singleton abstract fun alerts(repo: AlertsRepositoryImpl): AlertsRepository
    @Binds @Singleton abstract fun watchlist(repo: WatchlistRepositoryImpl): WatchlistRepository
    @Binds @Singleton abstract fun valuation(repo: ValuationRepositoryImpl): ValuationRepository
    @Binds @Singleton abstract fun pro(repo: ProRepositoryImpl): ProRepository
    @Binds @Singleton abstract fun dealer(repo: DealerRepositoryImpl): DealerRepository
    @Binds @Singleton abstract fun insights(repo: InsightsRepositoryImpl): InsightsRepository
    @Binds @Singleton abstract fun admin(repo: AdminRepositoryImpl): AdminRepository
}
