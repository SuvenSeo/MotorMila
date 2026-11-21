package lk.motormila.app.ui.alerts

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
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
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
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
import lk.motormila.app.ui.navigation.Alerts

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
    val push: Boolean = true,
    val email: Boolean = false,
    val whatsappPhone: String = "",
    val telegramChatId: String = "",
    val whatsapp: Boolean = false,
    val telegram: Boolean = false,
    val inapp: Boolean = true,
    val digest: Boolean = false,
    /** Off by default: only the Pro form shows the switch, so free alerts never get it silently. */
    val quietHours: Boolean = false,
)

val ALERT_CHANNEL_ORDER = listOf("inapp", "email", "whatsapp", "telegram", "push")

fun parseNotifyChannels(raw: String?): List<String> {
    if (raw == null) return listOf("push")
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
    return selected.ifEmpty { listOf("push") }
}

fun AlertForm.toAlertInput(isPro: Boolean): AlertInput? {
    val parsedMax = parseLkrShorthand(maxPrice)
    if (make.isBlank() || parsedMax == null) return null
    return AlertInput(
        make = make.trim(),
        model = model.trim().ifBlank { null },
        district = district.trim().ifBlank { null },
        maxPriceLkr = parsedMax,
        notifyPhone = if (isPro && whatsapp) whatsappPhone.trim().ifBlank { null } else null,
        notifyTelegramChatId = if (isPro && telegram) telegramChatId.trim().ifBlank { null } else null,
        notifyChannels = selectedNotifyChannels(isPro).joinToString(","),
        deliveryMode = if (isPro && digest) "digest" else "instant",
        // Free users never see the quiet-hours switch, so never enable it behind their back.
        quietHoursEnabled = if (isPro) quietHours else false,
    )
}

/** Rebuilds the server input for a deleted alert so Undo restores it exactly. */
fun Alert.toRestoreInput(): AlertInput = AlertInput(
    make = make,
    model = model,
    maxPriceLkr = maxPriceLkr,
    district = district,
    notifyPhone = notifyPhone,
    notifyEmail = notifyEmail,
    notifyTelegramChatId = notifyTelegramChatId,
    notifyChannels = notifyChannels,
    deliveryMode = deliveryMode,
    quietHoursEnabled = quietHoursEnabled,
)

/**
 * User-facing alerts message. Resolved to a localized string at the UI edge so
 * no English or raw exception text is carried in state.
 */
sealed interface AlertsMessage {
    /** Fixed copy from a string resource. */
    data class Res(@StringRes val id: Int) : AlertsMessage
    /** Typed transport/HTTP failure; shown via [AppError.messageRes]. */
    data class Failure(val error: AppError) : AlertsMessage
}

/** Localized copy for an [AlertsMessage]; never the raw exception text. */
@StringRes
fun AlertsMessage.textRes(): Int = when (this) {
    is AlertsMessage.Res -> id
    is AlertsMessage.Failure -> error.messageRes()
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
    val togglingIds: Set<Int> = emptySet(),
    /** Row ids with an in-flight channel PATCH. */
    val channelUpdatingIds: Set<Int> = emptySet(),
    val isPro: Boolean = false,
    /** Free plan cap: 1 active alert. */
    val freeCapReached: Boolean = false,
    /** False once the session flow reports no signed-in user (alerts are server-side). */
    val signedIn: Boolean = true,
    /** Set when a create was blocked or rejected because the user is signed out. */
    val signInRequired: Boolean = false,
    /** Inbox unread count (same repository's notification surface). */
    val unreadCount: Int = 0,
    val offline: Boolean = false,
    val error: AlertsMessage? = null,
    /** Make options for the combobox (de-duplicated: makes are list keys). */
    val makes: List<String> = emptyList(),
    /** Model options for the selected make; empty = free text is committed. */
    val models: List<String> = emptyList(),
    /** One-shot: an alert was just deleted; the screen offers Undo, then consumes. */
    val deletedAlert: Alert? = null,
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
    data class FormChanged(val form: AlertForm) : AlertsUiEvent
    data object Create : AlertsUiEvent
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
    data class UndoDelete(val alert: Alert) : AlertsUiEvent
    data object ConsumeDeleted : AlertsUiEvent
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

    init {
        viewModelScope.launch {
            combine(
                repository.observeAlerts(),
                authRepository.session(),
            ) { alerts, session ->
                Triple(alerts, session, alerts.map { it.id })
            }.catch { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        offline = mapped is AppError.Network,
                        error = AlertsMessage.Failure(mapped),
                    )
                }
            }.collect { (alerts, session, ids) ->
                val isPro = session?.isPro == true
                _state.update {
                    it.copy(
                        signedIn = session != null,
                        signInRequired = it.signInRequired && session == null,
                        isLoading = false,
                        isRefreshing = false,
                        offline = false,
                        alerts = alerts,
                        isPro = isPro,
                        freeCapReached = !isPro && alerts.size >= 1,
                    )
                }
                // Match-all + filter previews, reloaded only when the id set changes.
                if (ids != lastMatchedIds) {
                    lastMatchedIds = ids
                    loadMatches(alerts)
                }
            }
        }
        viewModelScope.launch {
            repository.unreadCount()
                .catch { emit(0) }
                .collect { n -> _state.update { it.copy(unreadCount = n) } }
        }
        prefillFromListingIfNeeded()
        loadMakes()
    }

    private fun loadMakes() {
        viewModelScope.launch {
            runCatching { listings.makes() }
                .onSuccess { makes -> _state.update { it.copy(makes = makes.distinct()) } }
            // Failure is non-fatal: the combobox commits typed text when it has no options.
        }
        _state.value.form.make.takeIf { it.isNotBlank() }?.let(::loadModels)
    }

    private fun loadModels(make: String) {
        viewModelScope.launch {
            val models = runCatching { listings.models(make) }.getOrDefault(emptyList()).distinct()
            // Ignore late results for a make the user has already changed.
            _state.update { if (it.form.make == make) it.copy(models = models) else it }
        }
    }

    private fun onFormChanged(form: AlertForm) {
        val makeChanged = form.make != _state.value.form.make
        _state.update { it.copy(form = form, models = if (makeChanged) emptyList() else it.models) }
        if (makeChanged && form.make.isNotBlank()) loadModels(form.make)
    }

    fun onEvent(event: AlertsUiEvent) {
        when (event) {
            AlertsUiEvent.Refresh -> refresh()
            is AlertsUiEvent.FormChanged -> onFormChanged(event.form)
            AlertsUiEvent.Create -> create()
            is AlertsUiEvent.Prefill -> prefill(event.id)
            AlertsUiEvent.CancelEdit -> _state.update { it.copy(editingId = null, form = AlertForm()) }
            AlertsUiEvent.Update -> update()
            is AlertsUiEvent.ToggleActive -> toggleActive(event.id, event.active)
            AlertsUiEvent.RefreshMatches -> loadMatches(_state.value.alerts, force = true)
            is AlertsUiEvent.Delete -> delete(event.id)
            is AlertsUiEvent.ToggleAlertChannel -> toggleAlertChannel(event.id, event.channel)
            is AlertsUiEvent.ToggleAlertDelivery -> toggleAlertDelivery(event.id)
            is AlertsUiEvent.ToggleAlertQuietHours -> toggleAlertQuietHours(event.id, event.enabled)
            AlertsUiEvent.ConsumeCreated -> _state.update { it.copy(justCreatedId = null) }
            AlertsUiEvent.ConsumePrefill -> _state.update { it.copy(justPrefill = false) }
            AlertsUiEvent.DismissError -> _state.update { it.copy(error = null, offline = false) }
            is AlertsUiEvent.UndoDelete -> restore(event.alert)
            AlertsUiEvent.ConsumeDeleted -> _state.update { it.copy(deletedAlert = null) }
        }
    }

    /**
     * Watchlist "create alert" navigates with [Alerts.listingId] > 0. WatchItem has no
     * make/model, so we load listing detail and copy make/model/district/max price into the form.
     */
    private fun prefillFromListingIfNeeded() {
        if (savedStateHandle.get<Boolean>(PREFILL_CONSUMED_KEY) == true) return
        val listingId = runCatching { savedStateHandle.toRoute<Alerts>() }.getOrNull()?.listingId ?: return
        if (listingId <= 0) return
        _state.update { it.copy(prefillFromListing = true) }
        viewModelScope.launch {
            runCatching { listings.getDetail(listingId) }
                .onSuccess { listing ->
                    savedStateHandle[PREFILL_CONSUMED_KEY] = true
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
                    if (listing.make.isNotBlank()) loadModels(listing.make)
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            offline = mapped is AppError.Network,
                            error = AlertsMessage.Failure(mapped),
                        )
                    }
                }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true, error = null, offline = false) }
            runCatching { repository.refresh() }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(offline = mapped is AppError.Network, error = AlertsMessage.Failure(mapped))
                    }
                }
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    /** Match-all + client-side filter (DATA_CONTRACT §2); bounded to 5 alerts. */
    private fun loadMatches(alerts: List<Alert>, force: Boolean = false) {
        if (alerts.isEmpty()) {
            _state.update { it.copy(matches = emptyList(), matchesLoading = false) }
            return
        }
        if (_state.value.matchesLoading && !force) return
        viewModelScope.launch {
            _state.update { it.copy(matchesLoading = true) }
            val groups = alerts.take(5).mapNotNull { alert ->
                runCatching { repository.match(alert.id, limit = 5) }.getOrNull()
            }
            _state.update { it.copy(matches = groups, matchesLoading = false) }
        }
    }

    private fun buildInput(f: AlertForm): AlertInput? = f.toAlertInput(_state.value.isPro)

    private fun create() {
        val f = _state.value.form
        if (!_state.value.signedIn) {
            // Alerts live on the server: a signed-out create used to fail with no visible feedback.
            _state.update { it.copy(signInRequired = true, error = null) }
            return
        }
        if (_state.value.freeCapReached) {
            _state.update { it.copy(error = AlertsMessage.Res(R.string.v19_alerts_err_cap)) }
            return
        }
        if (!_state.value.isPro && (f.whatsapp || f.telegram)) {
            _state.update { it.copy(error = AlertsMessage.Res(R.string.v19_alerts_err_pro_channels)) }
            return
        }
        val input = buildInput(f)
        if (input == null) {
            _state.update { it.copy(error = AlertsMessage.Res(formErrorRes(f))) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(creating = true, error = null, offline = false) }
            runCatching { repository.create(input) }
                .onSuccess { alert ->
                    _state.update { it.copy(creating = false, form = AlertForm(), justCreatedId = alert.id) }
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        if (mapped is AppError.Unauthorized) {
                            it.copy(creating = false, signInRequired = true)
                        } else {
                            it.copy(
                                creating = false,
                                offline = mapped is AppError.Network,
                                error = AlertsMessage.Failure(mapped),
                            )
                        }
                    }
                }
        }
    }

    /** Most specific validation copy for a form [AlertForm.toAlertInput] rejected. */
    @StringRes
    private fun formErrorRes(f: AlertForm): Int = when {
        f.make.isBlank() -> R.string.v19_alerts_err_make
        parseLkrShorthand(f.maxPrice) == null -> R.string.v19_alerts_err_price
        else -> R.string.v19_alerts_err_form
    }

    private fun prefill(id: Int) {
        val alert = _state.value.alerts.firstOrNull { it.id == id } ?: return
        _state.update {
            it.copy(
                editingId = id,
                form = alertFormFrom(alert),
                models = emptyList(),
            )
        }
        alert.make?.takeIf { it.isNotBlank() }?.let(::loadModels)
    }

    /**
     * In-place edit via [AlertsRepository.update] (PUT /alerts/{id}; legacy
     * create-then-delete only on pre-PUT backends). On failure the form stays
     * open and the error is surfaced; the original alert is left as it was.
     */
    private fun update() {
        val id = _state.value.editingId ?: return
        val input = buildInput(_state.value.form)
        if (input == null) {
            _state.update { it.copy(error = AlertsMessage.Res(formErrorRes(_state.value.form))) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(updating = true, error = null, offline = false) }
            runCatching { repository.update(id, input) }
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
                            error = if (mapped is AppError.Network) {
                                AlertsMessage.Failure(mapped)
                            } else {
                                AlertsMessage.Res(R.string.v19_alerts_err_save)
                            },
                        )
                    }
                    // Re-sync so the list reflects the server (legacy swap paths may have re-created it).
                    runCatching { repository.refresh() }
                }
        }
    }

    /** setActive workaround (DATA_CONTRACT §2): local Room toggle, reconciled on refresh. */
    private fun toggleActive(id: Int, active: Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(togglingIds = it.togglingIds + id) }
            runCatching { repository.setActive(id, active) }
                .onSuccess { runCatching { repository.refresh() } }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(offline = mapped is AppError.Network, error = AlertsMessage.Failure(mapped))
                    }
                }
            _state.update { it.copy(togglingIds = it.togglingIds - id) }
        }
    }

    private fun delete(id: Int) {
        val alert = _state.value.alerts.firstOrNull { it.id == id }
        viewModelScope.launch {
            runCatching { repository.delete(id) }
                .onSuccess { _state.update { it.copy(deletedAlert = alert) } }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(offline = mapped is AppError.Network, error = AlertsMessage.Failure(mapped))
                    }
                }
        }
    }

    /** Undo for delete: re-creates the alert with its original criteria, channels and paused state. */
    private fun restore(alert: Alert) {
        _state.update { it.copy(deletedAlert = null) }
        viewModelScope.launch {
            runCatching {
                val created = repository.create(alert.toRestoreInput())
                if (!alert.active) repository.setActive(created.id, false)
            }.onFailure { e ->
                if (e is kotlin.coroutines.cancellation.CancellationException) throw e
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(offline = mapped is AppError.Network, error = AlertsMessage.Failure(mapped))
                }
            }
        }
    }

    private fun toggleAlertChannel(id: Int, channel: String) {
        // In-app / email / push are free; only WhatsApp + Telegram are Pro-gated.
        val proOnly = channel == "whatsapp" || channel == "telegram"
        if (proOnly && !_state.value.isPro) {
            _state.update { it.copy(error = AlertsMessage.Res(R.string.v19_alerts_err_channels_pro)) }
            return
        }
        val alert = _state.value.alerts.firstOrNull { it.id == id } ?: return
        val next = parseNotifyChannels(alert.notifyChannels).toMutableSet()
        if (channel in next) next.remove(channel) else next.add(channel)
        if (next.isEmpty()) next.add("inapp")
        patchChannels(id, channels = ALERT_CHANNEL_ORDER.filter { it in next })
    }

    private fun toggleAlertDelivery(id: Int) {
        if (!_state.value.isPro) {
            _state.update { it.copy(error = AlertsMessage.Res(R.string.v19_alerts_err_digest_pro)) }
            return
        }
        val alert = _state.value.alerts.firstOrNull { it.id == id } ?: return
        val next = if (alert.deliveryMode == "digest") "instant" else "digest"
        patchChannels(id, deliveryMode = next)
    }

    private fun toggleAlertQuietHours(id: Int, enabled: Boolean) {
        if (!_state.value.isPro) {
            _state.update { it.copy(error = AlertsMessage.Res(R.string.v19_alerts_err_quiet_pro)) }
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
        viewModelScope.launch {
            _state.update { it.copy(channelUpdatingIds = it.channelUpdatingIds + id, error = null) }
            runCatching {
                repository.updateChannels(
                    id = id,
                    channels = channels,
                    deliveryMode = deliveryMode,
                    quietHoursEnabled = quietHoursEnabled,
                )
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(offline = mapped is AppError.Network, error = AlertsMessage.Failure(mapped))
                }
            }
            _state.update { it.copy(channelUpdatingIds = it.channelUpdatingIds - id) }
        }
    }

    companion object {
        private const val PREFILL_CONSUMED_KEY = "alerts_prefill_consumed"
    }
}
