package lk.motormila.app.ui.dealer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.data.local.datastore.SettingsStore
import lk.motormila.app.data.repository.DealerRepositoryImpl
import lk.motormila.app.domain.model.DealerBenchmark
import lk.motormila.app.domain.model.DealerClaim
import lk.motormila.app.domain.repository.DealerRepository

data class DealerClaimForm(
    val displayName: String = "",
    val phone: String = "",
    val email: String = "",
    val pattern: String = "",
    val url: String = "",
)

data class DealerUiState(
    val form: DealerClaimForm = DealerClaimForm(),
    val claiming: Boolean = false,
    /** Central claim token (SettingsStore.dealerClaimToken). Null = not claimed yet. */
    val claimToken: String? = null,
    val claimedName: String = "",
    /** Server-verified claim row (GET /dealer/me); null until verified. */
    val claimStatus: DealerClaim? = null,
    val verifyingClaim: Boolean = false,
    /** Server answered 403: verification is done manually by the MotorMila team. */
    val pendingManualVerification: Boolean = false,
    val refreshing: Boolean = false,
    val benchmarkUrls: String = "",
    val benchmarking: Boolean = false,
    val benchmark: DealerBenchmark? = null,
    val offline: Boolean = false,
    val error: String? = null,
)

sealed interface DealerUiEvent {
    data class FormChanged(val form: DealerClaimForm) : DealerUiEvent
    data object Claim : DealerUiEvent
    data object RefreshClaim : DealerUiEvent
    data class BenchmarkUrlsChanged(val urls: String) : DealerUiEvent
    data object RunBenchmark : DealerUiEvent
    data object SignOut : DealerUiEvent
    data object DismissError : DealerUiEvent
}

/**
 * Dealer claim flow. The claim_token lives in the central [SettingsStore]
 * (written by [DealerRepositoryImpl.claim], read here + surfaced in
 * Settings for debug) so process death never orphans a claim.
 */
@HiltViewModel
class DealerViewModel @Inject constructor(
    private val settingsStore: SettingsStore,
    private val repository: DealerRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DealerUiState())
    val state: StateFlow<DealerUiState> = _state.asStateFlow()

    private var lastVerifiedToken: String? = null

    init {
        viewModelScope.launch {
            settingsStore.observe().collect { settings ->
                val token = settings.dealerClaimToken
                _state.update { it.copy(claimToken = token) }
                if (token != null && token != lastVerifiedToken) {
                    lastVerifiedToken = token
                    verifyClaim(token)
                } else if (token == null) {
                    lastVerifiedToken = null
                    _state.update { it.copy(claimStatus = null) }
                }
            }
        }
    }

    fun onEvent(event: DealerUiEvent) {
        when (event) {
            is DealerUiEvent.FormChanged -> _state.update { it.copy(form = event.form) }
            DealerUiEvent.Claim -> claim()
            DealerUiEvent.RefreshClaim -> refreshClaim()
            is DealerUiEvent.BenchmarkUrlsChanged -> _state.update { it.copy(benchmarkUrls = event.urls) }
            DealerUiEvent.RunBenchmark -> runBenchmark()
            DealerUiEvent.SignOut -> signOut()
            DealerUiEvent.DismissError -> _state.update { it.copy(error = null, offline = false) }
        }
    }

    private fun claim() {
        val f = _state.value.form
        if (f.displayName.isBlank() || f.phone.isBlank() || f.email.isBlank()) {
            _state.update { it.copy(error = "Display name, phone and email are required to claim.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(claiming = true, error = null, offline = false) }
            runCatching {
                repository.claim(
                    dealerName = f.displayName.trim(),
                    contactEmail = f.email.trim(),
                    contactPhone = f.phone.trim().ifBlank { null },
                    sellerNamePattern = f.pattern.trim().ifBlank { null },
                    claimedUrl = f.url.trim().ifBlank { null },
                )
            }.onSuccess { res ->
                // Token persisted centrally by the impl; re-read it for the UI.
                val token = settingsStore.observe().first().dealerClaimToken
                _state.update {
                    it.copy(
                        claiming = false,
                        claimToken = token,
                        claimedName = f.displayName.trim(),
                        claimStatus = res,
                    )
                }
                token?.let { lastVerifiedToken = it }
                refreshClaim()
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(claiming = false, offline = mapped is AppError.Network, error = mapped.message)
                }
            }
        }
    }

    private fun refreshClaim() {
        val token = _state.value.claimToken
        if (token == null) {
            _state.update { it.copy(refreshing = false) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true, verifyingClaim = true, error = null) }
            verifyClaim(token)
            _state.update { it.copy(refreshing = false, verifyingClaim = false) }
        }
    }

    private suspend fun verifyClaim(token: String) {
        // myClaimStatus is cached-token based (null when absent) — no crash when signed out.
        runCatching { repository.myClaimStatus() }
            .onSuccess { status ->
                lastVerifiedToken = token
                _state.update { it.copy(claimStatus = status, offline = false, pendingManualVerification = false) }
            }
            .onFailure { e ->
                // Verification is an admin action (backend requires admin_token):
                // a 403 means "not verified yet", not an error to show the dealer.
                if ((e as? retrofit2.HttpException)?.code() == 403) {
                    _state.update { it.copy(pendingManualVerification = true, offline = false, error = null) }
                    return@onFailure
                }
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(offline = mapped is AppError.Network, error = mapped.message)
                }
            }
    }

    fun parsedUrls(): List<String> =
        _state.value.benchmarkUrls.lines().map { it.trim() }.filter { it.isNotBlank() }

    private fun runBenchmark() {
        val urls = parsedUrls()
        val name = _state.value.form.displayName.trim()
            .ifBlank { _state.value.claimedName.trim() }
        if (urls.isEmpty() && name.isBlank()) {
            _state.update { it.copy(error = "Claim first, then paste listing URLs to benchmark.") }
            return
        }
        if (urls.isEmpty() && name.isBlank()) {
            _state.update { it.copy(error = "Enter your dealership display name first.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(benchmarking = true, error = null, offline = false) }
            // URL-level aggregation lives on the impl (DATA_CONTRACT §4);
            // fall back to the name-scoped interface method without URLs.
            runCatching {
                val impl = repository as? DealerRepositoryImpl
                if (urls.isNotEmpty() && impl != null) {
                    impl.benchmarkUrls(name.ifBlank { "Your yard" }, urls)
                } else {
                    repository.benchmark(name.ifBlank { "Your yard" })
                }
            }.onSuccess { b -> _state.update { it.copy(benchmarking = false, benchmark = b) } }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(benchmarking = false, offline = mapped is AppError.Network, error = mapped.message)
                    }
                }
        }
    }

    private fun signOut() {
        viewModelScope.launch {
            runCatching { settingsStore.setDealerClaimToken(null) }
            lastVerifiedToken = null
            _state.update { it.copy(claimToken = null, claimedName = "", claimStatus = null, benchmark = null) }
        }
    }

    /** Reactive token for interceptors owned by the data layer. */
    val claimTokenFlow: Flow<String?> = settingsStore.observe().map { it.dealerClaimToken }
}
