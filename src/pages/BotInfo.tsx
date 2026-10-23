import { Link } from "react-router-dom";
import { Bot } from "lucide-react";
import { LegalPageShell, LegalSection, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";

const UA = "MotorMilaBot/1.0 (+https://motormila.vercel.app/bot)";

export default function BotInfo() {
  return (
    <LegalPageShell
      icon={Bot}
      title="MotorMilaBot"
      description="About the crawler behind MotorMila's market data — what it reads, how politely it behaves, and how to reach us."
    >
      <LegalSection title="What MotorMilaBot is">
        <p>
          MotorMilaBot is the web crawler MotorMila uses to read <strong>public</strong> vehicle listing pages
          on Sri Lankan classifieds sites. It identifies itself on every request with the user agent:
        </p>
        <p>
          <code className="rounded bg-surface px-2 py-1 text-caption font-mono">{UA}</code>
        </p>
        <p>
          This page is the contact URL named in that user agent. If you run one of the sites we read, you can
          reach a human at <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
      </LegalSection>
      <LegalSection title="What it collects">
        <p>
          Only the facts shown on the public listing itself: make, model, year of manufacture, asking price,
          mileage, fuel and transmission type, district, and a link back to the original ad. We use these to
          compute market statistics — medians, price trends, and fair-value signals.
        </p>
        <p>
          We do <strong>not</strong> work around blocks or access controls, use private APIs, rotate identities
          to evade rate limits, or harvest seller names, phone numbers, or photos into our database. Every
          listing links back to the source ad, which is where buyers contact sellers.
        </p>
      </LegalSection>
      <LegalSection title="How politely it crawls">
        <ul className="list-disc space-y-1 pl-5">
          <li>Respects robots.txt on every host before fetching.</li>
          <li>Waits 2–5 seconds between requests to the same site, with backoff on errors.</li>
          <li>Crawls a small number of pages per run, outside peak hours where possible.</li>
          <li>Stops immediately if a site blocks it — then we contact the site instead of working around it.</li>
        </ul>
      </LegalSection>
      <LegalSection title="Opt out">
        <p>
          Site owners can exclude MotorMilaBot in robots.txt, or ask us to remove collected data at any time via
          our <Link to="/removal">removal request page</Link> or by emailing{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We act on removal requests within 72 hours.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
