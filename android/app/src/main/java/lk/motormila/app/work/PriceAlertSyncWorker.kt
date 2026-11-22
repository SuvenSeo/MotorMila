package lk.motormila.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkManager
import androidx.work.WorkerParameters

/** Kept for WorkManager requests persisted by older installs. A match is not permission to deliver. */
class PriceAlertSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = Result.success()

    companion object {
        fun cancelLegacyWork(manager: WorkManager) {
            manager.cancelUniqueWork("price_alert_sync")
            manager.cancelUniqueWork("price_alert_sync_once")
        }
    }
}
