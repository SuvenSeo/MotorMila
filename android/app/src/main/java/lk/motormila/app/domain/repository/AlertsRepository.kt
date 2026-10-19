package lk.motormila.app.domain.repository

import kotlinx.coroutines.flow.Flow
import lk.motormila.app.domain.model.Alert
import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.model.AlertMatch
import lk.motormila.app.domain.model.AppNotification

interface AlertsRepository {
    fun observeAlerts(): Flow<List<Alert>>
    suspend fun refresh(): List<Alert>
    suspend fun create(input: AlertInput): Alert
    suspend fun update(id: Int, input: AlertInput): Alert
    suspend fun updateChannels(
        id: Int,
        channels: List<String>?,
        deliveryMode: String?,
        quietHoursEnabled: Boolean?,
    ): Alert
    suspend fun delete(id: Int)
    suspend fun setActive(id: Int, active: Boolean): Alert
    suspend fun match(id: Int, limit: Int = 10): AlertMatch

    fun observeNotifications(): Flow<List<AppNotification>>
    suspend fun notifications(limit: Int = 30): List<AppNotification>
    suspend fun markNotificationRead(id: Int)
    /** POST /notifications/read-all — returns count marked. */
    suspend fun markAllNotificationsRead(): Int
    suspend fun unreadCount(): Flow<Int>
}
