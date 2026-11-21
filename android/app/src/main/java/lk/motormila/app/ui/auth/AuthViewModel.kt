package lk.motormila.app.ui.auth

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.core.common.AppError
import lk.motormila.app.core.network.ErrorMapper
import lk.motormila.app.core.network.messageRes
import lk.motormila.app.domain.repository.AuthRepository
import lk.motormila.app.domain.usecase.LoginUseCase
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.ui.navigation.Login as LoginRoute

data class AuthUiState(
    val name: String = "",
    val email: String = "",
    val password: String = "",
    /** Sign-up only: must equal [password] before the account is created. */
    val confirmPassword: String = "",
    val inviteToken: String = "",
    val isSignupTab: Boolean = false,
    val loading: Boolean = false,
    val selfSignupEnabled: Boolean = false,
    val selfSignupTrialDays: Int = 7,
    /** Increments on each failed attempt to retrigger the shake animation. */
    val shakeToken: Int = 0,
    /** Localized error copy (string res); never raw backend/exception text. */
    @StringRes val errorRes: Int? = null,
    /** True when the last failure was transport-level (drives the offline badge). */
    val offline: Boolean = false,
    val loggedIn: Boolean = false,
    /** "Forgot password?" expanded into a persistent help card with a contact action. */
    val forgotOpen: Boolean = false,
    /** True until the cold-start restore() finishes ( SplashGate also gates on this). */
    val restoring: Boolean = true,
    /** Last known session (drives the "signed in as" hint). */
    val sessionEmail: String? = null,
    val expiresAt: String? = null,
    val sessionExpired: Boolean = false,
)

sealed interface AuthUiEvent {
    data class NameChanged(val value: String) : AuthUiEvent
    data class EmailChanged(val value: String) : AuthUiEvent
    data class PasswordChanged(val value: String) : AuthUiEvent
    data class ConfirmPasswordChanged(val value: String) : AuthUiEvent
    data class InviteTokenChanged(val value: String) : AuthUiEvent
    data class TabChanged(val signup: Boolean) : AuthUiEvent
    data object Submit : AuthUiEvent
    data object Retry : AuthUiEvent
    data object ToggleForgot : AuthUiEvent
    data object ConsumeLoggedIn : AuthUiEvent
    data object DismissError : AuthUiEvent
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val login: LoginUseCase,
    observeSession: ObserveSessionUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        runCatching { savedStateHandle.toRoute<LoginRoute>() }.getOrNull()?.let { route ->
            val token = route.token?.trim().orEmpty()
            if (token.isNotEmpty() || route.signup) {
                _state.update {
                    it.copy(
                        inviteToken = token,
                        isSignupTab = route.signup || token.isNotEmpty(),
                    )
                }
            }
        }
        // Re-hydrate the interceptor token after process death so the first
        // post-restart request already carries auth (foundation 401 -> Login
        // is still the backstop via AuthEventBus in the nav graph).
        viewModelScope.launch {
            runCatching { authRepository.restore() }
            _state.update { it.copy(restoring = false) }
        }
        viewModelScope.launch {
            runCatching { authRepository.selfSignupStatus() }
                .onSuccess { status ->
                    _state.update {
                        it.copy(
                            selfSignupEnabled = status.enabled,
                            selfSignupTrialDays = status.trialDays,
                        )
                    }
                }
        }
        viewModelScope.launch {
            observeSession().collect { session ->
                val expired = session?.expiresAt?.let { iso ->
                    runCatching { Instant.parse(iso).isBefore(Instant.now()) }.getOrDefault(false)
                } == true
                _state.update {
                    it.copy(
                        sessionEmail = session?.email,
                        expiresAt = session?.expiresAt,
                        sessionExpired = expired,
                    )
                }
            }
        }
    }

    fun onEvent(event: AuthUiEvent) {
        when (event) {
            is AuthUiEvent.NameChanged -> _state.update { it.copy(name = event.value, errorRes = null, offline = false) }
            is AuthUiEvent.EmailChanged -> _state.update { it.copy(email = event.value, errorRes = null, offline = false) }
            is AuthUiEvent.PasswordChanged -> _state.update { it.copy(password = event.value, errorRes = null, offline = false) }
            is AuthUiEvent.ConfirmPasswordChanged -> _state.update { it.copy(confirmPassword = event.value, errorRes = null, offline = false) }
            is AuthUiEvent.InviteTokenChanged -> _state.update { it.copy(inviteToken = event.value, errorRes = null, offline = false) }
            is AuthUiEvent.TabChanged -> _state.update { it.copy(isSignupTab = event.signup, errorRes = null, offline = false) }
            AuthUiEvent.Submit -> submit()
            AuthUiEvent.Retry -> submit()
            AuthUiEvent.ToggleForgot -> _state.update { it.copy(forgotOpen = !it.forgotOpen) }
            AuthUiEvent.ConsumeLoggedIn -> _state.update { it.copy(loggedIn = false) }
            AuthUiEvent.DismissError -> _state.update { it.copy(errorRes = null, offline = false) }
        }
    }

    private fun submit() {
        val s = _state.value
        val invalid = when {
            s.email.isBlank() || s.password.isBlank() -> R.string.v19_auth_err_credentials
            !EMAIL.matches(s.email.trim()) -> R.string.v19_auth_err_email_format
            s.isSignupTab && s.inviteToken.isBlank() && !s.selfSignupEnabled -> R.string.v19_auth_err_invite_required
            s.isSignupTab && s.password.length < 8 -> R.string.v19_auth_err_password_short
            s.isSignupTab && s.confirmPassword != s.password -> R.string.v19_auth_err_password_mismatch
            else -> null
        }
        if (invalid != null) {
            fail(invalid)
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, errorRes = null, offline = false) }
            runCatching {
                if (s.isSignupTab) {
                    if (s.inviteToken.isBlank() && s.selfSignupEnabled) {
                        authRepository.selfSignup(
                            name = s.name.trim().ifBlank { s.email.trim().substringBefore("@") },
                            email = s.email.trim(),
                            password = s.password,
                        )
                    } else {
                        authRepository.signup(
                            name = s.name.trim().ifBlank { s.email.trim().substringBefore("@").ifBlank { "Driver" } },
                            email = s.email.trim(),
                            password = s.password,
                            inviteToken = s.inviteToken.trim().ifBlank { null },
                        )
                    }
                } else {
                    login(s.email.trim(), s.password)
                }
            }.onSuccess { _state.update { it.copy(loading = false, loggedIn = true) } }
                .onFailure { e ->
                    val mapped = ErrorMapper.map(e)
                    // A 401 on the login call means wrong credentials, not an expired session.
                    val res = if (mapped is AppError.Unauthorized && !s.isSignupTab) {
                        R.string.v110m_auth_err_wrong_credentials
                    } else {
                        mapped.messageRes()
                    }
                    fail(res, offline = mapped is AppError.Network)
                }
        }
    }

    private fun fail(@StringRes res: Int, offline: Boolean = false) {
        _state.update {
            it.copy(
                loading = false,
                errorRes = res,
                offline = offline,
                shakeToken = it.shakeToken + 1,
            )
        }
    }

    private companion object {
        /** Same pattern as the Pro notify-me form (ProNotifyViewModel.EMAIL). */
        val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    }
}
