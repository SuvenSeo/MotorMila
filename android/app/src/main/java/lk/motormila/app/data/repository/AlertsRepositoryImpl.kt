package lk.motormila.app.data.repository

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.local.db.MotormilaDatabase
import lk.motormila.app.data.local.db.entity.AlertEntity
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.*
import lk.motormila.app.data.remote.mapper.toDomain
import lk.motormila.app.data.remote.mapper.toRequest
import lk.motormila.app.di.IoDispatcher
import lk.motormila.app.domain.model.*
import lk.motormila.app.domain.repository.AlertsRepository
import retrofit2.HttpException

/** Nothing in the v1 cache identified its owner; migration discards that mirror, not the watchlist. */
@OptIn(ExperimentalCoroutinesApi::class)
@Singleton
class AlertsRepositoryImpl @Inject constructor(
    private val api: MotormilaApiService,
    private val db: MotormilaDatabase,
    @IoDispatcher private val io: CoroutineDispatcher,
    private val sessions: SessionStore,
) : AlertsRepository {
    private val rules = Mutex()
    private val mailbox = Mutex()
    private val inbox = MutableStateFlow<Pair<String, List<AppNotification>>?>(null)
    private val dao get() = db.alertDao()
    private val UserSession.owner get() = email.trim().lowercase()

    private val UserSession.guard get() = lk.motormila.app.core.network.AlertSessionGuard(token)

    private suspend fun session(): UserSession = checkNotNull(sessions.snapshot()) { "Sign in to manage alerts." }
    private suspend fun UserSession.checkCurrent() {
        check(sessions.snapshot()?.token == token && sessions.cachedToken == token) { "Account changed. Refresh to continue." }
    }

    override fun observeAlerts(): Flow<List<Alert>> = sessions.observe().map { it?.owner }.distinctUntilChanged()
        .flatMapLatest { owner ->
            if (owner == null) flowOf(emptyList()) else dao.observe(owner).map { rows -> rows.map { it.toDomain() } }
        }

    override suspend fun refresh(): List<Alert> = withContext(io) {
        val account = session()
        rules.withLock {
            account.checkCurrent()
            val rows = api.listAlerts(guard = account.guard).map { it.entity(account) }
            account.checkCurrent()
            dao.replace(account.owner, rows)
            rows.map { it.toDomain() }
        }
    }

    override suspend fun create(input: AlertInput): Alert = writeRule { account ->
        saveChannels(account, input) { api.createAlert(it, account.guard) }
    }

    override suspend fun update(id: Int, input: AlertInput): Alert = writeRule { account ->
        try {
            saveChannels(account, input) { api.updateAlert(id, it, account.guard) }.also { check(it.id == id) }
        } catch (e: HttpException) {
            if (!isUpdateUnsupported(e.code())) throw e
            // On pre-PUT deployments never delete first, not even when creation hits a cap.
            val replacement = saveChannels(account, input) { api.createAlert(it, account.guard) }
            account.checkCurrent()
            dao.upsert(replacement.entity(account))
            if (replacement.id != id) {
                api.deleteAlert(id, account.guard)
                dao.delete(account.owner, id)
            }
            replacement
        }
    }

    private suspend fun saveChannels(
        account: UserSession, input: AlertInput, send: suspend (CreateAlertRequestDto) -> AlertDto,
    ): AlertDto {
        val selected = input.notifyChannels?.let(::parseChannels)
        val request = input.toRequest().let { body ->
            if (account.isPro && selected?.contains("email") == true && body.notifyEmail == null)
                body.copy(notifyEmail = account.email) else body
        }
        // Tagged Pro writes echo an explicit CSV but always deliver in-app.
        if (account.isPro && selected != null && "inapp" !in selected && !api.alertPreferences(account.guard).explicitChannels)
            throw UnsupportedExplicitChannels()
        require(selected == null || selected.isNotEmpty()) { "Choose a delivery channel." }
        account.checkCurrent()
        val saved = try {
            send(request)
        } catch (e: HttpException) {
            // Only an explicit policy rejection is safe to retry; never replay a POST on timeout/5xx.
            if (e.code() != 403 || account.isPro || selected == null) throw e
            // Retrofit buffers errorBody separately from its raw response.
            val policy = e.response()?.errorBody()?.source()?.peek()?.readUtf8().orEmpty()
            if (!isTaggedChannelGate(policy)) throw e
            if (selected != setOf("inapp", "push") || request.notifyPhone != null ||
                request.notifyEmail != null || request.notifyTelegramChatId != null) throw UnsupportedFreeChannels()
            account.checkCurrent()
            return send(request.copy(notifyChannels = null)).also {
                check(it.notifyChannels.isNullOrBlank() && it.notifyEmail.isNullOrBlank() &&
                    it.notifyPhone.isNullOrBlank() && it.notifyTelegramChatId.isNullOrBlank())
            }
        }
        if (selected != null && parseChannels(saved.notifyChannels) != selected) throw UnconfirmedChannels()
        return saved
    }

    private suspend fun writeRule(block: suspend (UserSession) -> AlertDto): Alert = withContext(io) {
        val account = session()
        rules.withLock {
            account.checkCurrent()
            val row = block(account).entity(account)
            account.checkCurrent()
            dao.upsert(row)
            row.toDomain()
        }
    }

    override suspend fun updateChannels(id: Int, channels: List<String>?, deliveryMode: String?, quietHoursEnabled: Boolean?): Alert = writeRule { account ->
        require(channels == null || channels.isNotEmpty())
        if (channels != null && !api.alertPreferences(account.guard).explicitChannels) {
            // The tagged PATCH /channels accepts choices its matcher cannot honour. Use PUT:
            // it enforces the same policy as POST on both server versions.
            val current = api.listAlerts(guard = account.guard).single { it.id == id }.entity(account)
            val input = AlertInput(make = current.make, model = current.model, maxPriceLkr = current.maxPriceLkr,
                district = current.district, notifyChannels = channels.joinToString(","),
                notifyPhone = current.notifyPhone.takeIf { "whatsapp" in channels },
                notifyTelegramChatId = current.notifyTelegramChatId.takeIf { "telegram" in channels },
                notifyEmail = current.notifyEmail.takeIf { "email" in channels },
                deliveryMode = current.deliveryMode, quietHoursEnabled = current.quietHoursEnabled)
            saveChannels(account, input) { api.updateAlert(id, it, account.guard) }.also { check(it.id == id) }
        } else {
            api.updateAlertChannels(id, AlertChannelsUpdateDto(channels, deliveryMode, quietHoursEnabled), account.guard).also {
                check(it.id == id)
                if (channels != null && parseChannels(it.notifyChannels) != channels.toSet()) throw UnconfirmedChannels()
            }
        }
    }

    override suspend fun delete(id: Int): Unit = withContext(io) {
        val account = session()
        rules.withLock {
            account.checkCurrent()
            api.deleteAlert(id, account.guard)
            dao.delete(account.owner, id)
        }
    }

    override suspend fun setActive(id: Int, active: Boolean): Alert = writeRule { account ->
        api.setAlertActive(id, AlertActiveDto(active), account.guard).also { check(it.id == id && it.active == active) }
    }

    override suspend fun match(id: Int, limit: Int): AlertMatch = withContext(io) {
        val account = session()
        val hit = api.matchAlerts(account.guard).results.firstOrNull { it.alertId == id }
        account.checkCurrent()
        hit?.toDomain()?.let { it.copy(listings = it.listings.take(limit)) }
            ?: AlertMatch(id, null, null, null, null, 0)
    }

    override fun observeNotifications(): Flow<List<AppNotification>> = combine(
        sessions.observe().map { it?.owner }.distinctUntilChanged(), inbox,
    ) { owner, cached -> cached?.takeIf { it.first == owner }?.second.orEmpty() }

    override suspend fun notifications(limit: Int): List<AppNotification> = withContext(io) {
        val account = session()
        mailbox.withLock {
            account.checkCurrent()
            val rows = api.listNotifications(account.guard).map { it.toDomain() }
            account.checkCurrent()
            inbox.value = account.owner to rows
            rows.take(limit)
        }
    }

    override suspend fun markNotificationRead(id: Int): Unit = withContext(io) {
        val account = session()
        mailbox.withLock {
            account.checkCurrent()
            val saved = api.markNotificationRead(id, account.guard)
            check(saved.id == id && saved.read)
            account.checkCurrent()
            inbox.value?.takeIf { it.first == account.owner }?.let { (owner, rows) ->
                inbox.value = owner to rows.map { if (it.id == id) saved.toDomain() else it }
            }
        }
    }

    override suspend fun markAllNotificationsRead(): Int = withContext(io) {
        val account = session()
        mailbox.withLock {
            account.checkCurrent()
            val count = api.markAllNotificationsRead(account.guard).markedRead
            account.checkCurrent()
            inbox.value?.takeIf { it.first == account.owner }?.let { (owner, rows) ->
                inbox.value = owner to rows.map { it.copy(isRead = true) }
            }
            count
        }
    }

    override suspend fun unreadCount(): Flow<Int> = observeNotifications().map { rows -> rows.count { !it.isRead } }

    private fun AlertDto.entity(account: UserSession): AlertEntity {
        check(id > 0 && (userToken.isEmpty() || userToken == "mm:${account.owner}")) { "Unexpected account response." }
        return AlertEntity(owner = account.owner, id = id, make = make, model = model, maxPriceLkr = maxPrice,
            district = district, notifyPhone = notifyPhone, notifyEmail = notifyEmail, notifyTelegramChatId = notifyTelegramChatId,
            notifyChannels = notifyChannels, active = active, createdAt = createdAt, deliveryMode = deliveryMode,
            quietHoursEnabled = quietHoursEnabled)
    }

    private fun AlertEntity.toDomain() = Alert(id = id, make = make, model = model, maxPriceLkr = maxPriceLkr,
        district = district, notifyPhone = notifyPhone, notifyEmail = notifyEmail, notifyTelegramChatId = notifyTelegramChatId,
        notifyChannels = notifyChannels, active = active, createdAt = createdAt, deliveryMode = deliveryMode ?: "instant",
        quietHoursEnabled = quietHoursEnabled ?: true)
}

private fun parseChannels(raw: String?) = raw.orEmpty().split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
internal fun isTaggedChannelGate(body: String) = body.contains("Multi-channel alert notifications require a signed-in Pro plan.", true)
internal class UnsupportedFreeChannels : IllegalStateException("This server does not support the selected free channels.")
internal class UnsupportedExplicitChannels : IllegalStateException("This server always includes the inbox. Select In-app or keep your existing rule.")
internal class UnconfirmedChannels : IllegalStateException("The server did not confirm the selected channels. Refresh before retrying.")
internal fun isUpdateUnsupported(code: Int): Boolean = code == 405 || code == 501
