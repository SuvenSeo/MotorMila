package lk.motormila.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.domain.model.ChatMessage
import lk.motormila.app.domain.repository.ChatRepository

data class AIChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val input: String = "",
    val isLoading: Boolean = false,
    /** Last send failure (fallback reply is still appended — this drives retry). */
    val lastError: String? = null,
    val failedPrompt: String? = null,
    val offline: Boolean = false,
    val error: String? = null,
    /** Live AI answers need an account (backend rejects signed-out writes); UI shows a localised sign-in hint. */
    val signInRequired: Boolean = false,
)

sealed interface AIChatUiEvent {
    data class InputChanged(val text: String) : AIChatUiEvent
    data class SendMessage(val text: String) : AIChatUiEvent
    data object Retry : AIChatUiEvent
    data object ClearChat : AIChatUiEvent
    data object DismissError : AIChatUiEvent
}

@HiltViewModel
class AIChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AIChatUiState())
    val state: StateFlow<AIChatUiState> = _state.asStateFlow()

    fun onEvent(event: AIChatUiEvent) {
        when (event) {
            is AIChatUiEvent.InputChanged -> _state.update { it.copy(input = event.text) }
            is AIChatUiEvent.SendMessage -> sendMessage(event.text)
            AIChatUiEvent.Retry -> retry()
            AIChatUiEvent.ClearChat ->
                _state.update { it.copy(messages = emptyList(), error = null, lastError = null, failedPrompt = null, offline = false) }
            AIChatUiEvent.DismissError ->
                _state.update { it.copy(error = null, lastError = null, failedPrompt = null, offline = false) }
        }
    }

    fun sendMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isBlank() || _state.value.isLoading) return

        val userMessage = ChatMessage(role = "user", content = trimmed)
        val currentHistory = _state.value.messages + userMessage
        _state.update {
            it.copy(
                messages = currentHistory,
                input = "",
                isLoading = true,
                error = null,
            )
        }

        viewModelScope.launch {
            runCatching {
                chatRepository.ask(trimmed, currentHistory)
            }.onSuccess { reply ->
                _state.update {
                    it.copy(
                        messages = it.messages + reply,
                        isLoading = false,
                        lastError = null,
                        failedPrompt = null,
                        offline = false,
                        signInRequired = false,
                    )
                }
            }.onFailure { e ->
                // Graceful degradation: offline-friendly fallback reply stays in
                // the feed; the error row underneath offers a live retry.
                val mapped = ErrorMapper.map(e)
                val fallbackReply = generateFallbackReply(trimmed)
                _state.update {
                    it.copy(
                        messages = it.messages + fallbackReply,
                        isLoading = false,
                        lastError = mapped.message,
                        failedPrompt = trimmed,
                        offline = mapped is AppError.Network,
                        signInRequired = needsSignIn(mapped),
                    )
                }
            }
        }
    }

    /** Re-ask the failed prompt without appending a duplicate user bubble. */
    private fun retry() {
        val prompt = _state.value.failedPrompt ?: return
        if (_state.value.isLoading) return
        _state.update { it.copy(isLoading = true, lastError = null, offline = false) }
        viewModelScope.launch {
            val history = _state.value.messages
            runCatching { chatRepository.ask(prompt, history) }
                .onSuccess { reply ->
                    _state.update {
                        it.copy(
                            messages = it.messages + reply,
                            isLoading = false,
                            failedPrompt = null,
                        )
                    }
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            isLoading = false,
                            lastError = mapped.message,
                            offline = mapped is AppError.Network,
                            signInRequired = needsSignIn(mapped),
                        )
                    }
                }
        }
    }

    private fun needsSignIn(e: AppError): Boolean = e is AppError.Unauthorized ||
        (e is AppError.Forbidden && (e.message.contains("Bearer", ignoreCase = true) || e.message.contains("Authentication", ignoreCase = true)))

    private fun generateFallbackReply(prompt: String): ChatMessage {
        val lower = prompt.lowercase()
        return when {
            "under rs. 8m" in lower || "practical" in lower -> {
                ChatMessage(
                    role = "assistant",
                    content = "Here are top practical vehicles under Rs. 8 Million with strong resale value and reliability in Sri Lanka:\n\n• Suzuki Wagon R (FX/FZ 2017-2019) — Rs. 6.2M - 7.5M, 18-22 km/l fuel efficiency, excellent parts availability.\n• Toyota Vitz (1.0L KSP130 2015-2018) — Rs. 7.2M - 8.2M, bulletproof 1KR-FE engine, unmatched liquidity.\n• Daihatsu Mira e:S (2018-2020) — Rs. 5.8M - 6.8M, ultra-low running costs, ideal city commuter.\n\nTip: Inspect battery health for mild hybrids and verify service records before making an offer.",
                )
            }
            "best deal" in lower -> {
                ChatMessage(
                    role = "assistant",
                    content = "Motormila Deal Score aggregates real-time market data across all active Sri Lankan classifieds:\n\n• Great Deals (Score ≥ 8.0): Priced 8% or more below Fair Market Value with verified mileage.\n• Fair Deals (Score 0.0 - 7.9): Market median aligned, low negotiation resistance expected.\n• High/Overpriced (Score < 0.0): Asking price exceeds 110% of cohort median.\n\nCheck the Dashboard's 'Best Picks' tab to see current top deal scores filtered by district.",
                )
            }
            "valuation" in lower || "confidence" in lower -> {
                ChatMessage(
                    role = "assistant",
                    content = "Valuation confidence reflects sample depth and price dispersion:\n\n• High Confidence: 15+ recent comparable listings with tight standard deviation (<7%). Typical for Corolla, Premio, Wagon R, Vezel.\n• Medium Confidence: 5-14 comps. Slight district or variant adjustments applied.\n• Low Confidence: <5 comps or vintage/rare models. Subject to higher asking spread.",
                )
            }
            "negotiat" in lower -> {
                ChatMessage(
                    role = "assistant",
                    content = "Negotiation playbook for Sri Lankan vehicle buyers:\n\n1. Anchor to Market Median: Quote Motormila's cohort median rather than seller asking.\n2. Leverage Days on Market: Listings active >30 days often have 5-8% cash flexibility.\n3. Detail Audit: Deduct for tire wear (Rs. 80k-120k set), battery age, or pending revenue licence renewals.\n4. Close with Finance Readiness: Pre-approved lease letters give you maximum leverage against window shoppers.",
                )
            }
            "cbsl" in lower || "lease" in lower -> {
                ChatMessage(
                    role = "assistant",
                    content = "Current Central Bank of Sri Lanka (CBSL) Vehicle Financing Regulations (LTV limits):\n\n• Commercial Vehicles & Dual-Purpose: Up to 90% Loan-to-Value (10% minimum down payment).\n• Passenger Cars (Hybrid / Petrol / Diesel): Maximum 50% LTV (50% down payment required).\n• Electric Vehicles (BEV): Maximum 50% LTV.\n\nMaximum lease tenure is typically 5 years (60 months) with prevailing AWPR interest rates.",
                )
            }
            else -> {
                ChatMessage(
                    role = "assistant",
                    content = "I've analyzed your inquiry regarding the Sri Lankan market.\n\n• Search live inventory by budget, fuel type, district, and year on the Search screen.\n• Use the Valuation studio to calculate accurate fair market value (FMV).\n• Compare up to 4 models side-by-side on the Compare screen.\n\nFeel free to ask specific questions about any make, model, or pricing signal!",
                )
            }
        }
    }
}
