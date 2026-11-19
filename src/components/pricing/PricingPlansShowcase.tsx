import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { ArrowRight, Briefcase, CheckCheck, Database, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Card } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";
import { opacityOnly, spring, tween, useReducedMotionOrLowData } from "@/lib/motion";
import { PLAN_PRICES, PRICING_TIERS } from "@/lib/pricingContent";
import { useAppPreferences } from "@/lib/appPreferences";
import { tx, type I18nText } from "@/lib/translate";
import { cn } from "@/lib/utils";
import type { Variants } from "motion/react";

/**
 * Three-card pricing showcase, adapted from the supplied pricing-section
 * reference to Motormila's real plans and brand. Prices are the live catalog
 * values (PLAN_PRICES); Pro stays honest about the beta. The number roll uses
 * the repo's AnimatedNumber instead of number-flow: number-flow measures every
 * digit on each change (~90 ms at 4x CPU), which this codebase deliberately
 * replaced with a compositor-only digit strip.
 */

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...tween.enter, delay: Math.min(i, 6) * 0.05 },
  }),
};

function Reveal({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const calm = useReducedMotionOrLowData();
  return (
    <m.div
      className={className}
      custom={index}
      variants={calm ? opacityOnly(revealVariants) : revealVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.12 }}
    >
      {children}
    </m.div>
  );
}

function PricingSwitch({
  yearly,
  onChange,
  label,
  monthlyLabel,
  yearlyLabel,
  offerLabel,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
  label: string;
  monthlyLabel: string;
  yearlyLabel: string;
  offerLabel: string;
}) {
  const options = [
    { value: false, label: monthlyLabel },
    { value: true, label: yearlyLabel },
  ] as const;

  return (
    <div
      role="group"
      aria-label={label}
      className="relative z-10 mx-auto flex w-fit rounded-pill border border-border bg-surface-2 p-1 shadow-e1"
    >
      {options.map((option) => {
        const active = yearly === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative isolate min-h-11 rounded-pill px-4 text-footnote font-semibold transition-colors duration-short ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6",
              active ? "text-primary-foreground" : "text-label-2 hover:text-foreground",
            )}
          >
            {active ? (
              <m.span
                aria-hidden
                layoutId="motormila-pricing-period"
                className="absolute inset-0 -z-10 rounded-pill bg-gradient-to-b from-primary-bright to-primary shadow-e2"
                transition={spring.snappy}
              />
            ) : null}
            <span className="relative inline-flex items-center justify-center gap-2">
              {option.label}
              {option.value ? (
                <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary-text">
                  {offerLabel}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const FEATURE_ICONS = [<Briefcase key="b" aria-hidden className="h-4 w-4" />, <Database key="d" aria-hidden className="h-4 w-4" />, <Server key="s" aria-hidden className="h-4 w-4" />] as const;

type ShowcasePlan = {
  id: string;
  name: string;
  description: string;
  amount: number;
  badge: string;
  badgeVariant: "success" | "info";
  popular?: boolean;
  note?: string;
  features: { text: string; icon: ReactNode }[];
  includes: string[];
  cta: ReactNode;
};

function PriceCard({
  plan,
  yearly,
  index,
}: {
  plan: ShowcasePlan;
  yearly: boolean;
  index: number;
}) {
  return (
    <Reveal index={3 + index} className="h-full">
      <Card
        id={plan.id === "pro" ? "get-started" : undefined}
        padding="none"
        className={cn(
          "flex h-full scroll-mt-24 flex-col overflow-hidden border-border/80",
          plan.popular && "border-primary/50 ring-2 ring-primary/20",
        )}
      >
        {plan.popular ? (
          <div aria-hidden className="h-1 w-full bg-gradient-to-r from-primary-bright via-primary to-primary-bright" />
        ) : null}
        <div className="flex flex-1 flex-col p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-callout font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-1.5 max-w-xs text-footnote leading-relaxed text-label-2">{plan.description}</p>
            </div>
            <Badge variant={plan.badgeVariant} className="shrink-0">{plan.badge}</Badge>
          </div>

          <p className="mt-7 flex items-baseline gap-1.5">
            <span className="font-display text-large font-semibold text-foreground">
              <AnimatedNumber
                value={plan.amount}
                prefix="LKR "
                locales="en-US"
                format={{ maximumFractionDigits: 0, useGrouping: true }}
              />
            </span>
            <span className="text-footnote text-label-2">
              /{plan.id === "free" ? "mo" : yearly ? "yr" : "mo"}
            </span>
          </p>
          {plan.note ? <p className="mt-1.5 text-caption text-label-2">{plan.note}</p> : null}

          <div className="mt-6">{plan.cta}</div>

          <ul className="mt-7 space-y-3.5">
            {plan.features.map((feature) => (
              <li key={feature.text} className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-content-center rounded-control bg-primary/10 text-primary-text">
                  {feature.icon}
                </span>
                <span className="text-footnote leading-relaxed text-label-1">{feature.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 border-t border-separator pt-5">
            <h4 className="mb-3 text-footnote font-semibold text-foreground">{plan.includes[0]}</h4>
            <ul className="space-y-2.5">
              {plan.includes.slice(1).map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-content-center rounded-full border border-primary/30 bg-primary/10">
                    <CheckCheck aria-hidden className="h-3 w-3 text-primary-text" />
                  </span>
                  <span className="text-footnote leading-relaxed text-label-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </Reveal>
  );
}

export function PricingPlansShowcase({
  proCta,
  onDealerClick,
}: {
  /** The honest waitlist CTA from Pricing.tsx (kept in one place). */
  proCta: ReactNode;
  /** Opens the existing "For dealers" accordion, which owns checkout. */
  onDealerClick: () => void;
}) {
  const { t } = useAppPreferences();
  const [yearly, setYearly] = useState(false);
  const period = yearly ? "yearly" : "monthly";
  const byId = (id: string) => PRICING_TIERS.find((tier) => tier.id === id);
  const free = byId("free");
  const pro = byId("pro");
  const dealer = byId("dealer");
  const label = (pair: I18nText | undefined, fallback: string) => (pair ? tx(t, pair) : t("pricing.showcase.fallback", fallback));

  const asFeatures = (items: I18nText[] | undefined) =>
    (items ?? []).slice(0, 3).map((item, i) => ({ text: tx(t, item), icon: FEATURE_ICONS[i % FEATURE_ICONS.length] }));
  const asIncludes = (items: I18nText[] | undefined, heading: string) => [heading, ...(items ?? []).slice(3).map((item) => tx(t, item))];

  const plans: ShowcasePlan[] = [
    {
      id: "free",
      name: label(free?.name, "Free"),
      description: t("pricing.showcase.freeDesc", "For buyers checking the market before they commit."),
      amount: 0,
      badge: t("shell.pro.freeBeta", "Free during beta"),
      badgeVariant: "success",
      features: asFeatures(free?.features),
      includes: asIncludes(free?.features, t("pricing.showcase.freeIncludes", "Free includes:")),
      cta: (
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link to="/">
            {label(free?.ctaLabel, "Start browsing")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      ),
    },
    {
      id: "pro",
      name: label(pro?.name, "Pro"),
      description: label(pro?.audience, "For serious buyers and brokers."),
      amount: PLAN_PRICES.pro[period],
      badge: t("shell.pro.badge", "Pro · coming soon"),
      badgeVariant: "info",
      note: t("pricing.showcase.proNote", "Planned price — nothing is charged during beta."),
      features: asFeatures(pro?.features),
      includes: asIncludes(pro?.features, t("pricing.showcase.proIncludes", "Everything in Free, plus:")),
      cta: (
        <div>
          {proCta}
          <Link
            to="/pro-preview"
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-footnote font-semibold text-primary-text no-underline hover:underline"
          >
            {t("shell.pricing.whatPro", "What Pro will include")}
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>
      ),
    },
    {
      id: "dealer",
      name: label(dealer?.name, "Dealer"),
      description: label(dealer?.audience, "For yards running inventory every day."),
      amount: PLAN_PRICES.dealer_starter[period],
      badge: t("acct.pricing.popular", "Most popular"),
      badgeVariant: "info",
      popular: true,
      note: t("pricing.showcase.dealerNote", "Starter plan, priced by stock size."),
      features: asFeatures(dealer?.features),
      includes: asIncludes(dealer?.features, t("pricing.showcase.dealerIncludes", "Everything in Pro, plus:")),
      cta: (
        <Button asChild size="lg" className="w-full">
          <a href="#dealer-plans" onClick={onDealerClick}>
            {t("pricing.showcase.seeDealer", "See dealer plans")}
            <ArrowRight aria-hidden />
          </a>
        </Button>
      ),
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-sheet bg-surface-2/40 py-10 sm:py-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[10%] top-0 h-full opacity-25 dark:opacity-10"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${BRAND.colors.blue} 0%, transparent 70%)`,
          mixBlendMode: "multiply",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal index={0} className="mx-auto max-w-3xl text-center">
          <h3 className="cine-display text-title1 sm:text-large text-foreground">
            {t("pricing.showcase.headline", "Plans that work best for your")}{" "}
            <span className="inline-block rounded-control border border-dashed border-primary/50 bg-primary/10 px-2 py-1 text-primary-text">
              {t("pricing.showcase.headlineAccent", "business")}
            </span>
          </h3>
          <p className="mx-auto mt-4 max-w-xl text-footnote leading-relaxed text-label-2">
            {t(
              "pricing.showcase.subhead",
              "Free while we're in beta. Dealer plans are live today, priced by the size of your stock.",
            )}
          </p>
        </Reveal>

        <Reveal index={1} className="mt-8">
          <PricingSwitch
            yearly={yearly}
            onChange={setYearly}
            label={t("pricing.showcase.billingPeriod", "Billing period")}
            monthlyLabel={t("acct.pricing.monthly", "Monthly")}
            yearlyLabel={t("pricing.showcase.yearly", "Yearly")}
            offerLabel={t("pricing.showcase.annualOffer", "2 months free")}
          />
        </Reveal>

        <div className="mt-8 grid items-stretch gap-4 md:grid-cols-3">
          {plans.map((plan, index) => (
            <PriceCard key={plan.id} plan={plan} yearly={yearly} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
