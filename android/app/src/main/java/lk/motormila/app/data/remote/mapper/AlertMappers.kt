package lk.motormila.app.data.remote.mapper

import lk.motormila.app.data.remote.dto.AlertDto
import lk.motormila.app.data.remote.dto.AlertMatchListingDto
import lk.motormila.app.data.remote.dto.AlertMatchResultDto
import lk.motormila.app.data.remote.dto.CreateAlertRequestDto
import lk.motormila.app.data.remote.dto.NotificationDto
import lk.motormila.app.domain.model.Alert
import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.model.AlertMatch
import lk.motormila.app.domain.model.AlertMatchListing
import lk.motormila.app.domain.model.AppNotification

fun AlertDto.toDomain(): Alert = Alert(
    id = id, make = make, model = model, maxPriceLkr = maxPrice,
    district = district, notifyPhone = notifyPhone, notifyEmail = notifyEmail,
    notifyTelegramChatId = notifyTelegramChatId, notifyChannels = notifyChannels,
    deliveryMode = deliveryMode ?: "instant",
    quietHoursEnabled = quietHoursEnabled ?: true,
    active = active, createdAt = createdAt,
)

fun AlertInput.toRequest(): CreateAlertRequestDto = CreateAlertRequestDto(
    make = make, model = model, maxPrice = maxPriceLkr, district = district,
    notifyPhone = notifyPhone, notifyEmail = notifyEmail,
    notifyTelegramChatId = notifyTelegramChatId, notifyChannels = notifyChannels,
    deliveryMode = deliveryMode, quietHoursEnabled = quietHoursEnabled,
)

fun AlertMatchListingDto.toDomain(): AlertMatchListing = AlertMatchListing(
    id = id, title = title, make = make, model = model, year = year,
    priceLkr = priceLkr, district = district, dealScore = dealScore,
    thumbnailUrl = thumbnailUrl,
)

fun AlertMatchResultDto.toDomain(): AlertMatch = AlertMatch(
    alertId = alertId, make = make, model = model, district = district,
    maxPriceLkr = maxPrice, matchingCount = matchingCount,
    listings = listings.map { it.toDomain() },
)

private val LISTING_PATH = Regex("/listings?/([1-9]\\d*)/?")

/**
 * Backend NotificationRead {id,user_token,title,body,link,read,created_at}.
 * kind is derived ("listing" when link points at a listing, else "alert");
 * listingId is parsed from the link when present.
 */
fun NotificationDto.toDomain(): AppNotification {
    val path = link?.let { runCatching { java.net.URI(it).rawPath }.getOrNull() }
    val listingId = path?.let { LISTING_PATH.matchEntire(it)?.groupValues?.get(1)?.toIntOrNull() }
    return AppNotification(
        id = id,
        title = title,
        body = body ?: "",
        kind = if (listingId != null) "listing" else "alert",
        listingId = listingId,
        isRead = read,
        createdAt = createdAt,
    )
}
