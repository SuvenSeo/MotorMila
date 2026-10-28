package lk.motormila.app.domain

import lk.motormila.app.domain.model.UserSession
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * v1.3.1 regression: backend PRO_PLANS is {pro, enterprise, dealer} but the
 * app previously only recognized "pro" (+ legacy aliases), so enterprise and
 * dealer accounts saw locked Pro features on mobile despite full web access.
 */
class UserSessionPlanAccessTest {

    private fun session(plan: String, role: String = "user") = UserSession(
        email = "owner@example.com",
        name = "Owner",
        plan = plan,
        role = role,
        subscriptionStatus = "active",
        token = "t",
        expiresAt = null,
    )

    @Test
    fun everyBackendProPlanUnlocksMobilePro() {
        // Must match backend PRO_PLANS = {pro, enterprise, dealer}.
        assertTrue(session("pro").isPro)
        assertTrue(session("enterprise").isPro)
        assertTrue(session("dealer").isPro)
        // Legacy aliases stay accepted.
        assertTrue(session("pro_plus").isPro)
        assertTrue(session("business").isPro)
        assertTrue(session("PRO").isPro)
        assertTrue(session("Enterprise").isPro)
    }

    @Test
    fun freePlanStaysLocked() {
        assertFalse(session("free").isPro)
        assertFalse(session("").isPro)
        assertFalse(session("unknown_plan").isPro)
    }

    @Test
    fun playPurchaseEntitlementUnlocksProLocally() {
        // v1.6.1: Google Play purchase unlocks Pro on-device (backend has no
        // Play verification endpoint yet); server plan stays authoritative.
        val entitled = session("free").copy(playProEntitled = true)
        assertTrue(entitled.isPro)
        // ...and losing the Play entitlement re-locks a free plan.
        assertFalse(entitled.copy(playProEntitled = false).isPro)
        // Server pro still works without any Play involvement.
        assertTrue(session("pro").isPro)
    }

    @Test
    fun adminRoleFlagDoesNotDependOnPlan() {
        assertTrue(session("free", role = "admin").isAdmin)
        assertFalse(session("pro").isAdmin)
    }
}
