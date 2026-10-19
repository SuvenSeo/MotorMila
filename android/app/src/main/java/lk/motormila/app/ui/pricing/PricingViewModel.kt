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
import lk.motormila.app.billing.PlayBillingDataSource
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.usecase.ObserveSessionUseCase

data class PricingUiState(
    val loggedIn: Boolean = false,
    val busyPlan: String? = null,
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
                _state.update { it.copy(loggedIn = session != null && !session.token.isNullOrBlank()) }
            }
        }
    }

    fun checkout(plan: String, onOpenUrl: (String) -> Unit, fallback: () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(busyPlan = plan, message = null) }
            runCatching { billing.checkoutIntent(plan) }
                .onSuccess { info ->
                    _state.update { it.copy(busyPlan = null, message = info.message.takeIf { msg -> msg.isNotBlank() }) }
                    val url = info.checkoutUrl
                    if (info.hasUrl && url != null) onOpenUrl(url) else fallback()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(busyPlan = null, message = ErrorMapper.map(error).message)
                    }
                    fallback()
                }
        }
    }
}
