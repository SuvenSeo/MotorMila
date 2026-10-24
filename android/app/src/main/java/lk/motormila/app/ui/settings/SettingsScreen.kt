package lk.motormila.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.DataSaverOn
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Feedback
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import lk.motormila.app.BuildConfig
import lk.motormila.app.R
import lk.motormila.app.core.SupportContact
import lk.motormila.app.data.remote.WEB_DELETE_ACCOUNT_URL
import lk.motormila.app.ui.common.InsetGroup
import lk.motormila.app.ui.common.InsetRow
import lk.motormila.app.ui.common.InsetSwitchRow
import lk.motormila.app.ui.common.InsetDivider
import lk.motormila.app.ui.common.LowDataMode
import lk.motormila.app.ui.common.MmScreen
import lk.motormila.app.ui.common.MmSegmented
import lk.motormila.app.ui.common.MmTextField
import lk.motormila.app.ui.common.ScreenPadding
import lk.motormila.app.ui.components.MmButton
import lk.motormila.app.ui.components.MmSheet
import lk.motormila.app.ui.theme.MmColors
import lk.motormila.app.ui.theme.MmHaptics
import lk.motormila.app.ui.theme.MmSpacing
import lk.motormila.app.ui.theme.MmType

/**
 * Settings as grouped inset lists (iOS Settings-like). Only settings that
 * actually change something are shown: the old default-district / default-sort
 * fields were never read by Search, and the biometric toggle gated nothing,
 * so both are gone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onLoggedOut: () -> Unit,
    onOpenUrl: (url: String) -> Unit,
    @Suppress("UNUSED_PARAMETER")
    onBiometricVerify: (onSuccess: () -> Unit, onError: (String) -> Unit) -> Unit = { _, _ -> },
    onPrivacyClick: () -> Unit = {},
    onTermsClick: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val theme by viewModel.theme.collectAsStateWithLifecycle()
    val reduceTransparency by viewModel.reduceTransparency.collectAsStateWithLifecycle()
    val language by viewModel.language.collectAsStateWithLifecycle()
    val baseUrl by viewModel.baseUrl.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lowData = LowDataMode.current()
    val snacks = remember { SnackbarHostState() }
    val haptics = MmHaptics.current
    var feedbackOpen by rememberSaveable { mutableStateOf(false) }
    var logoutConfirm by rememberSaveable { mutableStateOf(false) }
    var licencesOpen by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(state.error) {
        state.error?.let {
            haptics.reject()
            snacks.showSnackbar(it)
            viewModel.onEvent(SettingsUiEvent.DismissError)
        }
    }
    val thanks = stringResource(R.string.settings_feedback_thanks)
    LaunchedEffect(state.feedbackSent) {
        if (state.feedbackSent) {
            haptics.save()
            feedbackOpen = false
            snacks.showSnackbar(thanks)
        }
    }
    val cleared = stringResource(R.string.scr_set_cache_cleared)
    LaunchedEffect(state.cacheCleared) {
        if (state.cacheCleared) {
            snacks.showSnackbar(cleared)
            viewModel.onEvent(SettingsUiEvent.ConsumeCacheCleared)
        }
    }
    LaunchedEffect(state.loggedOut) {
        if (state.loggedOut) {
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
    if (logoutConfirm) {
        AlertDialog(
            containerColor = lk.motormila.app.ui.components.glassSheetColor(),
            shape = lk.motormila.app.ui.theme.MmShapes.xl,
            onDismissRequest = { logoutConfirm = false },
            title = { lk.motormila.app.ui.components.WindowBackdropBlur(); Text(stringResource(R.string.settings_logout)) },
            text = { Text(stringResource(R.string.settings_logout_note)) },
            confirmButton = {
                TextButton(onClick = { logoutConfirm = false; viewModel.onEvent(SettingsUiEvent.Logout) }) {
                    Text(stringResource(R.string.settings_logout), color = MmColors.current.danger)
                }
            },
            dismissButton = { TextButton(onClick = { logoutConfirm = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }

    MmScreen(title = stringResource(R.string.settings_title), snackbarHostState = snacks, edgeToEdge = true) {
        val c = MmColors.current
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = ScreenPadding,
            verticalArrangement = Arrangement.spacedBy(MmSpacing.xl),
        ) {
            item(key = "appearance") {
                InsetGroup(header = stringResource(R.string.settings_appearance)) {
                    val options = listOf("light", "dark", "system")
                    Column(Modifier.padding(MmSpacing.md)) {
                        MmSegmented(
                            options = listOf(
                                stringResource(R.string.settings_theme_light),
                                stringResource(R.string.settings_theme_dark),
                                stringResource(R.string.settings_theme_system),
                            ),
                            selectedIndex = options.indexOf(theme).coerceAtLeast(0),
                            onSelect = {
                                if (options[it] != theme) haptics.toggle()
                                viewModel.onEvent(SettingsUiEvent.ThemeChanged(options[it]))
                            },
                        )
                    }
                    InsetDivider()
                    InsetSwitchRow(
                        title = stringResource(R.string.settings_reduce_transparency),
                        subtitle = stringResource(R.string.settings_reduce_transparency_sub),
                        checked = reduceTransparency,
                        onCheckedChange = { viewModel.onEvent(SettingsUiEvent.ReduceTransparencyChanged(it)) },
                        showDivider = false,
                    )
                }
            }
            item(key = "language") {
                InsetGroup(
                    header = stringResource(R.string.settings_language),
                    footer = stringResource(R.string.scr_set_language_note),
                ) {
                    val langs = listOf(
                        "en" to R.string.language_en_cd,
                        "si" to R.string.language_si,
                        "ta" to R.string.language_ta,
                    )
                    langs.forEachIndexed { i, (code, label) ->
                        InsetRow(
                            title = stringResource(label),
                            icon = if (i == 0) Icons.Filled.Language else null,
                            showDivider = i < langs.lastIndex,
                            onClick = {
                                if (language != code) {
                                    haptics.toggle()
                                    viewModel.onEvent(SettingsUiEvent.LanguageChanged(code))
                                }
                            },
                            trailing = {
                                if (language == code) Icon(Icons.Filled.Check, contentDescription = stringResource(R.string.scr_selected), tint = c.brandText)
                            },
                        )
                    }
                }
            }
            item(key = "data") {
                InsetGroup(
                    header = stringResource(R.string.scr_set_data),
                    footer = stringResource(R.string.scr_set_low_data_note),
                ) {
                    InsetSwitchRow(
                        title = stringResource(R.string.scr_set_low_data),
                        checked = lowData,
                        onCheckedChange = { LowDataMode.set(context, it) },
                        icon = Icons.Filled.DataSaverOn,
                        iconTint = c.dealGreat,
                    )
                    InsetRow(
                        title = stringResource(R.string.scr_set_clear_cache),
                        icon = Icons.Filled.CleaningServices,
                        value = if (state.clearingCache) stringResource(R.string.scr_set_clearing) else null,
                        showDivider = false,
                        onClick = { viewModel.onEvent(SettingsUiEvent.ClearCache) },
                    )
                }
            }
            item(key = "support") {
                InsetGroup(header = stringResource(R.string.scr_set_support)) {
                    InsetRow(stringResource(R.string.settings_feedback), icon = Icons.Filled.Feedback, onClick = { feedbackOpen = true })
                    InsetRow(
                        stringResource(R.string.scr_set_contact),
                        subtitle = SupportContact.EMAIL,
                        icon = Icons.Filled.Mail,
                        showDivider = false,
                        onClick = { onOpenUrl(SupportContact.MAILTO) },
                    )
                }
            }
            item(key = "legal") {
                InsetGroup(header = stringResource(R.string.settings_legal)) {
                    InsetRow(stringResource(R.string.settings_privacy_title), icon = Icons.Filled.Policy, onClick = onPrivacyClick)
                    InsetRow(stringResource(R.string.settings_terms_title), icon = Icons.Filled.Description, onClick = onTermsClick)
                    InsetRow(
                        stringResource(R.string.settings_licences_title),
                        subtitle = stringResource(R.string.settings_licences_body),
                        icon = Icons.Filled.Description,
                        showDivider = false,
                        onClick = { licencesOpen = true },
                    )
                }
            }
            item(key = "account") {
                InsetGroup(header = stringResource(R.string.settings_account)) {
                    if (state.signedIn) {
                        InsetRow(
                            stringResource(R.string.settings_logout),
                            icon = Icons.AutoMirrored.Filled.Logout,
                            onClick = { logoutConfirm = true },
                            value = if (state.loggingOut) "…" else null,
                        )
                        InsetRow(
                            stringResource(R.string.account_delete_title),
                            subtitle = stringResource(R.string.account_delete_row_body),
                            icon = Icons.Filled.DeleteForever,
                            iconTint = c.danger,
                            titleColor = c.danger,
                            onClick = { viewModel.onEvent(SettingsUiEvent.OpenDeleteAccount) },
                        )
                    }
                    InsetRow(
                        stringResource(R.string.account_delete_web_title),
                        subtitle = stringResource(R.string.account_delete_web_body),
                        icon = Icons.Filled.OpenInBrowser,
                        showDivider = false,
                        onClick = { onOpenUrl(WEB_DELETE_ACCOUNT_URL) },
                    )
                }
            }
            if (BuildConfig.DEBUG) item(key = "dev") {
                InsetGroup(header = "Developer") {
                    Column(Modifier.padding(MmSpacing.md)) {
                        MmTextField(
                            label = stringResource(R.string.ui_settings_api_base_url_override_blank),
                            value = baseUrl,
                            onValueChange = { viewModel.onEvent(SettingsUiEvent.BaseUrlChanged(it)) },
                            supporting = stringResource(R.string.ui_settings_debug_builds_only_honoured_by),
                        )
                    }
                }
            }
        }
    }

    if (licencesOpen) {
        MmSheet(onDismissRequest = { licencesOpen = false }, title = stringResource(R.string.settings_licences_title)) {
            val licences = remember(context) {
                runCatching {
                    context.assets.list("licenses").orEmpty().sorted().map { name ->
                        val title = name.removeSuffix(".txt").replace('_', ' ')
                            .replace("OFL", "(SIL Open Font License 1.1)")
                            .split(' ').joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
                        title to context.assets.open("licenses/$name").bufferedReader().use { it.readText() }
                    }
                }.getOrDefault(emptyList())
            }
            LazyColumn(
                Modifier.fillMaxWidth().padding(horizontal = MmSpacing.lg),
                verticalArrangement = Arrangement.spacedBy(MmSpacing.md),
            ) {
                item {
                    Text(
                        stringResource(R.string.settings_licences_intro),
                        style = MmType.current.bodyM,
                        color = MmColors.current.textSecondary,
                    )
                }
                licences.forEach { (title, body) ->
                    item(key = title) {
                        Column(verticalArrangement = Arrangement.spacedBy(MmSpacing.xs)) {
                            Text(title, style = MmType.current.titleS, color = MmColors.current.textPrimary)
                            Text(body, style = MmType.current.caption, color = MmColors.current.textSecondary)
                        }
                    }
                }
                item { Spacer(Modifier.height(MmSpacing.xl)) }
            }
        }
    }

    if (feedbackOpen) {
        MmSheet(onDismissRequest = { feedbackOpen = false }, title = stringResource(R.string.settings_feedback)) {
            Column(Modifier.padding(horizontal = MmSpacing.lg), verticalArrangement = Arrangement.spacedBy(MmSpacing.md)) {
                MmTextField(
                    label = stringResource(R.string.settings_feedback_hint),
                    value = state.feedbackDraft,
                    onValueChange = { viewModel.onEvent(SettingsUiEvent.FeedbackChanged(it)) },
                    singleLine = false,
                    minLines = 4,
                )
                MmButton(
                    text = stringResource(R.string.settings_feedback_send),
                    onClick = { viewModel.onEvent(SettingsUiEvent.SendFeedback) },
                    loading = state.sendingFeedback,
                    enabled = state.feedbackDraft.trim().length >= 10,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(stringResource(R.string.scr_set_feedback_min), style = MmType.current.caption, color = MmColors.current.textTertiary)
                Spacer(Modifier.height(MmSpacing.lg))
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
        containerColor = lk.motormila.app.ui.components.glassSheetColor(),
        shape = lk.motormila.app.ui.theme.MmShapes.xl,
        onDismissRequest = { if (!deleting) onDismiss() },
        title = { lk.motormila.app.ui.components.WindowBackdropBlur(); Text(stringResource(R.string.account_delete_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.account_delete_body), style = MmType.current.bodyM)
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
                    color = MmColors.current.danger,
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
