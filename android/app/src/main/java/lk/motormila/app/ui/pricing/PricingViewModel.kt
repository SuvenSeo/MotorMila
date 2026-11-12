package lk.motormila.app.ui.pricing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.BuildConfig
import lk.motormila.app.billing.PlayBillingDataSource
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.usecase.ObserveSessionUseCase

data class PricingUiState(
    val loggedIn: Boolean = false,
    val isPro: Boolean = false,
    val busyDealer: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class PricingViewModel @Inject constructor(
    private val billing: PlayBillingDataSource,
    observeSession: ObserveSessionUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(PricingUiState())
    val state: StateFlow<PricingUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            observeSession().collect { session ->
                _state.update {
                    it.copy(
                        loggedIn = session != null && session.token.isNotBlank(),
                        isPro = session?.isPro == true,
                    )
                }
            }
        }
    }

    /**
     * Dealer checkout — direct (sideload) flavor only; the Play flavor never
     * reaches here (no external payment for digital goods on Play).
     */
    fun dealerCheckout(onOpenUrl: (String) -> Unit, fallback: () -> Unit) {
        if (!BuildConfig.EXTERNAL_CHECKOUT_ENABLED) {
            fallback()
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busyDealer = true, message = null) }
            runCatching { billing.checkoutIntent("dealer") }
                .onSuccess { info ->
                    _state.update { it.copy(busyDealer = false, message = info.message.takeIf { m -> m.isNotBlank() }) }
                    val url = info.checkoutUrl
                    if (info.hasUrl && url != null) onOpenUrl(url) else fallback()
                }
                .onFailure { e ->
                    _state.update { it.copy(busyDealer = false, message = ErrorMapper.map(e).message) }
                    fallback()
                }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }
}
