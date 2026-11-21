package lk.motormila.app.ui.auth

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

// Public request form. /reset-password is the *completion* page and needs an emailed token.
internal const val BUYER_RESET_REQUEST_URL = "https://motormila.pages.dev/forgot-password"

/** True means dispatch only. The website owns the request, its response and email delivery. */
internal fun openBuyerResetRequest(context: Context): Boolean {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(BUYER_RESET_REQUEST_URL))
        .addCategory(Intent.CATEGORY_BROWSABLE)
    return try {
        context.startActivity(intent)
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        false
    }
}
