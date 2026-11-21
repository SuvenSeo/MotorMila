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
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.entity.WatchlistEntity
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.model.WatchItem
import lk.motormila.app.domain.repository.WatchlistRepository
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
 * [expiresAtMs] so the Undo snackbar can restore them. A second removal inside
 * the window merges into the pending one, so Undo never silently drops the first.
 */
data class WatchlistUndo(
    val items: List<WatchItem>,
    val isClearAll: Boolean,
    val expiresAtMs: Long,
    /**
     * Full stored rows (original title, add-price baseline, addedAt, typical
     * price) re-inserted verbatim on Undo; empty when the DB isn't available.
     */
    val rows: List<WatchlistEntity> = emptyList(),
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
    private val repository: WatchlistRepository,
    // Nullable + default keeps manual (test) construction source-compatible;
    // Hilt always injects the real application context.
    @ApplicationContext private val appContext: Context? = null,
    // Direct row access so Undo can restore the exact stored entities (the
    // repository's add() re-baselines the price-drop snapshot).
    private val db: MotormilaDatabase? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(WatchlistUiState())
    val state: StateFlow<WatchlistUiState> = _state.asStateFlow()

    private var observeJob: Job? = null
    private var undoExpiryJob: Job? = null

    init {
        observe()
    }

    fun onEvent(event: WatchlistUiEvent) {
        when (event) {
            WatchlistUiEvent.Refresh -> observe(refresh = true)
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

    private fun observe(refresh: Boolean = false) {
        // One collector at a time: pull-to-refresh used to stack a new
        // collect on every refresh.
        observeJob?.cancel()
        observeJob = viewModelScope.launch {
            if (refresh) _state.update { it.copy(isRefreshing = true, error = null) }
            observeWatchlist()
                .catch { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = str(R.string.v19_watch_err_load, "Couldn't load your watchlist."),
                        )
                    }
                }
                .collect { items ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
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
            val rows = snapshotRows(setOf(id))
            runCatching { repository.removeFromWatchlist(id) }
                .onSuccess { if (item != null) offerUndo(listOf(item), isClearAll = false, rows = rows) }
                .onFailure {
                    _state.update {
                        it.copy(error = str(R.string.v19_watch_err_remove, "Couldn't remove that listing."))
                    }
                }
        }
    }

    /** Stored rows for [ids], read before deletion so Undo can re-insert them unchanged. */
    private suspend fun snapshotRows(ids: Set<Int>?): List<WatchlistEntity> {
        val dao = db?.watchlistDao() ?: return emptyList()
        return runCatching { dao.getAll() }.getOrDefault(emptyList())
            .filter { ids == null || it.listingId in ids }
    }

    /** Best-effort network refresh of last-known prices (Room-backed). */
    fun refreshPrices() {
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true, error = null) }
            runCatching { repository.refreshPrices() }
                .onFailure {
                    _state.update {
                        it.copy(error = str(R.string.v19_watch_err_refresh, "Couldn't refresh prices."))
                    }
                }
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    private fun clearAll() {
        val cleared = _state.value.items
        viewModelScope.launch {
            val rows = snapshotRows(ids = null)
            runCatching { repository.clear() }
                .onSuccess { offerUndo(cleared, isClearAll = true, rows = rows) }
                .onFailure {
                    _state.update {
                        it.copy(error = str(R.string.v19_watch_err_clear, "Couldn't clear your watchlist."))
                    }
                }
        }
    }

    /**
     * Retain the removed entities until the undo window expires. A removal
     * while another Undo is still pending merges into it (one snackbar, one
     * Undo that restores everything) instead of discarding the earlier one.
     */
    private fun offerUndo(items: List<WatchItem>, isClearAll: Boolean, rows: List<WatchlistEntity>) {
        if (items.isEmpty()) return
        val previous = _state.value.pendingUndo
            ?.takeIf { System.currentTimeMillis() <= it.expiresAtMs }
        val undo = if (previous == null) {
            WatchlistUndo(items, isClearAll, System.currentTimeMillis() + UNDO_WINDOW_MS, rows)
        } else {
            val newIds = items.map { it.id }.toSet()
            val newRowIds = rows.map { it.listingId }.toSet()
            WatchlistUndo(
                items = previous.items.filter { it.id !in newIds } + items,
                isClearAll = previous.isClearAll || isClearAll,
                expiresAtMs = System.currentTimeMillis() + UNDO_WINDOW_MS,
                rows = previous.rows.filter { it.listingId !in newRowIds } + rows,
            )
        }
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
            val dao = db?.watchlistDao()
            val rowsById = undo.rows.associateBy { it.listingId }
            var failed = false
            undo.items.forEach { item ->
                val row = rowsById[item.id]
                runCatching {
                    // Exact stored row when we have it (keeps title, add-price
                    // baseline and addedAt); otherwise the lossy re-add path.
                    if (dao != null && row != null) dao.upsert(row) else repository.add(item.toListing())
                }.onFailure { failed = true }
            }
            if (failed) {
                _state.update {
                    it.copy(error = str(R.string.v19_watch_err_restore, "Couldn't restore the removed items."))
                }
            }
        }
    }

    private fun dismissUndo() {
        undoExpiryJob?.cancel()
        undoExpiryJob = null
        _state.update { it.copy(pendingUndo = null) }
    }

    /**
     * Fallback re-add path for Undo when no stored row was captured (no DB in
     * tests). [WatchlistRepository.add] re-baselines the drop snapshot at the
     * current price; the title is carried over so the row is never blank.
     */
    private fun WatchItem.toListing(): Listing = Listing(
        id = id,
        title = title,
        make = "",
        model = "",
        year = null,
        priceLkr = priceLkr,
        mileageKm = null,
        fuelType = null,
        transmission = null,
        condition = null,
        bodyType = null,
        district = district,
        city = null,
        source = null,
        thumbnailUrl = thumbnailUrl,
        dealScore = null,
        marketMedianLkr = fmvLkr,
        scrapedAt = null,
        firstSeenAt = null,
        lastSeenAt = null,
        detailUrl = null,
        externalUrl = null,
        engineCc = null,
    )

    private companion object {
        /** Longer than the Undo snackbar so a late tap still restores. */
        const val UNDO_WINDOW_MS = 15_000L
    }
}
