package lk.motormila.app.ui.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.locale.LocaleHelper
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.data.local.datastore.SettingsStore
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.FeedbackRequestDto
import lk.motormila.app.domain.repository.AuthRepository

data class SettingsUiState(
    val feedbackDraft: String = "",
    val sendingFeedback: Boolean = false,
    val feedbackSent: Boolean = false,
    val clearingCache: Boolean = false,
    val cacheCleared: Boolean = false,
    val loggingOut: Boolean = false,
    val loggedOut: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null,
    val signedIn: Boolean = false,
    val deletingAccount: Boolean = false,
    val deleteDialogOpen: Boolean = false,
    val deletePassword: String = "",
)

sealed interface SettingsUiEvent {
    data class ThemeChanged(val theme: String) : SettingsUiEvent
    data class LanguageChanged(val code: String) : SettingsUiEvent
    data class DistrictChanged(val district: String) : SettingsUiEvent
    data class SortChanged(val sort: String) : SettingsUiEvent
    data class BiometricChanged(val enabled: Boolean) : SettingsUiEvent
    data class BaseUrlChanged(val url: String) : SettingsUiEvent
    data class FeedbackChanged(val text: String) : SettingsUiEvent
    data object OpenDeleteAccount : SettingsUiEvent
    data object CloseDeleteAccount : SettingsUiEvent
    data class DeletePasswordChanged(val password: String) : SettingsUiEvent
    data object ConfirmDeleteAccount : SettingsUiEvent
    data object SendFeedback : SettingsUiEvent
    data object ClearCache : SettingsUiEvent
    data object ConsumeCacheCleared : SettingsUiEvent
    data object Logout : SettingsUiEvent
    data object ConsumeLoggedOut : SettingsUiEvent
    data object DismissError : SettingsUiEvent
    data class ReduceTransparencyChanged(val enabled: Boolean) : SettingsUiEvent
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsStore: SettingsStore,
    private val authRepository: AuthRepository,
    // Feedback posts straight to POST /feedback (no FeedbackRepository exists).
    private val api: MotormilaApiService,
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    val theme: StateFlow<String> = settingsStore.observe()
        .map { it.theme }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsStore.DEFAULT_THEME)

    val language: StateFlow<String> = settingsStore.observe()
        .map { LocaleHelper.normalize(it.language) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LocaleHelper.DEFAULT)

    val defaultDistrict: StateFlow<String> = settingsStore.observe()
        .map { it.district ?: "Colombo" }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "Colombo")
    val defaultSort: StateFlow<String> = settingsStore.observe()
        .map { it.sort }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "newest")
    val reduceTransparency: StateFlow<Boolean> = settingsStore.observe()
        .map { it.reduceTransparency }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val biometricEnabled: StateFlow<Boolean> = settingsStore.observe()
        .map { it.biometricEnabled }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val baseUrl: StateFlow<String> = settingsStore.observe()
        .map { it.baseUrlOverride ?: "" }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")

    /** Central dealer claim token (debug surface; Dealer screen owns the flow). */
    val claimToken: StateFlow<String?> = settingsStore.observe()
        .map { it.dealerClaimToken }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        viewModelScope.launch {
            LocaleHelper.applyFromStore(
                LocaleHelper.normalize(settingsStore.observe().first().language),
            )
        }
    }

    fun onEvent(event: SettingsUiEvent) {
        when (event) {
            is SettingsUiEvent.ThemeChanged -> launch { settingsStore.setTheme(event.theme) }
            is SettingsUiEvent.LanguageChanged -> launch {
                val code = LocaleHelper.normalize(event.code)
                settingsStore.setLanguage(code)
                LocaleHelper.apply(code)
            }
            is SettingsUiEvent.DistrictChanged -> launch { settingsStore.setDistrict(event.district) }
            is SettingsUiEvent.SortChanged -> launch { settingsStore.setSort(event.sort) }
            is SettingsUiEvent.ReduceTransparencyChanged -> launch { settingsStore.setReduceTransparency(event.enabled) }
            is SettingsUiEvent.BiometricChanged -> launch { settingsStore.setBiometricEnabled(event.enabled) }
            is SettingsUiEvent.BaseUrlChanged -> launch {
                settingsStore.setBaseUrlOverride(event.url.ifBlank { null })
            }
            is SettingsUiEvent.FeedbackChanged ->
                _state.update { it.copy(feedbackDraft = event.text, feedbackSent = false) }
            SettingsUiEvent.SendFeedback -> sendFeedback()
            SettingsUiEvent.ClearCache -> clearCache()
            SettingsUiEvent.ConsumeCacheCleared -> _state.update { it.copy(cacheCleared = false) }
            SettingsUiEvent.Logout -> logout()
            SettingsUiEvent.OpenDeleteAccount ->
                _state.update { it.copy(deleteDialogOpen = true, deletePassword = "") }
            SettingsUiEvent.CloseDeleteAccount ->
                _state.update { it.copy(deleteDialogOpen = false, deletePassword = "") }
            is SettingsUiEvent.DeletePasswordChanged ->
                _state.update { it.copy(deletePassword = event.password) }
            SettingsUiEvent.ConfirmDeleteAccount -> deleteAccount()
            SettingsUiEvent.ConsumeLoggedOut -> _state.update { it.copy(loggedOut = false) }
            SettingsUiEvent.DismissError -> _state.update { it.copy(error = null, offline = false) }
        }
    }

    private fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            runCatching { block() }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(offline = mapped is AppError.Network, error = mapped.message)
                    }
                }
        }
    }

    private fun sendFeedback() {
        val text = _state.value.feedbackDraft.trim()
        if (text.length < 10) {
            _state.update { it.copy(error = "Tell us a little more (10+ characters).") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(sendingFeedback = true, error = null, offline = false) }
            runCatching { api.feedback(FeedbackRequestDto(message = text)) }
                .onSuccess { _state.update { it.copy(sendingFeedback = false, feedbackDraft = "", feedbackSent = true) } }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            sendingFeedback = false,
                            offline = mapped is AppError.Network,
                            error = mapped.message,
                        )
                    }
                }
        }
    }

    /** Clears Coil's memory + disk image caches (real eviction, not a placebo). */
    private fun clearCache() {
        viewModelScope.launch {
            _state.update { it.copy(clearingCache = true) }
            runCatching {
                val loader = coil3.SingletonImageLoader.get(context)
                loader.memoryCache?.clear()
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { loader.diskCache?.clear() }
            }
            _state.update { it.copy(clearingCache = false, cacheCleared = true) }
        }
    }

    init {
        viewModelScope.launch {
            authRepository.session().collect { session ->
                _state.update { it.copy(signedIn = session != null) }
            }
        }
    }

    /** Permanent server-side deletion (Play policy), then a full local sign-out. */
    private fun deleteAccount() {
        if (_state.value.deletingAccount) return
        val password = _state.value.deletePassword
        viewModelScope.launch {
            _state.update { it.copy(deletingAccount = true, error = null, offline = false) }
            runCatching {
                authRepository.deleteAccount(password)
                WorkManager.getInstance(context).cancelAllWork()
            }.onSuccess {
                _state.update {
                    it.copy(deletingAccount = false, deleteDialogOpen = false, deletePassword = "", loggedOut = true)
                }
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(
                        deletingAccount = false,
                        offline = mapped is AppError.Network,
                        error = mapped.message,
                    )
                }
            }
        }
    }

    private fun logout() {
        viewModelScope.launch {
            _state.update { it.copy(loggingOut = true, offline = false) }
            runCatching {
                // Cancel background sync/alert workers so a signed-out device goes quiet.
                WorkManager.getInstance(context).cancelAllWork()
                authRepository.logout()
            }.onSuccess {
                _state.update { it.copy(loggingOut = false, loggedOut = true) }
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(
                        loggingOut = false,
                        offline = mapped is AppError.Network,
                        error = mapped.message,
                    )
                }
            }
        }
    }
}
