package lk.motormila.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import lk.motormila.app.R
import lk.motormila.app.core.price.PriceVerdict
import lk.motormila.app.core.price.VerdictBand
import lk.motormila.app.core.price.WithheldGroup
import lk.motormila.app.ui.theme.MmDealTone

/** Copy for the one price verdict — same wording as web src/lib/priceVerdict.ts. */
@Composable
fun PriceVerdict.headline(): String = when (this) {
    is PriceVerdict.Ok -> when {
        verifyFirst -> stringResource(R.string.mm_deal_verify)
        band == VerdictBand.BELOW -> stringResource(R.string.mm_verdict_below, pct)
        band == VerdictBand.ABOVE -> stringResource(R.string.mm_verdict_above, pct)
        else -> stringResource(R.string.mm_deal_near_typical)
    }
    is PriceVerdict.Withheld -> when (group) {
        WithheldGroup.PRICE_UNUSABLE -> stringResource(R.string.mm_verdict_withheld_price)
        WithheldGroup.LEASE_OR_RENT -> stringResource(R.string.mm_verdict_withheld_lease)
        WithheldGroup.PARTS_OR_DAMAGED -> stringResource(R.string.mm_verdict_withheld_parts)
        WithheldGroup.INCONSISTENT_DATA -> stringResource(R.string.mm_verdict_withheld_inconsistent)
        WithheldGroup.INSUFFICIENT_DATA -> stringResource(R.string.mm_verdict_withheld_insufficient)
    }
}

/** One plain sentence on why there is no rating. */
@Composable
fun PriceVerdict.Withheld.detail(): String = when (group) {
    WithheldGroup.PRICE_UNUSABLE -> stringResource(R.string.mm_verdict_withheld_body_price)
    WithheldGroup.LEASE_OR_RENT -> stringResource(R.string.mm_verdict_withheld_body_lease)
    WithheldGroup.PARTS_OR_DAMAGED -> stringResource(R.string.mm_verdict_withheld_body_parts)
    WithheldGroup.INCONSISTENT_DATA -> stringResource(R.string.mm_verdict_withheld_body_inconsistent)
    WithheldGroup.INSUFFICIENT_DATA -> stringResource(R.string.mm_verdict_withheld_body_insufficient)
}

/** Tone for an ok verdict (verify-first is amber, never green). */
val PriceVerdict.Ok.tone: MmDealTone
    get() = when {
        verifyFirst -> MmDealTone.CAUTION
        band == VerdictBand.BELOW -> if (pct >= 15) MmDealTone.GREAT else MmDealTone.GOOD
        band == VerdictBand.ABOVE -> MmDealTone.HIGH
        else -> MmDealTone.FAIR
    }

/** Backend confidence token ("high" / "medium" / "low") in the app language. */
@Composable
fun confidenceWord(token: String?): String = when (token?.trim()?.lowercase()) {
    "high" -> stringResource(R.string.mm_conf_high)
    "medium" -> stringResource(R.string.mm_conf_medium)
    else -> stringResource(R.string.mm_conf_low)
}
