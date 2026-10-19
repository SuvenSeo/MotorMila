package lk.motormila.app.core.common

/**
 * Typed result for every data-layer operation.
 *
 * Success carries the value; Error carries a structured [AppError] so UI can
 * branch (e.g. Unauthorized -> force logout, RateLimited -> backoff message)
 * instead of parsing raw strings.
 */
sealed interface AppResult<out T> {
    data class Success<T>(val value: T) : AppResult<T>
    data class Error(val error: AppError) : AppResult<Nothing>

    val isSuccess: Boolean get() = this is Success
    fun getOrNull(): T? = (this as? Success)?.value
    fun errorOrNull(): AppError? = (this as? Error)?.error

    companion object {
        fun <T> success(value: T): AppResult<T> = Success(value)
        fun <T> failure(error: AppError): AppResult<T> = Error(error)
    }
}

/** Structured API/transport failure. [message] is safe to show to the user. */
sealed interface AppError {
    val message: String

    data class Network(override val message: String = "No connection. Check your internet and retry.") : AppError
    data class Unauthorized(override val message: String = "Session expired. Please sign in again.") : AppError
    data class Forbidden(override val message: String = "Your plan does not include this feature.") : AppError
    data class NotFound(override val message: String = "Not found.") : AppError
    data class Validation(override val message: String) : AppError
    data class RateLimited(override val message: String = "Too many requests. Please wait a moment.") : AppError
    data class Server(override val message: String = "Server error. Please try again later.") : AppError
    data class Unknown(override val message: String = "Something went wrong.") : AppError
}

/** Convenience: run [block], mapping any thrown error via [lk.motormila.app.core.network.ErrorMapper]. */
suspend fun <T> resultOf(block: suspend () -> T): AppResult<T> =
    try {
        AppResult.Success(block())
    } catch (ce: kotlin.coroutines.cancellation.CancellationException) {
        // Never swallow cooperative cancellation — rethrow so structured
        // concurrency keeps working and callers don't write stale error state.
        throw ce
    } catch (t: Throwable) {
        AppResult.Error(lk.motormila.app.core.network.ErrorMapper.map(t))
    }
