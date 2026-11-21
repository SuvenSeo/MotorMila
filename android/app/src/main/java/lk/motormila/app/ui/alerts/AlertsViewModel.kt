package lk.motormila.app.ui.alerts

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.math.abs
import kotlin.math.round
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import lk.motormila.app.data.repository.UnsupportedFreeChannels
import lk.motormila.app.R
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.format.parseLkrShorthand
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.core.network.messageRes
import lk.motormila.app.domain.model.Alert
import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.model.AlertMatch
import lk.motormila.app.domain.repository.AlertsRepository
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.domain.repository.ListingRepository

/**
 * Format rupees as alert-form shorthand: "8.5m" at/above 1M, else a whole-rupee integer.
 * Inverse of [parseLkrShorthand] for the common million case.
 */
fun formatLkrShorthand(value: Double): String {
    if (value >= 1_000_000) {
        val millions = value / 1_000_000.0
        val rounded = round(millions * 100.0) / 100.0
        val whole = rounded.toLong()
        val text = if (abs(rounded - whole) < 1e-9) {
            whole.toString()
        } else {
            rounded.toString().trimEnd('0').trimEnd('.')
        }
        return "${text}m"
    }
    return value.toLong().toString()
}

@Serializable
data class AlertForm(
    val make: String = "",
    val model: String = "",
    /** Empty = "Any district" (null server-side). Never silently defaults to Colombo. */
    val district: String = "",
    val maxPrice: String = "",
    val push: Boolean = false,
    val email: Boolean = false,
    val whatsappPhone: String = "",
    val telegramChatId: String = "",
    val whatsapp: Boolean = false,
    val telegram: Boolean = false,
    val inapp: Boolean = true,
    val digest: Boolean = false,
    val quietHours: Boolean = true,
)

val ALERT_CHANNEL_ORDER = listOf("inapp", "email", "whatsapp", "telegram", "push")

fun parseNotifyChannels(raw: String?): List<String> {
    if (raw.isNullOrBlank()) return listOf("inapp", "push")
    return raw.split(",")
        .map { it.trim().lowercase() }
        .filter { it.isNotEmpty() }
}

fun AlertForm.selectedNotifyChannels(isPro: Boolean): List<String> {
    val selected = buildList {
        // In-app is FREE (v1.9.0): the form shows it selected to everyone, so it
        // must actually be saved — never silently drop a displayed selection.
        if (inapp) add("inapp")
        if (email) add("email")
        if (whatsapp && isPro) add("whatsapp")
        if (telegram && isPro) add("telegram")
        if (push) add("push")
    }
    return selected
}

fun AlertForm.toAlertInput(isPro: Boolean): AlertInput? {
    val parsedMax = parseLkrShorthand(maxPrice)
    if (make.isBlank() || parsedMax == null || selectedNotifyChannels(isPro).isEmpty()) return null
    return AlertInput(
        make = make.trim(),
        model = model.trim().ifBlank { null },
        district = district.trim().ifBlank { null },
        maxPriceLkr = parsedMax,
        notifyPhone = if (isPro && whatsapp) whatsappPhone.trim().ifBlank { null } else null,
        notifyTelegramChatId = if (isPro && telegram) telegramChatId.trim().ifBlank { null } else null,
        notifyChannels = selectedNotifyChannels(isPro).joinToString(","),
        deliveryMode = if (isPro && digest) "digest" else "instant",
        quietHoursEnabled = if (isPro) quietHours else true,
    )
}

fun alertFormFrom(alert: Alert): AlertForm {
    val channels = parseNotifyChannels(alert.notifyChannels)
    return AlertForm(
        make = alert.make.orEmpty(),
        model = alert.model.orEmpty(),
        district = alert.district ?: "",
        maxPrice = alert.maxPriceLkr?.let(::formatLkrShorthand).orEmpty(),
        push = alert.notifyChannels == null || "push" in channels,
        email = "email" in channels,
        whatsappPhone = alert.notifyPhone.orEmpty(),
        telegramChatId = alert.notifyTelegramChatId.orEmpty(),
        whatsapp = "whatsapp" in channels,
        telegram = "telegram" in channels,
        inapp = "inapp" in channels,
        digest = alert.deliveryMode == "digest",
        quietHours = alert.quietHoursEnabled != false,
    )
}

data class AlertsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val listErrorRes: Int? = null,
    val form: AlertForm = AlertForm(),
    /** Alert id currently loaded into the form for editing (null = creating). */
    val editingId: Int? = null,
    val creating: Boolean = false,
    val updating: Boolean = false,
    /** Confetti-lite burst token: non-null right after a successful create. */
    val justCreatedId: Int? = null,
    val alerts: List<Alert> = emptyList(),
    /** Per-alert match groups (match-all + filter workaround, first 5 alerts). */
    val matches: List<AlertMatch> = emptyList(),
    val matchesLoading: Boolean = false,
    /** Row ids with an in-flight active-toggle. */
    val errorRes: Int? = null,
    val togglingIds: Set<Int> = emptySet(),
    /** Row ids with an in-flight channel PATCH. */
    val channelUpdatingIds: Set<Int> = emptySet(),
    val isPro: Boolean = false,
    /** Free plan cap: 1 active alert. */
    val freeCapReached: Boolean = false,
    /** False once the session flow reports no signed-in user (alerts are server-side). */
    val signedIn: Boolean = false,
    val alertOwner: String? = null,
    /** Set when a create was blocked or rejected because the user is signed out. */
    val signInRequired: Boolean = false,
    /** Inbox unread count (same repository's notification surface). */
    val unreadCount: Int = 0,
    val offline: Boolean = false,
    val error: String? = null,
    /**
     * Watchlist → Alerts listing-id prefill is in flight or finished.
     * Keeps the create form visible when listing detail fails (error goes to snackbar).
     */
    val prefillFromListing: Boolean = false,
    /** One-shot: form was just filled from a listing; screen shows a snackbar then consumes. */
    val justPrefill: Boolean = false,
)

sealed interface AlertsUiEvent {
    data object Refresh : AlertsUiEvent
    data class FormChanged(val expectedOwner: String?, val form: AlertForm) : AlertsUiEvent
    data class Create(val expectedOwner: String?) : AlertsUiEvent
    data class Prefill(val id: Int) : AlertsUiEvent
    data object CancelEdit : AlertsUiEvent
    data object Update : AlertsUiEvent
    data class ToggleActive(val id: Int, val active: Boolean) : AlertsUiEvent
    data object RefreshMatches : AlertsUiEvent
    data class Delete(val id: Int) : AlertsUiEvent
    data class ToggleAlertChannel(val id: Int, val channel: String) : AlertsUiEvent
    data class ToggleAlertDelivery(val id: Int) : AlertsUiEvent
    data class ToggleAlertQuietHours(val id: Int, val enabled: Boolean) : AlertsUiEvent
    data object ConsumeCreated : AlertsUiEvent
    data object ConsumePrefill : AlertsUiEvent
    data object DismissError : AlertsUiEvent
}

@HiltViewModel
class AlertsViewModel @Inject constructor(
    private val repository: AlertsRepository,
    private val listings: ListingRepository,
    authRepository: AuthRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _state = MutableStateFlow(AlertsUiState())
    val state: StateFlow<AlertsUiState> = _state.asStateFlow()

    private var lastMatchedIds: List<Int> = emptyList()

    // Cancel every private form/match/mutation job when its authenticated session changes.
    private var accountJob = SupervisorJob(viewModelScope.coroutineContext[Job])
    private val accountScope get() = CoroutineScope(viewModelScope.coroutineContext + accountJob)
    private var matchJob: Job? = null

    init {
        viewModelScope.launch {
            var previous: String? = null
            authRepository.session().collect { session ->
                val owner = session?.email?.trim()?.lowercase()
                if (previous != session?.token || _state.value.alertOwner != owner || _state.value.isLoading) {
                    previous = session?.token
                    accountJob.cancel()
                    accountJob = SupervisorJob(viewModelScope.coroutineContext[Job])
                    lastMatchedIds = emptyList()
                    _state.value = AlertsUiState(signedIn = session != null, alertOwner = owner, isPro = session?.isPro == true, isLoading = false)
                    if (session != null) {
                        accountScope.launch {
                            repository.observeAlerts().collect { alerts ->
                                _state.update { it.copy(alerts = alerts, freeCapReached = !it.isPro && alerts.any { a -> a.active }) }
                                val active = alerts.filter { it.active }
                                if (active.map { it.id } != lastMatchedIds) {
                                    lastMatchedIds = active.map { it.id }
                                    loadMatches(active)
                                }
                            }
                        }
                        accountScope.launch { repository.unreadCount().collect { n -> _state.update { it.copy(unreadCount = n) } } }
                        accountScope.launch { runRequest { repository.notifications(50) } }
                        refresh()
                        prefillFromListingIfNeeded()
                    }
                } else {
                    _state.update { it.copy(isPro = session?.isPro == true,
                        freeCapReached = session?.isPro != true && it.alerts.any { alert -> alert.active }) }
                }
            }
        }
    }

    private suspend inline fun <T> runRequest(block: () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(e)
    }

    fun onEvent(event: AlertsUiEvent) {
        when (event) {
            AlertsUiEvent.Refresh -> refresh()
            is AlertsUiEvent.FormChanged -> _state.update {
                if (it.alertOwner == event.expectedOwner) it.copy(form = event.form) else it
            }
            is AlertsUiEvent.Create -> create(event.expectedOwner)
            is AlertsUiEvent.Prefill -> prefill(event.id)
            AlertsUiEvent.CancelEdit -> _state.update { it.copy(editingId = null, form = AlertForm()) }
            AlertsUiEvent.Update -> update()
            is AlertsUiEvent.ToggleActive -> toggleActive(event.id, event.active)
            AlertsUiEvent.RefreshMatches -> loadMatches(_state.value.alerts.filter { it.active })
            is AlertsUiEvent.Delete -> delete(event.id)
            is AlertsUiEvent.ToggleAlertChannel -> toggleAlertChannel(event.id, event.channel)
            is AlertsUiEvent.ToggleAlertDelivery -> toggleAlertDelivery(event.id)
            is AlertsUiEvent.ToggleAlertQuietHours -> toggleAlertQuietHours(event.id, event.enabled)
            AlertsUiEvent.ConsumeCreated -> _state.update { it.copy(justCreatedId = null) }
            AlertsUiEvent.ConsumePrefill -> _state.update { it.copy(justPrefill = false) }
            AlertsUiEvent.DismissError -> _state.update { it.copy(error = null, errorRes = null, offline = false) }
        }
    }

    /**
     * Watchlist "create alert" navigates with a positive listingId. WatchItem has no
     * make/model, so we load listing detail and copy make/model/district/max price into the form.
     */
    private fun prefillFromListingIfNeeded() {
        if (savedStateHandle.get<Boolean>(PREFILL_CONSUMED_KEY) == true) return
        val listingId = savedStateHandle.get<Int>("listingId") ?: return
        if (listingId <= 0) return
        // Claim only the navigation intent, never a prior account's form or delivery details.
        savedStateHandle[PREFILL_CONSUMED_KEY] = true
        _state.update { it.copy(prefillFromListing = true) }
        accountScope.launch {
            runRequest { listings.getDetail(listingId) }
                .onSuccess { listing ->
                    _state.update { current ->
                        current.copy(
                            form = current.form.copy(
                                make = listing.make,
                                model = listing.model,
                                district = listing.district ?: "",
                                maxPrice = listing.priceLkr?.let(::formatLkrShorthand).orEmpty(),
                            ),
                            justPrefill = true,
                        )
                    }
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            offline = mapped is AppError.Network,
                            error = mapped.message,
                        )
                    }
                }
        }
    }

    private fun refresh() {
        if (!_state.value.signedIn) return
        accountScope.launch {
            _state.update { it.copy(isRefreshing = true, error = null, offline = false) }
            runRequest { repository.refresh() }
                .onSuccess { _state.update { it.copy(listErrorRes = null) } }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(offline = mapped is AppError.Network, listErrorRes = mapped.messageRes())
                    }
                }
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    /** Match-all + client-side filter (DATA_CONTRACT §2); bounded to 5 alerts. */
    private fun loadMatches(alerts: List<Alert>) {
        if (alerts.isEmpty()) {
            matchJob?.cancel()
            _state.update { it.copy(matches = emptyList(), matchesLoading = false) }
            return
        }
        matchJob?.cancel()
        matchJob = accountScope.launch {
            _state.update { it.copy(matchesLoading = true) }
            val groups = alerts.take(5).mapNotNull { alert ->
                runRequest { repository.match(alert.id, limit = 5) }.getOrNull()
            }
            _state.update { it.copy(matches = groups, matchesLoading = false) }
        }
    }

    private fun hasChannels(form: AlertForm): Boolean {
        if (form.selectedNotifyChannels(_state.value.isPro).isNotEmpty()) return true
        _state.update { it.copy(errorRes = R.string.buyer_alert_choose_channel) }
        return false
    }

    private fun buildInput(f: AlertForm): AlertInput? = f.toAlertInput(_state.value.isPro)

    private fun create(expectedOwner: String?) {
        if (_state.value.creating || _state.value.updating) return
        val f = _state.value.form
        if (!_state.value.signedIn) {
            // Alerts live on the server: a signed-out create used to fail with no visible feedback.
            _state.update { it.copy(signInRequired = true, error = null) }
            return
        }
        if (expectedOwner == null || expectedOwner != _state.value.alertOwner) return
        if (_state.value.freeCapReached) {
            _state.update { it.copy(error = "Free plan allows 1 alert. Upgrade to Pro for unlimited alerts.") }
            return
        }
        if (!_state.value.isPro && (f.whatsapp || f.telegram)) {
            _state.update { it.copy(error = "WhatsApp and Telegram notifications unlock with Pro.") }
            return
        }
        if (!hasChannels(f)) return
        val input = buildInput(f)
        if (input == null) {
            _state.update { it.copy(error = "Enter at least a make and a max price (e.g. 8m).") }
            return
        }
        _state.update { it.copy(creating = true, error = null, offline = false) }
        accountScope.launch {
            runRequest { repository.create(input, expectedOwner) }
                .onSuccess { alert ->
                    _state.update { it.copy(creating = false, form = AlertForm(), justCreatedId = alert.id) }
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        if (e is UnsupportedFreeChannels) {
                            it.copy(creating = false, errorRes = R.string.buyer_alert_legacy_channels)
                        } else if (mapped is AppError.Unauthorized) {
                            it.copy(creating = false, signInRequired = true)
                        } else {
                            it.copy(
                                creating = false,
                                offline = mapped is AppError.Network,
                                error = mapped.message,
                            )
                        }
                    }
                }
        }
    }

    private fun prefill(id: Int) {
        val alert = _state.value.alerts.firstOrNull { it.id == id } ?: return
        _state.update {
            it.copy(
                editingId = id,
                form = alertFormFrom(alert),
            )
        }
    }

    /**
     * In-place edit via [AlertsRepository.update] (PUT /alerts/{id}; legacy
     * create-then-delete only on pre-PUT backends). On failure the form stays
     * open and the error is surfaced; the original alert is left as it was.
     */
    private fun update() {
        val id = _state.value.editingId ?: return
        if (_state.value.updating || !_state.value.signedIn || !hasChannels(_state.value.form)) return
        val input = buildInput(_state.value.form)
        if (input == null) {
            _state.update { it.copy(error = "Enter at least a make and a max price (e.g. 8m).") }
            return
        }
        accountScope.launch {
            _state.update { it.copy(updating = true, error = null, offline = false) }
            runRequest { repository.update(id, input) }
                .onSuccess { alert ->
                    lastMatchedIds = emptyList() // force match reload (criteria changed; id may differ on legacy backends)
                    _state.update {
                        it.copy(updating = false, editingId = null, form = AlertForm(), justCreatedId = alert.id)
                    }
                }
                .onFailure { e ->
                    if (e is kotlin.coroutines.cancellation.CancellationException) throw e
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            updating = false,
                            offline = mapped is AppError.Network,
                            errorRes = if (e is UnsupportedFreeChannels) R.string.buyer_alert_legacy_channels else null,
                            error = mapped.message,
                        )
                    }
                    // Re-sync so the list reflects the server (legacy swap paths may have re-created it).
                    runRequest { repository.refresh() }
                }
        }
    }

    private fun toggleActive(id: Int, active: Boolean) = changeRow(id) { repository.setActive(id, active) }

    private fun delete(id: Int) = changeRow(id) { repository.delete(id) }

    private fun changeRow(id: Int, change: suspend () -> Unit) {
        if (!_state.value.signedIn || id in _state.value.togglingIds) return
        _state.update { it.copy(togglingIds = it.togglingIds + id, error = null, errorRes = null) }
        accountScope.launch {
            runRequest { change() }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update { it.copy(offline = mapped is AppError.Network, errorRes = R.string.buyer_alert_change_unconfirmed) }
            }
            _state.update { it.copy(togglingIds = it.togglingIds - id) }
        }
    }

    private fun toggleAlertChannel(id: Int, channel: String) {
        // In-app / email / push are free; only WhatsApp + Telegram are Pro-gated.
        val proOnly = channel == "whatsapp" || channel == "telegram"
        if (proOnly && !_state.value.isPro) {
            _state.update { it.copy(error = "WhatsApp and Telegram notifications unlock with Pro.") }
            return
        }
        val alert = _state.value.alerts.firstOrNull { it.id == id } ?: return
        val next = parseNotifyChannels(alert.notifyChannels).toMutableSet()
        if (channel in next) next.remove(channel) else next.add(channel)
        if (next.isEmpty()) {
            _state.update { it.copy(errorRes = R.string.buyer_alert_choose_channel) }
            return
        }
        patchChannels(id, channels = ALERT_CHANNEL_ORDER.filter { it in next })
    }

    private fun toggleAlertDelivery(id: Int) {
        if (!_state.value.isPro) {
            _state.update { it.copy(error = "Digest delivery unlocks with Pro.") }
            return
        }
        val alert = _state.value.alerts.firstOrNull { it.id == id } ?: return
        val next = if (alert.deliveryMode == "digest") "instant" else "digest"
        patchChannels(id, deliveryMode = next)
    }

    private fun toggleAlertQuietHours(id: Int, enabled: Boolean) {
        if (!_state.value.isPro) {
            _state.update { it.copy(error = "Quiet hours unlock with Pro.") }
            return
        }
        patchChannels(id, quietHoursEnabled = enabled)
    }

    private fun patchChannels(
        id: Int,
        channels: List<String>? = null,
        deliveryMode: String? = null,
        quietHoursEnabled: Boolean? = null,
    ) {
        accountScope.launch {
            _state.update { it.copy(channelUpdatingIds = it.channelUpdatingIds + id, error = null) }
            runRequest {
                repository.updateChannels(
                    id = id,
                    channels = channels,
                    deliveryMode = deliveryMode,
                    quietHoursEnabled = quietHoursEnabled,
                )
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(offline = mapped is AppError.Network, error = mapped.message,
                        errorRes = if (e is UnsupportedFreeChannels) R.string.buyer_alert_legacy_channels else null)
                }
            }
            _state.update { it.copy(channelUpdatingIds = it.channelUpdatingIds - id) }
        }
    }

    companion object {
        private const val PREFILL_CONSUMED_KEY = "alerts_prefill_consumed"
    }
}
