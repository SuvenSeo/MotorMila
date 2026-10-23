import { Link } from "react-router-dom";
import { m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Battery,
  Car,
  CheckCircle2,
  PlugZap,
  ShieldCheck,
  TrendingDown,
  Zap,
} from "lucide-react";
import { getEvInsight, formatPrice } from "@/services/api";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { fadeUp, listStagger, revealItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import {
  FREE_EV_MODELS_LIMIT,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import { visuals } from "@/lib/visualAssets";
import { groupThousands } from "@/lib/price";

const EV_MODULE_DEFS = [
  { icon: Battery, step: "01", titleKey: "ev.module.battery", titleFb: "Battery health", descFb: "Degradation patterns, SoH benchmarks, and what to inspect before buying." },
  { icon: ShieldCheck, step: "02", titleKey: "ev.module.duty", titleFb: "Duty & policy", descFb: "Sri Lanka EV import duty rates, exemptions, and policy outlook." },
  { icon: PlugZap, step: "03", titleKey: "ev.module.charging", titleFb: "Charging fit", descFb: "Home vs public charging, range per use case, and cost comparison." },
] as const;

const OWNERSHIP_CHECK_DEFS = [
  { label: "Battery reserve", value: "20-30%", note: "Guideline: keep this much SoH headroom when buying used" },
  { label: "Home charging", value: "Priority", note: "Guideline: overnight charging beats public-charger dependence" },
  { label: "Resale proof", value: "Records", note: "Guideline: battery reports protect resale value" },
] as const;

const TCO_FUEL_COST_PER_KM_PETROL_LKR = 28;
const TCO_FUEL_COST_PER_KM_EV_LKR = 6;
const TCO_KM_PER_YEAR = 20_000;

export default function EVHub() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const insightQuery = useQuery({
    queryKey: ["ev-insight"],
    queryFn: getEvInsight,
    staleTime: QUERY_STALE.market,
  });

  const insight = insightQuery.data;
  const pending = insightQuery.isPending;

  const evCount = insight?.ev_count ?? null;
  const evPct = insight?.ev_pct ?? null;
  const medianEvPrice = insight?.median_ev_price_lkr ?? null;
  const topModelsAll = insight?.top_ev_models ?? [];
  const topModels = fullAccess ? topModelsAll : topModelsAll.slice(0, FREE_EV_MODELS_LIMIT);
  const hiddenModelCount = fullAccess ? 0 : Math.max(0, topModelsAll.length - FREE_EV_MODELS_LIMIT);
  const benchmark = insight?.hybrid_benchmark ?? null;

  const annualFuelSavingLkr = (TCO_FUEL_COST_PER_KM_PETROL_LKR - TCO_FUEL_COST_PER_KM_EV_LKR) * TCO_KM_PER_YEAR;
  const evPremiumLkr =
    medianEvPrice !== null && benchmark?.median_price_lkr
      ? medianEvPrice - benchmark.median_price_lkr
      : null;
  const paybackYears =
    evPremiumLkr !== null && annualFuelSavingLkr > 0 && evPremiumLkr > 0
      ? Math.ceil(evPremiumLkr / annualFuelSavingLkr)
      : null;
  // A negative premium means the EV is already cheaper than the hybrid
  // benchmark — payback is instant, not "−16 yrs".

  const na = t("common.na", "N/A");
  const liveStats = [
    {
      label: t("ev.liveElectricLabel", "Electric listings live"),
      value: pending ? "…" : evCount !== null ? evCount.toLocaleString() : na,
      note: t("ev.liveElectricNote", "Active EV inventory tracked across all sources"),
    },
    {
      label: t("ev.marketShareLabel", "EV market share"),
      value: pending ? "…" : evPct !== null ? `${evPct.toFixed(1)}%` : na,
      note: t("ev.marketShareNote", "Share of all tracked listings that are electric"),
    },
    {
      label: t("ev.medianPriceLabel", "Median EV price"),
      value: pending ? "…" : medianEvPrice !== null ? formatPrice(medianEvPrice) : na,
      note: t("ev.medianPriceNote", "Median price across all priced EV listings"),
    },
  ];

  const evModules = EV_MODULE_DEFS.map((m) => ({
    ...m,
    title: t(m.titleKey, m.titleFb),
    desc: t(`${m.titleKey}Desc`, m.descFb),
  }));

  const ownershipChecks = OWNERSHIP_CHECK_DEFS.map((c) => ({
    ...c,
    label: t(`ev.ownership.${c.label.replace(" ", "")}`, c.label),
    note: t(`ev.ownershipNote.${c.label.replace(" ", "")}`, c.note),
  }));

  const [featureStat, ...secondaryStats] = liveStats;

  return (
    <PageCanvas ambient="subtle">
      <PageHero
        theme="ev"
        eyebrow={t("ev.eyebrow", "EV intelligence")}
        eyebrowIcon={Zap}
        watermarkIcon={Battery}
        title={<>{t("ev.title", "EV buying signals.")}</>}
        description={t("ev.description", "Battery health, charging fit, and duty signals for the Sri Lankan EV market.")}
        media={visuals.alt2HeroUltrawidePanorama}
        mediaPosition="center 45%"
        mediaTone="brand"
        // Real numbers only: no "…" placeholders or N/A tiles in the hero.
        highlights={pending ? undefined : liveStats.filter((stat) => stat.value !== na).slice(0, 3).map((stat) => ({
          label: stat.label,
          value: stat.value,
          hint: stat.note,
        }))}
      />

      <FreePlanBanner />

      <PageBody className="space-y-16 lg:space-y-24">
        {/* Live inventory pulse — one number towers */}
        <m.section variants={revealItem}>
          <SectionHeader title={t("ev.liveInventory", "Live EV inventory")} className="mb-8" />
          <div className="space-y-3">
            <div className="data-card flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
              <div>
                <p className="text-caption font-semibold text-muted-foreground">{featureStat.label}</p>
                <p className="num mt-3 text-large font-bold tracking-tight text-foreground sm:text-hero">{featureStat.value}</p>
              </div>
              <p className="max-w-xs text-footnote font-medium leading-relaxed text-muted-foreground sm:text-right">{featureStat.note}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {secondaryStats.map((stat) => (
                <div key={stat.label} className="data-card p-6">
                  <p className="text-caption font-semibold text-muted-foreground/80">{stat.label}</p>
                  <p className="num mt-2 text-title2 font-bold text-foreground">{stat.value}</p>
                  <p className="mt-1.5 text-caption font-medium text-muted-foreground">{stat.note}</p>
                </div>
              ))}
            </div>
          </div>
        </m.section>

        {/* Top EV models — feature the leading model */}
        {(pending || topModels.length > 0) && (
          <m.section variants={revealItem}>
            <SectionHeader title={t("ev.topModels", "Top EV models")} className="mb-8" />
            <m.div
              key={pending ? "loading" : "loaded"}
              inherit={false}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.05 }}
              variants={listStagger}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {pending
                ? Array.from({ length: 5 }).map((_, i) => (
                    /* Shimmer shaped like the real card: icon + name, price, count. */
                    <div
                      key={i}
                      aria-hidden
                      className={cn("data-card p-6", i === 0 && "xl:col-span-2 xl:flex xl:flex-col xl:justify-between")}
                    >
                      <div className="mb-4 flex items-center gap-2">
                        <div className={cn("skeleton-shimmer rounded-2xl", i === 0 ? "h-10 w-10" : "h-8 w-8")} />
                        <div className="skeleton-shimmer h-3.5 w-2/3 rounded-full" />
                      </div>
                      <div className={cn("skeleton-shimmer rounded-full", i === 0 ? "h-8 w-1/2" : "h-5 w-1/2")} />
                      <div className="skeleton-shimmer mt-2 h-2.5 w-1/3 rounded-full" />
                    </div>
                  ))
                : topModels.map((model, i) => {
                    const featured = i === 0;
                    return (
                      <m.div
                        key={`${model.make}-${model.model}`}
                        variants={fadeUp}
                        className={cn(
                          "data-card group p-6 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-soft-lg",
                          featured && "xl:col-span-2 xl:flex xl:flex-col xl:justify-between",
                        )}
                      >
                        <div className="mb-4 flex items-center gap-2">
                          <div className={cn(
                            "flex items-center justify-center rounded-2xl border border-border bg-surface",
                            featured ? "h-10 w-10" : "h-8 w-8",
                          )}>
                            <Zap className={cn("text-primary", featured ? "h-5 w-5" : "h-3.5 w-3.5")} aria-hidden />
                          </div>
                          <p className={cn("font-bold leading-tight text-foreground", featured ? "text-body" : "text-footnote")}>
                            {model.make} {model.model}
                          </p>
                        </div>
                        <p className={cn("num font-bold text-foreground", featured ? "text-title1 tracking-tight" : "text-callout")}>
                          {model.median_price_lkr !== null ? formatPrice(model.median_price_lkr) : "—"}
                        </p>
                        <p className="mt-1.5 text-caption font-medium text-muted-foreground">
                          {model.listing_count} listing{model.listing_count !== 1 ? "s" : ""} · median
                        </p>
                      </m.div>
                    );
                  })}
            </m.div>
            {!fullAccess && !pending && (hiddenModelCount > 0 || topModels.length > 0) ? (
              <UpgradePrompt
                className="mt-6"
                title={t("ev.upgradeTitle", "More EV models on Pro")}
                body={t("ev.upgradeBody", "Free shows the top 3 EV models. Pro unlocks the full ranked EV board and deeper TCO tools.")}
                variant="strip"
              />
            ) : null}
          </m.section>
        )}

        {/* TCO comparison callout */}
        <m.section variants={revealItem}>
          <div className="surface--glass rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <TrendingDown className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-2 text-caption font-semibold text-primary-bright">
                  <span aria-hidden className="h-1 w-1 rounded-full bg-primary" />
                  {t("ev.tcoEyebrow", "TCO comparison")}
                </p>
                <h3 className="mt-2 text-title3 font-bold tracking-tight text-foreground sm:text-title2">{t("ev.tcoTitle", "EV vs. Toyota Aqua hybrid — real running cost")}</h3>
                <p className="mt-3 max-w-2xl text-body font-medium leading-relaxed text-muted-foreground">
                  Fuel saving estimated at <span className="num font-bold text-foreground">Rs {groupThousands(annualFuelSavingLkr)}/yr</span> (LKR {TCO_FUEL_COST_PER_KM_EV_LKR} vs LKR {TCO_FUEL_COST_PER_KM_PETROL_LKR} per km, {(TCO_KM_PER_YEAR / 1000).toFixed(0)}k km/yr).
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="metric-tile p-4">
                    <p className="text-caption font-semibold text-muted-foreground/80">Median EV price</p>
                    <p className="num mt-2 text-callout font-bold text-foreground">
                      {pending ? "…" : medianEvPrice !== null ? formatPrice(medianEvPrice) : "N/A"}
                    </p>
                  </div>
                  <div className="metric-tile p-4">
                    <p className="text-caption font-semibold text-muted-foreground/80">Toyota Aqua benchmark</p>
                    <p className="num mt-2 text-callout font-bold text-foreground">
                      {pending ? "…" : benchmark?.median_price_lkr != null ? formatPrice(benchmark.median_price_lkr) : "N/A"}
                    </p>
                    <p className="mt-1 text-caption font-medium text-muted-foreground">
                      {benchmark?.listing_count ? `${benchmark.listing_count} listings` : "hybrid benchmark"}
                    </p>
                  </div>
                  <div className="metric-tile p-4">
                    <p className="text-caption font-semibold text-muted-foreground/80">Fuel savings payback</p>
                    <p className="num mt-2 text-callout font-bold text-foreground">
                      {pending
                        ? "…"
                        : paybackYears !== null
                          ? `~${paybackYears} yr${paybackYears !== 1 ? "s" : ""}`
                          : evPremiumLkr !== null && evPremiumLkr <= 0
                            ? "Instant"
                            : "N/A"}
                    </p>
                    <p className="mt-1 text-caption font-medium text-muted-foreground">
                      {evPremiumLkr !== null && evPremiumLkr <= 0
                        ? "EVs already cheaper than the hybrid benchmark"
                        : "to recover EV price premium"}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-caption font-medium text-muted-foreground">
                  Indicative only. Actual savings vary by charging cost, mileage, and model.
                </p>
              </div>
            </div>
          </div>
        </m.section>

        {/* Decision modules */}
        <m.section variants={revealItem}>
          <SectionHeader title={t("ev.decisionModules", "Decision modules")} className="mb-8" />
          <div className="grid gap-3 md:grid-cols-3">
            {evModules.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.title} className="data-card p-6 transition-ui hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                    </div>
                    <span className="num text-caption font-bold text-primary-bright">{m.step}</span>
                  </div>
                  <h3 className="mt-5 text-body font-bold text-foreground">{m.title}</h3>
                  <p className="mt-2 text-caption font-medium leading-relaxed text-muted-foreground">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </m.section>

        {/* Market action */}
        <m.section variants={revealItem} className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="data-card p-6 sm:p-8">
            <p className="text-caption font-semibold text-muted-foreground/80">{t("ev.ownershipChecks", "Ownership checks")}</p>
            <h3 className="mt-2 text-title3 font-bold tracking-tight text-foreground sm:text-title2">{t("ev.buyerGuidelines", "Buyer guidelines")}</h3>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {ownershipChecks.map((c) => (
                <div key={c.label} className="metric-tile p-4">
                  <p className="text-caption font-semibold text-muted-foreground">{c.label}</p>
                  <p className="num mt-2 text-title3 font-bold text-foreground">{c.value}</p>
                  <p className="mt-2 text-caption font-medium leading-relaxed text-muted-foreground">{c.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="data-card flex flex-col p-6 sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface">
              <Car className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <p className="mt-5 text-caption font-semibold text-muted-foreground/80">{t("ev.marketAction", "Market action")}</p>
            <h3 className="mt-2 text-callout font-bold text-foreground">{t("ev.browseTitle", "Browse EV inventory")}</h3>
            <ul className="mt-5 flex flex-wrap gap-2">
              {[
                t("ev.action.filter", "Filter electric inventory"),
                t("ev.action.finance", "Check finance baseline"),
                t("ev.action.resale", "Compare resale pressure"),
              ].map((a) => (
                <li key={a} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-caption font-bold text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-primary" aria-hidden /> {a}
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-auto w-full">
              <Link to="/?fuel_type=electric#market">
                {t("ev.browseCta", "Browse electric inventory")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </m.section>
      </PageBody>
    </PageCanvas>
  );
}
