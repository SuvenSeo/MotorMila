package lk.motormila.app.work

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class PriceAlertWorkerPolicyTest {
    @Test fun legacyRequestFinishesWithoutConsultingSessionCacheOrNetwork() = runTest {
        val context = mockk<Context>()
        val worker = PriceAlertSyncWorker(context, mockk<WorkerParameters>(relaxed = true))
        clearMocks(context, answers = false)
        assertEquals(ListenableWorker.Result.success(), worker.doWork())
        verify { context wasNot Called }
    }

    @Test fun upgradeOnlyCancelsTheTwoOldSchedules() {
        val wm = mockk<WorkManager>(relaxed = true)
        PriceAlertSyncWorker.cancelLegacyWork(wm)
        verify { wm.cancelUniqueWork("price_alert_sync") }
        verify { wm.cancelUniqueWork("price_alert_sync_once") }
        confirmVerified(wm)
    }
}
