package lk.motormila.app.data.local.db.entity

import androidx.room.Entity

/** Confirmed server rule; owner is the normalized account email, never a bearer. */
@Entity(tableName = "alerts", primaryKeys = ["owner", "id"])
data class AlertEntity(
    val owner: String,
    val id: Int,
    val make: String? = null,
    val model: String? = null,
    val maxPriceLkr: Double? = null,
    val district: String? = null,
    val notifyPhone: String? = null,
    val notifyEmail: String? = null,
    val notifyTelegramChatId: String? = null,
    val notifyChannels: String? = null,
    val active: Boolean = true,
    val createdAt: String? = null,
    val deliveryMode: String? = null,
    val quietHoursEnabled: Boolean? = null,
)
