package lk.motormila.app.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import java.net.SocketTimeoutException

/** Hubs give up waiting after this long and show a designed error with Retry (B11). */
const val HUB_LOAD_TIMEOUT_MS: Long = 15_000L

/**
 * [runCatching] with a deadline: a call that hangs past [timeoutMs] fails with a
 * [SocketTimeoutException] (mapped by [ErrorMapper] to "Request timed out. Please
 * retry.") instead of leaving the screen on its skeleton forever. Real
 * cancellation of the caller is rethrown, never swallowed.
 */
suspend fun <T> runCatchingWithTimeout(
    timeoutMs: Long = HUB_LOAD_TIMEOUT_MS,
    block: suspend () -> T,
): Result<T> =
    try {
        Result.success(withTimeout(timeoutMs) { block() })
    } catch (e: TimeoutCancellationException) {
        Result.failure(SocketTimeoutException("Request timed out. Please retry."))
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        Result.failure(e)
    }
