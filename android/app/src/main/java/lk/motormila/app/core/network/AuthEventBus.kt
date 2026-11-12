package lk.motormila.app.core.network

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * App-wide auth event bus. [AuthInterceptor] emits [Unauthorized] on HTTP 401;
 * UI layer collects this flow (e.g. in MainActivity) to force logout / nav to login.
 * Kept in core.network so data/ has zero UI imports.
 */
@Singleton
class AuthEventBus @Inject constructor() {
    private val _events = MutableSharedFlow<AuthEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<AuthEvent> = _events.asSharedFlow()

    fun post(event: AuthEvent) {
        _events.tryEmit(event)
    }
}

sealed interface AuthEvent {
    /**
     * Access token rejected (401). [path] = request path that failed;
     * [rejectedToken] = the bearer that was rejected (in-memory only, never
     * logged) so a late 401 for an OLD token cannot sign out a NEW session.
     */
    data class Unauthorized(val path: String? = null, val rejectedToken: String? = null) : AuthEvent {
        override fun toString(): String = "Unauthorized(path=$path)"
    }

    /** The rejected session was actually cleared: UI routes to Login. */
    data object SessionEnded : AuthEvent
}
