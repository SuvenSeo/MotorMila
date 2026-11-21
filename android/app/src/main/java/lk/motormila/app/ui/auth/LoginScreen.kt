package lk.motormila.app.ui.auth

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import lk.motormila.app.R
import lk.motormila.app.core.SupportContact
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.ui.components.BrandLogo
import lk.motormila.app.ui.components.BrandLogoSize
import lk.motormila.app.ui.components.MotormilaEyebrow
import lk.motormila.app.ui.components.MotormilaGhostButton
import lk.motormila.app.ui.components.MotormilaPillTabs
import lk.motormila.app.ui.components.MotormilaPrimaryButton
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaOnSurface
import lk.motormila.app.ui.theme.MotormilaOutline
import lk.motormila.app.ui.theme.MotormilaPill
import lk.motormila.app.ui.theme.MotormilaPrimaryBright
import lk.motormila.app.ui.theme.MotormilaSecondaryText
import lk.motormila.app.ui.theme.rememberHaptics
import lk.motormila.app.ui.theme.motormilaReveal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    onBrowse: () -> Unit = {},
    // Kept only because the nav graph still passes it; biometric unlock no longer gates login.
    @Suppress("UNUSED_PARAMETER")
    onBiometricAuth: (onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val shake = remember { Animatable(0f) }
    var passwordVisible by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val browseMarketLabel = stringResource(R.string.login_browse_market)
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val nextField = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
    val submitField = KeyboardActions(onDone = {
        focusManager.clearFocus()
        viewModel.onEvent(AuthUiEvent.Submit)
    })
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MotormilaPrimaryBright,
        unfocusedBorderColor = MotormilaOutline,
        focusedLabelColor = MotormilaPrimaryBright,
        unfocusedLabelColor = MotormilaSecondaryText,
        cursorColor = MotormilaPrimaryBright,
        focusedTextColor = MotormilaOnSurface,
        unfocusedTextColor = MotormilaOnSurface,
    )

    LaunchedEffect(state.loggedIn) {
        if (state.loggedIn) {
            if (!reducedMotion) haptics.confirm()
            viewModel.onEvent(AuthUiEvent.ConsumeLoggedIn)
            onLoggedIn()
        }
    }
    LaunchedEffect(state.errorRes, state.shakeToken) {
        state.errorRes?.let {
            if (!reducedMotion) haptics.reject()
            snacks.showSnackbar(context.getString(it))
        }
        if (state.shakeToken > 0 && !reducedMotion) {
            shake.snapTo(0f)
            // iOS-style "wrong password" shake: one impulse into an
            // under-damped spring that settles on its own.
            shake.snapTo(0f)
            shake.animateTo(
                0f,
                spring(dampingRatio = 0.18f, stiffness = 1800f),
                initialVelocity = 900f,
            )
        }
    }

    lk.motormila.app.ui.common.MmScreen(title = stringResource(R.string.v19_auth_title), snackbarHostState = snacks) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .offset { IntOffset(shake.value.roundToInt(), 0) },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            OfflineBanner(visible = state.offline)
            Column(
                Modifier.motormilaReveal().fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BrandLogo(
                    size = BrandLogoSize.DEFAULT,
                    showWordmark = true,
                    showTagline = true,
                    modifier = Modifier.semantics { contentDescription = browseMarketLabel },
                )
                Spacer(Modifier.height(18.dp))
                MotormilaEyebrow(stringResource(R.string.v19_auth_eyebrow).uppercase())
                if (state.sessionEmail != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = if (state.sessionExpired) {
                            stringResource(R.string.v19_auth_session_expired, state.sessionEmail.orEmpty())
                        } else {
                            stringResource(R.string.v19_auth_last_signed_in, state.sessionEmail.orEmpty())
                        },
                        fontSize = 13.sp,
                        color = if (state.sessionExpired) MotormilaPrimaryBright else MotormilaSecondaryText,
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
            MotormilaPillTabs(
                tabs = listOf(stringResource(R.string.v19_auth_tab_login), stringResource(R.string.v19_auth_tab_signup)),
                selected = if (state.isSignupTab) 1 else 0,
                onSelect = { viewModel.onEvent(AuthUiEvent.TabChanged(it == 1)) },
            )
            Spacer(Modifier.height(20.dp))
            if (state.isSignupTab) {
                OutlinedTextField(
                    value = state.name,
                    onValueChange = { viewModel.onEvent(AuthUiEvent.NameChanged(it)) },
                    label = { Text(stringResource(R.string.ui_auth_name)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    keyboardActions = nextField,
                    shape = MotormilaPill,
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                )
                Spacer(Modifier.height(10.dp))
            }
            OutlinedTextField(
                value = state.email,
                onValueChange = { viewModel.onEvent(AuthUiEvent.EmailChanged(it)) },
                label = { Text(stringResource(R.string.ui_auth_email)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                keyboardActions = nextField,
                shape = MotormilaPill,
                colors = fieldColors,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = state.password,
                onValueChange = { viewModel.onEvent(AuthUiEvent.PasswordChanged(it)) },
                label = { Text(stringResource(R.string.account_delete_password)) },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = if (state.isSignupTab) ImeAction.Next else ImeAction.Done,
                ),
                keyboardActions = if (state.isSignupTab) nextField else submitField,
                shape = MotormilaPill,
                colors = fieldColors,
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = stringResource(
                                if (passwordVisible) R.string.v19_auth_hide_password else R.string.v19_auth_show_password,
                            ),
                            tint = MotormilaSecondaryText,
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            )
            if (state.isSignupTab) {
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.confirmPassword,
                    onValueChange = { viewModel.onEvent(AuthUiEvent.ConfirmPasswordChanged(it)) },
                    label = { Text(stringResource(R.string.v19_auth_confirm_password)) },
                    singleLine = true,
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                    keyboardActions = nextField,
                    isError = state.confirmPassword.isNotEmpty() && state.confirmPassword != state.password,
                    shape = MotormilaPill,
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.inviteToken,
                    onValueChange = { viewModel.onEvent(AuthUiEvent.InviteTokenChanged(it)) },
                    label = { Text(stringResource(R.string.ui_auth_invite_token)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = submitField,
                    supportingText = {
                        Text(
                            if (state.selfSignupEnabled) {
                                stringResource(R.string.v19_auth_invite_optional, state.selfSignupTrialDays)
                            } else {
                                stringResource(R.string.v19_auth_invite_required_hint)
                            },
                            color = MotormilaSecondaryText,
                        )
                    },
                    shape = MotormilaPill,
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                )
            }
            Spacer(Modifier.height(18.dp))
            MotormilaPrimaryButton(
                label = when {
                    state.isSignupTab && state.selfSignupEnabled && state.inviteToken.isBlank() ->
                        stringResource(R.string.v19_auth_start_trial, state.selfSignupTrialDays)
                    state.isSignupTab -> stringResource(R.string.v19_auth_create_account)
                    else -> stringResource(R.string.v19_auth_login)
                },
                onClick = { viewModel.onEvent(AuthUiEvent.Submit) },
                loading = state.loading,
            )
            if (state.errorRes != null && !state.loading) {
                Spacer(Modifier.height(10.dp))
                MotormilaGhostButton(
                    stringResource(if (state.offline) R.string.v19_auth_retry_offline else R.string.v19_auth_retry),
                    onClick = { viewModel.onEvent(AuthUiEvent.Retry) },
                )
            }
            // No credentials are ever baked into the release build: earlier
            // revisions shipped a one-tap demo sign-in with a hardcoded review
            // account, which is a live account leak on a store/release APK.
            // Biometric unlock removed: it gated nothing (the session persists anyway).
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.login_invite_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(
                shape = androidx.compose.foundation.shape.CircleShape,
                onClick = onBrowse,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
            ) {
                Text(browseMarketLabel)
            }
            // Password resets are issued by the Motormila team (no self-serve
            // email flow yet): a persistent card with a one-tap email action,
            // instead of a snackbar that vanished before it could be acted on.
            TextButton(
                shape = androidx.compose.foundation.shape.CircleShape,
                onClick = { viewModel.onEvent(AuthUiEvent.ToggleForgot) },
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.login_forgot_password))
            }
            if (state.forgotOpen) {
                val subject = stringResource(R.string.v19_auth_forgot_subject)
                val body = stringResource(R.string.v19_auth_forgot_email_body, state.email.trim())
                val noApp = stringResource(R.string.v19_auth_forgot_no_app, SupportContact.EMAIL)
                MotormilaSurface(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        stringResource(R.string.v19_auth_forgot_title),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.v19_auth_forgot_body, SupportContact.EMAIL),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    MotormilaPrimaryButton(
                        label = stringResource(R.string.v19_auth_forgot_cta),
                        onClick = {
                            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")).apply {
                                putExtra(Intent.EXTRA_EMAIL, arrayOf(SupportContact.EMAIL))
                                putExtra(Intent.EXTRA_SUBJECT, subject)
                                putExtra(Intent.EXTRA_TEXT, body)
                            }
                            try {
                                context.startActivity(intent)
                            } catch (_: ActivityNotFoundException) {
                                scope.launch { snacks.showSnackbar(noApp) }
                            }
                        },
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}
