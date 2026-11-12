import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Gauge } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { CineHeader } from "@/components/CineHeader";
import { CineSection } from "@/components/CineSection";
import { Button } from "@/components/ui/button";
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

/** Body copy inside a numbered section. */
function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-4 text-body leading-relaxed text-label-2 [&_strong]:text-foreground [text-wrap:pretty]">{children}</div>;
}

/** A hairline list: rows divided by rules, a small marker in front. */
function HairlineList({ items, marker = "dot", label }: { items: string[]; marker?: "dot" | "index" | "alert"; label?: string }) {
  return (
    <ul className="cine-list border-y border-border" aria-label={label}>
      {items.map((item, i) => (
        <li key={item} className="flex items-start gap-4 py-3.5 text-body leading-snug text-label-1">
          {marker === "index" ? (
            <span aria-hidden className="w-6 shrink-0 pt-0.5 font-display text-footnote font-semibold tabular-nums text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
          ) : marker === "alert" ? (
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-deal-caution" />
          ) : (
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          )}
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Filled pips for a confidence level (3 = high … 0 = none). Decorative. */
function Pips({ n }: { n: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-1.5 w-4 rounded-full ${i < n ? "bg-[hsl(213_100%_66%)]" : "bg-foreground/15"}`} />
      ))}
    </span>
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
  const n = (i: number) => String(i + 1).padStart(2, "0");

  const bands = [
    { tone: "good", label: t("howPrice.cine.bandBelow", "Below market") },
    { tone: "fair", label: t("howPrice.cine.bandNear", "Near FMV") },
    { tone: "high", label: t("howPrice.cine.bandAbove", "Above market") },
  ] as const;

  const levels = [
    { pips: 3, term: t("howPrice.conf.high", "High"), desc: t("howPrice.conf.highDesc", "{n}+ close matches. The estimate is usually steady.", { n: HIGH_CONF_COMPS }) },
    { pips: 2, term: t("howPrice.conf.medium", "Medium"), desc: t("howPrice.conf.mediumDesc", "{n}–{m} matches. Good guide, small differences remain.", { n: MEDIUM_CONF_COMPS, m: HIGH_CONF_COMPS - 1 }) },
    { pips: 1, term: t("howPrice.conf.low", "Low"), desc: t("howPrice.conf.lowDesc", "Fewer than {n} matches, or only a model average. Treat it as a rough guide.", { n: MEDIUM_CONF_COMPS }) },
    { pips: 0, term: t("howPrice.conf.none", "None"), desc: t("howPrice.conf.noneDesc", "Too little data. We show no deal call rather than guess.") },
  ];

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("howPrice.eyebrow", "Methodology")}
        lead={t("howPrice.cine.lead", "How we score")}
        accent={t("howPrice.cine.accent", "prices.")}
        body={t(
          "howPrice.description",
          "Plain-language notes on how MotorMila works out a fair price, what the deal badges mean, and where the numbers can be wrong.",
        )}
      />

      <PageBody className="pb-20 pt-8 lg:pt-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
          {/* On this page: a numbered hairline index, sticky beside the text on desktop. */}
          <nav aria-label={t("howPrice.tocAria", "On this page")} className="cine-hwp-toc min-w-0">
            <p className="cine-eyebrow text-label-2">{t("howPrice.tocAria", "On this page")}</p>
            <ol className="cine-list mt-4 border-y border-border">
              {toc.map((item, i) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="cine-row group items-baseline gap-3 py-2 text-footnote lg:py-2.5 font-medium text-label-2 hover:text-foreground">
                    <span aria-hidden className="w-6 shrink-0 font-display font-semibold tabular-nums text-primary">{n(i)}</span>
                    <span className="min-w-0 flex-1">{item.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="cine-hwp min-w-0 max-w-3xl space-y-16 lg:space-y-24">
            <CineSection index={n(0)} id={A.fmv} title={t("howPrice.fmv.title", "What “FMV” means here")}>
              <Prose>
                <p>
                  {t(
                    "howPrice.fmv.p1",
                    "FMV (fair market value) is our estimate of what similar vehicles are typically being advertised for right now. It is worked out from comparable listings, not from a price guide.",
                  )}
                </p>
                <p>{t("howPrice.fmv.p2", "For each car we look for comparable ads that share:")}</p>
              </Prose>
              <div className="mt-4">
                <HairlineList
                  items={[
                    t("howPrice.fmv.make", "the same make and model"),
                    t("howPrice.fmv.year", "a manufacture year within ±{years} years", { years: YEAR_WINDOW }),
                    t("howPrice.fmv.mileage", "similar mileage — higher mileage pulls the estimate down, lower mileage lifts it (capped at ±20%)"),
                    t("howPrice.fmv.registration", "registration status — brand new, unregistered (reconditioned) and registered used cars are priced differently"),
                    t("howPrice.fmv.district", "district, where there are enough ads to tell a difference"),
                  ]}
                />
              </div>
              <div className="mt-5">
                <Prose>
                  <p>
                    {t(
                      "howPrice.fmv.p3",
                      "We use up to {max} of the closest matches. With enough of them we fit a simple statistical model; with fewer we fall back to an adjusted median; with very few we only show the model's average and say so.",
                      { max: MAX_COMPS },
                    )}
                  </p>
                </Prose>
              </div>

              {/* Result card: how the asking price is read against FMV. */}
              <figure className="cine-panel theme-dark mt-8 p-6 text-foreground sm:p-8">
                <p className="cine-eyebrow text-white/60">{t("howPrice.cine.bandsKicker", "How a deal badge reads")}</p>
                <div className="cine-hwp-scale mt-12">
                  <span aria-hidden className="cine-hwp-tick" style={{ left: "34.5%" } as CSSProperties}>−{BELOW_PCT}%</span>
                  <span aria-hidden className="cine-hwp-tick cine-hwp-tick--fmv" style={{ left: "46.4%" } as CSSProperties}>FMV</span>
                  <span aria-hidden className="cine-hwp-tick" style={{ left: "65.5%" } as CSSProperties}>+{ABOVE_PCT}%</span>
                  <ul className="cine-hwp-bands">
                    {bands.map((b, i) => (
                      <li key={b.tone} className="cine-hwp-band" data-tone={b.tone} style={{ "--i": i } as CSSProperties}>
                        <span aria-hidden className="cine-hwp-band__bar" />
                        <span className="mt-3 flex items-start gap-1.5 text-caption font-semibold leading-snug text-white [overflow-wrap:anywhere] sm:gap-2 sm:text-footnote">
                          <span aria-hidden className="cine-hwp-dot" data-tone={b.tone} />
                          <span className="min-w-0">{b.label}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <figcaption className="mt-6 max-w-2xl text-footnote leading-relaxed text-white/70">
                  {t(
                    "howPrice.fmv.bands",
                    "Deal badges compare the asking price with FMV: {below}% or more under FMV reads as below market, {above}% or more over reads as above, anything in between is near FMV.",
                    { below: BELOW_PCT, above: ABOVE_PCT },
                  )}
                </figcaption>
              </figure>
            </CineSection>

            <CineSection
              index={n(1)}
              id={A.confidence}
              title={t("howPrice.conf.title", "Confidence levels")}
              body={t("howPrice.conf.p1", "Every FMV carries a confidence level so you know how much weight to give it.")}
            >
              <div className="cine-panel theme-dark px-6 py-2 text-foreground sm:px-8 sm:py-3">
                <dl className="cine-list">
                  {levels.map((row) => (
                    <div key={row.term} className="flex flex-col gap-2 border-foreground/10 py-4 sm:flex-row sm:items-baseline sm:gap-6 [&+&]:border-t">
                      <dt className="flex shrink-0 items-center gap-3 sm:w-40">
                        <Pips n={row.pips} />
                        <span className="text-callout font-semibold text-white">{row.term}</span>
                      </dt>
                      <dd className="min-w-0 text-footnote leading-relaxed text-white/70">{row.desc}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </CineSection>

            <CineSection index={n(2)} id={A.askingVsSale} title={t("howPrice.ask.title", "Why asking prices aren't sale prices")}>
              <Prose>
                <p>
                  {t(
                    "howPrice.ask.p1",
                    "Everything we see is an advertised asking price. Sri Lankan sellers usually leave room to negotiate, and the final agreed price is private — no public source records it.",
                  )}
                </p>
              </Prose>
              <blockquote className="mt-6 border-l-2 border-primary pl-5 font-display text-title3 font-medium leading-snug text-foreground [text-wrap:pretty] sm:pl-6">
                {t(
                  "howPrice.ask.p2",
                  "So FMV is “what similar cars are asking”, not “what this car is worth” or “what it will sell for”. Use it to see whether an ad is in line with the market, then negotiate and inspect.",
                )}
              </blockquote>
            </CineSection>

            <CineSection index={n(3)} id={A.verifyFirst} title={t("howPrice.verify.title", "What “Unusually low — verify first” means")}>
              <Prose>
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
              </Prose>
              <div className="mt-4">
                <HairlineList
                  marker="alert"
                  items={[
                    t("howPrice.verify.see", "see the vehicle and its documents in person"),
                    t("howPrice.verify.cr", "check the CR (registration) name matches the seller"),
                    t("howPrice.verify.deposit", "never send an advance or “holding” deposit"),
                  ]}
                />
              </div>
              <Link to="/safe-transfer" className="cine-row group mt-2 items-center text-callout font-semibold text-primary">
                <span className="min-w-0 flex-1">{t("howPrice.verify.kit", "Open the Safe-Transfer Kit")}</span>
                <ArrowRight aria-hidden className="cine-row__arrow h-4 w-4" />
              </Link>
            </CineSection>

            <CineSection index={n(4)} id={A.sources} title={t("howPrice.sources.title", "Where the data comes from")}>
              <Prose>
                <p>
                  {t(
                    "howPrice.sources.p1",
                    "We read public vehicle ads from these Sri Lankan sites, remove duplicates of the same car posted in several places, and always link back to the original ad:",
                  )}
                </p>
              </Prose>
              <ul className="cine-hwp-sources mt-5" aria-label={t("howPrice.sources.listAria", "Listing sources")}>
                {LISTING_SOURCES.map((s) => (
                  <li key={s.domain} className="min-w-0">
                    <span className="block truncate text-footnote font-semibold text-foreground">{s.name}</span>
                    <span className="block truncate text-caption text-label-2">{s.domain}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-footnote leading-relaxed text-label-2">
                {t(
                  "howPrice.sources.p2",
                  "Listings belong to their sellers and source sites. MotorMila is independent and not affiliated with them. Sellers can ask us to remove an ad.",
                )}{" "}
                <Link to="/removal" className="font-semibold text-primary underline-offset-2 hover:underline">
                  {t("howPrice.sources.removal", "Request removal")}
                </Link>
              </p>
            </CineSection>

            <CineSection index={n(5)} id={A.freshness} title={t("howPrice.fresh.title", "How often it updates")}>
              <Prose>
                <p>
                  {t(
                    "howPrice.fresh.p1",
                    "We collect new and changed ads about twice a day and recalculate FMV after each run. Each page shows when its data was last refreshed. If the live service is down we show the last saved snapshot and label it.",
                  )}
                </p>
              </Prose>
            </CineSection>

            <CineSection index={n(6)} id={A.limits} title={t("howPrice.limits.title", "Limitations")}>
              <HairlineList
                marker="index"
                items={[
                  t("howPrice.limits.condition", "We can't see condition, accident history or service records — two cars with the same specs can be worth very different amounts."),
                  t("howPrice.limits.rare", "Rare models, very old cars and brand-new imports often have too few comparable ads for a confident figure."),
                  t("howPrice.limits.ads", "Ads can carry wrong years, mileage or prices. We filter obvious errors but can't catch every one."),
                  t("howPrice.limits.policy", "Import rules and tax changes can move prices faster than ads catch up."),
                  t("howPrice.limits.notAdvice", "FMV is a guide, not a valuation for loans, insurance or legal use. For that, use a licensed valuer."),
                ]}
              />
            </CineSection>

            {/* Close: put the method to work. */}
            <div className="cine-panel theme-dark flex flex-col gap-6 p-6 text-foreground sm:p-8">
              <h2 className="cine-display text-[clamp(1.5rem,1.2rem+1vw,2.25rem)] text-white">
                {t("howPrice.cine.ctaTitle", "See it on a real car.")}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/estimate">
                    <Gauge aria-hidden />
                    {t("howPrice.cta.estimate", "Estimate my car")}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link to="/">{t("howPrice.cta.browse", "Browse listings")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
