import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bot } from "lucide-react";
import { LegalPageShell, LegalSection, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { useAppPreferences } from "@/lib/appPreferences";

const UA = "MotorMilaBot/1.0 (+https://motormila.vercel.app/bot)";

/** Renders a translated string: **bold** runs become <strong>, {token} becomes nodes[token]. */
function rich(template: string, nodes: Record<string, ReactNode> = {}): ReactNode {
  return template.split(/(\*\*[^*]+\*\*|\{\w+\})/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const m = part.match(/^\{(\w+)\}$/);
    if (m && m[1] in nodes) return <Fragment key={i}>{nodes[m[1]]}</Fragment>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function BotInfo() {
  const { t } = useAppPreferences();
  const email = <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>;
  return (
    <LegalPageShell
      icon={Bot}
      title="MotorMilaBot"
      description={t(
        "bot.description",
        "About the crawler behind MotorMila's market data — what it reads, how politely it behaves, and how to reach us.",
      )}
    >
      <LegalSection id="what-motormilabot-is" title={t("bot.whatTitle", "What MotorMilaBot is")}>
        <p>
          {rich(
            t(
              "bot.whatP1",
              "MotorMilaBot is the web crawler MotorMila uses to read **public** vehicle listing pages on Sri Lankan classifieds sites. It identifies itself on every request with the user agent:",
            ),
          )}
        </p>
        <p>
          <code className="inline-block max-w-full break-all rounded-control border border-border bg-surface-2 px-2.5 py-1 font-code text-footnote text-foreground">{UA}</code>
        </p>
        <p>
          {rich(
            t(
              "bot.whatP3",
              "This page is the contact URL named in that user agent. If you run one of the sites we read, you can reach a human at {email}.",
            ),
            { email },
          )}
        </p>
      </LegalSection>
      <LegalSection id="what-it-collects" title={t("bot.collectTitle", "What it collects")}>
        <p>
          {t(
            "bot.collectP1",
            "Only the facts shown on the public listing itself: make, model, year of manufacture, asking price, mileage, fuel and transmission type, district, and a link back to the original ad. We use these to compute market statistics — medians, price trends, and fair-value signals.",
          )}
        </p>
        <p>
          {rich(
            t(
              "bot.collectP2",
              "We do **not** work around blocks or access controls, use private APIs, rotate identities to evade rate limits, or harvest seller names, phone numbers, or photos into our database. Every listing links back to the source ad, which is where buyers contact sellers.",
            ),
          )}
        </p>
      </LegalSection>
      <LegalSection id="how-politely-it-crawls" title={t("bot.politeTitle", "How politely it crawls")}>
        <ul>
          <li>{t("bot.polite1", "Respects robots.txt on every host before fetching.")}</li>
          <li>{t("bot.polite2", "Waits 2–5 seconds between requests to the same site, with backoff on errors.")}</li>
          <li>{t("bot.polite3", "Crawls a small number of pages per run, outside peak hours where possible.")}</li>
          <li>{t("bot.polite4", "Stops immediately if a site blocks it — then we contact the site instead of working around it.")}</li>
        </ul>
      </LegalSection>
      <LegalSection id="opt-out" title={t("bot.optOutTitle", "Opt out")}>
        <p>
          {rich(
            t(
              "bot.optOutP",
              "Site owners can exclude MotorMilaBot in robots.txt, or ask us to remove collected data at any time via our {removal} or by emailing {email}. We act on removal requests within 72 hours.",
            ),
            { removal: <Link to="/removal">{t("bot.removalLink", "removal request page")}</Link>, email },
          )}
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
