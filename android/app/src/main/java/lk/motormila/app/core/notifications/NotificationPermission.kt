package lk.motormila.app.core.notifications

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import lk.motormila.app.R

/** True when the app may post notifications (always true below Android 13). */
fun canPostNotifications(context: Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    } else {
        NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

/**
 * Asks for POST_NOTIFICATIONS (Android 13+) at a moment the user understands:
 * right after they create a price alert. Shows a short rationale first; the
 * system dialog only appears after "Allow". Asked at most once per screen
 * session ([rememberSaveable]); if the system will no longer show its dialog
 * (permanently denied), "Allow" opens the app's notification settings instead.
 *
 * @param trigger flips to true when the prompt should be considered (alert created).
 */
@Composable
fun NotificationPermissionPrompt(trigger: Boolean) {
    val context = LocalContext.current
    var asked by rememberSaveable { mutableStateOf(false) }
    var showRationale by rememberSaveable { mutableStateOf(false) }
    var deniedOnce by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) deniedOnce = true
    }

    LaunchedEffect(trigger) {
        if (trigger && !asked && !canPostNotifications(context)) {
            asked = true
            showRationale = true
        }
    }

    if (!showRationale) return
    AlertDialog(
        onDismissRequest = { showRationale = false },
        title = { Text(stringResource(R.string.notif_permission_title)) },
        text = { Text(stringResource(R.string.notif_permission_body)) },
        confirmButton = {
            TextButton(onClick = {
                showRationale = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !deniedOnce) {
                    launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    openNotificationSettings(context)
                }
            }) { Text(stringResource(R.string.notif_permission_allow)) }
        },
        dismissButton = {
            TextButton(onClick = { showRationale = false }) {
                Text(stringResource(R.string.notif_permission_not_now))
            }
        },
    )
}

/** App notification settings (fallback when the system prompt is suppressed). */
fun openNotificationSettings(context: Context) {
    runCatching {
        context.startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/** Pure gate: the runtime prompt exists only on Android 13+ and only when not yet granted. */
internal fun shouldRequestNotificationPermission(sdkInt: Int, granted: Boolean): Boolean =
    sdkInt >= Build.VERSION_CODES.TIRAMISU && !granted

/**
 * Imperative variant of [NotificationPermissionPrompt] for one-shot events
 * (e.g. a ViewModel "alert created" effect):
 *
 * ```
 * val requestNotifications = rememberNotificationPermissionRequester()
 * LaunchedEffect(Unit) { viewModel.alertCreated.collect { requestNotifications() } }
 * ```
 *
 * No-op below Android 13 or when already granted; launches the system
 * dialog directly (no rationale; show your own copy first if wanted).
 * [onResult] receives the final granted state.
 */
@Composable
fun rememberNotificationPermissionRequester(onResult: (Boolean) -> Unit = {}): () -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        onResult(granted)
    }
    return remember(context, launcher) {
        {
            val granted = canPostNotifications(context)
            if (shouldRequestNotificationPermission(Build.VERSION.SDK_INT, granted)) {
                launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                onResult(granted)
            }
        }
    }
}
