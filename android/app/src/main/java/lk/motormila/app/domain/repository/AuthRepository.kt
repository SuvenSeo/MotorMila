package lk.motormila.app.domain.repository

import kotlinx.coroutines.flow.Flow
import lk.motormila.app.domain.model.SelfSignupStatus
import lk.motormila.app.domain.model.UserSession

interface AuthRepository {
    /** Null when signed out. */
    fun session(): Flow<UserSession?>

    suspend fun me(): UserSession?

    suspend fun login(email: String, password: String): UserSession

    suspend fun signup(name: String, email: String, password: String, inviteToken: String?): UserSession

    suspend fun selfSignupStatus(): SelfSignupStatus

    suspend fun selfSignup(name: String, email: String, password: String): UserSession

    suspend fun logout()

    /** Restore persisted session on cold start (data builder reads DataStore). */
    suspend fun restore(): UserSession?

    /**
     * Server rejected [rejectedToken] (401): drop the local session without
     * calling the API. Returns true when a session was actually cleared
     * (false when the token is stale, i.e. the user already signed in again).
     */
    suspend fun clearRejectedSession(rejectedToken: String? = null): Boolean = false

    /**
     * Permanently delete the signed-in account on the server (Play account
     * deletion requirement), then clear everything local. Throws on failure.
     */
    suspend fun deleteAccount(password: String?) {}
}
