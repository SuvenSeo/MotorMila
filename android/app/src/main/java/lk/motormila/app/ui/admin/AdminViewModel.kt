package lk.motormila.app.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.model.AdminAnalytics
import lk.motormila.app.domain.model.AdminCacheClear
import lk.motormila.app.domain.model.AdminDealerRow
import lk.motormila.app.domain.model.AdminFeedbackItem
import lk.motormila.app.domain.model.AdminInviteRow
import lk.motormila.app.domain.model.AdminOverview
import lk.motormila.app.domain.model.AdminPermitRow
import lk.motormila.app.domain.model.AdminPipeline
import lk.motormila.app.domain.model.AdminPipelineTrigger
import lk.motormila.app.domain.model.AdminRevcarPilot
import lk.motormila.app.domain.model.AdminSystem
import lk.motormila.app.domain.model.AdminUserRow
import lk.motormila.app.domain.repository.AdminRepository
import lk.motormila.app.domain.usecase.ObserveSessionUseCase

internal const val ADMIN_PUBLIC_ORIGIN = "https://motormila.pages.dev"

internal val ADMIN_PLANS = listOf("free", "pro", "dealer", "enterprise")
internal val ADMIN_ROLES = listOf("user", "admin")
internal val ADMIN_FEEDBACK_STATUSES = listOf("new", "open", "triaged", "resolved", "closed", "spam")

enum class AdminDesk(val label: String) {
    Overview("Overview"),
    Users("Users"),
    Invites("Invites"),
    Pipeline("Pipeline"),
    Analytics("Analytics"),
    Feedback("Feedback"),
    Dealers("Dealers"),
    Permits("Permits"),
    System("System"),
    ;

    companion object {
        val labels: List<String> = entries.map { it.label }

        fun fromIndex(index: Int): AdminDesk = entries.getOrElse(index) { Overview }
    }
}

internal fun adminSignupUrl(signupPath: String?, token: String = ""): String {
    val path = signupPath?.trim()?.takeIf { it.isNotEmpty() }
        ?: token.trim().takeIf { it.isNotEmpty() }?.let { "/sign-up?token=$it" }
        ?: return ADMIN_PUBLIC_ORIGIN
    return if (path.startsWith("http://") || path.startsWith("https://")) {
        path
    } else {
        ADMIN_PUBLIC_ORIGIN + if (path.startsWith("/")) path else "/$path"
    }
}

internal fun adminProviderStatus(enabled: Boolean, configured: Boolean, lastRun: String?): String {
    if (!enabled) return "flagged off"
    if (!configured) return "needs key"
    val status = lastRun?.trim()?.takeIf { it.isNotEmpty() }
    return status ?: "ready · no runs yet"
}

data class AdminUiState(
    val isAdmin: Boolean = false,
    val sessionEmail: String? = null,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val tab: Int = 0,
    val overview: AdminOverview? = null,
    val users: List<AdminUserRow> = emptyList(),
    val userQuery: String = "",
    val userPlanFilter: String? = null,
    val usersLoading: Boolean = false,
    val usersLoaded: Boolean = false,
    val invites: List<AdminInviteRow> = emptyList(),
    val invitesLoading: Boolean = false,
    val invitesLoaded: Boolean = false,
    val inviteEmail: String = "",
    val invitePlan: String = "free",
    val inviteRole: String = "user",
    val sendingInvite: Boolean = false,
    val lastInviteToken: String? = null,
    val lastInviteSignupPath: String? = null,
    val pipeline: AdminPipeline? = null,
    val pipelineLoading: Boolean = false,
    val triggeringJob: String? = null,
    val lastTrigger: AdminPipelineTrigger? = null,
    val analytics: AdminAnalytics? = null,
    val analyticsLoading: Boolean = false,
    val feedback: List<AdminFeedbackItem> = emptyList(),
    val feedbackLoading: Boolean = false,
    val feedbackLoaded: Boolean = false,
    val dealers: List<AdminDealerRow> = emptyList(),
    val dealersLoading: Boolean = false,
    val dealersLoaded: Boolean = false,
    val verifyingDealerId: Int? = null,
    val permits: List<AdminPermitRow> = emptyList(),
    val permitsLoading: Boolean = false,
    val permitsLoaded: Boolean = false,
    val permitName: String = "",
    val permitType: String = "duty_free",
    val permitPrice: String = "0",
    val savingPermit: Boolean = false,
    val system: AdminSystem? = null,
    val systemLoading: Boolean = false,
    val clearingCache: Boolean = false,
    val lastCacheClear: AdminCacheClear? = null,
    val runningPilot: Boolean = false,
    val lastPilot: AdminRevcarPilot? = null,
    val error: String? = null,
    val notice: String? = null,
) {
    val desk: AdminDesk get() = AdminDesk.fromIndex(tab)
    val pendingInvites: List<AdminInviteRow> get() = invites.filter { it.status.equals("pending", true) }
    val lastInviteSignupUrl: String?
        get() = lastInviteSignupPath?.let { adminSignupUrl(it, lastInviteToken.orEmpty()) }
            ?: lastInviteToken?.let { adminSignupUrl(null, it) }
}

sealed interface AdminUiEvent {
    data object Refresh : AdminUiEvent
    data class TabChanged(val index: Int) : AdminUiEvent
    data class InviteEmailChanged(val value: String) : AdminUiEvent
    data class InvitePlanChanged(val value: String) : AdminUiEvent
    data class InviteRoleChanged(val value: String) : AdminUiEvent
    data object SendInvite : AdminUiEvent
    data class RevokeInvite(val id: Int) : AdminUiEvent
    data class SetUserPlan(val userId: Int, val plan: String) : AdminUiEvent
    data class SetUserRole(val userId: Int, val role: String) : AdminUiEvent
    data class SetUserActive(val userId: Int, val isActive: Boolean) : AdminUiEvent
    data class UserQueryChanged(val value: String) : AdminUiEvent
    data class UserPlanFilterChanged(val plan: String?) : AdminUiEvent
    data class TriggerPipeline(val job: String) : AdminUiEvent
    data class UpdateFeedback(val id: Int, val status: String) : AdminUiEvent
    data class VerifyDealer(val id: Int) : AdminUiEvent
    data class PermitNameChanged(val value: String) : AdminUiEvent
    data class PermitTypeChanged(val value: String) : AdminUiEvent
    data class PermitPriceChanged(val value: String) : AdminUiEvent
    data object UpsertPermit : AdminUiEvent
    data object ClearCache : AdminUiEvent
    data object RunRevcarPilot : AdminUiEvent
    data object DismissError : AdminUiEvent
    data object DismissNotice : AdminUiEvent
}

@HiltViewModel
class AdminViewModel @Inject constructor(
    private val admin: AdminRepository,
    observeSession: ObserveSessionUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminUiState())
    val state: StateFlow<AdminUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            observeSession().collect { session ->
                val isAdmin = session?.isAdmin == true
                _state.update {
                    it.copy(
                        isAdmin = isAdmin,
                        sessionEmail = session?.email,
                        isLoading = if (isAdmin) it.isLoading else false,
                    )
                }
                if (isAdmin) loadOverview()
            }
        }
    }

    fun onEvent(event: AdminUiEvent) {
        when (event) {
            AdminUiEvent.Refresh -> refresh()
            is AdminUiEvent.TabChanged -> selectTab(event.index)
            is AdminUiEvent.InviteEmailChanged -> _state.update { it.copy(inviteEmail = event.value) }
            is AdminUiEvent.InvitePlanChanged -> _state.update { it.copy(invitePlan = event.value) }
            is AdminUiEvent.InviteRoleChanged -> _state.update { it.copy(inviteRole = event.value) }
            AdminUiEvent.SendInvite -> sendInvite()
            is AdminUiEvent.RevokeInvite -> revoke(event.id)
            is AdminUiEvent.SetUserPlan -> patchUser(event.userId, plan = event.plan)
            is AdminUiEvent.SetUserRole -> patchUser(event.userId, role = event.role)
            is AdminUiEvent.SetUserActive -> patchUser(event.userId, isActive = event.isActive)
            is AdminUiEvent.UserQueryChanged -> {
                _state.update { it.copy(userQuery = event.value) }
                if (_state.value.desk == AdminDesk.Users) loadUsers()
            }
            is AdminUiEvent.UserPlanFilterChanged -> {
                _state.update { it.copy(userPlanFilter = event.plan) }
                if (_state.value.desk == AdminDesk.Users) loadUsers()
            }
            is AdminUiEvent.TriggerPipeline -> triggerPipeline(event.job)
            is AdminUiEvent.UpdateFeedback -> updateFeedback(event.id, event.status)
            is AdminUiEvent.VerifyDealer -> verifyDealer(event.id)
            is AdminUiEvent.PermitNameChanged -> _state.update { it.copy(permitName = event.value) }
            is AdminUiEvent.PermitTypeChanged -> _state.update { it.copy(permitType = event.value) }
            is AdminUiEvent.PermitPriceChanged -> _state.update { it.copy(permitPrice = event.value) }
            AdminUiEvent.UpsertPermit -> upsertPermit()
            AdminUiEvent.ClearCache -> clearCache()
            AdminUiEvent.RunRevcarPilot -> runRevcarPilot()
            AdminUiEvent.DismissError -> _state.update { it.copy(error = null) }
            AdminUiEvent.DismissNotice -> _state.update { it.copy(notice = null) }
        }
    }

    private fun selectTab(index: Int) {
        _state.update { it.copy(tab = index.coerceIn(0, AdminDesk.entries.lastIndex)) }
        ensureDesk(AdminDesk.fromIndex(_state.value.tab))
    }

    private fun refresh() {
        val desk = _state.value.desk
        _state.update { it.copy(isRefreshing = true, error = null) }
        loadOverview(refreshing = true)
        if (desk != AdminDesk.Overview) ensureDesk(desk, force = true)
    }

    private fun ensureDesk(desk: AdminDesk, force: Boolean = false) {
        when (desk) {
            AdminDesk.Overview -> if (force || _state.value.overview == null) loadOverview()
            AdminDesk.Users -> if (force || !_state.value.usersLoaded) loadUsers()
            AdminDesk.Invites -> if (force || !_state.value.invitesLoaded) loadInvites()
            AdminDesk.Pipeline -> if (force || _state.value.pipeline == null) loadPipeline()
            AdminDesk.Analytics -> if (force || _state.value.analytics == null) loadAnalytics()
            AdminDesk.Feedback -> if (force || !_state.value.feedbackLoaded) loadFeedback()
            AdminDesk.Dealers -> if (force || !_state.value.dealersLoaded) loadDealers()
            AdminDesk.Permits -> if (force || !_state.value.permitsLoaded) loadPermits()
            AdminDesk.System -> if (force || _state.value.system == null) loadSystem()
        }
    }

    private fun loadOverview(refreshing: Boolean = false) {
        viewModelScope.launch {
            val firstLoad = _state.value.overview == null
            _state.update {
                it.copy(
                    isLoading = firstLoad && !refreshing,
                    isRefreshing = refreshing,
                    error = null,
                )
            }
            runCatching { admin.overview() }
                .onSuccess { overview ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            overview = overview,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = ErrorMapper.map(error).message,
                        )
                    }
                }
        }
    }

    private fun loadUsers() {
        viewModelScope.launch {
            _state.update { it.copy(usersLoading = true, error = null) }
            val query = _state.value.userQuery
            val plan = _state.value.userPlanFilter
            runCatching { admin.users(query = query, plan = plan, limit = 200) }
                .onSuccess { users ->
                    _state.update {
                        it.copy(usersLoading = false, users = users, usersLoaded = true)
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(usersLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun loadInvites() {
        viewModelScope.launch {
            _state.update { it.copy(invitesLoading = true, error = null) }
            runCatching { admin.invites(status = null, limit = 200) }
                .onSuccess { invites ->
                    _state.update {
                        it.copy(invitesLoading = false, invites = invites, invitesLoaded = true)
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(invitesLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun loadPipeline() {
        viewModelScope.launch {
            _state.update { it.copy(pipelineLoading = true, error = null) }
            runCatching { admin.pipeline() }
                .onSuccess { pipeline ->
                    _state.update { it.copy(pipelineLoading = false, pipeline = pipeline) }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(pipelineLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun loadAnalytics() {
        viewModelScope.launch {
            _state.update { it.copy(analyticsLoading = true, error = null) }
            runCatching { admin.analytics() }
                .onSuccess { analytics ->
                    _state.update { it.copy(analyticsLoading = false, analytics = analytics) }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(analyticsLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun loadFeedback() {
        viewModelScope.launch {
            _state.update { it.copy(feedbackLoading = true, error = null) }
            runCatching { admin.feedback() }
                .onSuccess { rows ->
                    _state.update {
                        it.copy(feedbackLoading = false, feedback = rows, feedbackLoaded = true)
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(feedbackLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun loadDealers() {
        viewModelScope.launch {
            _state.update { it.copy(dealersLoading = true, error = null) }
            runCatching { admin.dealers() }
                .onSuccess { rows ->
                    _state.update {
                        it.copy(dealersLoading = false, dealers = rows, dealersLoaded = true)
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(dealersLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun loadPermits() {
        viewModelScope.launch {
            _state.update { it.copy(permitsLoading = true, error = null) }
            runCatching { admin.adminPermits() }
                .onSuccess { rows ->
                    _state.update {
                        it.copy(permitsLoading = false, permits = rows, permitsLoaded = true)
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(permitsLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun loadSystem() {
        viewModelScope.launch {
            _state.update { it.copy(systemLoading = true, error = null) }
            runCatching { admin.system() }
                .onSuccess { system ->
                    _state.update { it.copy(systemLoading = false, system = system) }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(systemLoading = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun sendInvite() {
        val email = _state.value.inviteEmail.trim()
        if (email.isBlank() || '@' !in email) {
            _state.update { it.copy(error = "Enter a valid email to invite.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(sendingInvite = true, error = null) }
            runCatching {
                admin.createInvite(email, _state.value.invitePlan, _state.value.inviteRole)
            }
                .onSuccess { invite ->
                    _state.update {
                        it.copy(
                            sendingInvite = false,
                            inviteEmail = "",
                            lastInviteToken = invite.token,
                            lastInviteSignupPath = invite.signupPath,
                            invitesLoaded = true,
                            invites = listOf(invite) + it.invites.filter { row -> row.id != invite.id },
                            notice = "Invite created for ${invite.email}",
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(sendingInvite = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun revoke(id: Int) {
        viewModelScope.launch {
            runCatching { admin.revokeInvite(id) }
                .onSuccess {
                    _state.update {
                        it.copy(
                            invites = it.invites.filterNot { row -> row.id == id },
                            notice = "Invite revoked",
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(error = ErrorMapper.map(error).message) } }
        }
    }

    private fun patchUser(
        userId: Int,
        plan: String? = null,
        role: String? = null,
        isActive: Boolean? = null,
    ) {
        if (isActive != null) {
            val target = _state.value.users.find { it.id == userId }
            if (target?.email.equals(_state.value.sessionEmail, true)) return
        }
        viewModelScope.launch {
            runCatching { admin.updateUser(userId, plan = plan, role = role, isActive = isActive) }
                .onSuccess { updated ->
                    _state.update { state ->
                        state.copy(
                            users = state.users.map { if (it.id == updated.id) updated else it },
                            notice = "User updated",
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(error = ErrorMapper.map(error).message) } }
        }
    }

    private fun triggerPipeline(job: String) {
        if (_state.value.triggeringJob != null) return
        viewModelScope.launch {
            _state.update { it.copy(triggeringJob = job, error = null) }
            runCatching { admin.triggerPipeline(job) }
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            triggeringJob = null,
                            lastTrigger = result,
                            notice = "Pipeline ${result.job ?: job} launched" +
                                (result.pid?.let { pid -> " (pid $pid)" } ?: ""),
                        )
                    }
                    loadPipeline()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(triggeringJob = null, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun updateFeedback(id: Int, status: String) {
        viewModelScope.launch {
            runCatching { admin.updateFeedback(id, status) }
                .onSuccess { updated ->
                    _state.update { state ->
                        state.copy(
                            feedback = state.feedback.map { if (it.id == updated.id) updated else it },
                            notice = "Feedback updated",
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(error = ErrorMapper.map(error).message) } }
        }
    }

    private fun verifyDealer(id: Int) {
        viewModelScope.launch {
            _state.update { it.copy(verifyingDealerId = id, error = null) }
            runCatching { admin.verifyDealer(id) }
                .onSuccess { updated ->
                    _state.update { state ->
                        state.copy(
                            verifyingDealerId = null,
                            dealers = state.dealers.map { if (it.id == updated.id) updated else it },
                            notice = "Dealer verified",
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(verifyingDealerId = null, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun upsertPermit() {
        val name = _state.value.permitName.trim()
        val type = _state.value.permitType.trim()
        val price = _state.value.permitPrice.trim().toDoubleOrNull()
        if (name.isBlank() || type.isBlank() || price == null) {
            _state.update { it.copy(error = "Enter permit name, type, and a numeric price.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(savingPermit = true, error = null) }
            runCatching { admin.upsertPermit(name, type, price) }
                .onSuccess { saved ->
                    _state.update { state ->
                        val without = state.permits.filterNot { it.id == saved.id }
                        state.copy(
                            savingPermit = false,
                            permitName = "",
                            permitPrice = "0",
                            permitsLoaded = true,
                            permits = listOf(saved) + without,
                            notice = "Permit saved",
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(savingPermit = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun clearCache() {
        viewModelScope.launch {
            _state.update { it.copy(clearingCache = true, error = null) }
            runCatching { admin.clearCache() }
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            clearingCache = false,
                            lastCacheClear = result,
                            notice = "Cleared ${result.deleted} cache row(s)",
                        )
                    }
                    loadSystem()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(clearingCache = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }

    private fun runRevcarPilot() {
        viewModelScope.launch {
            _state.update { it.copy(runningPilot = true, error = null) }
            runCatching { admin.runRevcarPilot() }
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            runningPilot = false,
                            lastPilot = result,
                            notice = "RevCarData pilot: ${result.matched}/${result.attempted} matched. MSRP not applied to FMV.",
                        )
                    }
                    loadSystem()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(runningPilot = false, error = ErrorMapper.map(error).message)
                    }
                }
        }
    }
}
