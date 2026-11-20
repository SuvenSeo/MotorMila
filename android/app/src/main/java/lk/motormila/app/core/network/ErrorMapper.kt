package lk.motormila.app.core.network

import androidx.annotation.StringRes
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import lk.motormila.app.R
import lk.motormila.app.core.common.AppError
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException

/**
 * Maps transport/HTTP failures to [AppError]. Backend error shape is
 * `{detail: string | [{msg}]}` with 401/403/404/422/429/503 status codes.
 */
object ErrorMapper {

    private val lenientJson = Json { ignoreUnknownKeys = true }

    fun map(t: Throwable): AppError = when (t) {
        is HttpException -> mapHttp(t)
        is UnknownHostException -> AppError.Network("No internet connection.")
        is SocketTimeoutException -> AppError.Network("Request timed out. Please retry.")
        // OkHttp callTimeout (15 s) surfaces as a bare InterruptedIOException("timeout").
        is java.io.InterruptedIOException -> AppError.Network("Request timed out. Please retry.")
        is IOException -> AppError.Network()
        else -> AppError.Unknown(t.message?.take(180) ?: "Something went wrong.")
    }

    private fun mapHttp(e: HttpException): AppError {
        val detail = extractDetail(e)
        return when (e.code()) {
            401 -> AppError.Unauthorized()
            403 -> AppError.Forbidden(detail ?: "Your plan does not include this feature.")
            404 -> AppError.NotFound(detail ?: "Not found.")
            409 -> AppError.Validation(detail ?: "Conflict.")
            410 -> AppError.Validation(detail ?: "No longer available.")
            422 -> AppError.Validation(detail ?: "Invalid input.")
            429 -> AppError.RateLimited(detail ?: "Too many requests. Please wait a moment.")
            in 500..599 -> AppError.Server(detail ?: "Server error. Please try again later.")
            else -> AppError.Unknown(detail ?: "Request failed (${e.code()}).")
        }
    }

    /** Best-effort parse of FastAPI `{detail}` bodies (string or error-list). */
    fun extractDetail(e: HttpException): String? = runCatching {
        val raw = e.response()?.errorBody()?.string()?.take(2000) ?: return null
        val el = lenientJson.parseToJsonElement(raw)
        val detail = el.jsonObject["detail"] ?: return null
        return try {
            detail.jsonPrimitive.content.take(300)
        } catch (_: IllegalArgumentException) {
            // list form: [{loc,msg,type}] -> join messages
            detail.toString().take(300)
        }
    }.getOrNull()

    /**
     * Compatibility bridge for legacy callers that still carry error *strings*
     * (e.g. `ErrorState(message = state.error)`). Recognises only structured
     * markers — the mapper's own canonical default messages (exact match) and
     * leading HTTP status codes — never free English substrings. Anything
     * unrecognised becomes [AppError.Unknown] so the UI shows calm localized
     * copy instead of a raw exception string.
     */
    fun fromLegacyMessage(message: String?): AppError {
        val m = message?.trim().orEmpty()
        if (m.isEmpty()) return AppError.Unknown()
        // Exact canonical outputs of map()/AppError defaults (English source of truth).
        when (m) {
            AppError.Network().message, "No internet connection.",
            "Request timed out. Please retry.",
            -> return AppError.Network(m)
            AppError.Unauthorized().message -> return AppError.Unauthorized(m)
            AppError.Forbidden().message -> return AppError.Forbidden(m)
            AppError.NotFound().message -> return AppError.NotFound(m)
            AppError.RateLimited().message -> return AppError.RateLimited(m)
            AppError.Server().message -> return AppError.Server(m)
            AppError.Unknown().message -> return AppError.Unknown(m)
        }
        // Structured HTTP status markers ("401", "HTTP 503", "503 Service Unavailable").
        val code = Regex("^(?:HTTP\\s*)?(\\d{3})\\b").find(m)?.groupValues?.get(1)?.toIntOrNull()
        if (code != null) {
            return when (code) {
                401 -> AppError.Unauthorized(m)
                403 -> AppError.Forbidden(m)
                404 -> AppError.NotFound(m)
                409, 410, 422 -> AppError.Validation(m)
                429 -> AppError.RateLimited(m)
                in 500..599 -> AppError.Server(m)
                else -> AppError.Unknown(m)
            }
        }
        return AppError.Unknown(m)
    }
}

/**
 * Localized user-facing copy for a mapped error (v1.9.0 P1-E). The typed
 * [AppError] stays the source of truth; the UI edge resolves this res id via
 * `stringResource` so no raw/English exception text ever reaches the user.
 */
@StringRes
fun AppError.messageRes(): Int = when (this) {
    is AppError.Network -> R.string.v19_error_offline_body
    is AppError.Unauthorized -> R.string.v19_error_session_body
    is AppError.Forbidden -> R.string.v19_error_plan_body
    is AppError.NotFound -> R.string.v19_error_notfound_body
    is AppError.Validation -> R.string.v19_error_validation_body
    is AppError.RateLimited -> R.string.v19_error_rate_body
    is AppError.Server -> R.string.v19_error_server_body
    is AppError.Unknown -> R.string.v19_error_generic_body
}
