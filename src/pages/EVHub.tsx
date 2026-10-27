import { Link } from "react-router-dom";
import { m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Battery,
  CheckCircle2,
  PlugZap,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { getEvInsight } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CineHeader } from "@/components/CineHeader";
import { CineFigure, CineSection } from "@/components/CineSection";
import { LkrValue } from "@/components/ui/stat-tile";
import { visuals } from "@/lib/visualAssets";
import "@/styles/cinematic-pages.css";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { listItem } from "@/lib/motion";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import {
  FREE_EV_MODELS_LIMIT,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import { formatLkrCompact, groupThousands } from "@/lib/price";

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

  // One hero figure: the median EV price; the live count and share sit in its
  // caption (they used to be repeated in a second stat band).
  const heroCaption = [
    evCountShown !== null ? t("ev.cine.liveCount", "{n} electric listings live", { n: evCountShown.toLocaleString("en-US") }) : null,
    evPctShown !== null ? t("ev.cine.share", "{pct}% of the tracked market", { pct: evPctShown.toFixed(1) }) : null,
  ].filter(Boolean).join(" · ");
  const heroNote = t("ev.medianCarPriceNote", "Median asking price of electric cars (bikes and three-wheelers excluded)");

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("ev.eyebrow", "EV intelligence")}
        lead={t("ev.cine.lead", "EV buying")}
        accent={t("ev.cine.accent", "signals.")}
        body={t("ev.description", "Battery health, charging fit, and duty signals for the Sri Lankan EV market.")}
        image={visuals.alt2PageFeaturesBg}
        imagePosition="55% 50%"
      >
        <div className="min-h-[5.5rem]" aria-live="polite">
          {pending ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton shape="text" className="h-3 w-40 bg-foreground/10" />
              <Skeleton shape="text" className="h-10 w-48 bg-foreground/10" />
            </div>
          ) : medianEvPrice !== null && medianEvPrice > 0 ? (
            <CineFigure
              label={t("ev.medianPriceLabel", "Median EV price")}
              value={formatLkrCompact(medianEvPrice)}
              caption={heroCaption ? `${heroCaption}. ${heroNote}.` : `${heroNote}.`}
            />
          ) : evCountShown !== null ? (
            <CineFigure
              label={t("ev.liveElectricLabel", "Electric listings live")}
              value={evCountShown.toLocaleString("en-US")}
              caption={evPctShown !== null ? t("ev.cine.share", "{pct}% of the tracked market", { pct: evPctShown.toFixed(1) }) : t("ev.liveElectricNote", "Active EV inventory tracked across all sources")}
            />
          ) : null}
        </div>
        <Button asChild variant="secondary" className="mt-6">
          <Link to="/ev-chargers">
            <PlugZap aria-hidden />
            {t("ev.chargersCta", "Find chargers")}
          </Link>
        </Button>
      </CineHeader>

      <PageBody className="space-y-14 pt-8 lg:space-y-20 lg:pt-12">
        <FreePlanBanner />

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
        ) : null}

        {/* 01 — Top EV models */}
        {(pending || topModels.length > 0) && (
          <CineSection index="01" title={t("ev.topModels", "Top EV models")}>
            {pending ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-36" />
                ))}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {topModels.map((model, i) => (
                  <m.li
                    key={`${model.make}-${model.model}`}
                    variants={listItem}
                    custom={i}
                    initial="hidden"
                    animate="show"
                    className="list-none"
                  >
                    <Link
                      to={`/cars/${encodeURIComponent(model.make)}/${encodeURIComponent(model.model)}`}
                      className="group flex h-full flex-col justify-between gap-6 rounded-card border border-border bg-card p-5 no-underline transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-caption font-semibold tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                          <span className="mt-1 block text-callout font-semibold text-foreground transition-colors duration-short group-hover:text-primary">
                            {model.make} {model.model}
                          </span>
                        </span>
                        <ArrowRight aria-hidden className="cine-row__arrow mt-1 h-4 w-4 shrink-0 text-label-2 group-hover:text-primary" />
                      </span>
                      <span>
                        <span className="cine-card__price block text-title2 leading-none text-foreground">
                          <LkrValue value={model.median_price_lkr} />
                        </span>
                        <span className="mt-1.5 block text-caption text-label-2">
                          {t("ev.modelListings", "{n} listings · median", { n: model.listing_count })}
                        </span>
                      </span>
                    </Link>
                  </m.li>
                ))}
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
          </CineSection>
        )}

        {/* 02 — TCO comparison, as a dark result card */}
        <CineSection index="02" title={t("ev.tcoEyebrow", "TCO comparison")}>
          <div className="cine-panel theme-dark p-6 text-foreground sm:p-8">
            <h3 className="cine-display max-w-2xl text-[clamp(1.5rem,1.2rem+1vw,2.25rem)] text-white">
              {t("ev.tcoTitle", "EV vs. Toyota Aqua hybrid — real running cost")}
            </h3>
            <p className="mt-3 max-w-2xl text-body text-white/70">
              {t("ev.tcoBody", "Fuel saving estimated at {saving}/yr (LKR {ev} vs LKR {petrol} per km, {km}k km/yr).", {
                saving: `Rs ${groupThousands(annualFuelSavingLkr)}`,
                ev: TCO_FUEL_COST_PER_KM_EV_LKR,
                petrol: TCO_FUEL_COST_PER_KM_PETROL_LKR,
                km: (TCO_KM_PER_YEAR / 1000).toFixed(0),
              })}
            </p>
            <dl className="mt-6 grid gap-4 border-t border-foreground/10 pt-5 sm:grid-cols-3 sm:gap-6">
              <div>
                <dt className="text-caption text-white/55">{t("ev.medianPriceLabel", "Median EV price")}</dt>
                <dd className="cine-card__price mt-1.5 text-title2 text-white">
                  {pending ? <Skeleton shape="text" className="h-6 w-24 bg-foreground/10" /> : <LkrValue value={medianEvPrice} />}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-white/55">{t("ev.aquaBenchmark", "Toyota Aqua benchmark")}</dt>
                <dd className="cine-card__price mt-1.5 text-title2 text-white">
                  {pending ? <Skeleton shape="text" className="h-6 w-24 bg-foreground/10" /> : <LkrValue value={benchmark?.median_price_lkr ?? null} />}
                </dd>
                <dd className="mt-1 text-caption text-white/55">
                  {benchmark?.listing_count
                    ? t("ev.benchmarkListings", "{n} listings", { n: benchmark.listing_count })
                    : t("ev.hybridBenchmark", "hybrid benchmark")}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-white/55">{t("ev.payback", "Fuel savings payback")}</dt>
                <dd className="cine-card__price mt-1.5 text-title2 text-white">
                  {pending ? (
                    <Skeleton shape="text" className="h-6 w-16 bg-foreground/10" />
                  ) : paybackYears !== null ? (
                    t("ev.paybackYears", "~{n} yr", { n: paybackYears })
                  ) : evPremiumLkr !== null && evPremiumLkr <= 0 ? (
                    t("ev.instant", "Instant")
                  ) : (
                    "—"
                  )}
                </dd>
                <dd className="mt-1 text-caption text-white/55">
                  {evPremiumLkr !== null && evPremiumLkr <= 0
                    ? t("ev.alreadyCheaper", "EVs already cheaper than the hybrid benchmark")
                    : t("ev.recoverPremium", "to recover EV price premium")}
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-caption text-white/55">
              {t("ev.tcoNote", "Indicative only. Actual savings vary by charging cost, mileage, and model.")}
            </p>
          </div>
        </CineSection>

        {/* 03 — Decision modules */}
        <CineSection index="03" title={t("ev.decisionModules", "Decision modules")}>
          <ol className="grid border-y border-border md:grid-cols-3 md:divide-x md:divide-border">
            {evModules.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <m.li key={mod.title} variants={listItem} custom={i} initial="hidden" animate="show" className="list-none border-border py-5 max-md:[&+li]:border-t md:px-6 md:first:pl-0 md:last:pr-0">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-footnote font-semibold tabular-nums text-primary">{mod.step}</span>
                    <Icon className="h-4 w-4 text-label-2" aria-hidden />
                  </div>
                  <h3 className="mt-3 text-callout font-semibold text-foreground">{mod.title}</h3>
                  <p className="mt-1.5 text-footnote text-label-2">{mod.desc}</p>
                </m.li>
              );
            })}
          </ol>
        </CineSection>

        {/* 04 — Ownership checks + market action */}
        <CineSection index="04" title={t("ev.buyerGuidelines", "Buyer guidelines")} body={t("ev.ownershipChecks", "Ownership checks")}>
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <dl className="grid gap-4 sm:grid-cols-3">
              {ownershipChecks.map((c) => (
                <div key={c.label} className="border-t border-border pt-3">
                  <dt className="text-caption text-label-2">{c.label}</dt>
                  <dd className="mt-1.5 text-title3 font-semibold tabular-nums text-foreground">{c.value}</dd>
                  <dd className="mt-1.5 text-caption text-label-2">{c.note}</dd>
                </div>
              ))}
            </dl>
            <Card padding="lg" className="flex flex-col">
              <p className="text-footnote font-semibold text-primary">{t("ev.marketAction", "Market action")}</p>
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
          </div>
        </CineSection>
      </PageBody>
    </PageCanvas>
  );
}
