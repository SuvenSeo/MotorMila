package lk.motormila.app.ui.auth

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
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
    onBiometricAuth: (onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val biometricEnabled by viewModel.biometricEnabled.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val shake = remember { Animatable(0f) }
    var passwordVisible by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val browseMarketLabel = stringResource(R.string.login_browse_market)
    val forgotPasswordMessage = stringResource(R.string.login_forgot_password_message)
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
    LaunchedEffect(state.error, state.shakeToken) {
        state.error?.let {
            if (!reducedMotion) haptics.reject()
            snacks.showSnackbar(it)
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

    lk.motormila.app.ui.common.MmScreen(title = "Sign in", snackbarHostState = snacks) {
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
                MotormilaEyebrow("INVITE-ONLY INTELLIGENCE")
                if (state.sessionEmail != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = if (state.sessionExpired) {
                            "Session for ${state.sessionEmail} expired — sign in again."
                        } else {
                            "Last signed in as ${state.sessionEmail}."
                        },
                        fontSize = 13.sp,
                        color = if (state.sessionExpired) MotormilaPrimaryBright else MotormilaSecondaryText,
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
            MotormilaPillTabs(
                tabs = listOf("Log in", "Sign up"),
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
                shape = MotormilaPill,
                colors = fieldColors,
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (passwordVisible) "Hide password" else "Show password",
                            tint = MotormilaSecondaryText,
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            )
            if (state.isSignupTab) {
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.inviteToken,
                    onValueChange = { viewModel.onEvent(AuthUiEvent.InviteTokenChanged(it)) },
                    label = { Text(stringResource(R.string.ui_auth_invite_token)) },
                    singleLine = true,
                    supportingText = {
                        Text(
                            if (state.selfSignupEnabled) {
                                "Optional — leave blank to start a ${state.selfSignupTrialDays}-day Pro trial."
                            } else {
                                "Invite-only: get a token from Admin or your dealer."
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
                        "Start ${state.selfSignupTrialDays}-day trial"
                    state.isSignupTab -> "Create account"
                    else -> "Log in"
                },
                onClick = { viewModel.onEvent(AuthUiEvent.Submit) },
                loading = state.loading,
            )
            if (state.error != null && !state.loading) {
                Spacer(Modifier.height(10.dp))
                MotormilaGhostButton(
                    if (state.offline) "Retry when back online" else "Retry",
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
            // email flow yet), so the previous no-op button now says so.
            TextButton(
                shape = androidx.compose.foundation.shape.CircleShape,
                onClick = {
                    scope.launch { snacks.showSnackbar(forgotPasswordMessage) }
                },
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.login_forgot_password))
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}
