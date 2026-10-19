package lk.motormila.app.ui.updates

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import lk.motormila.app.core.updates.AppUpdateChecker
import lk.motormila.app.di.IoDispatcher

/**
 * All checker I/O is confined to [AppUpdateViewModel] via withContext(Dispatchers.IO)
 * — the checker's blocking OkHttp calls must never touch the main thread, and the
 * surrounding runCatching guarantees an update-check failure can never crash the app.
 */

/**
 * Owns the in-app update flow: one passive check per cold start, an optional
 * manual re-check, download + installer hand-off.
 *
 * Dismissal: "Later" hides the dialog and remembers that version code so the
 * passive launch check stays quiet, while an explicit manual check always
 * re-shows what's available. Failures are silent except the manual check,
 * which surfaces a "no update" confirmation.
 */
@HiltViewModel
class AppUpdateViewModel @Inject constructor(
    private val updateChecker: AppUpdateChecker,
    @ApplicationContext private val appContext: Context,
    /** Injected per the app-wide convention so the flow is testable/deterministic. */
    @IoDispatcher private val io: CoroutineDispatcher,
) : ViewModel() {

    data class UiState(
        val checking: Boolean = false,
        val downloading: Boolean = false,
        val available: AppUpdateChecker.CheckResult.UpdateAvailable? = null,
        val dismissedVersionCode: Int? = null,
        val downloadFailedTick: Int = 0,
        val manuallyCheckedWithNoUpdate: Boolean = false,
        /** User was sent to "Install unknown apps"; tap Update again on return. */
        val installPermissionRequested: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var checkedThisProcess = false

    /** Passive check at app start — never shows "no update" feedback. */
    fun checkOnLaunch(currentVersionCode: Int) {
        if (checkedThisProcess) return
        checkedThisProcess = true
        runCheck(currentVersionCode, isManual = false)
    }

    /** Explicit "Check for updates" action — surfaces result feedback. */
    fun manualCheck(currentVersionCode: Int) {
        runCheck(currentVersionCode, isManual = true)
    }

    fun consumeNoUpdateFeedback() {
        _state.update { it.copy(manuallyCheckedWithNoUpdate = false) }
    }

    fun consumeDownloadFailure() {
        _state.update { it.copy(downloadFailedTick = 0) }
    }

    /** "Later" — quiet for this version on passive checks. */
    fun dismiss() {
        if (_state.value.available?.mandatory == true) return
        _state.update { current ->
            current.copy(
                available = null,
                dismissedVersionCode = current.available?.versionCode,
            )
        }
    }

    fun downloadAndInstall(update: AppUpdateChecker.CheckResult.UpdateAvailable) {
        if (_state.value.downloading) return
        // Android 8+: the user must allow this app to install packages first.
        val canInstall = runCatching { updateChecker.canInstallPackages(appContext) }.getOrDefault(false)
        if (!canInstall) {
            runCatching { updateChecker.openInstallPermissionSettings(appContext) }
            _state.update { it.copy(installPermissionRequested = true) }
            return
        }
        _state.update { it.copy(downloading = true, installPermissionRequested = false) }
        viewModelScope.launch {
            // Blocking network + disk I/O stays off the main thread.
            val apk = runCatching {
                withContext(io) { updateChecker.downloadApk(update.apkUrl, appContext, update.sha256) }
            }.getOrElse {
                if (it is kotlinx.coroutines.CancellationException) throw it
                null
            }
            _state.update { it.copy(downloading = false) }
            if (apk != null) {
                runCatching { updateChecker.launchInstaller(apk, appContext) }
            } else {
                _state.update { it.copy(downloadFailedTick = it.downloadFailedTick + 1) }
            }
        }
    }
    private fun runCheck(currentVersionCode: Int, isManual: Boolean) {
        if (_state.value.checking) return
        _state.update { it.copy(checking = true) }
        viewModelScope.launch {
            // The checker performs blocking network I/O — always on Dispatchers.IO.
            // Any failure (network down, parse error, unexpected exception) is a
            // silent "up to date"; the update flow can never crash the app.
            val result = runCatching {
                withContext(io) { updateChecker.check(currentVersionCode) }
            }.getOrElse {
                if (it is kotlinx.coroutines.CancellationException) throw it
                AppUpdateChecker.CheckResult.UpToDate
            }
            _state.update { current ->
                when (result) {
                    is AppUpdateChecker.CheckResult.UpdateAvailable ->
                        // Manual checks always re-show; passive checks respect dismissal.
                        if (!isManual && current.dismissedVersionCode == result.versionCode) {
                            current.copy(checking = false)
                        } else {
                            current.copy(checking = false, available = result)
                        }
                    AppUpdateChecker.CheckResult.UpToDate -> current.copy(
                        checking = false,
                        manuallyCheckedWithNoUpdate = isManual,
                    )
                }
            }
        }
    }
}
