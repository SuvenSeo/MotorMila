import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { CONTROLLER_NAME, LegalPageShell, LegalSection, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { LISTING_SOURCES } from "@/lib/listingSources";

export default function TermsOfService() {
  return (
    <LegalPageShell
      icon={FileText}
      title="Terms of Use"
      description="The rules for using MotorMila, in plain English."
    >
      <LegalSection title="1. About these terms">
        <p>
          These terms apply when you use the MotorMila website, app and API ("MotorMila"), run by {CONTROLLER_NAME}.
          By using MotorMila you agree to them. If you don't agree, please don't use the service.
        </p>
      </LegalSection>

      <LegalSection title="2. What MotorMila is, and isn't">
        <ul>
          <li>MotorMila is an independent search and price-comparison service. It collects vehicle ads published on other websites ({LISTING_SOURCES.map((s) => s.name).join(", ")}) and ads posted directly on MotorMila.</li>
          <li>We are <strong>not affiliated with</strong> those websites. Their ads belong to the sellers and the sites that published them. Each listing links to the original ad, and that ad is the authoritative version.</li>
          <li>We are not a dealer, broker, lender or insurer. We don't own, inspect or sell the vehicles shown, and we aren't part of any deal between a buyer and a seller.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. No guarantees">
        <ul>
          <li>Listings can be out of date, sold, wrong or removed from the original site. Check the original ad and the vehicle itself before you pay.</li>
          <li>Prices, deal scores, "fair value", trends, landed-cost and tax estimates are automated estimates from available data. They are not valuations, financial advice or tax advice.</li>
          <li>Import duty and tax figures follow the gazettes we know about and can change at any time. Confirm with Sri Lanka Customs or a licensed clearing agent.</li>
          <li>MotorMila is provided "as is". We don't promise it will always be available or error-free.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Leasing, inspection and insurance requests">
        <p>
          If you send a request through a MotorMila form, we pass your details to the partner named on the form, with
          your consent. The partner makes its own decisions and its own agreement with you. Partners may pay MotorMila
          a referral fee. Insurance requests go only to a broker registered with the Insurance Regulatory Commission of
          Sri Lanka. MotorMila does not give insurance advice.
        </p>
      </LegalSection>

      <LegalSection title="5. Your account">
        <ul>
          <li>Keep your password safe. You're responsible for what happens under your account.</li>
          <li>Give accurate information, and don't share a paid seat outside the team it was bought for.</li>
          <li>You can close your account at any time on the <Link to="/delete-account">account deletion page</Link>.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Plans and payments">
        <ul>
          <li>Pro is free while MotorMila is in beta. We'll tell you before any Pro charge starts, and nothing renews without your agreement.</li>
          <li>Dealer plans are billed monthly or yearly in LKR through PayHere, or by bank transfer or KOKO. Prices are on the <Link to="/pricing">pricing page</Link>.</li>
          <li>You can cancel at any time. The plan stays active until the end of the period you've paid for. If a payment was taken in error, contact us within 14 days for a refund.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Posting your own ads">
        <p>
          If you post a vehicle on MotorMila, you confirm you have the right to sell it and to use the photos and text.
          You give MotorMila permission to show, resize and promote that ad on MotorMila and its apps while it is live.
          Ads are reviewed before going live, and we may remove ads that are misleading, illegal or duplicated.
        </p>
      </LegalSection>

      <LegalSection title="8. Fair use of MotorMila">
        <p>Please don't:</p>
        <ul>
          <li>use MotorMila for anything illegal, or to harass or spam sellers;</li>
          <li>try to break into, overload or disrupt the service, or get around rate limits and access controls;</li>
          <li>misrepresent MotorMila data as your own, or remove the links to original sources.</li>
        </ul>
        <p>
          Automated access is fine if it is polite: identify your bot, respect our robots.txt and rate limits, and link
          back to us. For regular or large-scale use, ask us about an API key at{" "}
          <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.
        </p>
      </LegalSection>

      <LegalSection title="9. Removing content">
        <p>
          If a listing is yours, shows your personal details, or uses your photo or text without permission, send a{" "}
          <Link to="/removal">removal request</Link>. We act within 72 hours and tell you what we did.
        </p>
      </LegalSection>

      <LegalSection title="10. Liability">
        <p>
          As far as Sri Lankan law allows, MotorMila isn't liable for losses from relying on a listing or estimate, from
          a deal with a seller or partner, or from the service being unavailable. If we are liable to you, our total
          liability is limited to what you paid us in the 12 months before the claim. Nothing in these terms limits
          liability that can't be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes, law and contact">
        <p>
          We may update these terms. We'll change the effective date and give notice of important changes. These terms
          are governed by the laws of Sri Lanka, and the courts of Sri Lanka have jurisdiction.
        </p>
        <p>
          Questions: <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>. Privacy questions:{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
