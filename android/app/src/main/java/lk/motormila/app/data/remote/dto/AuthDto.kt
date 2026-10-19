package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Auth DTOs. Backend: backend/app/api/v1/endpoints/auth.py
 * - POST /auth/login {email,password} -> {user, token, expires_at(epoch s)}
 * - POST /auth/signup {token,name,password} -> same shape
 * - GET /auth/me -> FLAT user dict (NOT wrapped in {user:...})
 * - GET /auth/invite/{token} -> {email, plan, ...} preview
 * - POST /auth/logout -> {ok}
 */
@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class SignupRequest(
    val token: String,
    val name: String,
    val password: String,
)

@Serializable
data class UserDto(
    val email: String = "",
    val name: String = "",
    val plan: String = "free",
    @SerialName("subscriptionStatus") val subscriptionStatus: String? = null,
    val role: String = "user",
    @SerialName("avatarInitials") val avatarInitials: String? = null,
    @SerialName("trialEndsAt") val trialEndsAt: String? = null,
    @SerialName("trialDaysLeft") val trialDaysLeft: Int? = null,
)

@Serializable
data class TokenResponse(
    val user: UserDto = UserDto(),
    val token: String = "",
    @SerialName("expires_at") val expiresAt: Long? = null,
)

/**
 * GET /auth/me returns the user fields FLAT (auth.py `_user_response`).
 * The old wrapper shape ({user: ...}) silently decoded to empty defaults.
 */
@Serializable
data class MeResponse(
    val email: String = "",
    val name: String = "",
    val plan: String = "free",
    @SerialName("subscriptionStatus") val subscriptionStatus: String? = null,
    val role: String = "user",
    @SerialName("avatarInitials") val avatarInitials: String? = null,
    @SerialName("trialEndsAt") val trialEndsAt: String? = null,
    @SerialName("trialDaysLeft") val trialDaysLeft: Int? = null,
) {
    fun toUserDto() = UserDto(
        email = email,
        name = name,
        plan = plan,
        subscriptionStatus = subscriptionStatus,
        role = role,
        avatarInitials = avatarInitials,
        trialEndsAt = trialEndsAt,
        trialDaysLeft = trialDaysLeft,
    )
}

@Serializable
data class InvitePreviewDto(
    val email: String? = null,
    val plan: String? = null,
    val role: String? = null,
    val status: String? = null,
    @SerialName("expiresAt") val expiresAt: String? = null,
)

@Serializable
data class OkResponse(
    val ok: Boolean = true,
)

/** DELETE /auth/me body: optional password re-check before hard delete. */
@Serializable
data class DeleteAccountRequestDto(
    val password: String? = null,
)
