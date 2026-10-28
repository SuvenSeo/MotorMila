package lk.motormila.app.ui.admin

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import lk.motormila.app.domain.model.AdminCacheClear
import lk.motormila.app.domain.model.AdminDealerRow
import lk.motormila.app.domain.model.AdminFeedbackItem
import lk.motormila.app.domain.model.AdminInviteRow
import lk.motormila.app.domain.model.AdminOverview
import lk.motormila.app.domain.model.AdminPermitRow
import lk.motormila.app.domain.model.AdminPipeline
import lk.motormila.app.domain.model.AdminPipelineRun
import lk.motormila.app.domain.model.AdminPipelineTrigger
import lk.motormila.app.domain.model.AdminRevcarPilot
import lk.motormila.app.domain.model.AdminSystem
import lk.motormila.app.domain.model.AdminUserRow
import lk.motormila.app.domain.model.UserSession
import lk.motormila.app.domain.repository.AdminRepository
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AdminViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val admin: AdminRepository = mockk(relaxUnitFun = true)
    private val sessionFlow = MutableStateFlow<UserSession?>(null)
    private val auth: AuthRepository = mockk()

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
        every { auth.session() } returns sessionFlow
        stubAdmin()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun nonAdmin_doesNotLoadAndClearsSpinner() {
        sessionFlow.value = session(role = "user")
        val vm = viewModel()

        assertFalse(vm.state.value.isAdmin)
        assertFalse(vm.state.value.isLoading)
        coVerify(exactly = 0) { admin.overview() }
    }

    @Test
    fun adminSession_loadsOverviewLazily() {
        sessionFlow.value = session()
        val vm = viewModel()

        assertTrue(vm.state.value.isAdmin)
        assertFalse(vm.state.value.isLoading)
        assertEquals(3, vm.state.value.overview?.feedbackOpen)
        assertEquals(2, vm.state.value.overview?.dealersVerified)
        assertNull(vm.state.value.pipeline)
        coVerify(exactly = 1) { admin.overview() }
        coVerify(exactly = 0) { admin.pipeline(any()) }
        coVerify(exactly = 0) { admin.users(any(), any(), any()) }
    }

    @Test
    fun tabChanged_pipelineLoadsRuns() {
        sessionFlow.value = session()
        val vm = viewModel()
        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Pipeline.ordinal))

        assertEquals(AdminDesk.Pipeline, vm.state.value.desk)
        assertEquals(listOf(7), vm.state.value.pipeline?.runs?.map { it.id })
        coVerify { admin.pipeline(any()) }
    }

    @Test
    fun usersTab_forwardsQueryAndEnterprisePlan() {
        sessionFlow.value = session()
        val vm = viewModel()
        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Users.ordinal))
        vm.onEvent(AdminUiEvent.UserQueryChanged("ada"))
        vm.onEvent(AdminUiEvent.UserPlanFilterChanged("enterprise"))

        coVerify { admin.users(query = "ada", plan = "enterprise", limit = 200) }
        assertEquals("enterprise", vm.state.value.userPlanFilter)
        assertEquals("ada", vm.state.value.userQuery)
    }

    @Test
    fun invitesTab_requestsHistoryWithNullStatus() {
        sessionFlow.value = session()
        val vm = viewModel()
        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Invites.ordinal))

        coVerify { admin.invites(status = null, limit = 200) }
        assertEquals(1, vm.state.value.pendingInvites.size)
        assertEquals(2, vm.state.value.invites.size)
    }

    @Test
    fun sendInvite_usesRoleAndEnterprisePlan() {
        sessionFlow.value = session()
        val vm = viewModel()
        vm.onEvent(AdminUiEvent.InviteEmailChanged("new@example.com"))
        vm.onEvent(AdminUiEvent.InvitePlanChanged("enterprise"))
        vm.onEvent(AdminUiEvent.InviteRoleChanged("admin"))
        vm.onEvent(AdminUiEvent.SendInvite)

        coVerify { admin.createInvite("new@example.com", "enterprise", "admin") }
        assertEquals("/sign-up?token=tok-1", vm.state.value.lastInviteSignupPath)
        assertEquals(
            "https://motormila.pages.dev/sign-up?token=tok-1",
            vm.state.value.lastInviteSignupUrl,
        )
    }

    @Test
    fun setUserPlan_patchesThroughUpdateUser() {
        sessionFlow.value = session()
        val vm = viewModel()
        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Users.ordinal))
        vm.onEvent(AdminUiEvent.SetUserPlan(11, "enterprise"))

        coVerify { admin.updateUser(11, plan = "enterprise", role = null, isActive = null) }
        assertEquals("enterprise", vm.state.value.users.single().plan)
    }

    @Test
    fun setUserActive_ignoresSelf() {
        sessionFlow.value = session(email = "owner@example.com")
        coEvery { admin.users(any(), any(), any()) } returns listOf(
            user(email = "owner@example.com", isActive = true),
        )
        val vm = viewModel()
        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Users.ordinal))
        vm.onEvent(AdminUiEvent.SetUserActive(11, false))

        coVerify(exactly = 0) { admin.updateUser(any(), any(), any(), any()) }
        assertTrue(vm.state.value.users.single().isActive)
    }

    @Test
    fun triggerPipeline_launchesSyncAndReloadsRuns() {
        sessionFlow.value = session()
        val vm = viewModel()
        vm.onEvent(AdminUiEvent.TriggerPipeline("sync"))

        coVerify { admin.triggerPipeline("sync") }
        coVerify { admin.pipeline(any()) }
        assertEquals("sync", vm.state.value.lastTrigger?.job)
        assertTrue(vm.state.value.notice?.contains("pid 9") == true)
    }

    @Test
    fun feedbackAndDealerAndPermitAndSystemActions() {
        sessionFlow.value = session()
        val vm = viewModel()

        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Feedback.ordinal))
        vm.onEvent(AdminUiEvent.UpdateFeedback(4, "triaged"))
        coVerify { admin.updateFeedback(4, "triaged") }
        assertEquals("triaged", vm.state.value.feedback.single().status)

        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Dealers.ordinal))
        vm.onEvent(AdminUiEvent.VerifyDealer(8))
        coVerify { admin.verifyDealer(8) }
        assertTrue(vm.state.value.dealers.single().isVerified)

        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.Permits.ordinal))
        vm.onEvent(AdminUiEvent.PermitNameChanged("Duty free"))
        vm.onEvent(AdminUiEvent.PermitTypeChanged("duty_free"))
        vm.onEvent(AdminUiEvent.PermitPriceChanged("2500000"))
        vm.onEvent(AdminUiEvent.UpsertPermit)
        coVerify { admin.upsertPermit("Duty free", "duty_free", 2_500_000.0) }

        vm.onEvent(AdminUiEvent.TabChanged(AdminDesk.System.ordinal))
        vm.onEvent(AdminUiEvent.ClearCache)
        coVerify { admin.clearCache(key = null) }
        vm.onEvent(AdminUiEvent.RunRevcarPilot)
        coVerify { admin.runRevcarPilot() }
        assertEquals(40, vm.state.value.lastPilot?.matched)
    }

    @Test
    fun overviewFailure_setsError() {
        coEvery { admin.overview() } throws IOException("offline")
        sessionFlow.value = session()
        val vm = viewModel()

        assertFalse(vm.state.value.isLoading)
        assertTrue(vm.state.value.error?.isNotBlank() == true)
    }

    private fun viewModel(): AdminViewModel =
        AdminViewModel(admin = admin, observeSession = ObserveSessionUseCase(auth))

    private fun stubAdmin() {
        coEvery { admin.overview() } returns AdminOverview(
            listingsLive = 12,
            usersTotal = 4,
            feedbackOpen = 3,
            dealersVerified = 2,
        )
        coEvery { admin.users(any(), any(), any()) } returns listOf(user())
        coEvery { admin.invites(any(), any()) } returns listOf(
            invite(id = 1, status = "pending"),
            invite(id = 2, status = "accepted", email = "old@example.com"),
        )
        coEvery { admin.createInvite(any(), any(), any()) } returns invite(
            id = 9,
            email = "new@example.com",
            plan = "enterprise",
            role = "admin",
            token = "tok-1",
            signupPath = "/sign-up?token=tok-1",
        )
        coEvery { admin.updateUser(any(), any(), any(), any()) } returns user(plan = "enterprise")
        coEvery { admin.pipeline(any()) } returns AdminPipeline(
            runs = listOf(
                AdminPipelineRun(
                    id = 7,
                    source = "ikman",
                    status = "success",
                    listingsFound = 10,
                    listingsNew = 2,
                    startedAt = "2026-01-01T00:00:00Z",
                    finishedAt = null,
                    errorMessage = null,
                ),
            ),
        )
        coEvery { admin.triggerPipeline(any()) } returns AdminPipelineTrigger(ok = true, job = "sync", pid = 9)
        coEvery { admin.analytics() } returns lk.motormila.app.domain.model.AdminAnalytics()
        coEvery { admin.feedback(any(), any()) } returns listOf(feedback())
        coEvery { admin.updateFeedback(any(), any()) } returns feedback(status = "triaged")
        coEvery { admin.dealers(any(), any()) } returns listOf(dealer())
        coEvery { admin.verifyDealer(any()) } returns dealer(status = "verified")
        coEvery { admin.adminPermits() } returns listOf(
            AdminPermitRow(1, "Duty free", "duty_free", 1_000_000.0, null),
        )
        coEvery { admin.upsertPermit(any(), any(), any()) } returns AdminPermitRow(
            id = 3,
            permitName = "Duty free",
            permitType = "duty_free",
            marketPriceLkr = 2_500_000.0,
            updatedAt = null,
        )
        coEvery { admin.system() } returns AdminSystem()
        coEvery { admin.clearCache(any()) } returns AdminCacheClear(ok = true, deleted = 2)
        coEvery { admin.runRevcarPilot() } returns AdminRevcarPilot(ok = true, attempted = 100, matched = 40)
    }

    private fun session(
        email: String = "admin@example.com",
        role: String = "admin",
    ): UserSession = UserSession(
        email = email,
        name = "Admin",
        plan = "pro",
        role = role,
        subscriptionStatus = "active",
        token = "tok",
        expiresAt = null,
    )

    private fun user(
        id: Int = 11,
        email: String = "ada@example.com",
        plan: String = "free",
        isActive: Boolean = true,
    ) = AdminUserRow(
        id = id,
        email = email,
        name = "Ada",
        plan = plan,
        subscriptionStatus = "none",
        role = "user",
        isActive = isActive,
        createdAt = null,
    )

    private fun invite(
        id: Int,
        email: String = "pending@example.com",
        plan: String = "pro",
        role: String = "user",
        status: String = "pending",
        token: String = "tok",
        signupPath: String? = "/sign-up?token=tok",
    ) = AdminInviteRow(
        id = id,
        email = email,
        plan = plan,
        role = role,
        status = status,
        token = token,
        signupPath = signupPath,
        expiresAt = null,
    )

    private fun feedback(status: String = "new") = AdminFeedbackItem(
        id = 4,
        category = "bug",
        route = "/search",
        message = "Broken filter",
        email = "user@example.com",
        status = status,
        createdAt = null,
    )

    private fun dealer(status: String = "pending") = AdminDealerRow(
        id = 8,
        displayName = "Colombo Motors",
        contactPhone = "077",
        contactEmail = "yard@example.com",
        sellerNamePattern = "Colombo*",
        claimedUrl = null,
        status = status,
        plan = "dealer",
        subscriptionStatus = null,
        verifiedAt = if (status == "verified") "2026-01-01" else null,
        createdAt = null,
    )
}
