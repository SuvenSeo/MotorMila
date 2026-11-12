package lk.motormila.app.data.auth

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.launch
import lk.motormila.app.core.network.AuthEvent
import lk.motormila.app.core.network.AuthEventBus
import lk.motormila.app.domain.repository.AuthRepository

/**
 * Turns a rejected bearer (HTTP 401 seen by
 * [lk.motormila.app.core.network.AuthInterceptor]) into a REAL logout:
 * the persisted session and in-memory token are cleared, the alert worker is
 * cancelled, and only then [AuthEvent.SessionEnded] is posted so the UI
 * routes to Login. A late 401 for an older token (user already signed in
 * again) is ignored.
 *
 * Started once from [lk.motormila.app.MotormilaApp.onCreate].
 */
@Singleton
class SessionGuard @Inject constructor(
    private val bus: AuthEventBus,
    private val authRepository: AuthRepository,
) {
    private var job: Job? = null

    fun start(scope: CoroutineScope) {
        if (job?.isActive == true) return
        job = scope.launch {
            bus.events.filterIsInstance<AuthEvent.Unauthorized>().collect { event ->
                runCatching { onUnauthorized(event) }
            }
        }
    }

    /** Returns true when the session was cleared (and [AuthEvent.SessionEnded] posted). */
    suspend fun onUnauthorized(event: AuthEvent.Unauthorized): Boolean {
        val cleared = authRepository.clearRejectedSession(event.rejectedToken)
        if (cleared) bus.post(AuthEvent.SessionEnded)
        return cleared
    }
}
