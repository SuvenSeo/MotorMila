package lk.motormila.app.data.repository

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import lk.motormila.app.core.network.AuthInterceptor
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.LoginRequest
import lk.motormila.app.data.remote.dto.SelfSignupRequestDto
import lk.motormila.app.data.remote.dto.SignupRequest
import lk.motormila.app.data.remote.dto.TokenResponse
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.SelfSignupStatus
import lk.motormila.app.domain.model.UserSession
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.work.PriceAlertSyncWorker

/**
 * Auth: login/signup/me/logout against the POST and GET auth endpoints, session persisted in
 * SessionStore. Every mutation synchronously refreshes
 * [AuthInterceptor.updateToken] so subsequent requests carry the new token
 * without waiting for a DataStore read.
 */
@Singleton
class AuthRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: MotormilaApiService,
    private val sessionStore: SessionStore,
    private val authInterceptor: AuthInterceptor,
    private val database: lk.motormila.app.data.local.db.MotormilaDatabase,
    @IoDispatcher private val io: CoroutineDispatcher,
) : AuthRepository {

    override fun session(): Flow<UserSession?> = sessionStore.observe()

    override suspend fun me(): UserSession? = withContext(io) {
        val dto = api.me().toUserDto()
        val token = sessionStore.cachedToken ?: return@withContext null
        val session = UserSession(
            email = dto.email,
            name = dto.name.ifBlank { null },
            plan = dto.plan.ifBlank { "free" },
            role = dto.role.ifBlank { "user" },
            subscriptionStatus = dto.subscriptionStatus,
            token = token,
            expiresAt = sessionStore.snapshot()?.expiresAt,
            playProEntitled = sessionStore.snapshot()?.playProEntitled == true,
        )
        sessionStore.saveSession(session)
        session
    }

    override suspend fun login(email: String, password: String): UserSession = withContext(io) {
        val res = api.login(LoginRequest(email.trim(), password))
        val session = UserSession(
            email = res.user.email,
            name = res.user.name.ifBlank { null },
            plan = res.user.plan.ifBlank { "free" },
            role = res.user.role.ifBlank { "user" },
            subscriptionStatus = res.user.subscriptionStatus,
            token = res.token,
            expiresAt = SessionStore.epochToIso(res.expiresAt),
            playProEntitled = sessionStore.snapshot()?.playProEntitled == true,
        )
        sessionStore.saveSession(session)
        authInterceptor.updateToken(session.token)
        session
    }

    override suspend fun signup(name: String, email: String, password: String, inviteToken: String?): UserSession =
        withContext(io) {
            // Backend signup is invite-token based; email is bound server-side to the invite.
            val res = api.signup(SignupRequest(token = inviteToken.orEmpty(), name = name, password = password))
            val session = UserSession(
                email = res.user.email.ifBlank { email },
                name = res.user.name.ifBlank { name },
                plan = res.user.plan.ifBlank { "free" },
                role = res.user.role.ifBlank { "user" },
                subscriptionStatus = res.user.subscriptionStatus,
                token = res.token,
                expiresAt = SessionStore.epochToIso(res.expiresAt),
                playProEntitled = sessionStore.snapshot()?.playProEntitled == true,
            )
            sessionStore.saveSession(session)
            authInterceptor.updateToken(session.token)
            session
        }

    override suspend fun selfSignupStatus(): SelfSignupStatus = withContext(io) {
        val dto = api.selfSignupStatus()
        SelfSignupStatus(enabled = dto.enabled, trialDays = dto.trialDays, plan = dto.plan)
    }

    override suspend fun selfSignup(name: String, email: String, password: String): UserSession =
        withContext(io) {
            persistToken(
                api.selfSignup(
                    SelfSignupRequestDto(
                        email = email.trim(),
                        name = name.trim().ifBlank { email.substringBefore("@") },
                        password = password,
                    ),
                ),
                fallbackEmail = email,
                fallbackName = name,
            )
        }

    override suspend fun logout(): Unit = withContext(io) {
        runCatching { api.logout() }
        sessionStore.clear()
        authInterceptor.updateToken(null)
        // Stop background workers — otherwise they keep hitting /alerts/match
        // with a cleared token after logout.
        // (SnapshotRefreshWorker keeps running: public market data for guests too.)
        runCatching { PriceAlertSyncWorker.cancel(context) }
        Unit
    }

    override suspend fun clearRejectedSession(rejectedToken: String?): Boolean = withContext(io) {
        val cleared = sessionStore.clearIfRejected(rejectedToken)
        if (cleared) {
            authInterceptor.updateToken(null)
            runCatching { PriceAlertSyncWorker.cancel(context) }
        }
        cleared
    }

    override suspend fun deleteAccount(password: String?): Unit = withContext(io) {
        val response = api.deleteAccount(
            lk.motormila.app.data.remote.dto.DeleteAccountRequestDto(password?.takeIf { it.isNotBlank() }),
        )
        if (!response.isSuccessful && response.code() != 404) {
            throw retrofit2.HttpException(response)
        }
        sessionStore.clear()
        authInterceptor.updateToken(null)
        runCatching { PriceAlertSyncWorker.cancel(context) }
        // Local caches tied to the account (alerts, watchlist) go too.
        runCatching { database.clearAllTables() }
        Unit
    }

    override suspend fun restore(): UserSession? = withContext(io) {
        val session = sessionStore.rehydrate()
        authInterceptor.updateToken(session?.token)
        session
    }

    private suspend fun persistToken(
        res: TokenResponse,
        fallbackEmail: String,
        fallbackName: String,
    ): UserSession {
        val session = UserSession(
            email = res.user.email.ifBlank { fallbackEmail },
            name = res.user.name.ifBlank { fallbackName }.ifBlank { null },
            plan = res.user.plan.ifBlank { "free" },
            role = res.user.role.ifBlank { "user" },
            subscriptionStatus = res.user.subscriptionStatus,
            token = res.token,
            expiresAt = SessionStore.epochToIso(res.expiresAt),
            playProEntitled = sessionStore.snapshot()?.playProEntitled == true,
        )
        sessionStore.saveSession(session)
        authInterceptor.updateToken(session.token)
        return session
    }
}
