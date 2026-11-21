package lk.motormila.app.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.core.network.messageRes
import lk.motormila.app.domain.model.AppNotification
import lk.motormila.app.domain.repository.AlertsRepository
import lk.motormila.app.domain.repository.AuthRepository

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val signedIn: Boolean = false,
    val items: List<AppNotification> = emptyList(),
    val offline: Boolean = false,
    val error: Int? = null,
) {
    val unreadCount get() = items.count { !it.isRead }
}

sealed interface NotificationsUiEvent {
    data object Refresh : NotificationsUiEvent
    data class MarkRead(val id: Int) : NotificationsUiEvent
    data object MarkAllRead : NotificationsUiEvent
}

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val repository: AlertsRepository,
    auth: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsUiState())
    val state = _state.asStateFlow()
    private val actions = Mutex()
    private var accountJob = SupervisorJob(viewModelScope.coroutineContext[Job])

    init {
        viewModelScope.launch {
            auth.session().map { it?.token }.distinctUntilChanged().collect { identity ->
                accountJob.cancel()
                accountJob = SupervisorJob(viewModelScope.coroutineContext[Job])
                _state.value = NotificationsUiState(isLoading = identity != null, signedIn = identity != null)
                if (identity != null) onEvent(NotificationsUiEvent.Refresh)
            }
        }
    }

    fun onEvent(event: NotificationsUiEvent) {
        if (!_state.value.signedIn) return
        CoroutineScope(viewModelScope.coroutineContext + accountJob).launch {
            actions.withLock {
                _state.update { it.copy(isRefreshing = !it.isLoading, error = null) }
                try {
                    when (event) {
                        NotificationsUiEvent.Refresh -> {
                            val rows = repository.notifications(50)
                            _state.update { it.copy(items = rows) }
                        }
                        is NotificationsUiEvent.MarkRead -> {
                            repository.markNotificationRead(event.id)
                            _state.update { it.copy(items = it.items.map { n -> if (n.id == event.id) n.copy(isRead = true) else n }) }
                        }
                        NotificationsUiEvent.MarkAllRead -> {
                            repository.markAllNotificationsRead()
                            _state.update { it.copy(items = it.items.map { n -> n.copy(isRead = true) }) }
                        }
                    }
                    _state.update { it.copy(isLoading = false, isRefreshing = false, offline = false) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val mapped = ErrorMapper.map(e)
                    _state.update { it.copy(isLoading = false, isRefreshing = false, offline = mapped is AppError.Network, error = mapped.messageRes()) }
                }
            }
        }
    }
}
