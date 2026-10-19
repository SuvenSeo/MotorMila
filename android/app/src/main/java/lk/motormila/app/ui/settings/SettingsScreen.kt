package lk.motormila.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import lk.motormila.app.BuildConfig
import lk.motormila.app.R
import lk.motormila.app.data.remote.WEB_DELETE_ACCOUNT_URL
import lk.motormila.app.core.motion.rememberReducedMotion
import lk.motormila.app.core.ui.PrimaryAction
import lk.motormila.app.core.ui.SectionTitle
import lk.motormila.app.ui.components.MotormilaChoiceChip
import lk.motormila.app.ui.components.MotormilaGroup
import lk.motormila.app.ui.components.MotormilaGroupRow
import lk.motormila.app.ui.components.MotormilaPage
import lk.motormila.app.ui.components.MotormilaSurface
import lk.motormila.app.ui.components.OfflineBanner
import lk.motormila.app.ui.theme.rememberHaptics

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    onLoggedOut: () -> Unit,
    onOpenUrl: (url: String) -> Unit,
    /** Host wires BiometricPrompt; on success the toggle persists, on failure show message. */
    onBiometricVerify: (onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit,
    onPrivacyClick: () -> Unit = {},
    onTermsClick: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val theme by viewModel.theme.collectAsStateWithLifecycle()
    val language by viewModel.language.collectAsStateWithLifecycle()
    val district by viewModel.defaultDistrict.collectAsStateWithLifecycle()
    val sort by viewModel.defaultSort.collectAsStateWithLifecycle()
    val biometric by viewModel.biometricEnabled.collectAsStateWithLifecycle()
    val baseUrl by viewModel.baseUrl.collectAsStateWithLifecycle()
    val claimToken by viewModel.claimToken.collectAsStateWithLifecycle()
    val snacks = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberHaptics()

    fun tapTick() {
        if (!reducedMotion) haptics.tick()
    }

    LaunchedEffect(state.error) {
        state.error?.let {
            if (!reducedMotion) haptics.reject()
            snacks.showSnackbar(it)
            viewModel.onEvent(SettingsUiEvent.DismissError)
        }
    }
    val feedbackThanks = stringResource(R.string.settings_feedback_thanks)
    val biometricCd = stringResource(R.string.settings_biometric_title)
    LaunchedEffect(state.feedbackSent) {
        if (state.feedbackSent) {
            if (!reducedMotion) haptics.confirm()
            snacks.showSnackbar(feedbackThanks)
        }
    }
    LaunchedEffect(state.loggedOut) {
        if (state.loggedOut) {
            if (!reducedMotion) haptics.confirm()
            viewModel.onEvent(SettingsUiEvent.ConsumeLoggedOut)
            onLoggedOut()
        }
    }

    if (state.deleteDialogOpen) {
        DeleteAccountDialog(
            password = state.deletePassword,
            deleting = state.deletingAccount,
            onPasswordChange = { viewModel.onEvent(SettingsUiEvent.DeletePasswordChanged(it)) },
            onConfirm = { viewModel.onEvent(SettingsUiEvent.ConfirmDeleteAccount) },
            onDismiss = { viewModel.onEvent(SettingsUiEvent.CloseDeleteAccount) },
        )
    }

    MotormilaPage(title = stringResource(R.string.settings_title), snackbarHostState = snacks) {
        LazyColumn(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { OfflineBanner(visible = state.offline) }
            item {
                SectionTitle(stringResource(R.string.settings_appearance))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "light" to R.string.settings_theme_light,
                        "dark" to R.string.settings_theme_dark,
                        "system" to R.string.settings_theme_system,
                    ).forEach { (t, labelRes) ->
                        MotormilaChoiceChip(
                            label = stringResource(labelRes),
                            selected = theme == t,
                            onClick = { tapTick(); viewModel.onEvent(SettingsUiEvent.ThemeChanged(t)) },
                        )
                    }
                }
            }
            item {
                SectionTitle(stringResource(R.string.settings_language))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (option in LanguageChips) {
                        val label = stringResource(option.labelRes)
                        val description = stringResource(option.contentDescriptionRes)
                        MotormilaChoiceChip(
                            label = label,
                            selected = language == option.code,
                            onClick = {
                                tapTick()
                                viewModel.onEvent(SettingsUiEvent.LanguageChanged(option.code))
                            },
                            modifier = Modifier.semantics { contentDescription = description },
                        )
                    }
                }
            }
            item {
                SectionTitle(stringResource(R.string.settings_defaults))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = district,
                        onValueChange = { viewModel.onEvent(SettingsUiEvent.DistrictChanged(it)) },
                        label = { Text(stringResource(R.string.settings_default_district)) },
                        singleLine = true,
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    )
                    OutlinedTextField(
                        value = sort,
                        onValueChange = { viewModel.onEvent(SettingsUiEvent.SortChanged(it)) },
                        label = { Text(stringResource(R.string.settings_default_sort)) },
                        singleLine = true,
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    )
                }
            }
            item {
                SectionTitle(stringResource(R.string.settings_security))
                MotormilaSurface {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Fingerprint, contentDescription = null)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(stringResource(R.string.settings_biometric_title), style = MaterialTheme.typography.bodyLarge)
                            Text(stringResource(R.string.settings_biometric_body), style = MaterialTheme.typography.bodySmall)
                        }
                        Switch(
                            checked = biometric,
                            onCheckedChange = { enabled ->
                                if (enabled) {
                                    // Verify device credential before persisting the toggle.
                                    onBiometricVerify(
                                        {
                                            tapTick()
                                            viewModel.onEvent(SettingsUiEvent.BiometricChanged(true))
                                        },
                                        { msg -> scope.launch { snacks.showSnackbar(msg) } },
                                    )
                                } else {
                                    tapTick()
                                    viewModel.onEvent(SettingsUiEvent.BiometricChanged(false))
                                }
                            },
                            modifier = Modifier.semantics { contentDescription = biometricCd },
                        )
                    }
                }
            }
            if (BuildConfig.DEBUG) item {
                SectionTitle("Developer")
                OutlinedTextField(
                    value = baseUrl,
                    onValueChange = { viewModel.onEvent(SettingsUiEvent.BaseUrlChanged(it)) },
                    label = { Text("API base URL override (blank = default)") },
                    singleLine = true,
                    supportingText = { Text("Debug builds only — honoured by the network module.") },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                )
                TextButton(
                    shape = androidx.compose.foundation.shape.CircleShape,
                    onClick = { tapTick(); viewModel.onEvent(SettingsUiEvent.ClearCache) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(if (state.clearingCache) "Clearing…" else "Clear image + stats cache")
                }
            }
            if (BuildConfig.DEBUG) item {
                SectionTitle("Dealer claim (debug)")
                MotormilaSurface {
                    Text(
                        if (claimToken != null) {
                            "claim_token ${claimToken?.take(8)}…${claimToken?.takeLast(4)} — managed by Dealer tools"
                        } else {
                            "No dealer claim on this device — claim from Dealer tools."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = "Dealer claim token debug value" },
                    )
                }
            }
            item {
                SectionTitle(stringResource(R.string.settings_feedback))
                OutlinedTextField(
                    value = state.feedbackDraft,
                    onValueChange = { viewModel.onEvent(SettingsUiEvent.FeedbackChanged(it)) },
                    label = { Text(stringResource(R.string.settings_feedback_hint)) },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                )
                Spacer(Modifier.height(8.dp))
                PrimaryAction(stringResource(R.string.settings_feedback_send), onClick = { viewModel.onEvent(SettingsUiEvent.SendFeedback) }, loading = state.sendingFeedback)
            }
            item {
                SectionTitle(stringResource(R.string.settings_legal))
                MotormilaGroup {
                    MotormilaGroupRow(
                        title = stringResource(R.string.settings_privacy_title),
                        subtitle = stringResource(R.string.settings_privacy_body),
                        onClick = onPrivacyClick,
                    )
                    MotormilaGroupRow(
                        title = stringResource(R.string.settings_terms_title),
                        subtitle = stringResource(R.string.settings_terms_body),
                        onClick = onTermsClick,
                        showDivider = false,
                    )
                }
            }
            item {
                SectionTitle(stringResource(R.string.settings_account))
                MotormilaGroup {
                    if (state.signedIn) {
                        MotormilaGroupRow(
                            title = stringResource(R.string.account_delete_title),
                            subtitle = stringResource(R.string.account_delete_row_body),
                            onClick = { viewModel.onEvent(SettingsUiEvent.OpenDeleteAccount) },
                        )
                    }
                    MotormilaGroupRow(
                        title = stringResource(R.string.account_delete_web_title),
                        subtitle = stringResource(R.string.account_delete_web_body),
                        onClick = { onOpenUrl(WEB_DELETE_ACCOUNT_URL) },
                        showDivider = false,
                    )
                }
            }
            if (state.signedIn) item {
                PrimaryAction(stringResource(R.string.settings_logout), onClick = { viewModel.onEvent(SettingsUiEvent.Logout) }, loading = state.loggingOut)
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.settings_logout_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Confirm-before-delete dialog (permanent, server-side). */
@Composable
private fun DeleteAccountDialog(
    password: String,
    deleting: Boolean,
    onPasswordChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!deleting) onDismiss() },
        title = { Text(stringResource(R.string.account_delete_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.account_delete_body), style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(
                    value = password,
                    onValueChange = onPasswordChange,
                    label = { Text(stringResource(R.string.account_delete_password)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    enabled = !deleting,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !deleting && password.isNotBlank()) {
                Text(
                    stringResource(if (deleting) R.string.account_delete_working else R.string.account_delete_confirm),
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !deleting) {
                Text(stringResource(R.string.cancel))
            }
        },
    )
}

private data class LanguageChip(
    val code: String,
    val labelRes: Int,
    val contentDescriptionRes: Int,
)

private val LanguageChips = listOf(
    LanguageChip("en", R.string.language_en, R.string.language_en_cd),
    LanguageChip("si", R.string.language_si, R.string.language_si_cd),
    LanguageChip("ta", R.string.language_ta, R.string.language_ta_cd),
)
