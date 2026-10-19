package lk.motormila.app.ui.pricing

data class PricingTier(
    val id: String,
    val name: String,
    val price: String,
    val note: String,
    val annualNote: String? = null,
    val audience: String,
    val highlight: Boolean = false,
    val features: List<String>,
    val cta: String,
)

data class PricingFaq(
    val question: String,
    val answer: String,
    /** Mentions bank transfer / KOKO / WhatsApp: hidden in the Play flavor. */
    val externalPayment: Boolean = false,
)

object PricingCatalog {
    val trialDays: Int = 7

    val tiers: List<PricingTier> = listOf(
        PricingTier(
            id = "free",
            name = "Free",
            price = "LKR 0",
            note = "/mo",
            audience = "Browsers and first-time buyers testing the market",
            features = listOf(
                "Open every product page (soft limits, not hard locks)",
                "First 12 live listings · page 1 only",
                "Latest 6 Official Pulse signals",
                "Landed-cost calculator (starter)",
                "6-month trends & price-index window",
                "Teaser Best Picks shortlist",
                "1 market alert (no WhatsApp)",
            ),
            cta = "Browse the market",
        ),
        PricingTier(
            id = "pro",
            name = "Pro",
            price = "Coming soon",
            note = "launching soon",
            // Live price (kept): LKR 999 /mo, LKR 9,990/yr
            annualNote = "Coming soon",
            audience = "Brokers, analysts, and serious buyers who need depth",
            features = listOf(
                "Full Pro terminal",
                "Official Pulse history",
                "Deeper alerts and match refresh",
                "Lane drill-downs and source coverage",
                "CSV / PDF export packs",
                "7-day free trial — no invite needed when self-serve is on",
            ),
            cta = "Start 7-day free trial",
        ),
        PricingTier(
            id = "dealer",
            name = "Dealer",
            price = "Coming soon",
            note = "launching soon",
            // Live price (kept): LKR 1,999 /mo, LKR 19,990/yr
            annualNote = "Coming soon",
            audience = "Yards and multi-lot dealers running inventory every day",
            highlight = true,
            features = listOf(
                "Everything in Pro",
                "Full Dealer workspace",
                "URL benchmark against live comps",
                "Aging and price-gap views",
                "Team seats for sales staff",
                "Claim-profile yard matching",
            ),
            cta = "Open dealer workspace",
        ),
        PricingTier(
            id = "custom",
            name = "Custom",
            price = "Coming soon",
            note = "message us",
            audience = "Banks, leasing desks, multi-branch importers",
            features = listOf(
                "Everything in Dealer",
                "Custom data feeds and SLAs",
                "Seat packs and branded reports",
                "Policy and portfolio brief formats",
                "Dedicated onboarding",
            ),
            cta = "Message us",
        ),
    )

    val faqs: List<PricingFaq> = listOf(
        PricingFaq(
            "Why isn’t everything free?",
            "Scraping, normalizing, and scoring Sri Lanka’s vehicle boards is ongoing ops cost. Free covers browse and starter tools; Pro and Dealer fund pipeline uptime, pulse depth, and workspaces.",
        ),
        PricingFaq(
            "Can I try Pro before paying?",
            "Yes. Start a 7-day free Pro trial from Sign up when self-serve is enabled. After the trial, pay by bank transfer or KOKO and WhatsApp the receipt for activation within 2 hours.",
            externalPayment = true,
        ),
        PricingFaq(
            "Is annual billing cheaper?",
            "Yes — annual saves 2 months. Pro is LKR 9,990/yr (vs LKR 999/mo) and Dealer is LKR 19,990/yr (vs LKR 1,999/mo).",
        ),
        PricingFaq(
            "How do I pay without a card?",
            "Pay by bank transfer or KOKO, then WhatsApp the receipt with your account email. We activate Pro / Dealer within 2 hours.",
            externalPayment = true,
        ),
        PricingFaq(
            "Do deal scores work on Free?",
            "No — deal scores are a Pro signal. Free can browse listings and tools with soft limits; Pro unlocks scoring on every listing, Best Picks ranking, and deeper lane context.",
        ),
    )

    /** FAQs for this build's distribution channel (Play: no external payment copy). */
    val channelFaqs: List<PricingFaq>
        get() = faqs.filter { lk.motormila.app.BuildConfig.EXTERNAL_CHECKOUT_ENABLED || !it.externalPayment }

    const val CONTACT_MAILTO = lk.motormila.app.core.SupportContact.MAILTO
    const val CONTACT_PHONE = "0758504424"
}
