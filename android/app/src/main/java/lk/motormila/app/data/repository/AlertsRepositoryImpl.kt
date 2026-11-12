package lk.motormila.app.data.repository

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.entity.AlertEntity
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.AlertChannelsUpdateDto
import lk.motormila.app.data.remote.dto.AlertDto
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.data.remote.mapper.toRequest
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.Alert
import lk.motormila.app.domain.model.AlertInput
import lk.motormila.app.domain.model.AlertMatch
import lk.motormila.app.domain.model.AppNotification
import lk.motormila.app.domain.repository.AlertsRepository

/**
 * Alerts + notifications. Backend gaps handled client-side:
 * - update(): PUT /alerts/{id} in place; only a pre-PUT backend (405) falls
 *   back to create-then-delete.
 * - setActive(): local Room toggle flagged dirty; reconciled on next refresh().
 * - match(id): POST /alerts/match matches ALL alerts; filtered by alertId.
 */
@Singleton
class AlertsRepositoryImpl @Inject constructor(
    private val api: MotormilaApiService,
    private val db: MotormilaDatabase,
    @IoDispatcher private val io: CoroutineDispatcher,
) : AlertsRepository {

    /**
     * Room v1 has no delivery_mode / quiet_hours columns. Overlay those
     * DTO-only fields so observeAlerts() still reflects the last API payload.
     */
    private val deliveryExtras = ConcurrentHashMap<Int, Pair<String?, Boolean?>>()

    override fun observeAlerts(): Flow<List<Alert>> =
        db.alertDao().observeAll().map { rows -> rows.map { it.toDomain() } }

    override suspend fun refresh(): List<Alert> = withContext(io) {
        val remote = api.listAlerts()
        val dirtyById = db.alertDao().getAll().filter { it.dirty }.associateBy { it.id }
        db.alertDao().clear()
        db.alertDao().upsertAll(
            remote.map { dto ->
                val dirty = dirtyById[dto.id]
                dto.toEntity(activeOverride = dirty?.active)
            },
        )
        db.alertDao().getAll().map { it.toDomain() }
    }

    override suspend fun create(input: AlertInput): Alert = withContext(io) {
        val created = api.createAlert(input.toRequest()).toDomain()
        db.alertDao().upsert(created.toEntity())
        created
    }

    /**
     * Edit in place via PUT /alerts/{id}: same id, created_at and match
     * history, no window where the alert does not exist, no plan-cap clash.
     * Only when the deployed backend predates PUT (HTTP 405) do we fall back
     * to [legacyReplace]. Every other error propagates with the original
     * alert untouched.
     */
    override suspend fun update(id: Int, input: AlertInput): Alert = withContext(io) {
        val updated = try {
            api.updateAlert(id, input.toRequest()).toDomain()
        } catch (e: retrofit2.HttpException) {
            if (!isUpdateUnsupported(e.code())) throw e
            return@withContext legacyReplace(id, input)
        }
        db.alertDao().upsert(updated.toEntity())
        updated
    }

    /**
     * Pre-PUT backends only: create the replacement FIRST and delete the old
     * alert only after that succeeded, so a failed create never loses it.
     */
    private suspend fun legacyReplace(id: Int, input: AlertInput): Alert {
        val original = db.alertDao().getAll().firstOrNull { it.id == id }?.toDomain()
        val replacement = try {
            create(input)
        } catch (e: retrofit2.HttpException) {
            // Plan cap (e.g. Free = 1 alert) rejects the extra alert. Swap in
            // place instead, rolling back to the original on failure.
            if (e.code() == 401 || e.code() !in 400..499 || original == null) throw e
            return swapWithRollback(id, original, input)
        }
        if (replacement.id != id) {
            runCatching { api.deleteAlert(id) }
            db.alertDao().delete(id)
            deliveryExtras.remove(id)
        }
        return replacement
    }

    private suspend fun swapWithRollback(id: Int, original: Alert, input: AlertInput): Alert {
        api.deleteAlert(id)
        db.alertDao().delete(id)
        deliveryExtras.remove(id)
        return try {
            create(input)
        } catch (e: Exception) {
            if (e is kotlin.coroutines.cancellation.CancellationException) throw e
            // Restore the user's original alert (new id) before surfacing the error.
            runCatching { create(original.toInput()) }
            throw e
        }
    }

    private fun Alert.toInput(): AlertInput = AlertInput(
        make = make,
        model = model,
        maxPriceLkr = maxPriceLkr,
        district = district,
        notifyPhone = notifyPhone,
        notifyEmail = notifyEmail,
        notifyTelegramChatId = notifyTelegramChatId,
        notifyChannels = notifyChannels,
        deliveryMode = deliveryMode,
        quietHoursEnabled = quietHoursEnabled,
    )

    override suspend fun updateChannels(
        id: Int,
        channels: List<String>?,
        deliveryMode: String?,
        quietHoursEnabled: Boolean?,
    ): Alert = withContext(io) {
        val updated = api.updateAlertChannels(
            id,
            AlertChannelsUpdateDto(
                channels = channels,
                deliveryMode = deliveryMode,
                quietHoursEnabled = quietHoursEnabled,
            ),
        ).toDomain()
        db.alertDao().upsert(updated.toEntity())
        updated
    }

    override suspend fun delete(id: Int) = withContext(io) {
        runCatching { api.deleteAlert(id) }
        db.alertDao().delete(id)
        deliveryExtras.remove(id)
        Unit
    }

    override suspend fun setActive(id: Int, active: Boolean): Alert = withContext(io) {
        db.alertDao().setActive(id, active)
        db.alertDao().getAll().firstOrNull { it.id == id }?.toDomain()
            ?: throw IllegalArgumentException("Alert $id not cached")
    }

    override suspend fun match(id: Int, limit: Int): AlertMatch = withContext(io) {
        val res = api.matchAlerts()
        val hit = res.results.firstOrNull { it.alertId == id }
            ?: return@withContext AlertMatch(
                alertId = id, make = null, model = null, district = null,
                maxPriceLkr = null, matchingCount = 0,
            )
        hit.toDomain().copy(listings = hit.listings.take(limit).map { it.toDomain() })
    }

    override fun observeNotifications(): Flow<List<AppNotification>> = observeNotifications(limit = 50)

    fun observeNotifications(limit: Int): Flow<List<AppNotification>> =
        flow {
            emit(notifications(limit))
            // Room mirror for notifications is intentionally omitted (server-owned inbox);
            // workers post local notifications separately via NotificationHelper.
        }

    override suspend fun notifications(limit: Int): List<AppNotification> = withContext(io) {
        api.listNotifications().take(limit).map { it.toDomain() }
    }

    override suspend fun markNotificationRead(id: Int): Unit = withContext(io) {
        api.markNotificationRead(id)
    }

    /** POST /notifications/read-all — returns count marked. */
    override suspend fun markAllNotificationsRead(): Int = withContext(io) {
        api.markAllNotificationsRead().markedRead
    }

    override suspend fun unreadCount(): Flow<Int> = flow {
        emit(runCatching { notifications(50).count { !it.isRead } }.getOrDefault(0))
    }

    private fun rememberDelivery(id: Int, deliveryMode: String?, quietHoursEnabled: Boolean?) {
        deliveryExtras[id] = (deliveryMode ?: "instant") to (quietHoursEnabled ?: true)
    }

    private fun AlertDto.toEntity(activeOverride: Boolean?): AlertEntity {
        rememberDelivery(id, deliveryMode, quietHoursEnabled)
        return AlertEntity(
            id = id, make = make, model = model, maxPriceLkr = maxPrice,
            district = district, notifyPhone = notifyPhone, notifyEmail = notifyEmail,
            notifyTelegramChatId = notifyTelegramChatId, notifyChannels = notifyChannels,
            active = activeOverride ?: active, createdAt = createdAt,
            dirty = activeOverride != null,
        )
    }

    private fun AlertEntity.toDomain(): Alert {
        val extras = deliveryExtras[id]
        return Alert(
            id = id, make = make, model = model, maxPriceLkr = maxPriceLkr,
            district = district, notifyPhone = notifyPhone, notifyEmail = notifyEmail,
            notifyTelegramChatId = notifyTelegramChatId, notifyChannels = notifyChannels,
            deliveryMode = extras?.first ?: "instant",
            quietHoursEnabled = extras?.second ?: true,
            active = active, createdAt = createdAt,
        )
    }

    private fun Alert.toEntity(): AlertEntity {
        rememberDelivery(id, deliveryMode, quietHoursEnabled)
        return AlertEntity(
            id = id, make = make, model = model, maxPriceLkr = maxPriceLkr,
            district = district, notifyPhone = notifyPhone, notifyEmail = notifyEmail,
            notifyTelegramChatId = notifyTelegramChatId, notifyChannels = notifyChannels,
            active = active, createdAt = createdAt,
        )
    }
}

/** PUT /alerts/{id} missing on the deployed backend (route exists only for DELETE). */
internal fun isUpdateUnsupported(code: Int): Boolean = code == 405 || code == 501
