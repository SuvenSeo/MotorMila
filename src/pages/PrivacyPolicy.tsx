import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { CONTROLLER_NAME, LegalPageShell, LegalSection, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { LISTING_SOURCES } from "@/lib/listingSources";

export default function PrivacyPolicy() {
  return (
    <LegalPageShell
      icon={Shield}
      title="Privacy Policy"
      description="What we collect, where it comes from, why we use it, how long we keep it, and how you can control it."
    >
      <LegalSection title="1. Who we are">
        <p>
          MotorMila is a vehicle price and market website for Sri Lanka. The data controller is {CONTROLLER_NAME}.
          You can reach us about anything in this policy at <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
          That mailbox is read by our data protection officer.
        </p>
        <p>
          We aim to follow Sri Lanka's Personal Data Protection Act, No. 9 of 2022 (as amended), which we call
          the PDPA below.
        </p>
      </LegalSection>

      <LegalSection title="2. The short version">
        <ul>
          <li>We show vehicle facts (make, model, year, price, mileage, district) from public listing sites, with a link back to the original ad.</li>
          <li>We don't sell your personal data.</li>
          <li>If you ask for a leasing, inspection or insurance quote, we share your details only with the partner named on that form, and only after you tick the consent box.</li>
          <li>You can ask us to remove a listing or your data at any time. We act on removal requests within 72 hours.</li>
        </ul>
      </LegalSection>

      <LegalSection id="sources" title="3. Listing data from other websites">
        <p>
          Most listings on MotorMila come from public vehicle ads on these sites:{" "}
          {LISTING_SOURCES.map((s) => s.name).join(", ")}. We only collect ads that anyone can see without an account,
          and every listing links back to the original ad.
        </p>
        <p>From those ads we keep the vehicle details and the link: title, make, model, year, price, mileage, fuel,
          transmission, engine size, body type, condition, district or town, and the dates we first and last saw the ad.
          We use these to build price statistics such as medians, trends and deal scores.
        </p>
        <p>
          A listing can contain personal data about the seller, such as a name, a phone number, or a person or number
          plate in a photo. We don't build profiles of sellers. To contact a seller you go to the original ad.
          If you are the seller and want a listing or your details removed, use the{" "}
          <Link to="/removal">removal request form</Link>.
        </p>
        <p>
          Legal basis: our legitimate interest, and that of buyers, in comparing vehicle prices in one place. We have
          weighed this against sellers' interests, and we limit what we keep for that reason (see section 7).
        </p>
      </LegalSection>

      <LegalSection title="4. Data you give us">
        <ul>
          <li><strong>Account:</strong> email, display name, a hashed password, your plan, and sign-in times. Basis: our contract with you.</li>
          <li><strong>Your own ads</strong> (Sell your car): vehicle details, photos, and the contact name and phone you choose to show. Basis: contract.</li>
          <li><strong>Alerts:</strong> your saved searches and, if you turn them on, the phone number, Telegram or email used to send alerts. Basis: your consent, which you can withdraw in Alerts or Settings.</li>
          <li><strong>Leasing, inspection and insurance requests:</strong> name, phone, optional email, district, the vehicle, budget or down payment, preferred date and notes, plus the exact consent text you agreed to and when. Basis: your consent.</li>
          <li><strong>Payments:</strong> handled by PayHere (cards, Genie, FriMi, eZcash and others) or by bank transfer or KOKO. We never see or store your card number. We keep the order, plan, amount and status. Basis: contract and our legal duty to keep accounting records.</li>
          <li><strong>Messages to us:</strong> feedback, waitlist emails, removal and deletion requests. Basis: legitimate interest in replying, or a legal duty.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Data collected automatically">
        <ul>
          <li><strong>Security logs:</strong> IP address, browser type and request times, to keep the service secure and stop abuse. On lead forms we store a one-way hash of your IP, not the IP itself.</li>
          <li><strong>Usage analytics:</strong> pages viewed and product events (for example "compare opened"), linked to a random ID that lasts only for your browser session. We also use Vercel Web Analytics, which doesn't use cookies. See the <Link to="/cookies">cookie notice</Link>.</li>
          <li><strong>Error reports:</strong> if the app crashes, a technical report goes to our error tracker without your name or email.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Who we share data with">
        <ul>
          <li><strong>Partners you choose:</strong> the leasing company, inspection company or licensed insurance broker named on a request form, and only for that request.</li>
          <li><strong>Service providers</strong> who process data for us under contract: Vercel (website hosting), Hugging Face (API hosting), Neon (database), Cloudflare (storage and network), PayHere (payments), our email provider (account and alert emails), and Telegram and WhatsApp if you turn on those alerts.</li>
          <li><strong>Authorities</strong>, when Sri Lankan law requires it.</li>
        </ul>
        <p>
          Some of these providers store data outside Sri Lanka, mainly in the United States and the European Union.
          We only use providers that commit to protect personal data to a standard equal to the PDPA.
        </p>
      </LegalSection>

      <LegalSection title="7. How long we keep data">
        <ul>
          <li>Listings from other sites: vehicle details while the ad is live. After an ad disappears we keep only anonymous price statistics, and remove the link and any personal details within 90 days.</li>
          <li>Accounts: while the account is open. Deleted within 14 days of a deletion request.</li>
          <li>Lead requests: 12 months, then deleted. Sooner if you ask.</li>
          <li>Payment records: 6 years, for tax and accounting law.</li>
          <li>Security logs: up to 90 days.</li>
          <li>Removal and deletion requests: 3 years, as a record that we acted on them.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Your rights">
        <p>Under the PDPA you can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and give you a copy;</li>
          <li>correct data that's wrong or out of date;</li>
          <li>delete your data, or stop using it;</li>
          <li>withdraw consent you gave (this doesn't affect what we did before you withdrew);</li>
          <li>object to our use of your data based on legitimate interests, for example a listing that shows your details;</li>
          <li>review a decision made only by automated means that significantly affects you.</li>
        </ul>
        <p>
          Email <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>, or use the{" "}
          <Link to="/removal">removal form</Link> or the <Link to="/delete-account">account deletion page</Link>. We may
          ask you to confirm who you are. We reply within 21 working days, and act on listing removals within 72 hours.
        </p>
        <p>
          If you aren't happy with our answer, you can complain to the Data Protection Authority of Sri Lanka.
        </p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>
          Passwords are hashed, traffic is encrypted (HTTPS), and access to the database and admin tools is limited to
          the people who need it. If a breach puts your data at risk, we'll tell you and the Data Protection Authority
          as the PDPA requires.
        </p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>MotorMila is not meant for children under 18, and we don't knowingly collect their data.</p>
      </LegalSection>

      <LegalSection title="11. Changes">
        <p>
          If we change this policy we'll update the effective date above, and for important changes we'll show a notice
          on the site or email account holders.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
