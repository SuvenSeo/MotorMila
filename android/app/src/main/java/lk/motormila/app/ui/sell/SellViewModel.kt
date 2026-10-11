package lk.motormila.app.ui.sell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.MyListingCreateDto
import lk.motormila.app.data.remote.dto.MyListingDto

/** Basic sell-your-car form state — mirrors web `SellYourCar.tsx` essentials. */
data class SellForm(
    val make: String = "",
    val model: String = "",
    val year: String = "",
    val priceLkr: String = "",
    val mileage: String = "",
    val fuelType: String = "Petrol",
    val transmission: String = "Automatic",
    val condition: String = "Used",
    val district: String = "",
    val city: String = "",
    val contactName: String = "",
    val contactPhone: String = "",
    val description: String = "",
)

data class SellUiState(
    val form: SellForm = SellForm(),
    val submitting: Boolean = false,
    val error: String? = null,
    val needsLogin: Boolean = false,
    val created: MyListingDto? = null,
)

@HiltViewModel
class SellViewModel @Inject constructor(
    private val api: MotormilaApiService,
    sessionStore: SessionStore,
) : ViewModel() {

    val loggedIn: StateFlow<Boolean> = sessionStore.observe()
        .map { it != null }
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val _state = MutableStateFlow(SellUiState())
    val state: StateFlow<SellUiState> = _state.asStateFlow()

    fun updateForm(form: SellForm) {
        _state.update { it.copy(form = form, error = null) }
    }

    fun dismissError() {
        _state.update { it.copy(error = null, needsLogin = false) }
    }

    fun submit() {
        val form = _state.value.form
        if (form.make.isBlank() || form.model.isBlank()) {
            _state.update { it.copy(error = "Make and model are required.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(submitting = true, error = null, needsLogin = false) }
            val body = MyListingCreateDto(
                make = form.make.trim(),
                model = form.model.trim(),
                year = form.year.toIntOrNull(),
                priceLkr = form.priceLkr.toDoubleOrNull(),
                mileage = form.mileage.toIntOrNull(),
                fuelType = form.fuelType,
                transmission = form.transmission,
                condition = form.condition,
                district = form.district.trim().ifBlank { null },
                city = form.city.trim().ifBlank { null },
                contactName = form.contactName.trim().ifBlank { null },
                contactPhone = form.contactPhone.trim().ifBlank { null },
                description = form.description.trim().ifBlank { null },
            )
            runCatching { api.createMyListing(body) }
                .onSuccess { created ->
                    _state.update { it.copy(submitting = false, created = created) }
                }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    _state.update {
                        it.copy(
                            submitting = false,
                            needsLogin = mapped is AppError.Unauthorized,
                            error = if (mapped is AppError.Unauthorized) null else mapped.message,
                        )
                    }
                }
        }
    }
}
