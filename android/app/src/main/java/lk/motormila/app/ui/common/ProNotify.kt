package lk.motormila.app.ui.common

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.FeedbackRequestDto
import lk.motormila.app.domain.usecase.ObserveSessionUseCase
import lk.motormila.app.ui.components.MmButton
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmMotion
import lk.motormila.app.ui.theme.MmShapes
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

/**
 * Paid plans are not on sale yet (web: PRICING_COMING_SOON). Everything in the
 * app is free during the beta; Pro collects an email for the launch list.
 * Flip to false only when real checkout (Play Billing on the Play flavor) ships.
 */
const val PRO_COMING_SOON: Boolean = true

data class ProNotifyState(
    val email: String = "",
    val sending: Boolean = false,
    val done: Boolean = false,
    /** String resource for an inline error, or null. */
    val errorRes: Int? = null,
)

/** Launch-list signup — same channel as web (POST /feedback, route /pricing). */
@HiltViewModel
class ProNotifyViewModel @Inject constructor(
    private val api: MotormilaApiService,
    private val observeSession: ObserveSessionUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(ProNotifyState())
    val state: StateFlow<ProNotifyState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val email = runCatching { observeSession().firstOrNull()?.email }.getOrNull().orEmpty()
            if (email.isNotBlank()) _state.update { if (it.email.isBlank()) it.copy(email = email) else it }
        }
    }

    fun onEmail(value: String) = _state.update { it.copy(email = value.trim(), errorRes = null) }

    fun submit() {
        val email = _state.value.email.trim()
        if (!EMAIL.matches(email)) {
            _state.update { it.copy(errorRes = R.string.scr_notify_invalid) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(sending = true, errorRes = null) }
            runCatching {
                api.feedback(
                    FeedbackRequestDto(category = "general", route = "/pricing", message = "Pro trial waitlist signup (android)", email = email),
                )
            }.onSuccess { _state.update { it.copy(sending = false, done = true) } }
                .onFailure { _state.update { it.copy(sending = false, errorRes = R.string.scr_notify_failed) } }
        }
    }

    private companion object {
        val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    }
}

/** "Pro is coming soon — notify me" block: email field + button, then a done state. */
@Composable
fun ProNotifyBlock(
    modifier: Modifier = Modifier,
    viewModel: ProNotifyViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val c = MmColors.current
    val haptics = MmHaptics.current
    LaunchedEffect(state.done) { if (state.done) haptics.save() }
    AnimatedContent(
        targetState = state.done,
        transitionSpec = { MmMotion.crossfade(MmMotion.reduced) },
        label = "notify",
        modifier = modifier,
    ) { done ->
        if (done) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(MmShapes.sm)
                    .background(c.dealGreatContainer)
                    .padding(MmSpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = c.onDealGreat, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(MmSpacing.sm))
                Text(stringResource(R.string.scr_notify_done), style = MmType.current.bodyM, color = c.textPrimary)
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.sm)) {
                MmTextField(
                    label = stringResource(R.string.scr_notify_email),
                    value = state.email,
                    onValueChange = viewModel::onEmail,
                    placeholder = stringResource(R.string.scr_notify_email_ph),
                    keyboardType = KeyboardType.Email,
                )
                state.errorRes?.let {
                    Text(stringResource(it), style = MmType.current.bodyS, color = c.danger)
                }
                MmButton(
                    text = stringResource(R.string.scr_notify_cta),
                    onClick = viewModel::submit,
                    loading = state.sending,
                    leadingIcon = Icons.Filled.NotificationsActive,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
