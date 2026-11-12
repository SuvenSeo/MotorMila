package lk.motormila.app.ui.valuation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Calendar
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.domain.model.Comparable
import lk.motormila.app.domain.model.ValuationInput
import lk.motormila.app.domain.repository.ListingRepository
import lk.motormila.app.ui.navigation.Valuation as ValuationRoute
import lk.motormila.app.ui.valuation.ValuationQuiz.Question
import lk.motormila.app.ui.valuation.ValuationQuiz.Registration

/** Result shown at the end of the quiz (live estimate API only — no invented fallback). */
data class QuizResult(
    val low: Double,
    val median: Double,
    val high: Double,
    /** "high" | "medium" | "low" */
    val confidence: String,
    val comparableCount: Int,
    val methodology: String,
    val comparables: List<Comparable>,
)

data class ValuationUiState(
    /** 0 car · 1 details · 2 condition questions · 3 result */
    val step: Int = 0,
    val questionIndex: Int = 0,
    val makes: List<String> = emptyList(),
    val makesLoading: Boolean = true,
    val models: List<String> = emptyList(),
    val modelsLoading: Boolean = false,
    val make: String = "",
    val model: String = "",
    val year: Int = Calendar.getInstance().get(Calendar.YEAR) - 6,
    val mileage: String = "",
    val registration: Registration? = null,
    val district: String = "Colombo",
    val answers: Map<Question, String> = emptyMap(),
    val loading: Boolean = false,
    val result: QuizResult? = null,
    /** Live service failed or returned no usable range. */
    val failed: Boolean = false,
) {
    val step0Valid: Boolean get() = make.isNotBlank() && model.isNotBlank()
    val step1Valid: Boolean get() = ValuationQuiz.step1Valid(registration, mileage)
    val progress: Float get() = ValuationQuiz.progress(step, questionIndex)
    val position: ValuationQuiz.Position get() = ValuationQuiz.position(answers)
    val flags: List<ValuationQuiz.Flag> get() = ValuationQuiz.flags(answers)
}

sealed interface ValuationUiEvent {
    data class MakeChanged(val make: String) : ValuationUiEvent
    data class ModelChanged(val model: String) : ValuationUiEvent
    data class YearChanged(val year: Int) : ValuationUiEvent
    data class MileageChanged(val mileage: String) : ValuationUiEvent
    data class RegistrationChanged(val registration: Registration) : ValuationUiEvent
    data class DistrictChanged(val district: String) : ValuationUiEvent
    data object Next : ValuationUiEvent
    data object Back : ValuationUiEvent
    data class Answer(val question: Question, val value: String) : ValuationUiEvent
    data object Skip : ValuationUiEvent
    data object Restart : ValuationUiEvent
    data object Retry : ValuationUiEvent
}

@HiltViewModel
class ValuationViewModel @Inject constructor(
    private val listings: ListingRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _state = MutableStateFlow(ValuationUiState())
    val state: StateFlow<ValuationUiState> = _state.asStateFlow()

    private var estimateJob: Job? = null
    private var modelsJob: Job? = null

    init {
        val route = runCatching { savedStateHandle.toRoute<ValuationRoute>() }.getOrNull()
        val make = route?.make?.trim().orEmpty()
        val model = route?.model?.trim().orEmpty()
        // Shared ad links carry the model year in the slug; prefill it when plausible.
        val year = route?.year?.takeIf { it in 1950..(Calendar.getInstance().get(Calendar.YEAR) + 1) }
        _state.update { it.copy(make = make, model = model, year = year ?: it.year) }
        viewModelScope.launch {
            val makes = runCatching { listings.makes() }.getOrDefault(emptyList())
            _state.update { it.copy(makes = makes.filter { m -> m.isNotBlank() }.distinct(), makesLoading = false) }
        }
        if (make.isNotBlank()) loadModels(make)
    }

    fun onEvent(event: ValuationUiEvent) {
        when (event) {
            is ValuationUiEvent.MakeChanged -> {
                _state.update { it.copy(make = event.make, model = "", models = emptyList()) }
                if (event.make.isNotBlank()) loadModels(event.make)
            }
            is ValuationUiEvent.ModelChanged -> _state.update { it.copy(model = event.model) }
            is ValuationUiEvent.YearChanged -> _state.update { it.copy(year = event.year) }
            is ValuationUiEvent.MileageChanged ->
                _state.update { it.copy(mileage = event.mileage.filter { c -> c.isDigit() || c == ',' }.take(9)) }
            is ValuationUiEvent.RegistrationChanged -> _state.update { it.copy(registration = event.registration) }
            is ValuationUiEvent.DistrictChanged -> _state.update { it.copy(district = event.district) }
            ValuationUiEvent.Next -> next()
            ValuationUiEvent.Back -> back()
            is ValuationUiEvent.Answer -> answer(event.question, event.value)
            ValuationUiEvent.Skip -> advanceQuestion()
            ValuationUiEvent.Restart -> {
                estimateJob?.cancel()
                _state.update {
                    ValuationUiState(makes = it.makes, makesLoading = false)
                }
            }
            ValuationUiEvent.Retry -> runEstimate()
        }
    }

    private fun next() {
        val s = _state.value
        when (s.step) {
            0 -> if (s.step0Valid) _state.update { it.copy(step = 1) }
            1 -> if (s.step1Valid) {
                // Start the estimate now so it's ready when the quiz ends (as on web).
                runEstimate()
                _state.update { it.copy(step = 2, questionIndex = 0) }
            }
        }
    }

    private fun back() {
        _state.update { s ->
            when {
                s.step == 2 && s.questionIndex > 0 -> s.copy(questionIndex = s.questionIndex - 1)
                s.step == 3 -> s.copy(step = 2, questionIndex = ValuationQuiz.questions.lastIndex)
                s.step > 0 -> s.copy(step = s.step - 1)
                else -> s
            }
        }
    }

    private fun answer(q: Question, value: String) {
        _state.update { it.copy(answers = it.answers + (q to value)) }
        advanceQuestion()
    }

    private fun advanceQuestion() {
        _state.update { s ->
            if (s.questionIndex < ValuationQuiz.questions.lastIndex) s.copy(questionIndex = s.questionIndex + 1)
            else s.copy(step = 3)
        }
    }

    private fun loadModels(make: String) {
        modelsJob?.cancel()
        modelsJob = viewModelScope.launch {
            _state.update { it.copy(modelsLoading = true) }
            val models = runCatching { listings.models(make) }.getOrDefault(emptyList())
            _state.update {
                if (it.make != make) it
                else it.copy(models = models.filter { m -> m.isNotBlank() }.distinct(), modelsLoading = false)
            }
        }
    }

    private fun runEstimate() {
        val s = _state.value
        estimateJob?.cancel()
        estimateJob = viewModelScope.launch {
            _state.update { it.copy(loading = true, failed = false, result = null) }
            val input = ValuationInput(
                make = s.make.trim(),
                model = s.model.trim(),
                year = s.year,
                mileageKm = ValuationQuiz.mileageKm(s.registration, s.mileage),
                condition = s.registration?.apiValue,
                district = s.district,
            )
            val result = runCatching { listings.customEstimate(input) }.getOrNull()
                ?.takeIf { ValuationQuiz.usable(it.lowLkr, it.medianLkr, it.highLkr) }
                ?.let { v ->
                    QuizResult(
                        low = v.lowLkr,
                        median = v.medianLkr,
                        high = v.highLkr,
                        confidence = v.confidence.lowercase().let { c -> if (c in setOf("high", "medium")) c else "low" },
                        comparableCount = v.comparableCount,
                        methodology = v.methodology,
                        comparables = v.comparables.take(5),
                    )
                }
            _state.update { it.copy(loading = false, result = result, failed = result == null) }
        }
    }
}
