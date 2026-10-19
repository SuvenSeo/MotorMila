package lk.motormila.app.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.model.AppNotification
import lk.motormila.app.domain.repository.AlertsRepository

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val items: List<AppNotification> = emptyList(),
    val unreadCount: Int = 0,
    val offline: Boolean = false,
    val error: String? = null,
)

sealed interface NotificationsUiEvent {
    data object Refresh : NotificationsUiEvent
    data class MarkRead(val id: String) : NotificationsUiEvent
    data object MarkAllRead : NotificationsUiEvent
    data object DismissError : NotificationsUiEvent
}

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    // Inbox rows are served by AlertsRepository (no NotificationsRepository exists).
    private val repository: AlertsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.observeNotifications()
                .catch { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            offline = mapped is AppError.Network,
                            error = mapped.message,
                        )
                    }
                }
                .collect { items ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            offline = false,
                            items = items,
                            unreadCount = items.count { n -> !n.isRead },
                        )
                    }
                }
        }
    }

    fun onEvent(event: NotificationsUiEvent) {
        when (event) {
            NotificationsUiEvent.Refresh -> refresh()
            is NotificationsUiEvent.MarkRead -> viewModelScope.launch {
                // Screen/NavGraph carry ids as String; domain ids are Int.
                // Non-numeric ids are ignored (graph drops them too).
                val id = event.id.toIntOrNull()
                if (id == null) {
                    _state.update { it.copy(error = "Couldn't open that notification.") }
                    return@launch
                }
                runCatching { repository.markNotificationRead(id) }
                    .onFailure { e ->
                        val mapped = ErrorMapper.map(e)
                        _state.update {
                            it.copy(offline = mapped is AppError.Network, error = mapped.message)
                        }
                    }
            }
            NotificationsUiEvent.MarkAllRead -> viewModelScope.launch {
                // Backend POST /notifications/read-all marks everything server-side
                // in one call (previously marked rows one by one).
                runCatching { repository.markAllNotificationsRead() }
                    .onFailure { e ->
                        val mapped = ErrorMapper.map(e)
                        _state.update {
                            it.copy(offline = mapped is AppError.Network, error = mapped.message)
                        }
                    }
            }
            NotificationsUiEvent.DismissError -> _state.update { it.copy(error = null, offline = false) }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true, error = null, offline = false) }
            // observeNotifications() re-emits from network; warm it here so pull-to-refresh settles.
            runCatching { repository.notifications() }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(offline = mapped is AppError.Network, error = mapped.message)
                    }
                }
            _state.update { it.copy(isRefreshing = false) }
        }
    }
}
