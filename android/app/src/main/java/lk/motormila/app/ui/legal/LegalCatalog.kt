package lk.motormila.app.ui.legal

data class LegalSection(
    val heading: String,
    val paragraphs: List<String>,
    val bullets: List<String> = emptyList(),
)

data class LegalDocument(
    val id: String,
    val eyebrow: String,
    val title: String,
    val subtitle: String,
    val updated: String,
    val cta: String,
    val sections: List<LegalSection>,
)

object LegalCatalog {
    const val CONTACT_EMAIL = lk.motormila.app.core.SupportContact.EMAIL
    const val CONTACT_PHONE = "0758504424"

    val privacy = LegalDocument(
        id = "privacy",
        eyebrow = "Legal",
        title = "Privacy Policy.",
        subtitle = "How Motormila collects, uses, and protects information when you use the platform.",
        updated = "Last updated: July 2025 · Motormila is operated by Ardeno Studio.",
        cta = "Terms of Service",
        sections = listOf(
            LegalSection(
                heading = "1. What we collect",
                paragraphs = listOf(
                    "Motormila aggregates vehicle listing data from publicly accessible Sri Lanka classified websites (Ikman, Riyasewana, AutoLanka, and others). We do not collect personal information from those listings — only vehicle attributes, asking prices, and seller-provided descriptions that are already public.",
                    "When you create an account, we store your email address, chosen display name, access plan, and encrypted password hash. We also record sign-in timestamps and the IP address of each authenticated request for security purposes.",
                ),
            ),
            LegalSection(
                heading = "2. How we use your information",
                paragraphs = listOf(
                    "We do not sell, rent, or share your personal data with third parties for marketing.",
                ),
                bullets = listOf(
                    "To authenticate your session and enforce plan limits.",
                    "To send platform invite emails and transactional notifications.",
                    "To deliver WhatsApp market-alert messages — only when you explicitly opt in by providing your phone number in Alerts.",
                    "To improve scrape quality and detect data anomalies (aggregate, anonymised).",
                ),
            ),
            LegalSection(
                heading = "3. Fair Market Value estimates",
                paragraphs = listOf(
                    "Price intelligence, deal scores, and FMV estimates on Motormila are algorithmic signals derived from live listing data — they are not formal appraisals, certified valuations, or financial advice. Treat them as market reference points only.",
                ),
            ),
            LegalSection(
                heading = "4. WhatsApp alerts",
                paragraphs = listOf(
                    "WhatsApp notifications are strictly opt-in. By submitting a phone number in Alerts you consent to receiving vehicle-match messages via Twilio. You can withdraw consent at any time by removing the alert or contacting us.",
                ),
            ),
            LegalSection(
                heading = "5. Cookies and local storage",
                paragraphs = listOf(
                    "The native app stores your session token, watchlist IDs, and UI preferences (theme, language) on this device. That data is not sold. Session cookies on the web product are HttpOnly and Secure.",
                ),
            ),
            LegalSection(
                heading = "6. Data retention and erasure",
                paragraphs = listOf(
                    "Account data is retained while your account is active. Delete your account at any time in Settings → Delete account, or on the web at motormila.pages.dev/delete-account. You can also email $CONTACT_EMAIL with subject \"Data erasure request\". Erasure completes within 14 days.",
                ),
            ),
            LegalSection(
                heading = "7. Changes to this policy",
                paragraphs = listOf(
                    "Material changes will be communicated via email to registered users at least 14 days before taking effect. Continued use of the platform after that date constitutes acceptance of the updated policy.",
                ),
            ),
            LegalSection(
                heading = "8. Contact",
                paragraphs = listOf("Questions about privacy: $CONTACT_EMAIL"),
            ),
        ),
    )

    val terms = LegalDocument(
        id = "terms",
        eyebrow = "Legal",
        title = "Terms of Service.",
        subtitle = "The rules that govern your use of Motormila and the obligations of both parties.",
        updated = "Last updated: July 2025 · Motormila is operated by Ardeno Studio.",
        cta = "Privacy Policy",
        sections = listOf(
            LegalSection(
                heading = "1. Acceptance",
                paragraphs = listOf(
                    "By creating an account or using Motormila you agree to these Terms. If you do not agree, do not use the platform. Access is invite-only and may be revoked at any time for violation of these Terms.",
                ),
            ),
            LegalSection(
                heading = "2. Description of service",
                paragraphs = listOf(
                    "Motormila is a vehicle market intelligence platform that aggregates publicly available car listings from Sri Lanka classifieds, applies pricing algorithms, and presents analytics for buyers, dealers, and importers.",
                    "Listing data is scraped from public sources and may lag real-world availability. Motormila does not sell vehicles, broker transactions, or guarantee the accuracy of any third-party listing.",
                ),
            ),
            LegalSection(
                heading = "3. Pricing estimates and FMV scores",
                paragraphs = listOf(
                    "Fair Market Value (FMV) estimates, deal scores, and price indices produced by Motormila are algorithmic signals derived from scraped listing data. They are not certified appraisals, professional valuations, or financial advice. Do not rely on them as the sole basis for any financial decision. Motormila accepts no liability for decisions made using platform outputs.",
                ),
            ),
            LegalSection(
                heading = "4. Permitted use",
                paragraphs = listOf("You may use Motormila for lawful personal or business research. You must not:"),
                bullets = listOf(
                    "Scrape, copy, or republish platform data in bulk without a written B2B licence.",
                    "Attempt to reverse-engineer pricing algorithms or access APIs beyond published endpoints.",
                    "Use the platform to mislead buyers or artificially inflate or deflate market perceptions.",
                    "Share account credentials or seats with parties outside your licensed team.",
                ),
            ),
            LegalSection(
                heading = "5. Subscription and payment",
                paragraphs = listOf(
                    "Free, Pro, and Dealer plans are described on Pricing. Paid plans are billed in advance. Failure to renew reverts access to the Free tier. Refunds are not provided for partial periods except where required by applicable law.",
                ),
            ),
            LegalSection(
                heading = "6. WhatsApp notifications",
                paragraphs = listOf(
                    "WhatsApp market-alert messages are opt-in only. By adding a phone number to an alert you consent to receive automated messages via Twilio. Standard carrier message rates may apply. Opt out at any time by removing the alert.",
                ),
            ),
            LegalSection(
                heading = "7. Intellectual property",
                paragraphs = listOf(
                    "The Motormila platform, brand, algorithms, and original content are owned by Ardeno Studio. Individual listing data remains the property of the originating classifieds platforms; Motormila aggregates it under fair-use indexing.",
                ),
            ),
            LegalSection(
                heading = "8. Limitation of liability",
                paragraphs = listOf(
                    "To the maximum extent permitted by law, Ardeno Studio is not liable for any indirect, incidental, or consequential damages arising from use of Motormila, including losses from transactions made using platform pricing signals.",
                ),
            ),
            LegalSection(
                heading = "9. Governing law",
                paragraphs = listOf(
                    "These Terms are governed by the laws of Sri Lanka. Disputes shall be resolved in the courts of Sri Lanka unless otherwise agreed in writing.",
                ),
            ),
            LegalSection(
                heading = "10. Contact",
                paragraphs = listOf("Questions about these Terms: $CONTACT_EMAIL"),
            ),
        ),
    )

    fun byId(id: String): LegalDocument = when (id) {
        "terms" -> terms
        else -> privacy
    }
}
