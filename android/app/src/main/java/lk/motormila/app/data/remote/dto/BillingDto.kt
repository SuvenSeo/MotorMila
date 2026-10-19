package lk.motormila.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Backend: endpoints/billing.py — POST /billing/checkout-intent. */
@Serializable
data class CheckoutIntentRequestDto(val plan: String)

@Serializable
data class CheckoutIntentResponseDto(
    val provider: String = "manual",
    @SerialName("checkout_url") val checkoutUrl: String? = null,
    val message: String = "",
)

/** Backend: routers/play_billing.py — POST /billing/play/verify. */
@Serializable
data class PlayVerifyRequestDto(
    @SerialName("purchase_token") val purchaseToken: String,
    @SerialName("product_id") val productId: String,
    @SerialName("package_name") val packageName: String,
)

@Serializable
data class PlayVerifyResponseDto(
    val ok: Boolean = false,
    val plan: String? = null,
    val status: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    val acknowledged: Boolean = false,
)
