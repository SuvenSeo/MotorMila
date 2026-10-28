package lk.motormila.app.fcm

import lk.motormila.app.data.remote.dto.DeviceRegisterRequestDto

/**
 * A data-only FCM message from the backend (app/utils/price_drop_push.py):
 * {type: "price_drop", listing_id, deep_link, title, body, ...}. Pure + unit-testable.
 */
data class IncomingPush(
    val kind: String?,
    val title: String,
    val body: String,
    val listingId: Int?,
) {
    /** Stable per-listing notification id so a newer drop replaces the older one. */
    val notificationId: Int
        get() = if (listingId != null) PUSH_NOTIF_ID_BASE + listingId else PUSH_NOTIF_ID_BASE

    companion object {
        const val PUSH_NOTIF_ID_BASE = 20_000
    }
}

private val LISTING_PATH_RE = Regex("""/listing/(\d+)""")

/** Listing id from `listing_id`, else from the `deep_link` path (/listing/<id>). */
internal fun pushListingId(data: Map<String, String>): Int? =
    data["listing_id"]?.trim()?.toIntOrNull()?.takeIf { it > 0 }
        ?: data["deep_link"]?.let { LISTING_PATH_RE.find(it)?.groupValues?.get(1)?.toIntOrNull() }
            ?.takeIf { it > 0 }

/** Null when the message has nothing to show (no title and no body). */
fun parseIncomingPush(data: Map<String, String>): IncomingPush? {
    val title = data["title"]?.trim().orEmpty()
    val body = data["body"]?.trim().orEmpty()
    if (title.isEmpty() && body.isEmpty()) return null
    return IncomingPush(
        kind = data["type"]?.trim()?.ifEmpty { null },
        title = title.ifEmpty { "MotorMila" },
        body = body,
        listingId = pushListingId(data),
    )
}

/** Max watchlist ids sent per registration (backend keeps 500). */
internal const val MAX_REGISTERED_WATCH_IDS = 500

fun buildDeviceRegistration(
    token: String,
    appVersion: String?,
    priceDropsEnabled: Boolean,
    watchedListingIds: Collection<Int>,
): DeviceRegisterRequestDto = DeviceRegisterRequestDto(
    token = token,
    platform = "android",
    appVersion = appVersion?.take(32),
    priceDropsEnabled = priceDropsEnabled,
    watchedListingIds = watchedListingIds.filter { it > 0 }.distinct().sorted().take(MAX_REGISTERED_WATCH_IDS),
)
