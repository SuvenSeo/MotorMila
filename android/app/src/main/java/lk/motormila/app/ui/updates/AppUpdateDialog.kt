package lk.motormila.app.ui.updates

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import lk.motormila.app.R
import lk.motormila.app.core.updates.AppUpdateChecker

/**
 * "Update available" dialog for the sideload channel. Shown by
 * [AppUpdateViewModel] when a newer versionCode is published.
 */
@Composable
fun AppUpdateDialog(
    update: AppUpdateChecker.CheckResult.UpdateAvailable,
    downloading: Boolean,
    onUpdate: () -> Unit,
    onDismiss: () -> Unit,
    installPermissionRequested: Boolean = false,
) {
    AlertDialog(
        containerColor = lk.motormila.app.ui.components.glassSheetColor(),
        shape = lk.motormila.app.ui.theme.MmShapes.xl,
        onDismissRequest = { if (!update.mandatory) onDismiss() },
        title = {
            lk.motormila.app.ui.components.WindowBackdropBlur()
            Text(
                text = stringResource(R.string.update_available_title),
                style = MaterialTheme.typography.titleLarge,
            )
        },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.update_available_body, update.versionName),
                    style = MaterialTheme.typography.bodyMedium,
                )
                update.notes?.let { notes ->
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = notes,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (installPermissionRequested && !downloading) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.update_install_permission_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                if (downloading) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.update_downloading),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onUpdate, enabled = !downloading) {
                Text(stringResource(R.string.update_now))
            }
        },
        dismissButton = if (update.mandatory) {
            null
        } else {
            {
                TextButton(onClick = onDismiss, enabled = !downloading) {
                    Text(stringResource(R.string.update_later))
                }
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}
