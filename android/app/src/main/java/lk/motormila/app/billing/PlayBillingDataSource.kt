package lk.motormila.app.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.queryProductDetails
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import lk.motormila.app.BuildConfig
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.CheckoutIntentRequestDto
import lk.motormila.app.data.remote.dto.PlayVerifyRequestDto

/**
 * Google Play Billing ("play" flavor). Policy-compliant flow:
 *
 * 1. [launchProUpgrade] opens the Play purchase sheet.
 * 2. PURCHASED purchases are sent to the backend
 *    (POST /billing/play/verify) which validates the token with the Google
 *    Play Developer API, grants the plan server-side (idempotent) and
 *    acknowledges it. Only a server-verified purchase unlocks Pro locally.
 * 3. PENDING purchases (cash / slow payment methods) are NEVER acknowledged
 *    or granted; they are re-checked on the next launch / purchase update.
 * 4. If verification fails (offline, backend down) the purchase stays
 *    unacknowledged and is retried on the next launch by [syncPlayEntitlement]
 *    (Google refunds automatically after 3 days without acknowledgement, so a
 *    user is never charged for something the server never granted).
 * 5. The local Pro flag is cleared on logout (SessionStore.clear()).
 *
 * The client is built with the application context (no Activity leak); an
 * Activity is only needed to show the purchase sheet.
 */
@Singleton
class PlayBillingDataSource @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val api: MotormilaApiService,
    private val sessionStore: SessionStore,
) : BillingDataSource {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _state = MutableStateFlow<BillingState>(BillingState.Idle)
    override val state: StateFlow<BillingState> = _state.asStateFlow()

    private val connectMutex = Mutex()

    @Volatile
    private var client: BillingClient? = null

    /** Direct (sideload) flavor only: server checkout-intent (manual / web URL). */
    override suspend fun checkoutIntent(plan: String): CheckoutInfo = withContext(Dispatchers.IO) {
        val res = api.checkoutIntent(CheckoutIntentRequestDto(plan))
        CheckoutInfo(provider = res.provider, checkoutUrl = res.checkoutUrl, message = res.message)
    }

    override suspend fun launchProUpgrade(activity: Activity, productId: String): Boolean =
        withContext(Dispatchers.IO) {
            if (!BuildConfig.PLAY_BILLING_ENABLED) return@withContext false
            val billingClient = connectedClient() ?: return@withContext false
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build(),
                    ),
                ).build()
            val result = runCatching { billingClient.queryProductDetails(params) }.getOrNull()
                ?: return@withContext false
            val details: ProductDetails = result.productDetailsList?.firstOrNull()
                ?: return@withContext false
            val offerToken = details.subscriptionOfferDetails?.firstOrNull()?.offerToken
                ?: return@withContext false
            val flowParamsBuilder = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(
                    listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(offerToken)
                            .build(),
                    ),
                )
            // Ties the purchase to the MotorMila account (server re-checks it).
            sessionStore.snapshot()?.email?.let { email ->
                flowParamsBuilder.setObfuscatedAccountId(obfuscateAccountId(email))
            }
            val launch = withContext(Dispatchers.Main) {
                billingClient.launchBillingFlow(activity, flowParamsBuilder.build())
            }
            launch.responseCode == BillingClient.BillingResponseCode.OK
        }

    override suspend fun hasActiveProPurchase(): Boolean = withContext(Dispatchers.IO) {
        queryPurchases().any { it.purchaseState == Purchase.PurchaseState.PURCHASED && it.isAcknowledged }
    }

    /**
     * Launch-time reconciliation (best-effort, never throws):
     * - verifies any PURCHASED-but-unacknowledged purchase with the server;
     * - keeps the local Pro flag only while Play reports a verified
     *   (acknowledged) active subscription; clears it when lapsed/refunded.
     * Signed-out users are skipped (verification needs the account).
     */
    suspend fun syncPlayEntitlement() {
        if (!BuildConfig.PLAY_BILLING_ENABLED) return
        if (sessionStore.snapshot() == null) return
        val purchases = runCatching { queryPurchases() }.getOrNull() ?: return
        var verified = false
        purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }.forEach { purchase ->
            val ok = purchase.isAcknowledged || verifyWithServer(purchase)
            verified = verified || ok
        }
        runCatching { sessionStore.setPlayProEntitled(verified) }
    }

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        scope.launch {
            _state.value = when (result.responseCode) {
                BillingClient.BillingResponseCode.OK -> handlePurchases(purchases.orEmpty())
                BillingClient.BillingResponseCode.USER_CANCELED -> BillingState.Idle
                BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                    syncPlayEntitlement()
                    BillingState.Purchased(emptyList())
                }
                else -> BillingState.Error(result.debugMessage)
            }
        }
    }

    private suspend fun handlePurchases(purchases: List<Purchase>): BillingState {
        if (purchases.any { it.purchaseState == Purchase.PurchaseState.PENDING } &&
            purchases.none { it.purchaseState == Purchase.PurchaseState.PURCHASED }
        ) {
            // Do NOT acknowledge or grant a pending purchase.
            return BillingState.Pending
        }
        val purchased = purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
        if (purchased.isEmpty()) return BillingState.Idle
        val ok = purchased.map { verifyWithServer(it) }.any { it }
        return if (ok) {
            runCatching { sessionStore.setPlayProEntitled(true) }
            BillingState.Purchased(purchased.mapNotNull { it.orderId })
        } else {
            BillingState.VerificationFailed
        }
    }

    /**
     * Server-side verification. The backend acknowledges the purchase after
     * granting the plan; if it reports it could not, the client acknowledges
     * as a fallback — but only after a successful verification.
     */
    private suspend fun verifyWithServer(purchase: Purchase): Boolean {
        val productId = purchase.products.firstOrNull() ?: return false
        val res = runCatching {
            api.verifyPlayPurchase(
                PlayVerifyRequestDto(
                    purchaseToken = purchase.purchaseToken,
                    productId = productId,
                    packageName = appContext.packageName.removeSuffix(".debug"),
                ),
            )
        }.getOrNull() ?: return false
        if (!res.ok) return false
        if (!res.acknowledged && !purchase.isAcknowledged) {
            acknowledge(purchase.purchaseToken)
        }
        return true
    }

    private suspend fun acknowledge(token: String) {
        val c = connectedClient() ?: return
        runCatching {
            suspendCancellableCoroutine { cont ->
                c.acknowledgePurchase(
                    AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(),
                ) { if (cont.isActive) cont.resume(Unit) }
            }
        }
    }

    private suspend fun queryPurchases(): List<Purchase> {
        val c = connectedClient() ?: return emptyList()
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        return runCatching {
            suspendCancellableCoroutine<List<Purchase>> { cont ->
                c.queryPurchasesAsync(params) { _, list ->
                    if (cont.isActive) cont.resume(list)
                }
            }
        }.getOrDefault(emptyList())
    }

    /** Awaits a real setup callback (no fixed sleep); null when Play is unavailable. */
    private suspend fun connectedClient(): BillingClient? = connectMutex.withLock {
        client?.takeIf { it.isReady }?.let { return@withLock it }
        val c = client ?: BillingClient.newBuilder(appContext)
            .setListener(purchasesListener)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
            )
            .build()
            .also { client = it }
        val ok = withTimeoutOrNull(CONNECT_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                c.startConnection(object : BillingClientStateListener {
                    override fun onBillingSetupFinished(result: BillingResult) {
                        if (cont.isActive) {
                            cont.resume(result.responseCode == BillingClient.BillingResponseCode.OK)
                        }
                    }

                    override fun onBillingServiceDisconnected() {
                        if (cont.isActive) cont.resume(false)
                    }
                })
            }
        } ?: false
        if (ok) c else null
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000L

        /** Stable, non-reversible account hint (Play limits it to 64 chars, no PII). */
        fun obfuscateAccountId(email: String): String {
            val digest = java.security.MessageDigest.getInstance("SHA-256")
                .digest(email.trim().lowercase().toByteArray())
            return digest.joinToString("") { "%02x".format(it) }
        }
    }
}

interface BillingDataSource {
    val state: StateFlow<BillingState>
    suspend fun checkoutIntent(plan: String): CheckoutInfo
    suspend fun launchProUpgrade(activity: Activity, productId: String): Boolean
    /** True when Play reports an active, server-verified (acknowledged) subscription. */
    suspend fun hasActiveProPurchase(): Boolean = false
}

sealed interface BillingState {
    data object Idle : BillingState
    data object Loading : BillingState
    /** Payment is pending (e.g. cash/convenience store). Pro unlocks once it completes. */
    data object Pending : BillingState
    /** Play charged but the server could not verify yet; retried on next launch. */
    data object VerificationFailed : BillingState
    data class Purchased(val orderIds: List<String>) : BillingState
    data class Error(val message: String) : BillingState
}

data class CheckoutInfo(
    /** "manual" | "payhere" | "stripe". manual = contact-sales fallback. */
    val provider: String,
    val checkoutUrl: String?,
    val message: String,
) {
    val hasUrl: Boolean get() = !checkoutUrl.isNullOrBlank()
}
