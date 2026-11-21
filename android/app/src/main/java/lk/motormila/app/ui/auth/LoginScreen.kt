package lk.motormila.app.ui.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.password
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.R
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.ui.common.MmScreen
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.MotormilaPill
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    onBrowse: () -> Unit = {},
    onBiometricAuth: (onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val signup = state.isSignupTab
    var passwordVisible by remember(signup) { mutableStateOf(false) }
    var resetPageUnavailable by remember(signup) { mutableStateOf(false) }
    val submit: () -> Unit = {
        if (!state.loading) {
            focus.clearFocus()
            viewModel.onEvent(AuthUiEvent.Submit)
        }
    }

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
    }

    MmScreen(
        title = stringResource(if (signup) R.string.buyer_auth_create_account else R.string.buyer_auth_welcome),
        snackbarHostState = snacks,
    ) {
        Column(
            modifier = Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth()) {
                OfflineBanner(visible = state.offline)
                // One locally bundled frame from the website's night drive; no slideshow or network request.
                Image(
                    painter = painterResource(R.drawable.buyer_auth_night_coast),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(8f / 3f).clip(RoundedCornerShape(16.dp)),
                )
                Spacer(Modifier.height(16.dp))
                BuyerAuthTabs(signup = signup, enabled = !state.loading) {
                    focus.clearFocus()
                    viewModel.onEvent(AuthUiEvent.TabChanged(it))
                }
                Spacer(Modifier.height(16.dp))
                if (!signup) {
                    state.sessionEmail?.let { email ->
                        Text(
                            stringResource(
                                if (state.sessionExpired) R.string.buyer_auth_session_expired else R.string.buyer_auth_last_account,
                                email,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(12.dp))
                    }
                }
                val field = Modifier.fillMaxWidth().heightIn(min = 56.dp)
                val shape = RoundedCornerShape(14.dp)
                if (signup) {
                    OutlinedTextField(
                        value = state.name,
                        onValueChange = { viewModel.onEvent(AuthUiEvent.NameChanged(it)) },
                        label = { Text(stringResource(R.string.buyer_auth_name)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
                        shape = shape,
                        modifier = field,
                    )
                    Spacer(Modifier.height(10.dp))
                }
                OutlinedTextField(
                    value = state.email,
                    onValueChange = { viewModel.onEvent(AuthUiEvent.EmailChanged(it)) },
                    label = { Text(stringResource(R.string.buyer_auth_email)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                    shape = shape,
                    modifier = field,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = state.password,
                    onValueChange = { viewModel.onEvent(AuthUiEvent.PasswordChanged(it)) },
                    label = { Text(stringResource(R.string.buyer_auth_password)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = if (signup) ImeAction.Next else ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    shape = shape,
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }, modifier = Modifier.size(48.dp)) {
                            Icon(
                                if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                contentDescription = stringResource(
                                    if (passwordVisible) R.string.buyer_auth_hide_password else R.string.buyer_auth_show_password,
                                ),
                            )
                        }
                    },
                    modifier = field.semantics { password() },
                )
                if (signup) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = state.inviteToken,
                        onValueChange = { viewModel.onEvent(AuthUiEvent.InviteTokenChanged(it)) },
                        label = { Text(stringResource(R.string.buyer_auth_invite)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                        supportingText = {
                            Text(
                                if (state.selfSignupEnabled) stringResource(R.string.buyer_auth_invite_optional, state.selfSignupTrialDays)
                                else stringResource(R.string.buyer_auth_invite_required),
                            )
                        },
                        shape = shape,
                        modifier = field,
                    )
                } else {
                    TextButton(
                        onClick = {
                            focus.clearFocus()
                            resetPageUnavailable = !openBuyerResetRequest(context)
                        },
                        modifier = Modifier.align(Alignment.End).heightIn(min = 48.dp),
                    ) { Text(stringResource(R.string.buyer_auth_reset_web)) }
                    if (resetPageUnavailable) {
                        SelectionContainer {
                            Text(
                                stringResource(R.string.buyer_auth_reset_unavailable, BUYER_RESET_REQUEST_URL),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = submit,
                    enabled = !state.loading,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (state.loading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text(
                            when {
                                signup && state.selfSignupEnabled && state.inviteToken.isBlank() ->
                                    stringResource(R.string.buyer_auth_start_trial, state.selfSignupTrialDays)
                                signup -> stringResource(R.string.buyer_auth_create_account)
                                else -> stringResource(R.string.buyer_auth_sign_in)
                            },
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                if (state.error != null && !state.loading) {
                    TextButton(
                        onClick = { viewModel.onEvent(AuthUiEvent.Retry) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) {
                        Text(stringResource(if (state.offline) R.string.buyer_auth_retry_online else R.string.buyer_auth_retry))
                    }
                }
                TextButton(onClick = onBrowse, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(stringResource(R.string.buyer_auth_guest))
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun BuyerAuthTabs(signup: Boolean, enabled: Boolean, select: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(MotormilaPill).background(MaterialTheme.colorScheme.surfaceVariant)
            .selectableGroup().padding(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (isSignup in listOf(false, true)) {
            val selected = signup == isSignup
            Tab(
                selected = selected,
                enabled = enabled,
                onClick = { if (!selected) select(isSignup) },
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).clip(MotormilaPill).then(
                    if (selected) Modifier.background(MaterialTheme.colorScheme.primaryContainer) else Modifier,
                ),
                selectedContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            ) {
                Text(
                    stringResource(if (isSignup) R.string.buyer_auth_sign_up else R.string.buyer_auth_sign_in),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 12.dp),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.titleSmall,
                )
            }
        }
    }
}
