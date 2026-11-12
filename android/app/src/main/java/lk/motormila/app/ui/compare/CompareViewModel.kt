package lk.motormila.app.ui.compare

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.ui.navigation.Compare

data class CompareUiState(
    val ids: List<Int> = emptyList(),
    val isLoading: Boolean = true,
    val items: List<Listing> = emptyList(),
    val error: String? = null,
    val onlyDifferences: Boolean = false,
) {
    companion object {
        const val MAX_IDS = CompareLogic.MAX
    }
}

sealed interface CompareUiEvent {
    data object Refresh : CompareUiEvent
    data class Remove(val id: Int) : CompareUiEvent
    data object ClearAll : CompareUiEvent
    data class OnlyDifferences(val on: Boolean) : CompareUiEvent
    data object DismissError : CompareUiEvent
}

/**
 * Compare tray persisted across screens: adding a car from Search/detail
 * (which navigates to Compare(listOf(id))) appends to the cars already being
 * compared instead of replacing them.
 */
internal class CompareTray(context: Context) {
    private val prefs = context.getSharedPreferences("motormila_compare", Context.MODE_PRIVATE)
    fun read(): List<Int> = prefs.getString(KEY, "").orEmpty().split(',').mapNotNull { it.trim().toIntOrNull() }
    fun write(ids: List<Int>) = prefs.edit().putString(KEY, ids.joinToString(",")).apply()
    private companion object { const val KEY = "ids" }
}

@HiltViewModel
class CompareViewModel @Inject constructor(
    private val repository: ListingRepository,
    @ApplicationContext context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val tray = CompareTray(context)

    private val navIds: List<Int> =
        runCatching { savedStateHandle.toRoute<Compare>().ids }.getOrNull()
            ?: savedStateHandle.get<String>("ids")?.split(",")?.mapNotNull { it.toIntOrNull() }
            ?: emptyList()

    private val _state = MutableStateFlow(CompareUiState(ids = CompareLogic.merge(tray.read(), navIds)))
    val state: StateFlow<CompareUiState> = _state.asStateFlow()

    init {
        tray.write(_state.value.ids)
        load()
    }

    /** Reconcile with a new nav arg while this VM is alive. */
    fun syncIds(ids: List<Int>) {
        val merged = CompareLogic.merge(_state.value.ids, ids)
        if (merged != _state.value.ids) {
            setIds(merged)
            load()
        }
    }

    fun onEvent(event: CompareUiEvent) {
        when (event) {
            CompareUiEvent.Refresh -> load()
            is CompareUiEvent.Remove -> {
                val ids = _state.value.ids - event.id
                tray.write(ids)
                _state.update { s -> s.copy(ids = ids, items = s.items.filter { it.id != event.id }) }
            }
            CompareUiEvent.ClearAll -> {
                tray.write(emptyList())
                _state.update { it.copy(ids = emptyList(), items = emptyList()) }
            }
            is CompareUiEvent.OnlyDifferences -> _state.update { it.copy(onlyDifferences = event.on) }
            CompareUiEvent.DismissError -> _state.update { it.copy(error = null) }
        }
    }

    private fun setIds(ids: List<Int>) {
        tray.write(ids)
        _state.update { it.copy(ids = ids) }
    }

    private fun load() {
        val ids = _state.value.ids
        if (ids.isEmpty()) {
            _state.update { it.copy(isLoading = false, items = emptyList()) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            // Load in parallel; a car that fails to load is dropped, not fatal.
            val results = ids.map { id -> async { runCatching { repository.getDetail(id) } } }.awaitAll()
            val items = results.mapNotNull { it.getOrNull() }
            val firstError = results.firstOrNull { it.isFailure }?.exceptionOrNull()
            _state.update {
                it.copy(
                    isLoading = false,
                    items = items,
                    error = if (items.isEmpty() && firstError != null) firstError.message ?: "Couldn't load comparison." else null,
                )
            }
        }
    }
}
