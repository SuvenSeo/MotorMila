package lk.motormila.app.ui.pro

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.BuildConfig
import lk.motormila.app.R
import lk.motormila.app.billing.BillingState
import lk.motormila.app.billing.PlayBillingDataSource
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.data.repository.ProRepositoryImpl
import lk.motormila.app.domain.model.ArbitrageGap
import lk.motormila.app.domain.model.ProDistrict
import lk.motormila.app.domain.model.ProSnapshot
import lk.motormila.app.domain.model.VehicleLane
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.domain.repository.ProRepository

data class ProUiState(
    val isPro: Boolean = false,
    val planName: String = "Free",
    val isLoading: Boolean = true,
    val offline: Boolean = false,
    val snapshot: ProSnapshot? = null,
    val lanes: List<VehicleLane> = emptyList(),
    val districts: List<ProDistrict> = emptyList(),
    val arbitrage: List<ArbitrageGap> = emptyList(),
    /** Gap-pct gate for the "significant gap" highlight (3 / 5 / 8). */
    val arbitrageThresholdPct: Double = ProViewModel.DEFAULT_ARB_THRESHOLD_PCT,
    /** "make|model" key of the lane whose detail card is expanded. */
    val selectedLaneKey: String? = null,
    val laneDetail: VehicleLane? = null,
    val loadingDetail: Boolean = false,
    /** District whose inline detail card is expanded. */
    val districtDetailKey: String? = null,
    val districtDetail: ProDistrict? = null,
    val detailError: String? = null,
    val billingLoading: Boolean = false,
    val billingError: String? = null,
    /** Localised billing message (string resource id), shown once as a snackbar. */
    val billingMessageRes: Int? = null,
    /** Manual-provider note from checkout-intent (contact-sales fallback). */
    val checkoutMessage: String? = null,
    val checkoutUrl: String? = null,
    val error: String? = null,
)

sealed interface ProUiEvent {
    data object Refresh : ProUiEvent
    /** Static-URL fallback when no Activity is available (see onCheckout). */
    data object CheckoutIntent : ProUiEvent
    data object ConsumeCheckout : ProUiEvent
    data class SelectLane(val make: String, val model: String) : ProUiEvent
    data class ToggleDistrictDetail(val district: String) : ProUiEvent
    data class ThresholdChanged(val pct: Double) : ProUiEvent
    data object DismissError : ProUiEvent
}

@HiltViewModel
class ProViewModel @Inject constructor(
    private val proRepository: ProRepository,
    private val billing: PlayBillingDataSource,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ProUiState())
    val state: StateFlow<ProUiState> = _state.asStateFlow()

    /** Native Play purchase states (Idle/Loading/Purchased/Error) for the paywall. */
    val billingState: StateFlow<BillingState> = billing.state
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BillingState.Idle)

    init {
        viewModelScope.launch {
            // AuthRepository.session() is the session source of truth (no SessionRepository exists).
            authRepository.session().collect { session ->
                val isPro = session?.isPro == true
                val plan = session?.plan?.ifBlank { null }?.replaceFirstChar { c -> c.uppercase() } ?: "Free"
                val wasPro = _state.value.isPro
                _state.update { it.copy(isPro = isPro, planName = plan) }
                if (isPro && !wasPro) loadSnapshot() else if (!isPro) _state.update { it.copy(isLoading = false) }
            }
        }
    }

    fun onEvent(event: ProUiEvent) {
        when (event) {
            ProUiEvent.Refresh -> if (_state.value.isPro) loadSnapshot() else {
                _state.update { it.copy(offline = false, error = null) }
            }
            ProUiEvent.CheckoutIntent -> checkout()
            ProUiEvent.ConsumeCheckout -> _state.update { it.copy(checkoutUrl = null, checkoutMessage = null) }
            is ProUiEvent.SelectLane -> selectLane(event.make, event.model)
            is ProUiEvent.ToggleDistrictDetail -> toggleDistrictDetail(event.district)
            is ProUiEvent.ThresholdChanged -> _state.update { it.copy(arbitrageThresholdPct = event.pct) }
            ProUiEvent.DismissError ->
                _state.update {
                    it.copy(error = null, detailError = null, billingError = null, billingMessageRes = null, offline = false)
                }
        }
    }

    private fun loadSnapshot() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null, offline = false) }
            runCatching {
                val snap = proRepository.snapshot()
                val lanes = runCatching { proRepository.lanes() }.getOrDefault(emptyList())
                val districts = runCatching { proRepository.districts() }.getOrDefault(emptyList())
                val arb = loadArbitrage(lanes)
                snap to Triple(lanes, districts, arb)
            }.onSuccess { (snap, rest) ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        offline = false,
                        snapshot = snap,
                        lanes = rest.first,
                        districts = rest.second,
                        arbitrage = rest.third,
                    )
                }
            }.onFailure { e ->
                val mapped = ErrorMapper.map(e)
                _state.update {
                    it.copy(
                        isLoading = false,
                        offline = mapped is AppError.Network,
                        error = mapped.message,
                    )
                }
            }
        }
    }

    /**
     * Arbitrage workaround (DATA_CONTRACT §2): the interface default is
     * unscoped and returns empty, because the backend requires a `make`.
     * Aggregate [ProRepositoryImpl.arbitrageFor] across the top makes by
     * volume so the pairs section actually populates.
     */
    private suspend fun loadArbitrage(lanes: List<VehicleLane>): List<ArbitrageGap> {
        val direct = runCatching { proRepository.arbitrage() }.getOrDefault(emptyList())
        if (direct.isNotEmpty()) return direct.sortedByDescending { it.gapPct }.take(10)
        val impl = proRepository as? ProRepositoryImpl ?: return emptyList()
        val makes = lanes.sortedByDescending { it.listingCount }
            .take(3).map { it.make }.filter { it.isNotBlank() }.distinct()
        return makes.flatMap { make ->
            runCatching { impl.arbitrageFor(make) }.getOrDefault(emptyList())
        }.distinctBy { Triple(it.buyDistrict, it.sellDistrict, it.gapPct) }
            .sortedByDescending { it.gapPct }
            .take(10)
    }

    private fun selectLane(make: String, model: String) {
        val key = "$make|$model"
        if (_state.value.selectedLaneKey == key) {
            _state.update { it.copy(selectedLaneKey = null, laneDetail = null, detailError = null) }
            return
        }
        _state.update { it.copy(selectedLaneKey = key, laneDetail = null, detailError = null, loadingDetail = true) }
        viewModelScope.launch {
            runCatching { proRepository.laneDetail(make, model) }
                .onSuccess { detail ->
                    // Ignore stale responses after the user collapsed/toggled lanes.
                    if (_state.value.selectedLaneKey == key) {
                        _state.update { it.copy(loadingDetail = false, laneDetail = detail) }
                    }
                }
                .onFailure { e ->
                    if (_state.value.selectedLaneKey == key) {
                        _state.update {
                            it.copy(loadingDetail = false, detailError = ErrorMapper.map(e).message)
                        }
                    }
                }
        }
    }

    private fun toggleDistrictDetail(district: String) {
        if (_state.value.districtDetailKey == district) {
            _state.update { it.copy(districtDetailKey = null, districtDetail = null, detailError = null) }
            return
        }
        _state.update { it.copy(districtDetailKey = district, districtDetail = null, detailError = null, loadingDetail = true) }
        viewModelScope.launch {
            runCatching { proRepository.districtDetail(district) }
                .onSuccess { detail ->
                    if (_state.value.districtDetailKey == district) {
                        _state.update { it.copy(loadingDetail = false, districtDetail = detail) }
                    }
                }
                .onFailure { e ->
                    if (_state.value.districtDetailKey == district) {
                        _state.update {
                            it.copy(loadingDetail = false, detailError = ErrorMapper.map(e).message)
                        }
                    }
                }
        }
    }

    /**
     * Play-first checkout: try the native Play Billing flow when the product
     * is configured; fall back to server checkout-intent (manual / PayHere /
     * Stripe URL opened via onOpenCheckout). Needs the host Activity for
     * [PlayBillingDataSource.launchProUpgrade].
     */
    fun onCheckout(activity: Activity) {
        if (_state.value.billingLoading) return
        viewModelScope.launch {
            _state.update { it.copy(billingLoading = true, billingError = null) }
            if (BuildConfig.PLAY_BILLING_ENABLED) {
                // Play flavor: Play Billing is the ONLY payment path (policy).
                // The purchase is verified server-side against this account,
                // so a signed-in session is required first.
                val signedIn = runCatching { authRepository.session().first() != null }.getOrDefault(false)
                if (!signedIn) {
                    _state.update { it.copy(billingLoading = false, billingMessageRes = R.string.billing_sign_in_first) }
                    return@launch
                }
                val native = runCatching { billing.launchProUpgrade(activity, PRO_PRODUCT_ID) }.getOrDefault(false)
                _state.update {
                    it.copy(
                        billingLoading = false,
                        billingMessageRes = if (native) null else R.string.billing_play_unavailable,
                    )
                }
                return@launch
            }
            if (!BuildConfig.EXTERNAL_CHECKOUT_ENABLED) {
                _state.update { it.copy(billingLoading = false, billingMessageRes = R.string.billing_play_unavailable) }
                return@launch
            }
            runCatching { billing.checkoutIntent("pro") }
                .onSuccess { info ->
                    if (!info.checkoutUrl.isNullOrBlank()) {
                        _state.update {
                            it.copy(
                                billingLoading = false,
                                checkoutUrl = info.checkoutUrl,
                                checkoutMessage = info.message.takeIf { _ -> info.provider == "manual" },
                            )
                        }
                    } else {
                        _state.update {
                            it.copy(
                                billingLoading = false,
                                billingError = info.message.ifBlank { "Checkout is handled manually for now." },
                            )
                        }
                    }
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            billingLoading = false,
                            billingError = mapped.message,
                            offline = mapped is AppError.Network && it.snapshot == null,
                        )
                    }
                }
        }
    }

    private fun checkout() {
        // No-Activity fallback: static Pro page (opened via LocalUriHandler).
        // Never in the Play flavor (no external payment links for digital goods).
        if (!BuildConfig.EXTERNAL_CHECKOUT_ENABLED) {
            _state.update { it.copy(billingMessageRes = R.string.billing_play_unavailable) }
            return
        }
        _state.update { it.copy(checkoutUrl = null) }
        _state.update { it.copy(checkoutUrl = CHECKOUT_URL) }
    }

    companion object {
        const val CHECKOUT_URL = "https://motormila.pages.dev/pro"
        /** Play Console subscription id — confirm with the release checklist before launch. */
        const val PRO_PRODUCT_ID = "motormila_pro_monthly"
        const val DEFAULT_ARB_THRESHOLD_PCT = 5.0
    }
}

/** Convenience for the scaffold badge / upsell surfaces. */
val ProUiState.showPaywall: Boolean get() = !isPro

/** Gaps at/above the selected threshold, best spread first. */
fun ProUiState.significantGaps(): List<ArbitrageGap> =
    arbitrage.filter { it.gapPct >= arbitrageThresholdPct }.sortedByDescending { it.gapPct }
