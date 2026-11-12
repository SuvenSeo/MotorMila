package lk.motormila.app.core.network

import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
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
}
