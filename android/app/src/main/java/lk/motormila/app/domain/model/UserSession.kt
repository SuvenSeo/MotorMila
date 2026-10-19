package lk.motormila.app.domain.model

/**
 * Authenticated session. Mirrors backend auth payload (endpoints/auth.py):
 * JWT in mm_session cookie / Authorization header carrying plan + role.
 */
data class UserSession(
    val email: String,
    val name: String?,
    /** "free" | "pro" | ... (backend PRO_PLANS). */
    val plan: String,
    /** "user" | "admin". */
    val role: String,
    val subscriptionStatus: String?,
    val token: String,
    /** ISO-8601 expiry, null = non-expiring / unknown. */
    val expiresAt: String?,
    /**
     * Local Google Play entitlement. True when Play Billing reports an active
     * `motormila_pro_monthly` subscription for this device's Google account.
     * The backend has no Play verification endpoint yet, so a Play purchase
     * unlocks Pro locally (Play's purchase cache is the source of truth,
     * re-verified on launch); server plan remains authoritative when present.
     */
    val playProEntitled: Boolean = false,
) {
    /** Mirrors backend PRO_PLANS {pro, enterprise, dealer} (+ legacy aliases), OR local Play entitlement. */
    val isPro: Boolean
        get() = playProEntitled ||
            plan.equals("pro", ignoreCase = true) ||
            plan.equals("pro_plus", ignoreCase = true) ||
            plan.equals("business", ignoreCase = true) ||
            plan.equals("enterprise", ignoreCase = true) ||
            plan.equals("dealer", ignoreCase = true)

    val isAdmin: Boolean get() = role.equals("admin", ignoreCase = true)
}
