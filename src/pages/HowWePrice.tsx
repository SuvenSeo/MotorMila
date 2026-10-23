import { Link } from "react-router-dom";
import { Reveal } from "@/components/motion/Reveal";
import { AlertTriangle, BarChart3, Clock, Database, Gauge, Info, Scale, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { useAppPreferences } from "@/lib/appPreferences";
import { LISTING_SOURCES } from "@/lib/listingSources";
import { HOW_WE_PRICE_ANCHORS } from "@/lib/howWePrice";

/**
 * Numbers quoted on this page mirror the scoring code so the explainer never
 * drifts from what badges actually do:
 * - comps window / cap / confidence: src/lib/offlineValuation.ts (mirrors backend fmv.py)
 * - −5% / +8% bands: src/lib/fmv.ts summarizeFmv
 * - 35% "verify first" threshold: dealBadge VERIFY_BELOW_PCT (ui/listing)
 * - refresh cadence: .github/workflows/daily-scrape.yml (two runs a day)
 */
const YEAR_WINDOW = 2;
const MAX_COMPS = 80;
const HIGH_CONF_COMPS = 15;
const MEDIUM_CONF_COMPS = 8;
const BELOW_PCT = 5;
const ABOVE_PCT = 8;
const VERIFY_PCT = 35;

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal as="section" id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
        </span>
        <h2 id={`${id}-title`} className="text-body font-semibold text-foreground sm:text-callout">
          {title}
        </h2>
      </div>
      <div className="space-y-3 text-body leading-relaxed text-foreground/85">{children}</div>
    </Reveal>
  );
}

export default function HowWePrice() {
  const { t } = useAppPreferences();
  const A = HOW_WE_PRICE_ANCHORS;

  const toc: Array<{ id: string; label: string }> = [
    { id: A.fmv, label: t("howPrice.toc.fmv", "What FMV means") },
    { id: A.confidence, label: t("howPrice.toc.confidence", "Confidence levels") },
    { id: A.askingVsSale, label: t("howPrice.toc.askingVsSale", "Asking ≠ sale price") },
    { id: A.verifyFirst, label: t("howPrice.toc.verifyFirst", "“Unusually low — verify first”") },
    { id: A.sources, label: t("howPrice.toc.sources", "Where the data comes from") },
    { id: A.freshness, label: t("howPrice.toc.freshness", "How often it updates") },
    { id: A.limits, label: t("howPrice.toc.limits", "Limitations") },
  ];

  return (
    <PageCanvas ambient="subtle">
      <PageHero
        theme="valuation"
        eyebrow={t("howPrice.eyebrow", "Methodology")}
        eyebrowIcon={Scale}
        title={<>{t("howPrice.title", "How we score prices")}</>}
        description={t(
          "howPrice.description",
          "Plain-language notes on how MotorMila works out a fair price, what the deal badges mean, and where the numbers can be wrong.",
        )}
      />

      <PageBody narrow className="pb-20">
        <nav aria-label={t("howPrice.tocAria", "On this page")} className="mb-6 rounded-2xl border border-border bg-surface/60 p-4">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">{t("howPrice.tocAria", "On this page")}</p>
          <ul className="flex flex-wrap gap-2">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 text-caption font-medium text-foreground no-underline hover:border-primary/40"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4">
          <Section id={A.fmv} icon={Gauge} title={t("howPrice.fmv.title", "What “FMV” means here")}>
            <p>
              {t(
                "howPrice.fmv.p1",
                "FMV (fair market value) is our estimate of what similar vehicles are typically being advertised for right now. It is worked out from comparable listings, not from a price guide.",
              )}
            </p>
            <p>{t("howPrice.fmv.p2", "For each car we look for comparable ads that share:")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("howPrice.fmv.make", "the same make and model")}</li>
              <li>{t("howPrice.fmv.year", "a manufacture year within ±{years} years", { years: YEAR_WINDOW })}</li>
              <li>{t("howPrice.fmv.mileage", "similar mileage — higher mileage pulls the estimate down, lower mileage lifts it (capped at ±20%)")}</li>
              <li>{t("howPrice.fmv.registration", "registration status — brand new, unregistered (reconditioned) and registered used cars are priced differently")}</li>
              <li>{t("howPrice.fmv.district", "district, where there are enough ads to tell a difference")}</li>
            </ul>
            <p>
              {t(
                "howPrice.fmv.p3",
                "We use up to {max} of the closest matches. With enough of them we fit a simple statistical model; with fewer we fall back to an adjusted median; with very few we only show the model's average and say so.",
                { max: MAX_COMPS },
              )}
            </p>
            <p>
              {t(
                "howPrice.fmv.bands",
                "Deal badges compare the asking price with FMV: {below}% or more under FMV reads as below market, {above}% or more over reads as above, anything in between is near FMV.",
                { below: BELOW_PCT, above: ABOVE_PCT },
              )}
            </p>
          </Section>

          <Section id={A.confidence} icon={ShieldCheck} title={t("howPrice.conf.title", "Confidence levels")}>
            <p>{t("howPrice.conf.p1", "Every FMV carries a confidence level so you know how much weight to give it.")}</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                { term: t("howPrice.conf.high", "High"), desc: t("howPrice.conf.highDesc", "{n}+ close matches. The estimate is usually steady.", { n: HIGH_CONF_COMPS }) },
                { term: t("howPrice.conf.medium", "Medium"), desc: t("howPrice.conf.mediumDesc", "{n}–{m} matches. Good guide, small differences remain.", { n: MEDIUM_CONF_COMPS, m: HIGH_CONF_COMPS - 1 }) },
                { term: t("howPrice.conf.low", "Low"), desc: t("howPrice.conf.lowDesc", "Fewer than {n} matches, or only a model average. Treat it as a rough guide.", { n: MEDIUM_CONF_COMPS }) },
                { term: t("howPrice.conf.none", "None"), desc: t("howPrice.conf.noneDesc", "Too little data. We show no deal call rather than guess.") },
              ].map((row) => (
                <div key={row.term} className="rounded-xl border border-border bg-surface p-3">
                  <dt className="text-footnote font-semibold text-foreground">{row.term}</dt>
                  <dd className="mt-1 text-footnote text-muted-foreground">{row.desc}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id={A.askingVsSale} icon={Info} title={t("howPrice.ask.title", "Why asking prices aren't sale prices")}>
            <p>
              {t(
                "howPrice.ask.p1",
                "Everything we see is an advertised asking price. Sri Lankan sellers usually leave room to negotiate, and the final agreed price is private — no public source records it.",
              )}
            </p>
            <p>
              {t(
                "howPrice.ask.p2",
                "So FMV is “what similar cars are asking”, not “what this car is worth” or “what it will sell for”. Use it to see whether an ad is in line with the market, then negotiate and inspect.",
              )}
            </p>
          </Section>

          <Section id={A.verifyFirst} icon={AlertTriangle} title={t("howPrice.verify.title", "What “Unusually low — verify first” means")}>
            <p>
              {t(
                "howPrice.verify.p1",
                "We show this amber label instead of a green deal when an ad is more than {pct}% under FMV, or when it looks cheap but the FMV behind it has low confidence.",
                { pct: VERIFY_PCT },
              )}
            </p>
            <p>
              {t(
                "howPrice.verify.p2",
                "Prices that far below the market are sometimes real (urgent sale, damage, missing papers) and sometimes bait: deposit-first scams, lease takeovers listed as full price, or typos. Before paying anything:",
              )}
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("howPrice.verify.see", "see the vehicle and its documents in person")}</li>
              <li>{t("howPrice.verify.cr", "check the CR (registration) name matches the seller")}</li>
              <li>{t("howPrice.verify.deposit", "never send an advance or “holding” deposit")}</li>
            </ul>
            <p>
              <Link to="/safe-transfer" className="font-semibold text-primary-bright">
                {t("howPrice.verify.kit", "Open the Safe-Transfer Kit")}
              </Link>
            </p>
          </Section>

          <Section id={A.sources} icon={Database} title={t("howPrice.sources.title", "Where the data comes from")}>
            <p>
              {t(
                "howPrice.sources.p1",
                "We read public vehicle ads from these Sri Lankan sites, remove duplicates of the same car posted in several places, and always link back to the original ad:",
              )}
            </p>
            <ul className="flex flex-wrap gap-2" aria-label={t("howPrice.sources.listAria", "Listing sources")}>
              {LISTING_SOURCES.map((s) => (
                <li key={s.domain} className="rounded-full border border-border bg-surface px-3 py-1 text-caption text-foreground">
                  {s.name}
                </li>
              ))}
            </ul>
            <p className="text-footnote text-muted-foreground">
              {t(
                "howPrice.sources.p2",
                "Listings belong to their sellers and source sites. MotorMila is independent and not affiliated with them. Sellers can ask us to remove an ad.",
              )}{" "}
              <Link to="/removal" className="font-semibold text-primary-bright">
                {t("howPrice.sources.removal", "Request removal")}
              </Link>
            </p>
          </Section>

          <Section id={A.freshness} icon={Clock} title={t("howPrice.fresh.title", "How often it updates")}>
            <p>
              {t(
                "howPrice.fresh.p1",
                "We collect new and changed ads about twice a day and recalculate FMV after each run. Each page shows when its data was last refreshed. If the live service is down we show the last saved snapshot and label it.",
              )}
            </p>
          </Section>

          <Section id={A.limits} icon={BarChart3} title={t("howPrice.limits.title", "Limitations")}>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("howPrice.limits.condition", "We can't see condition, accident history or service records — two cars with the same specs can be worth very different amounts.")}</li>
              <li>{t("howPrice.limits.rare", "Rare models, very old cars and brand-new imports often have too few comparable ads for a confident figure.")}</li>
              <li>{t("howPrice.limits.ads", "Ads can carry wrong years, mileage or prices. We filter obvious errors but can't catch every one.")}</li>
              <li>{t("howPrice.limits.policy", "Import rules and tax changes can move prices faster than ads catch up.")}</li>
              <li>{t("howPrice.limits.notAdvice", "FMV is a guide, not a valuation for loans, insurance or legal use. For that, use a licensed valuer.")}</li>
            </ul>
          </Section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/estimate"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-footnote font-semibold text-primary-foreground no-underline hover:bg-primary/90"
          >
            <Gauge className="h-4 w-4" aria-hidden />
            {t("howPrice.cta.estimate", "Estimate my car")}
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-footnote font-semibold text-foreground no-underline hover:border-primary/40"
          >
            {t("howPrice.cta.browse", "Browse listings")}
          </Link>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
