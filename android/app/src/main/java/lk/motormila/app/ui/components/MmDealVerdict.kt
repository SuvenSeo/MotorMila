package lk.motormila.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.res.stringResource
import lk.motormila.app.core.price.LeaseTakeover
import lk.motormila.app.core.price.PriceContext
import lk.motormila.app.core.price.PriceVerdict
import lk.motormila.app.core.price.PriceVerdicts
import lk.motormila.app.core.price.VerdictBand
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MmDealTone

/**
 * Deal verdict — a VIEW of the one price verdict (core/price/PriceVerdict.kt,
 * same rules and fixtures as backend + web), never a second rule set. Compares
 * ASKING price with the typical asking price of comparable listings (never
 * "market value").
 *
 * - Lease takeovers get no price verdict (the price isn't the full price).
 * - 35 % or more below typical → amber "verify first" (bait-price / advance-fee
 *   scam shape), never green.
 * - 5 % or more below → good; 8 % or more above → high; otherwise near typical.
 * - A withheld verdict (weak estimate, implausible gap, placeholder / parts /
 *   rental price…) shows no badge rather than a fake-looking one.
 */
data class MmDealVerdict(
    val kind: Kind,
    val gapLkr: Double,
    val gapPctBelow: Double,
    /** Whole percent from the verdict (0 for lease / none). */
    val pct: Int = 0,
) {
    enum class Kind { BELOW, FAIR, ABOVE, VERIFY, LEASE, NONE }

    val tone: MmDealTone
        get() = when (kind) {
            Kind.BELOW -> if (gapPctBelow >= 15) MmDealTone.GREAT else MmDealTone.GOOD
            Kind.FAIR -> MmDealTone.FAIR
            Kind.ABOVE -> MmDealTone.HIGH
            Kind.VERIFY -> MmDealTone.CAUTION
            Kind.LEASE, Kind.NONE -> MmDealTone.NEUTRAL
        }

    companion object {
        const val BELOW_PCT = PriceVerdicts.BELOW_PCT
        const val ABOVE_PCT = PriceVerdicts.ABOVE_PCT
        const val VERIFY_BELOW_PCT = PriceVerdicts.VERIFY_BELOW_PCT
        const val MIN_COMPS_FOR_GREEN = PriceVerdicts.MIN_COMPS

        private val NONE = MmDealVerdict(Kind.NONE, 0.0, 0.0)
        private val LEASE = MmDealVerdict(Kind.LEASE, 0.0, 0.0)

        /**
         * The badge for an already-resolved verdict. [ratingAllowed] false (plan
         * doesn't include deal calls) still shows the safety labels (verify / lease).
         */
        fun from(
            verdict: PriceVerdict,
            isLeaseTakeover: Boolean = false,
            ratingAllowed: Boolean = true,
        ): MmDealVerdict {
            if (isLeaseTakeover) return LEASE
            // Withheld (incl. rent / down-payment wording): no badge. The detail
            // screen's price card says why.
            if (verdict is PriceVerdict.Withheld) return NONE
            val ok = verdict as PriceVerdict.Ok
            val base = MmDealVerdict(Kind.NONE, ok.gapLkr, -ok.gapPct, ok.pct)
            if (ok.verifyFirst) return base.copy(kind = Kind.VERIFY)
            if (!ratingAllowed) return NONE
            return base.copy(
                kind = when (ok.band) {
                    VerdictBand.BELOW -> Kind.BELOW
                    VerdictBand.FAIR -> Kind.FAIR
                    VerdictBand.ABOVE -> Kind.ABOVE
                },
            )
        }

        /** Convenience for callers that only have the two numbers (previews, tests). */
        fun compute(
            askingLkr: Double?,
            typicalLkr: Double?,
            isLeaseTakeover: Boolean = false,
            weakEstimate: Boolean = false,
            compsCount: Int? = null,
            ratingAllowed: Boolean = true,
            ctx: PriceContext = PriceContext(),
        ): MmDealVerdict = from(
            PriceVerdicts.verdict(
                asking = askingLkr,
                reference = typicalLkr,
                comps = compsCount,
                confidence = if (weakEstimate) "low" else null,
                ctx = ctx,
            ),
            isLeaseTakeover = isLeaseTakeover,
            ratingAllowed = ratingAllowed,
        )
    }
}

/**
 * Whether the signed-in user has Pro. Provided once at the root (MainActivity)
 * so cards can show the Pro lock ONLY to non-Pro users — a Pro user looking at
 * an unrated ad must never be told to upgrade.
 */
val LocalIsPro = compositionLocalOf { false }

/** User-facing label, or null when no badge should show. Never says "market value". */
@Composable
fun MmDealVerdict.label(): String? {
    val gap = MmPriceFormat.compact(gapLkr, "Rs —")
    return when (kind) {
        MmDealVerdict.Kind.BELOW -> stringResource(R.string.mm_deal_below_typical, gap)
        MmDealVerdict.Kind.ABOVE -> stringResource(R.string.mm_deal_above_typical, gap)
        MmDealVerdict.Kind.FAIR -> stringResource(R.string.mm_deal_near_typical)
        MmDealVerdict.Kind.VERIFY -> stringResource(R.string.mm_deal_verify)
        MmDealVerdict.Kind.LEASE -> stringResource(R.string.mm_deal_lease)
        MmDealVerdict.Kind.NONE -> null
    }
}

/** Lease-takeover detector — delegates to the one used by the price verdict (core/price). */
object MmLeaseTakeover {
    fun detect(vararg texts: String?): Boolean = LeaseTakeover.detect(*texts)
}
