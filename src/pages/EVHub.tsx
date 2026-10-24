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
import { getEvInsight } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, cardVariants } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatTile, CountValue, FlowValue, LkrValue } from "@/components/ui/stat-tile";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { listItem, revealItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import {
  FREE_EV_MODELS_LIMIT,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import { groupThousands } from "@/lib/price";

const EV_MODULE_DEFS = [
  { icon: Battery, step: "01", titleKey: "ev.module.battery", titleFb: "Battery health", descFb: "Degradation patterns, SoH benchmarks, and what to inspect before buying." },
  { icon: ShieldCheck, step: "02", titleKey: "ev.module.duty", titleFb: "Duty & policy", descFb: "Sri Lanka EV import duty rates, exemptions, and policy outlook." },
  { icon: PlugZap, step: "03", titleKey: "ev.module.charging", titleFb: "Charging fit", descFb: "Home vs public charging, range per use case, and cost comparison." },
] as const;

const OWNERSHIP_CHECK_DEFS = [
  { key: "batteryReserve", label: "Battery reserve", value: "20-30%", note: "Guideline: keep this much SoH headroom when buying used" },
  { key: "homeCharging", label: "Home charging", value: "Priority", note: "Guideline: overnight charging beats public-charger dependence" },
  { key: "resaleProof", label: "Resale proof", value: "Records", note: "Guideline: battery reports protect resale value" },
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
  const failed = insightQuery.isError && !insight;
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

  // Never headline 0 for a count that simply hasn't been indexed yet.
  const evCountShown = evCount !== null && evCount > 0 ? evCount : null;
  const evPctShown = evPct !== null && evCount ? evPct : null;

  const evModules = EV_MODULE_DEFS.map((mod) => ({
    ...mod,
    title: t(mod.titleKey, mod.titleFb),
    desc: t(`${mod.titleKey}Desc`, mod.descFb),
  }));
  const ownershipChecks = OWNERSHIP_CHECK_DEFS.map((c) => ({
    ...c,
    label: t(`ev.ownership.${c.key}`, c.label),
    value: t(`ev.ownershipValue.${c.key}`, c.value),
    note: t(`ev.ownershipNote.${c.key}`, c.note),
  }));

  const headerStats = pending || failed
    ? undefined
    : [
        ...(evCountShown !== null
          ? [{ label: t("ev.liveElectricLabel", "Electric listings live"), value: <CountValue value={evCountShown} /> }]
          : []),
        ...(evPctShown !== null
          ? [{
              label: t("ev.marketShareLabel", "EV market share"),
              value: <FlowValue value={evPctShown} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" label={`${evPctShown.toFixed(1)}%`} />,
            }]
          : []),
        ...(medianEvPrice !== null
          ? [{ label: t("ev.medianPriceLabel", "Median EV price"), value: <LkrValue value={medianEvPrice} /> }]
          : []),
      ];

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={t("ev.eyebrow", "EV intelligence")}
        eyebrowIcon={Zap}
        title={t("ev.title", "EV buying signals.")}
        description={t("ev.description", "Battery health, charging fit, and duty signals for the Sri Lankan EV market.")}
        stats={headerStats?.length ? headerStats : undefined}
        actions={
          <Button asChild variant="secondary">
            <Link to="/ev-chargers">
              <PlugZap aria-hidden />
              {t("ev.chargersCta", "Find chargers")}
            </Link>
          </Button>
        }
      />

      <FreePlanBanner />

      <PageBody className="space-y-14 pt-0 lg:space-y-20 lg:pt-0">
        {/* Live inventory — one number leads */}
        <m.section variants={revealItem}>
          <SectionHeading title={t("ev.liveInventory", "Live EV inventory")} />
          {failed ? (
            <Card padding="none">
              <ErrorState
                title={t("ev.errorTitle", "EV figures didn't load")}
                onRetry={() => void insightQuery.refetch()}
              />
            </Card>
          ) : !pending && evCountShown === null ? (
            <Card padding="none">
              <EmptyState
                icon={Zap}
                title={t("ev.emptyTitle", "EV listings are still being counted")}
                body={t("ev.emptyBody", "Electric inventory shows here after the next market scan tags fuel type.")}
              />
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              <StatTile
                size="lg"
                className="lg:col-span-1"
                loading={pending}
                label={t("ev.liveElectricLabel", "Electric listings live")}
                value={<CountValue value={evCountShown} />}
                hint={t("ev.liveElectricNote", "Active EV inventory tracked across all sources")}
              />
              <StatTile
                loading={pending}
                label={t("ev.marketShareLabel", "EV market share")}
                value={
                  evPctShown !== null ? (
                    <FlowValue value={evPctShown} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix="%" label={`${evPctShown.toFixed(1)}%`} />
                  ) : (
                    "—"
                  )
                }
                hint={t("ev.marketShareNote", "Share of all tracked listings that are electric")}
              />
              <StatTile
                loading={pending}
                label={t("ev.medianPriceLabel", "Median EV price")}
                value={<LkrValue value={medianEvPrice} />}
                hint={t("ev.medianCarPriceNote", "Median asking price of electric cars (bikes and three-wheelers excluded)")}
              />
            </div>
          )}
        </m.section>

        {/* Top EV models — the leader gets the wide tile */}
        {(pending || topModels.length > 0) && (
          <m.section variants={revealItem}>
            <SectionHeading title={t("ev.topModels", "Top EV models")} />
            {pending ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className={cn("h-32", i === 0 && "xl:col-span-2")} />
                ))}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {topModels.map((model, i) => {
                  const featured = i === 0;
                  return (
                    <m.li
                      key={`${model.make}-${model.model}`}
                      variants={listItem}
                      custom={i}
                      initial="hidden"
                      animate="show"
                      className={cn("list-none", featured && "xl:col-span-2")}
                    >
                      <Link
                        to={`/cars/${encodeURIComponent(model.make)}/${encodeURIComponent(model.model)}`}
                        className={cn(cardVariants({ variant: "interactive", padding: "md" }), "group flex h-full flex-col justify-between no-underline")}
                      >
                        <span className="mb-4 flex items-center gap-2">
                          <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary", featured ? "h-10 w-10" : "h-8 w-8")}>
                            <Zap className={featured ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
                          </span>
                          <span className={cn("font-semibold text-foreground", featured ? "text-callout" : "text-body")}>
                            {model.make} {model.model}
                          </span>
                        </span>
                        <span>
                          <span className={cn("block font-display font-semibold text-foreground", featured ? "text-title1" : "text-title3")}>
                            <LkrValue value={model.median_price_lkr} />
                          </span>
                          <span className="mt-1 block text-caption text-label-2">
                            {t("ev.modelListings", "{n} listings · median", { n: model.listing_count })}
                          </span>
                        </span>
                      </Link>
                    </m.li>
                  );
                })}
              </ul>
            )}
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

        {/* TCO comparison */}
        <m.section variants={revealItem}>
          <Card padding="lg">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <TrendingDown className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-footnote font-semibold text-primary">{t("ev.tcoEyebrow", "TCO comparison")}</p>
                <h3 className="mt-1 font-display text-title2 font-semibold text-foreground">
                  {t("ev.tcoTitle", "EV vs. Toyota Aqua hybrid — real running cost")}
                </h3>
                <p className="mt-3 max-w-2xl text-body text-label-2">
                  {t("ev.tcoBody", "Fuel saving estimated at {saving}/yr (LKR {ev} vs LKR {petrol} per km, {km}k km/yr).", {
                    saving: `Rs ${groupThousands(annualFuelSavingLkr)}`,
                    ev: TCO_FUEL_COST_PER_KM_EV_LKR,
                    petrol: TCO_FUEL_COST_PER_KM_PETROL_LKR,
                    km: (TCO_KM_PER_YEAR / 1000).toFixed(0),
                  })}
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-control bg-surface-2 p-4">
                    <p className="text-caption text-label-2">{t("ev.medianPriceLabel", "Median EV price")}</p>
                    <div className="mt-1.5 text-callout font-semibold tabular-nums text-foreground">
                      {pending ? <Skeleton shape="text" className="h-5 w-24" /> : <LkrValue value={medianEvPrice} />}
                    </div>
                  </div>
                  <div className="rounded-control bg-surface-2 p-4">
                    <p className="text-caption text-label-2">{t("ev.aquaBenchmark", "Toyota Aqua benchmark")}</p>
                    <div className="mt-1.5 text-callout font-semibold tabular-nums text-foreground">
                      {pending ? <Skeleton shape="text" className="h-5 w-24" /> : <LkrValue value={benchmark?.median_price_lkr ?? null} />}
                    </div>
                    <p className="mt-1 text-caption text-label-2">
                      {benchmark?.listing_count
                        ? t("ev.benchmarkListings", "{n} listings", { n: benchmark.listing_count })
                        : t("ev.hybridBenchmark", "hybrid benchmark")}
                    </p>
                  </div>
                  <div className="rounded-control bg-surface-2 p-4">
                    <p className="text-caption text-label-2">{t("ev.payback", "Fuel savings payback")}</p>
                    <div className="mt-1.5 text-callout font-semibold tabular-nums text-foreground">
                      {pending ? (
                        <Skeleton shape="text" className="h-5 w-16" />
                      ) : paybackYears !== null ? (
                        t("ev.paybackYears", "~{n} yr", { n: paybackYears })
                      ) : evPremiumLkr !== null && evPremiumLkr <= 0 ? (
                        t("ev.instant", "Instant")
                      ) : (
                        "—"
                      )}
                    </div>
                    <p className="mt-1 text-caption text-label-2">
                      {evPremiumLkr !== null && evPremiumLkr <= 0
                        ? t("ev.alreadyCheaper", "EVs already cheaper than the hybrid benchmark")
                        : t("ev.recoverPremium", "to recover EV price premium")}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-caption text-label-2">
                  {t("ev.tcoNote", "Indicative only. Actual savings vary by charging cost, mileage, and model.")}
                </p>
              </div>
            </div>
          </Card>
        </m.section>

        {/* Decision modules */}
        <m.section variants={revealItem}>
          <SectionHeading title={t("ev.decisionModules", "Decision modules")} />
          <ul className="grid gap-3 md:grid-cols-3">
            {evModules.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <m.li key={mod.title} variants={listItem} custom={i} initial="hidden" animate="show" className="list-none">
                  <Card padding="md" className="h-full">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="text-caption font-semibold tabular-nums text-label-2">{mod.step}</span>
                    </div>
                    <h3 className="mt-4 text-callout font-semibold text-foreground">{mod.title}</h3>
                    <p className="mt-1.5 text-footnote text-label-2">{mod.desc}</p>
                  </Card>
                </m.li>
              );
            })}
          </ul>
        </m.section>

        {/* Market action */}
        <m.section variants={revealItem} className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card padding="lg">
            <p className="text-footnote font-semibold text-primary">{t("ev.ownershipChecks", "Ownership checks")}</p>
            <h3 className="mt-1 font-display text-title2 font-semibold text-foreground">{t("ev.buyerGuidelines", "Buyer guidelines")}</h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {ownershipChecks.map((c) => (
                <div key={c.label} className="rounded-control bg-surface-2 p-4">
                  <p className="text-caption text-label-2">{c.label}</p>
                  <p className="mt-1.5 text-title3 font-semibold tabular-nums text-foreground">{c.value}</p>
                  <p className="mt-1.5 text-caption text-label-2">{c.note}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card padding="lg" className="flex flex-col">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Car className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-4 text-footnote font-semibold text-primary">{t("ev.marketAction", "Market action")}</p>
            <h3 className="mt-1 text-callout font-semibold text-foreground">{t("ev.browseTitle", "Browse EV inventory")}</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {[
                t("ev.action.filter", "Filter electric inventory"),
                t("ev.action.finance", "Check finance baseline"),
                t("ev.action.resale", "Compare resale pressure"),
              ].map((a) => (
                <li key={a}>
                  <Badge variant="neutral">
                    <CheckCircle2 className="text-primary" aria-hidden /> {a}
                  </Badge>
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-6 w-full lg:mt-auto">
              <Link to="/?fuel_type=electric#market">
                {t("ev.browseCta", "Browse electric inventory")} <ArrowRight aria-hidden />
              </Link>
            </Button>
          </Card>
        </m.section>
      </PageBody>
    </PageCanvas>
  );
}
