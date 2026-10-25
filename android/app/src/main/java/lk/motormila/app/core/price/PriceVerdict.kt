package lk.motormila.app.core.price

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * The ONE price verdict — every price judgment in the app derives from it:
 * deal badges (cards, detail), the deal ring, the FMV card, the deal ladder,
 * the price-history "typical" line and the share card.
 *
 * Port of backend/app/utils/price_verdict.py and web src/lib/priceVerdict.ts.
 * All three assert the same cases in docs/price-verdict-fixtures.json
 * (PriceVerdictTest here) — change them together.
 *
 *   below ≤ −5 % · above ≥ +8 % · verify-first ≤ −35 % · withheld beyond ±60 %
 *
 * We withhold instead of showing something that looks fake: a power-of-ten
 * slip, fewer than 5 comps, low confidence, an "Other" model bucket, a
 * placeholder / below-floor / over-ceiling price, lease / rent / down-payment
 * wording, or parts / damaged wording. Pure Kotlin — no android.* imports.
 */
object PriceVerdicts {
    const val BELOW_PCT = 5.0
    const val ABOVE_PCT = 8.0
    const val VERIFY_BELOW_PCT = 35.0
    /** Beyond this gap either way the comparison itself is suspect. */
    const val MAX_PLAUSIBLE_GAP_PCT = 60.0
    const val MIN_COMPS = 5
    const val MAX_PLAUSIBLE_PRICE_LKR = 500_000_000.0
    const val DEFAULT_PRICE_FLOOR_LKR = 100_000.0

    /** Lowest plausible full asking price per category (below it: deposit, instalment, part or typo). */
    val PRICE_FLOOR_LKR: Map<String, Double> = mapOf(
        "motorbikes" to 50_000.0,
        "three-wheelers" to 100_000.0,
        "tractors" to 100_000.0,
        "cars" to 300_000.0,
        "suvs" to 300_000.0,
        "jeeps" to 300_000.0,
        "vans" to 300_000.0,
        "wagons" to 300_000.0,
        "pickups" to 300_000.0,
        "crew-cabs" to 300_000.0,
        "lorries" to 300_000.0,
        "lorries-trucks" to 300_000.0,
        "trucks" to 300_000.0,
        "buses" to 300_000.0,
        "heavy-duty" to 300_000.0,
    )

    private val GENERIC_MODELS = setOf("", "other", "others", "unknown", "n/a", "na", "-", "none", "any", "various")
    private val PLACEHOLDER_RE = Regex("""^(?:1{6,}|1234(?:5(?:6(?:7(?:8(?:9)?)?)?)?)?|98765\d{0,4})$""")
    private val RENT_RE = Regex(
        """\b(?:for\s+(?:rent|hire)|rent\s*-?\s*a\s*-?\s*(?:car|van|cab)|on\s+rent|rentals?|per\s+(?:month|day|week)|""" +
            """monthly\s+(?:rent(?:al)?|payment|instal+ment)|daily\s+rental|down\s*-?\s*payment|instal+ments?\s+only)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val PARTS_RE = Regex(
        """\b(?:(?:for|spare)\s+parts|parts\s+only|(?:body|engine|shell|chassis)\s+only|salvage|scrap(?:ped)?|wreck(?:ed)?|""" +
            """breaking\s+for\s+parts|dismantl\w*|accidented|accident\s+(?:damaged?|vehicle|car|bike|repair)|""" +
            """(?:fire|flood)\s*-?\s*damaged?|damaged\s+(?:vehicle|car|bike|van))\b""",
        RegexOption.IGNORE_CASE,
    )

    fun isPlaceholderPrice(price: Double): Boolean {
        if (!(price > 0) || price != floor(price) || price > 9.0e15) return false
        return PLACEHOLDER_RE.matches(price.toLong().toString())
    }

    /** A bucket like "Other" (many models mixed). Unknown (null) is not penalised. */
    fun isGenericModel(model: String?): Boolean = model != null && model.trim().lowercase() in GENERIC_MODELS

    fun priceFloorLkr(category: String?): Double =
        PRICE_FLOOR_LKR[category.orEmpty().trim().lowercase()] ?: DEFAULT_PRICE_FLOOR_LKR

    /** Prices a power of ten apart (±4 %): the lakhs / millions / rupees slip. */
    fun isPowerOfTenApart(a: Double, b: Double): Boolean {
        if (!(a > 0) || !(b > 0)) return false
        val ratio = max(a, b) / min(a, b)
        return listOf(10.0, 100.0, 1_000.0, 10_000.0, 100_000.0, 1_000_000.0).any { abs(ratio / it - 1) <= 0.04 }
    }

    /** Why [asking] is not a usable full vehicle price, or null when it is. */
    fun askingPriceIssue(asking: Double?, ctx: PriceContext = PriceContext()): WithheldReason? {
        val price = asking?.takeIf { it.isFinite() }
        if (price == null || price <= 0) return WithheldReason.NO_PRICE
        if (isPlaceholderPrice(price)) return WithheldReason.PLACEHOLDER_PRICE
        if (price < priceFloorLkr(ctx.category)) return WithheldReason.BELOW_PRICE_FLOOR
        if (price > MAX_PLAUSIBLE_PRICE_LKR) return WithheldReason.ABOVE_PRICE_CEILING
        if (LeaseTakeover.detect(ctx.title, ctx.variant, ctx.description)) return WithheldReason.LEASE_OR_RENT
        val text = listOfNotNull(ctx.title, ctx.variant, ctx.description).joinToString(" ")
        if (RENT_RE.containsMatchIn(text)) return WithheldReason.LEASE_OR_RENT
        if (PARTS_RE.containsMatchIn(text)) return WithheldReason.PARTS_OR_DAMAGED
        return null
    }

    private fun bandOf(gap: Double): VerdictBand = when {
        gap <= -BELOW_PCT -> VerdictBand.BELOW
        gap >= ABOVE_PCT -> VerdictBand.ABOVE
        else -> VerdictBand.FAIR
    }

    /**
     * The verdict for an asking price against ONE reference. [comps] unknown
     * (null, e.g. on a card) is not penalised; [secondaryReference] is a second
     * estimate for the same listing — opposite directions withhold.
     */
    fun verdict(
        asking: Double?,
        reference: Double?,
        comps: Int? = null,
        confidence: String? = null,
        secondaryReference: Double? = null,
        ctx: PriceContext = PriceContext(),
    ): PriceVerdict {
        val ref = reference?.takeIf { it.isFinite() }
        askingPriceIssue(asking, ctx)?.let { return PriceVerdict.Withheld(it, ref) }
        val price = asking!!
        if (ref == null || ref <= 0) return PriceVerdict.Withheld(WithheldReason.NO_REFERENCE, null)
        if (isGenericModel(ctx.model)) return PriceVerdict.Withheld(WithheldReason.GENERIC_MODEL, ref)
        if (comps != null && comps < MIN_COMPS) return PriceVerdict.Withheld(WithheldReason.THIN_COMPS, ref)
        val conf = confidence.orEmpty().trim().lowercase()
        if (conf == "low" || conf == "none") return PriceVerdict.Withheld(WithheldReason.LOW_CONFIDENCE, ref)
        if (isPowerOfTenApart(price, ref)) return PriceVerdict.Withheld(WithheldReason.UNIT_MISMATCH, ref)
        val gap = (price - ref) / ref * 100.0
        if (abs(gap) > MAX_PLAUSIBLE_GAP_PCT) return PriceVerdict.Withheld(WithheldReason.IMPLAUSIBLE_GAP, ref)
        val band = bandOf(gap)
        val second = secondaryReference?.takeIf { it.isFinite() && it > 0 }
        if (second != null) {
            val gap2 = (price - second) / second * 100.0
            val band2 = if (abs(gap2) <= MAX_PLAUSIBLE_GAP_PCT) bandOf(gap2) else null
            if ((band == VerdictBand.BELOW && band2 == VerdictBand.ABOVE) || (band == VerdictBand.ABOVE && band2 == VerdictBand.BELOW)) {
                return PriceVerdict.Withheld(WithheldReason.ESTIMATES_DISAGREE, ref)
            }
        }
        var pct = floor(abs(gap) + 0.5).toInt()
        pct = when (band) {
            VerdictBand.FAIR -> min(pct, (if (gap < 0) BELOW_PCT else ABOVE_PCT).toInt() - 1)
            VerdictBand.BELOW -> max(pct, BELOW_PCT.toInt())
            VerdictBand.ABOVE -> max(pct, ABOVE_PCT.toInt())
        }
        return PriceVerdict.Ok(
            band = band,
            gapPct = (gap * 100.0).roundToLong() / 100.0,
            pct = pct,
            verifyFirst = gap <= -VERIFY_BELOW_PCT,
            referenceLkr = ref,
            gapLkr = abs(price - ref),
        )
    }

    /** Verdict from the listing row alone (cards, lists, compare): the stored cohort median is the reference. */
    fun forListingRow(
        priceLkr: Double?,
        marketMedianLkr: Double?,
        ctx: PriceContext,
    ): PriceVerdict = verdict(asking = priceLkr, reference = marketMedianLkr, ctx = ctx)

    /**
     * Data-boundary guard: a stored deal score / median whose comparison is
     * withheld is dropped so no list, sort, badge or chart can show
     * "90 % below similar cars" off a mixed cohort. Missing medians stay missing.
     */
    fun storedSignalIsPlausible(
        priceLkr: Double?,
        marketMedianLkr: Double?,
        dealScore: Double?,
        ctx: PriceContext,
    ): Boolean {
        if (marketMedianLkr == null) return dealScore == null || abs(dealScore) <= MAX_PLAUSIBLE_GAP_PCT
        return forListingRow(priceLkr, marketMedianLkr, ctx) is PriceVerdict.Ok
    }

    /**
     * THE verdict for one listing on its detail screen — computed once and handed
     * to every panel so they cannot contradict each other.
     *
     * - FMV loaded: its estimate + comps/confidence is the reference; the stored
     *   cohort median (what the card used) is the secondary check. A backend that
     *   already withheld the verdict wins.
     * - FMV not loaded: the stored cohort median, exactly like the card.
     */
    fun resolve(
        priceLkr: Double?,
        marketMedianLkr: Double?,
        ctx: PriceContext,
        fmv: FmvReference?,
    ): PriceVerdict {
        if (fmv == null) return forListingRow(priceLkr, marketMedianLkr, ctx)
        val serverReason = fmv.withheldReason
        if (serverReason != null) {
            val issue = askingPriceIssue(priceLkr, ctx)
            return PriceVerdict.Withheld(
                issue ?: WithheldReason.fromKey(serverReason) ?: WithheldReason.LOW_CONFIDENCE,
                fmv.fmvLkr,
            )
        }
        if (fmv.method == "insufficient_data" || fmv.fmvLkr == null) {
            return PriceVerdict.Withheld(askingPriceIssue(priceLkr, ctx) ?: WithheldReason.NO_REFERENCE, null)
        }
        return verdict(
            asking = priceLkr,
            reference = fmv.fmvLkr,
            comps = fmv.sampleSize,
            confidence = fmv.confidence,
            secondaryReference = marketMedianLkr?.takeIf { it != fmv.fmvLkr },
            ctx = ctx,
        )
    }
}

enum class VerdictBand { BELOW, FAIR, ABOVE }

/** What the user is told — one message per group. */
enum class WithheldGroup { PRICE_UNUSABLE, LEASE_OR_RENT, PARTS_OR_DAMAGED, INSUFFICIENT_DATA, INCONSISTENT_DATA }

enum class WithheldReason(val key: String, val group: WithheldGroup) {
    NO_PRICE("no_price", WithheldGroup.PRICE_UNUSABLE),
    PLACEHOLDER_PRICE("placeholder_price", WithheldGroup.PRICE_UNUSABLE),
    BELOW_PRICE_FLOOR("below_price_floor", WithheldGroup.PRICE_UNUSABLE),
    ABOVE_PRICE_CEILING("above_price_ceiling", WithheldGroup.PRICE_UNUSABLE),
    LEASE_OR_RENT("lease_or_rent", WithheldGroup.LEASE_OR_RENT),
    PARTS_OR_DAMAGED("parts_or_damaged", WithheldGroup.PARTS_OR_DAMAGED),
    NO_REFERENCE("no_reference", WithheldGroup.INSUFFICIENT_DATA),
    THIN_COMPS("thin_comps", WithheldGroup.INSUFFICIENT_DATA),
    LOW_CONFIDENCE("low_confidence", WithheldGroup.INSUFFICIENT_DATA),
    GENERIC_MODEL("generic_model", WithheldGroup.INSUFFICIENT_DATA),
    IMPLAUSIBLE_GAP("implausible_gap", WithheldGroup.INCONSISTENT_DATA),
    UNIT_MISMATCH("unit_mismatch", WithheldGroup.INCONSISTENT_DATA),
    ESTIMATES_DISAGREE("estimates_disagree", WithheldGroup.INCONSISTENT_DATA),
    ;

    companion object {
        fun fromKey(key: String?): WithheldReason? = entries.firstOrNull { it.key == key }
    }
}

sealed interface PriceVerdict {
    data class Ok(
        val band: VerdictBand,
        /** (asking − reference) / reference × 100; negative = below. */
        val gapPct: Double,
        /** Whole percent, never contradicting the band once rounded. */
        val pct: Int,
        /** Deep below the reference: amber "verify first", never green. */
        val verifyFirst: Boolean,
        val referenceLkr: Double,
        /** |asking − reference| in rupees. */
        val gapLkr: Double,
    ) : PriceVerdict {
        /** Legacy deal-score sign: positive = below typical. */
        val dealScore: Double get() = -gapPct
    }

    data class Withheld(val reason: WithheldReason, val referenceLkr: Double?) : PriceVerdict {
        val group: WithheldGroup get() = reason.group
    }
}

/** Ad text the verdict reads (title / variant / description) plus category and model. */
data class PriceContext(
    val category: String? = null,
    val model: String? = null,
    val title: String? = null,
    val description: String? = null,
    val variant: String? = null,
)

/** The FMV fields the verdict needs (domain Fmv → this, see Fmv.toReference). */
data class FmvReference(
    val fmvLkr: Double?,
    val sampleSize: Int?,
    val confidence: String?,
    val method: String?,
    /** Backend `verdict.reason` when the backend already withheld the verdict. */
    val withheldReason: String?,
)

/**
 * Lease-takeover detector (port of web src/lib/leaseTakeover.ts and backend
 * is_lease_takeover_text). Reads the ad text only — never invents a full price.
 * Harmless phrases ("leasing can be arranged", "lease fully settled") are
 * scrubbed first so a broader positive pattern can't re-match them.
 */
object LeaseTakeover {
    private val positive = listOf(
        """\bleas(?:e|ing)\s*(?:-|\s)?\s*(?:take\s*-?\s*over|transfer)\b""",
        """\btake\s*-?\s*over\b""",
        """\bcan\s+be\s+taken\s+over\b""",
        """\bleas(?:e|ing)\s*settle(?:ment)?\b(?!d)""",
        """\bsettle\s+(?:the\s+)?leas(?:e|ing)\b""",
        """\b(?:ongoing|on-going|existing|running|current)\s+leas(?:e|ing)\b""",
        """\bcontinu(?:e|ing)\s+(?:the\s+|with\s+the\s+)?(?:existing\s+)?leas(?:e|ing)\b""",
        """\bbalance\b[^.\n]{0,40}?\binstal+ments?\b""",
        """\bremaining\s+(?:\d{1,3}\s+)?instal+ments?\b""",
        """\b(?:leas(?:e|ing)|loan|facility)\s+balance\b""",
        """\bbalance\s+(?:leas(?:e|ing)|loan)\b""",
        """\bleas(?:e|ing)\b[^.\n\d]{0,20}[\d,]{4,}(?:\.\d+)?\s*(?:/=)?\s*[x×*]\s*\d{1,3}\b""",
    ).map { Regex(it, RegexOption.IGNORE_CASE) }

    private val negative = listOf(
        """\bleas(?:e|ing)\s+(?:can\s+be\s+)?(?:arranged|facilit(?:y|ies)|available|options?)\b""",
        """\bleas(?:e|ing)\s+(?:is\s+)?(?:fully\s+)?(?:settled|cleared|closed|free)\b""",
        """\b(?:no|without)\s+leas(?:e|ing)\b""",
    ).map { Regex(it, RegexOption.IGNORE_CASE) }

    fun detect(vararg texts: String?): Boolean {
        val text = texts.filterNotNull().filter { it.isNotBlank() }.joinToString(" \n ")
        if (text.isBlank()) return false
        val scrubbed = negative.fold(text) { acc, r -> r.replace(acc, " ") }
        return positive.any { it.containsMatchIn(scrubbed) }
    }
}
