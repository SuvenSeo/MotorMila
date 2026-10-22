package lk.motormila.app.core.updates

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.security.MessageDigest
import androidx.core.content.FileProvider
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import lk.motormila.app.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Static release manifest written by the android-release workflow (CDN, survives backend outages). */
internal const val STATIC_RELEASE_MANIFEST_URL = "https://motormila.pages.dev/app/latest-release.json"

/**
 * In-app update checking for the sideload ("direct" flavor) APK channel.
 * Disabled entirely in the "play" flavor ([BuildConfig.SELF_UPDATE_ENABLED]):
 * Play's Device and Network Abuse policy forbids self-updating.
 *
 * Integrity: the manifest must carry the APK's SHA-256; the downloaded bytes
 * are hashed and the installer is never launched on a mismatch (or when no
 * hash is published). Android's own same-signer check is the second layer.
 *
 * Flow: app calls GET {BASE_URL}/releases/app → backend returns env-published
 * metadata for the newest GitHub Release APK. If [LatestRelease.versionCode]
 * is greater than the running BuildConfig.VERSION_CODE the UI shows an
 * "Update available" dialog; tapping it downloads the APK and hands it to the
 * system package installer (user confirms — no silent install).
 *
 * Version comparison is numeric on versionCode (never versionName strings).
 * Every failure path yields "up to date" — the checker can never block usage.
 */
@Singleton
class AppUpdateChecker @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val json: Json,
) {

    @Serializable
    data class LatestRelease(
        val version: String? = null,
        val version_code: Int? = null,
        val apk_url: String? = null,
        val notes: String? = null,
        val published_at: String? = null,
        val min_supported_version_code: Int = 0,
        val sha256: String? = null,
    )

    sealed interface CheckResult {
        /** A newer build exists; fields are pre-decoded for the dialog. */
        data class UpdateAvailable(
            val versionName: String,
            val versionCode: Int,
            val apkUrl: String,
            val notes: String?,
            /** Lower-case hex SHA-256 of the APK, from the release manifest. */
            val sha256: String? = null,
            /** Running build is below min_supported_version_code: no "Later". */
            val mandatory: Boolean = false,
        ) : CheckResult

        /** Running build is the newest (or check failed) — no action needed. */
        data object UpToDate : CheckResult
    }

    /**
     * Ask the backend for the newest release. Returns [CheckResult.UpdateAvailable]
     * only when the remote versionCode strictly exceeds the running one AND an
     * apk_url is present. Any network/parse error yields [CheckResult.UpToDate].
     */
    suspend fun check(currentVersionCode: Int): CheckResult {
        if (!BuildConfig.SELF_UPDATE_ENABLED) return CheckResult.UpToDate
        val release = fetchLatestRelease() ?: return CheckResult.UpToDate
        return decide(release, currentVersionCode)
    }

    /**
     * Download the APK into app-external cache. Returns null on any failure —
     * the caller keeps the user in the app and surfaces a snackbar.
     */
    suspend fun downloadApk(apkUrl: String, context: Context, expectedSha256: String?): File? {
        if (!BuildConfig.SELF_UPDATE_ENABLED) return null
        val expected = normalizeSha256(expectedSha256) ?: return null
        if (!apkUrl.startsWith("https://")) return null
        return try {
            // Bare client — never send the session JWT to an APK download host.
            // The shared okHttpClient carries AuthInterceptor which would
            // exfiltrate the bearer token to whatever host apk_url points at.
            val bareClient = OkHttpClient.Builder()
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                .build()
            val request = Request.Builder().url(apkUrl).build()
            bareClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body ?: return null
                val dir = File(context.getExternalFilesDir(null), "updates").apply { mkdirs() }
                val target = File(dir, "motormila-update.apk")
                val digest = MessageDigest.getInstance("SHA-256")
                target.outputStream().use { out ->
                    body.byteStream().use { input ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            digest.update(buf, 0, n)
                            out.write(buf, 0, n)
                        }
                    }
                }
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (target.length() == 0L || actual != expected) {
                    // Tampered, truncated or wrong file: never hand it to the installer.
                    target.delete()
                    return null
                }
                target
            }
        } catch (_: IOException) {
            null
        } catch (_: SecurityException) {
            null
        } catch (ce: CancellationException) {
            throw ce
        } catch (_: Exception) {
            // Last-resort guard: download failure must never crash the app.
            null
        }
    }

    /**
     * Hand the downloaded APK to the system installer. Requires the user to
     * have "Install unknown apps" enabled for this app (sideload channel).
     */
    fun launchInstaller(apkFile: File, context: Context): Boolean {
        if (!BuildConfig.SELF_UPDATE_ENABLED) return false
        return try {
            val uri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile,
            )
            val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    /** True when this app may launch the package installer ("Install unknown apps"). */
    fun canInstallPackages(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()

    /** Opens the system "Install unknown apps" toggle for this app. */
    fun openInstallPermissionSettings(context: Context): Boolean = try {
        context.startActivity(
            Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
    } catch (_: ActivityNotFoundException) {
        false
    }

    /** Static CDN manifest first (carries sha256, up when the API is down), then the API. */
    private suspend fun fetchLatestRelease(): LatestRelease? {
        // Debug/preview builds (lk.motormila.app.debug) follow the preview
        // pre-release manifest only: production APKs are a different package.
        val preview = BuildConfig.PREVIEW_UPDATE_MANIFEST_URL.trim()
        if (preview.isNotEmpty()) return fetchManifest(preview, bare = true)
        return fetchManifest(STATIC_RELEASE_MANIFEST_URL, bare = true)
            ?: fetchManifest(buildReleaseUrl(), bare = false)
    }

    private val bareClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .build()
    }

    private suspend fun fetchManifest(rawUrl: String, bare: Boolean): LatestRelease? {
        val client = if (bare) bareClient else okHttpClient
        val url = rawUrl.toHttpUrlOrNull() ?: return null
        val request = Request.Builder().url(url).get().build()
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body ?: return null
                json.decodeFromString(LatestRelease.serializer(), body.string())
                    .takeIf { it.version_code != null }
            }
        } catch (e: CancellationException) {
            // Coroutine cancellation must propagate, never be swallowed.
            throw e
        } catch (_: Exception) {
            // Any failure (offline, parse, unexpected runtime error) is a silent
            // "up to date" — a broken update check must never crash the app.
            null
        }
    }

    private fun buildReleaseUrl(): String =
        BuildConfig.BASE_URL.trim().trimEnd('/') + "/releases/app"

    companion object {
        /** Pure decision policy (unit-tested). */
        internal fun decide(release: LatestRelease, currentVersionCode: Int): CheckResult {
            val remoteCode = release.version_code ?: return CheckResult.UpToDate
            val url = release.apk_url?.trim().orEmpty()
            if (remoteCode <= currentVersionCode || url.isBlank()) return CheckResult.UpToDate
            // No published hash = no verifiable install: stay quiet.
            val sha = normalizeSha256(release.sha256) ?: return CheckResult.UpToDate
            return CheckResult.UpdateAvailable(
                versionName = release.version ?: "v$remoteCode",
                versionCode = remoteCode,
                apkUrl = url,
                notes = release.notes?.takeIf { it.isNotBlank() },
                sha256 = sha,
                mandatory = currentVersionCode < release.min_supported_version_code,
            )
        }

        internal fun normalizeSha256(raw: String?): String? {
            val v = raw?.trim()?.lowercase()?.removePrefix("sha256:") ?: return null
            return v.takeIf { it.length == 64 && it.all { c -> c in '0'..'9' || c in 'a'..'f' } }
        }
    }
}

/**
 * Play flavor: open this app's Google Play listing (updates are Play's job).
 * Falls back to the web listing when the Play Store app is missing.
 */
fun openPlayStoreListing(context: Context) {
    val pkg = context.packageName.removeSuffix(".debug")
    val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(market)
    } catch (_: ActivityNotFoundException) {
        runCatching {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}
