package lk.motormila.app.ui.compare

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.domain.model.Listing
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.ui.navigation.Compare

/** A tray slot survives a failed fetch; its ID remains visible and actionable. */
data class CompareEntry(val id: Int, val listing: Listing? = null, val loading: Boolean = false)

data class CompareUiState(
    val entries: List<CompareEntry> = emptyList(),
    val onlyDifferences: Boolean = false,
) {
    val ids: List<Int> get() = entries.map { it.id }

    companion object {
        const val MAX_IDS = CompareLogic.MAX
    }
}

sealed interface CompareUiEvent {
    data object Refresh : CompareUiEvent
    data class Remove(val id: Int) : CompareUiEvent
    data object ClearAll : CompareUiEvent
    data class OnlyDifferences(val on: Boolean) : CompareUiEvent
    data class Retry(val id: Int) : CompareUiEvent
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

    private val _state = MutableStateFlow(CompareUiState())
    private val loads = mutableMapOf<Int, Job>()
    private var lastNavIds = navIds
    val state: StateFlow<CompareUiState> = _state.asStateFlow()

    init { setIds(CompareLogic.merge(tray.read(), navIds)) }

    fun syncIds(ids: List<Int>) {
        // Back from the picker (without selection) or Detail is not a new Add.
        if (ids == lastNavIds) return
        lastNavIds = ids
        setIds(CompareLogic.merge(_state.value.ids, ids))
    }

    fun onEvent(event: CompareUiEvent) {
        when (event) {
            CompareUiEvent.Refresh -> _state.value.ids.forEach(::load)
            is CompareUiEvent.Retry -> load(event.id)
            is CompareUiEvent.Remove -> setIds(_state.value.ids - event.id)
            CompareUiEvent.ClearAll -> setIds(emptyList())
            is CompareUiEvent.OnlyDifferences -> _state.update { it.copy(onlyDifferences = event.on) }
        }
    }

    private fun setIds(ids: List<Int>) {
        val previous = _state.value.entries.associateBy { it.id }
        (previous.keys - ids.toSet()).forEach { loads.remove(it)?.cancel() }
        tray.write(ids)
        _state.update { state -> state.copy(entries = ids.map { previous[it] ?: CompareEntry(it) }) }
        ids.filterNot(previous::containsKey).forEach(::load)
    }

    private fun load(id: Int) {
        if (id !in _state.value.ids || loads[id]?.isActive == true) return
        updateEntry(id) { it.copy(loading = true) }
        loads[id] = viewModelScope.launch {
            val listing = try {
                repository.getDetail(id).takeIf { it.id == id }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null // Missing in a snapshot or a network failure is not proof the ad is gone.
            }
            ensureActive()
            updateEntry(id) { CompareEntry(id, listing) }
        }
    }

    private fun updateEntry(id: Int, change: (CompareEntry) -> CompareEntry) {
        _state.update { state -> state.copy(entries = state.entries.map { if (it.id == id) change(it) else it }) }
    }
}
