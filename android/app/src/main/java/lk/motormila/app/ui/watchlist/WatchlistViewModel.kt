package lk.motormila.app.ui.watchlist

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.data.repository.WatchlistRepositoryImpl
import lk.motormila.app.domain.usecase.ObserveWatchlistUseCase

data class WatchlistUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val items: List<WatchItem> = emptyList(),
    /** Ids whose price dropped since previous snapshot — flash these rows. */
    val droppedIds: Set<Int> = emptySet(),
    val error: String? = null,
    /** Cleared entities retained in memory until the undo window expires. */
    val pendingUndo: WatchlistUndo? = null,
)

/**
 * A removal (single swipe or Clear all) whose entities are kept until
 * [expiresAtMs] so the Undo snackbar can restore them.
 */
data class WatchlistUndo(
    val items: List<WatchItem>,
    val isClearAll: Boolean,
    val expiresAtMs: Long,
)

sealed interface WatchlistUiEvent {
    data object Refresh : WatchlistUiEvent
    data object RefreshPrices : WatchlistUiEvent
    data class Remove(val id: Int) : WatchlistUiEvent
    data object ClearAll : WatchlistUiEvent
    data object Undo : WatchlistUiEvent
    data object DismissUndo : WatchlistUiEvent
    data object DismissError : WatchlistUiEvent
}

@HiltViewModel
class WatchlistViewModel @Inject constructor(
    private val observeWatchlist: ObserveWatchlistUseCase,
    private val repository: WatchlistRepositoryImpl,
    // Nullable + default keeps manual (test) construction source-compatible;
    // Hilt always injects the real application context.
    @ApplicationContext private val appContext: Context? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(WatchlistUiState())
    val state: StateFlow<WatchlistUiState> = _state.asStateFlow()

    internal val checks = repository.observeChecks()

    private var observeJob: Job? = null
    private var undoExpiryJob: Job? = null

    init {
        observe()
    }

    fun onEvent(event: WatchlistUiEvent) {
        when (event) {
            WatchlistUiEvent.Refresh -> observe()
            WatchlistUiEvent.RefreshPrices -> refreshPrices()
            is WatchlistUiEvent.Remove -> remove(event.id)
            WatchlistUiEvent.ClearAll -> clearAll()
            WatchlistUiEvent.Undo -> undo()
            WatchlistUiEvent.DismissUndo -> dismissUndo()
            WatchlistUiEvent.DismissError -> _state.update { it.copy(error = null) }
        }
    }

    private fun str(resId: Int, fallback: String, vararg args: Any): String =
        appContext?.getString(resId, *args) ?: fallback

    private fun observe() {
        // One collector at a time: pull-to-refresh used to stack a new
        // collect on every refresh.
        observeJob?.cancel()
        observeJob = viewModelScope.launch {
            observeWatchlist()
                .catch { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = e.message ?: str(R.string.v19_watch_err_load, "Couldn't load your watchlist."),
                        )
                    }
                }
                .collect { items ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            items = items,
                            droppedIds = items
                                .filter { w -> w.hasPriceDrop }
                                .map { w -> w.id }
                                .toSet(),
                        )
                    }
                }
        }
    }

    private fun remove(id: Int) {
        val item = _state.value.items.firstOrNull { it.id == id }
        viewModelScope.launch {
            runCatching { repository.removeFromWatchlist(id) }
                .onSuccess { if (item != null) offerUndo(listOf(item), isClearAll = false) }
                .onFailure { e ->
                    _state.update {
                        it.copy(error = e.message ?: str(R.string.v19_watch_err_remove, "Couldn't remove that listing."))
                    }
                }
        }
    }

    /** Best-effort network refresh of last-known prices (Room-backed). */
    fun refreshPrices() {
        if (_state.value.isRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true, error = null) }
            runCatching { repository.refreshPrices() }
                .onFailure { e ->
                    _state.update {
                        it.copy(error = e.message ?: str(R.string.v19_watch_err_refresh, "Couldn't refresh prices."))
                    }
                }
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    private fun clearAll() {
        val cleared = _state.value.items
        viewModelScope.launch {
            runCatching { repository.clear() }
                .onSuccess { offerUndo(cleared, isClearAll = true) }
                .onFailure { e ->
                    _state.update {
                        it.copy(error = e.message ?: str(R.string.v19_watch_err_clear, "Couldn't clear your watchlist."))
                    }
                }
        }
    }

    /** Retain the cleared entities until the undo window expires. */
    private fun offerUndo(items: List<WatchItem>, isClearAll: Boolean) {
        if (items.isEmpty()) return
        val undo = WatchlistUndo(items, isClearAll, System.currentTimeMillis() + UNDO_WINDOW_MS)
        _state.update { it.copy(pendingUndo = undo) }
        undoExpiryJob?.cancel()
        undoExpiryJob = viewModelScope.launch {
            delay(UNDO_WINDOW_MS)
            _state.update { if (it.pendingUndo === undo) it.copy(pendingUndo = null) else it }
        }
    }

    private fun undo() {
        val undo = _state.value.pendingUndo ?: return
        dismissUndo()
        if (System.currentTimeMillis() > undo.expiresAtMs) return
        viewModelScope.launch {
            undo.items.forEach { item ->
                runCatching { repository.restore(item) }
                    .onFailure { e ->
                        _state.update {
                            it.copy(error = e.message ?: str(R.string.v19_watch_err_restore, "Couldn't restore the removed items."))
                        }
                    }
            }
        }
    }

    private fun dismissUndo() {
        undoExpiryJob?.cancel()
        undoExpiryJob = null
        _state.update { it.copy(pendingUndo = null) }
    }

    private companion object {
        /** Longer than the Undo snackbar so a late tap still restores. */
        const val UNDO_WINDOW_MS = 15_000L
    }
}
