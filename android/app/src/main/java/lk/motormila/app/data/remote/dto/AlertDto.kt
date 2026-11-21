package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Alert + notification DTOs. Backend: endpoints/alerts.py, notifications.py.
 */
@Serializable
data class AlertPreferencesDto(@SerialName("explicit_alert_channels") val explicitChannels: Boolean = false)

@Serializable
data class AlertDto(
    val id: Int = 0,
    @SerialName("user_token") val userToken: String = "",
    val make: String? = null,
    val model: String? = null,
    @SerialName("max_price") val maxPrice: Double? = null,
    val district: String? = null,
    @SerialName("notify_phone") val notifyPhone: String? = null,
    @SerialName("notify_email") val notifyEmail: String? = null,
    @SerialName("notify_telegram_chat_id") val notifyTelegramChatId: String? = null,
    @SerialName("notify_channels") val notifyChannels: String? = null,
    @SerialName("delivery_mode") val deliveryMode: String? = null,
    @SerialName("quiet_hours_enabled") val quietHoursEnabled: Boolean? = null,
    @kotlinx.serialization.Required val active: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class CreateAlertRequestDto(
    val make: String? = null,
    val model: String? = null,
    @SerialName("max_price") val maxPrice: Double? = null,
    val district: String? = null,
    @SerialName("notify_phone") val notifyPhone: String? = null,
    @SerialName("notify_email") val notifyEmail: String? = null,
    @SerialName("notify_telegram_chat_id") val notifyTelegramChatId: String? = null,
    @SerialName("notify_channels") val notifyChannels: String? = null,
    @SerialName("delivery_mode") val deliveryMode: String? = null,
    @SerialName("quiet_hours_enabled") val quietHoursEnabled: Boolean? = null,
)

@Serializable
data class AlertActiveDto(val active: Boolean)

@Serializable
data class AlertChannelsUpdateDto(
    val channels: List<String>? = null,
    @SerialName("delivery_mode") val deliveryMode: String? = null,
    @SerialName("quiet_hours_enabled") val quietHoursEnabled: Boolean? = null,
)

@Serializable
data class AlertMatchListingDto(
    val id: Int = 0,
    val title: String? = null,
    val make: String = "",
    val model: String = "",
    val year: Int? = null,
    @SerialName("price_lkr") val priceLkr: Double? = null,
    val district: String? = null,
    @SerialName("deal_score") val dealScore: Double? = null,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
)

@Serializable
data class AlertMatchResultDto(
    @SerialName("alert_id") val alertId: Int = 0,
    val make: String? = null,
    val model: String? = null,
    val district: String? = null,
    @SerialName("max_price") val maxPrice: Double? = null,
    @SerialName("matching_count") val matchingCount: Int = 0,
    val listings: List<AlertMatchListingDto> = emptyList(),
)

@Serializable
data class MatchResponseDto(
    val results: List<AlertMatchResultDto> = emptyList(),
    @SerialName("checked_at") val checkedAt: String? = null,
)

@Serializable
data class NotificationDto(
    val id: Int = 0,
    @SerialName("user_token") val userToken: String = "",
    val title: String = "",
    val body: String? = null,
    val link: String? = null,
    val read: Boolean = false,
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
data class MarkAllReadDto(
    @kotlinx.serialization.Required @SerialName("marked_read") val markedRead: Int = 0,
)
