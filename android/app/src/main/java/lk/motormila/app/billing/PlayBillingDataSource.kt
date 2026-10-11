package lk.motormila.app.billing

import android.app.Activity
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.queryProductDetails
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import lk.motormila.app.data.local.datastore.SessionStore
import lk.motormila.app.data.remote.MotormilaApiService
import lk.motormila.app.data.remote.dto.CheckoutIntentRequestDto
import kotlin.coroutines.resume

/**
 * Play Billing wrapper. Server checkout is manual-first (backend
 * POST /billing/checkout-intent returns a URL or contact-sales message), so
 * this data source exposes BOTH paths:
 * - [checkoutIntent]: server fallback (always available, manual provider).
 * - [launchProUpgrade]: native Play flow when the Play product is configured;
 *   returns false when Play is unavailable so UI falls back to checkoutIntent.
 *
 * Sandbox notes (Agent D / QA):
 * - License testers: Play Console → Setup → License testing; use
 *   `android.test.purchased` or a real draft-track subscription product.
 * - Test card "Test card, always approves" for purchase → acknowledge flow.
 * - Purchases MUST be acknowledged within 3 days or Google auto-refunds —
 *   [purchasesListener] acknowledges every UNACKNOWLEDGED purchase token.
 * - Verify server-side via backend POST /billing/checkout-intent + purchaseToken
 *   check before granting Pro (see ProRepository).
 */
@Singleton
class PlayBillingDataSource @Inject constructor(
    private val api: MotormilaApiService,
    private val sessionStore: SessionStore,
) : BillingDataSource {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _state = MutableStateFlow<BillingState>(BillingState.Idle)
    override val state: StateFlow<BillingState> = _state.asStateFlow()

    private var client: BillingClient? = null

    override suspend fun checkoutIntent(plan: String): CheckoutInfo = withContext(Dispatchers.IO) {
        val res = api.checkoutIntent(CheckoutIntentRequestDto(plan))
        CheckoutInfo(provider = res.provider, checkoutUrl = res.checkoutUrl, message = res.message)
    }

    override suspend fun launchProUpgrade(activity: Activity, productId: String): Boolean =
        withContext(Dispatchers.IO) {
            val billingClient = getClient(activity) ?: return@withContext false
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
            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(
                    listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(offerToken)
                            .build(),
                    ),
                ).build()
            val launch = withContext(Dispatchers.Main) {
                billingClient.launchBillingFlow(activity, flowParams)
            }
            launch.responseCode == BillingClient.BillingResponseCode.OK
        }

    override suspend fun hasActiveProPurchase(activity: Activity): Boolean =
        withContext(Dispatchers.IO) {
            val billingClient = getClient(activity) ?: return@withContext false
            runCatching {
                val params = com.android.billingclient.api.QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
                var found = false
                suspendCancellableCoroutine { cont ->
                    billingClient.queryPurchasesAsync(params) { _, purchases ->
                        found = purchases.any {
                            it.purchaseState ==
                                com.android.billingclient.api.Purchase.PurchaseState.PURCHASED
                        }
                        if (cont.isActive) cont.resume(found)
                    }
                }
            }.getOrDefault(false)
        }

    /**
     * Reconcile the local Play entitlement with Play's purchase cache.
     * Call on app launch (best-effort): keeps Pro unlocked across restarts
     * and clears it when the subscription lapses or is refunded.
     */
    suspend fun syncPlayEntitlement(activity: Activity) {
        val active = runCatching { hasActiveProPurchase(activity) }.getOrDefault(false)
        runCatching { sessionStore.setPlayProEntitled(active) }
    }

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        scope.launch {
            _state.value = when (result.responseCode) {
                BillingClient.BillingResponseCode.OK -> {
                    // Acknowledge every purchase so Google doesn't auto-refund.
                    purchases?.forEach { purchase ->
                        if (!purchase.isAcknowledged) {
                            runCatching {
                                client?.acknowledgePurchase(
                                    com.android.billingclient.api.AcknowledgePurchaseParams.newBuilder()
                                        .setPurchaseToken(purchase.purchaseToken)
                                        .build(),
                                ) { _ -> }
                            }
                        }
                    }
                    // Record the local Play entitlement immediately: the backend has
                    // no Play verification endpoint yet, so a Google-acknowledged
                    // purchase unlocks Pro on-device (Play's cache = source of
                    // truth, re-verified on launch via syncPlayEntitlement).
                    purchases?.firstOrNull { it.purchaseState == com.android.billingclient.api.Purchase.PurchaseState.PURCHASED }
                        ?.let { runCatching { sessionStore.setPlayProEntitled(true) } }
                    BillingState.Purchased(purchases?.mapNotNull { it.orderId } ?: emptyList())
                }
                BillingClient.BillingResponseCode.USER_CANCELED -> BillingState.Idle
                else -> BillingState.Error(result.debugMessage)
            }
        }
    }

    private suspend fun getClient(activity: Activity): BillingClient? {
        client?.let { if (it.isReady) return it }
        return runCatching {
            val c = BillingClient.newBuilder(activity)
                .setListener(purchasesListener)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build()
            client = c
            var ready = false
            c.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    ready = result.responseCode == BillingClient.BillingResponseCode.OK
                }
                override fun onBillingServiceDisconnected() { /* retry on next call */ }
            })
            // startConnection is async; readiness is re-checked by callers via isReady.
            if (!c.isReady) {
                kotlinx.coroutines.delay(1500)
            }
            c.takeIf { it.isReady || ready }
        }.getOrNull()
    }
}

interface BillingDataSource {
    val state: StateFlow<BillingState>
    suspend fun checkoutIntent(plan: String): CheckoutInfo
    suspend fun launchProUpgrade(activity: Activity, productId: String): Boolean
    /** Best-effort restore: true when Play reports an active subscription purchase. */
    suspend fun hasActiveProPurchase(activity: Activity): Boolean = false
}

sealed interface BillingState {
    data object Idle : BillingState
    data object Loading : BillingState
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
