package lk.motormila.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import kotlin.math.abs
import lk.motormila.app.R
import lk.motormila.app.ui.theme.MmDealTone

/**
 * Deal verdict — same rules as the web (src/lib/dealBadge.ts) so card,
 * detail and FMV text agree. Compares ASKING price with the typical asking
 * price of comparable listings (never "market value").
 *
 * - Lease takeovers get no price verdict (the price isn't the full price).
 * - > 35% below typical, or >= 5% below on a weak estimate → amber "verify
 *   first" (bait-price / advance-fee scam shape), never green.
 * - >= 5% below → good; >= 8% above → high; otherwise near typical (fair).
 */
data class MmDealVerdict(
    val kind: Kind,
    val gapLkr: Double,
    val gapPctBelow: Double,
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
        const val BELOW_PCT = 5.0
        const val ABOVE_PCT = 8.0
        const val VERIFY_BELOW_PCT = 35.0
        const val MIN_COMPS_FOR_GREEN = 5

        private val NONE = MmDealVerdict(Kind.NONE, 0.0, 0.0)

        fun compute(
            askingLkr: Double?,
            typicalLkr: Double?,
            isLeaseTakeover: Boolean = false,
            weakEstimate: Boolean = false,
            compsCount: Int? = null,
            ratingAllowed: Boolean = true,
        ): MmDealVerdict {
            if (isLeaseTakeover) return MmDealVerdict(Kind.LEASE, 0.0, 0.0)
            if (askingLkr == null || typicalLkr == null || askingLkr <= 0 || typicalLkr <= 0) return NONE
            val pctBelow = (typicalLkr - askingLkr) / typicalLkr * 100.0
            val gap = abs(typicalLkr - askingLkr)
            val weak = weakEstimate || (compsCount != null && compsCount < MIN_COMPS_FOR_GREEN)
            if (pctBelow > VERIFY_BELOW_PCT) return MmDealVerdict(Kind.VERIFY, gap, pctBelow)
            if (pctBelow >= BELOW_PCT && weak) return MmDealVerdict(Kind.VERIFY, gap, pctBelow)
            if (!ratingAllowed) return NONE
            if (pctBelow >= BELOW_PCT) return MmDealVerdict(Kind.BELOW, gap, pctBelow)
            if (-pctBelow >= ABOVE_PCT) return MmDealVerdict(Kind.ABOVE, gap, pctBelow)
            return MmDealVerdict(Kind.FAIR, gap, pctBelow)
        }
    }
}

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

/**
 * Lease-takeover detector (port of web src/lib/leaseTakeover.ts). Reads the
 * ad text only — never invents a full price. Conservative on negatives:
 * "leasing can be arranged", "lease fully settled" are ordinary ads.
 */
object MmLeaseTakeover {
    private val positive = listOf(
        Regex("""\bleas(?:e|ing)\s*(?:-|\s)?\s*(?:take\s*-?\s*over|transfer)\b""", RegexOption.IGNORE_CASE),
        Regex("""\btake\s*-?\s*over\b""", RegexOption.IGNORE_CASE),
        Regex("""\bcan\s+be\s+taken\s+over\b""", RegexOption.IGNORE_CASE),
        Regex("""\bleas(?:e|ing)\s*settle(?:ment)?\b(?!d)""", RegexOption.IGNORE_CASE),
        Regex("""\bsettle\s+(?:the\s+)?leas(?:e|ing)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:ongoing|on-going|existing|running|current)\s+leas(?:e|ing)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bcontinu(?:e|ing)\s+(?:the\s+|with\s+the\s+)?(?:existing\s+)?leas(?:e|ing)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bbalance\b[^.\n]{0,40}?\binstal+ments?\b""", RegexOption.IGNORE_CASE),
        Regex("""\bremaining\s+(?:\d{1,3}\s+)?instal+ments?\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:leas(?:e|ing)|loan|facility)\s+balance\b""", RegexOption.IGNORE_CASE),
        Regex("""\bbalance\s+(?:leas(?:e|ing)|loan)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bleas(?:e|ing)\b[^.\n\d]{0,20}[\d,]{4,}(?:\.\d+)?\s*(?:/=)?\s*[x×*]\s*\d{1,3}\b""", RegexOption.IGNORE_CASE),
    )
    private val negative = listOf(
        Regex("""\bleas(?:e|ing)\s+(?:can\s+be\s+)?(?:arranged|facilit(?:y|ies)|available|options?)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bleas(?:e|ing)\s+(?:is\s+)?(?:fully\s+)?(?:settled|cleared|closed|free)\b""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:no|without)\s+leas(?:e|ing)\b""", RegexOption.IGNORE_CASE),
    )

    fun detect(vararg texts: String?): Boolean {
        val text = texts.filterNotNull().joinToString(" \n ")
        if (text.isBlank()) return false
        val hit = positive.firstOrNull { it.containsMatchIn(text) } ?: return false
        // A negative phrase only cancels when it is the ONLY lease mention.
        if (negative.any { it.containsMatchIn(text) }) {
            val stripped = negative.fold(text) { acc, r -> r.replace(acc, " ") }
            return positive.any { it.containsMatchIn(stripped) }
        }
        return hit.containsMatchIn(text)
    }
}
