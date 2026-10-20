package lk.motormila.app.ui.pricing

import lk.motormila.app.R

/** One comparison row: label, Free value, Pro value (string resources). */
data class PricingRow(val label: Int, val free: Int, val pro: Int)

data class PricingFaq(
    val question: Int,
    val answer: Int,
    /** Mentions external payment (PayHere / bank / KOKO): hidden in the Play flavor. */
    val externalPayment: Boolean = false,
)

/**
 * Honest pricing, mirroring web src/lib/pricingContent.ts (PRICING_COMING_SOON):
 * MotorMila is free during the beta; Pro is coming soon (launch list only, no
 * checkout). Dealer plans are sold on the web; the Play build shows no
 * external payment route.
 */
object PricingCatalog {
    val freeFeatures: List<Int> = listOf(
        R.string.scr_price_free_f1,
        R.string.scr_price_free_f2,
        R.string.scr_price_free_f3,
        R.string.scr_price_free_f4,
        R.string.scr_price_free_f5,
    )

    val proFeatures: List<Int> = listOf(
        R.string.scr_price_pro_f1,
        R.string.scr_price_pro_f2,
        R.string.scr_price_pro_f3,
        R.string.scr_price_pro_f4,
        R.string.scr_price_pro_f5,
    )

    val rows: List<PricingRow> = listOf(
        PricingRow(R.string.scr_price_row_search, R.string.scr_price_val_yes, R.string.scr_price_val_yes),
        PricingRow(R.string.scr_price_row_deal, R.string.scr_price_val_dash, R.string.scr_price_val_yes),
        PricingRow(R.string.scr_price_row_history, R.string.scr_price_val_6m, R.string.scr_price_val_full),
        PricingRow(R.string.scr_price_row_updates, R.string.scr_price_val_latest6, R.string.scr_price_val_all),
        PricingRow(R.string.scr_price_row_alerts, R.string.scr_price_val_one, R.string.scr_price_val_more),
        PricingRow(R.string.scr_price_row_exports, R.string.scr_price_val_dash, R.string.scr_price_val_yes),
    )

    val faqs: List<PricingFaq> = listOf(
        PricingFaq(R.string.scr_price_faq_free_q, R.string.scr_price_faq_free_a),
        PricingFaq(R.string.scr_price_faq_pro_q, R.string.scr_price_faq_pro_a),
        PricingFaq(R.string.scr_price_faq_source_q, R.string.scr_price_faq_source_a),
        PricingFaq(R.string.scr_price_faq_dealer_q, R.string.scr_price_faq_dealer_a_web, externalPayment = true),
        PricingFaq(R.string.scr_price_faq_dealer_q, R.string.scr_price_faq_dealer_a_play),
    )

    /** FAQs for a distribution channel (Play: no external payment copy). */
    fun faqsFor(externalCheckout: Boolean): List<PricingFaq> =
        faqs.filter { faq ->
            if (externalCheckout) faq.answer != R.string.scr_price_faq_dealer_a_play
            else !faq.externalPayment
        }

    val channelFaqs: List<PricingFaq>
        get() = faqsFor(lk.motormila.app.BuildConfig.EXTERNAL_CHECKOUT_ENABLED)
}
