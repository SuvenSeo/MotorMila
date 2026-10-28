package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Native push device registration. Backend: endpoints/notifications.py
 * POST / DELETE /notifications/devices (signed-in session required).
 * Request fields carry no defaults: the shared Json does not encode
 * defaults, and every field must reach the server.
 */
@Serializable
data class DeviceRegisterRequestDto(
    val token: String,
    val platform: String,
    @SerialName("app_version") val appVersion: String?,
    @SerialName("price_drops_enabled") val priceDropsEnabled: Boolean,
    /** Local watchlist ids so the server can push drops on watched listings. */
    @SerialName("watched_listing_ids") val watchedListingIds: List<Int>,
)

@Serializable
data class DeviceUnregisterRequestDto(
    val token: String,
)

@Serializable
data class DeviceRegisterResponseDto(
    val registered: Boolean = false,
    @SerialName("price_drops_enabled") val priceDropsEnabled: Boolean = true,
    @SerialName("watched_count") val watchedCount: Int = 0,
    @SerialName("push_configured") val pushConfigured: Boolean = false,
)
