import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { ArrowRight, BookOpen, Landmark, Radio } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { listItem } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CineHeader } from "@/components/CineHeader";
import { CineSection } from "@/components/CineSection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PulseSignalCard } from "@/components/data/PulseParts";
import { PULSE_SOURCE_GUIDES, labelPulseSource, localizePulseGuide } from "@/lib/officialPulseContent";
import { getMarketSignals, getVehicleNews } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { FREE_PULSE_LIMIT, freePlanText, hasFullPlatformAccess } from "@/lib/planLimits";

type SourceFilter = "all" | string;

export default function OfficialPulse() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const signalsQuery = useQuery({
    queryKey: ["market-signals", fullAccess ? 48 : FREE_PULSE_LIMIT],
    queryFn: () => getMarketSignals(fullAccess ? 48 : FREE_PULSE_LIMIT),
    staleTime: QUERY_STALE.market,
    retry: 1,
  });
  const newsQuery = useQuery({
    queryKey: ["vehicle-news", fullAccess ? 6 : 2],
    queryFn: () => getVehicleNews(fullAccess ? 6 : 2),
    staleTime: QUERY_STALE.market,
    retry: 0,
  });

  const signals = signalsQuery.data ?? [];
  const sourceChips = Array.from(new Set(signals.map((s) => s.source.toLowerCase()))).sort();
  const filteredSignals =
    sourceFilter === "all"
      ? signals
      : signals.filter((s) => s.source.toLowerCase() === sourceFilter);
  const visibleSignals = fullAccess
    ? filteredSignals
    : filteredSignals.slice(0, FREE_PULSE_LIMIT);
  const newsItems = newsQuery.data ?? [];
  const pending = signalsQuery.isPending;

  const headerStats = [
    { label: t("pulse.signals", "Signals"), value: pending ? null : signals.length },
    { label: t("pulse.sources", "Sources"), value: pending ? null : sourceChips.length },
    { label: t("pulse.guides", "Guides"), value: PULSE_SOURCE_GUIDES.length },
  ].filter((s): s is { label: string; value: number } => typeof s.value === "number" && s.value > 0);

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("pulse.eyebrow", "Official pulse")}
        lead={t("pulse.cine.lead", "Official")}
        accent={t("pulse.cine.accent", "pulse.")}
        body={t("pulse.description", "Government & import market signals, explained in-platform.")}
      >
        {headerStats.length ? (
          <dl className="mb-6 grid max-w-md grid-cols-3 gap-4">
            {headerStats.map((stat) => (
              <div key={stat.label} className="min-w-0 border-t border-foreground/15 pt-3">
                <dt className="text-caption text-white/55">{stat.label}</dt>
                <dd className="cine-display mt-1 text-title2 tabular-nums text-white">{stat.value.toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/docs#official-pulse">
              <BookOpen aria-hidden />
              {t("pulse.readDocs", "Read the docs")}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/pricing">{t("common.viewPricing", "View pricing")}</Link>
          </Button>
        </div>
      </CineHeader>

      <PageBody className="space-y-14 pt-8 lg:space-y-20 lg:pt-12">
        <FreePlanBanner />

        <CineSection
          index="01"
          title={t("pulse.guidesTitle", "Signal guides")}
          body={t("pulse.guidesDesc", "Each source is explained in Motormila so you can act without leaving for a government site first.")}
        >
          <ul className="cine-list border-y border-border">
            {PULSE_SOURCE_GUIDES.map((g) => localizePulseGuide(g, t)).map((guide) => (
              <li key={guide.key}>
                <Link to={`/official-pulse/guide/${guide.key}`} className="cine-row group sm:items-center">
                  <span className="w-28 shrink-0 pt-0.5 text-caption font-semibold uppercase tracking-caps text-primary sm:w-36 sm:pt-0">
                    {labelPulseSource(guide.source, t)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-callout font-semibold text-foreground transition-colors duration-short group-hover:text-primary">{guide.title}</span>
                    <span className="mt-0.5 block text-footnote text-label-2 sm:line-clamp-1">{guide.summary}</span>
                  </span>
                  <span className="sr-only">{t("pulse.openGuide", "Open guide")}</span>
                  <ArrowRight aria-hidden className="cine-row__arrow h-4 w-4 text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        </CineSection>

        <CineSection
          index="02"
          title={t("pulse.feedTitle", "Recent market signals")}
          body={t("pulse.feedDesc", "Latest DMT, Customs, CBSL FX, CCPI, and import-parity observations synced into Motormila.")}
          actions={
            <Badge variant="neutral">
              <Radio aria-hidden className="text-primary" />
              {fullAccess
                ? t("pulse.last48", "Last 48 observations")
                : t("pulse.lastFree", "Latest {n} on Free", { n: FREE_PULSE_LIMIT })}
            </Badge>
          }
        >
          {sourceChips.length > 0 ? (
            <Tabs value={sourceFilter} onValueChange={setSourceFilter} className="mb-6">
              <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
                <TabsList aria-label={t("pulse.filterAria", "Filter by source")}>
                  <TabsTrigger value="all">{t("pulse.allSources", "All sources")}</TabsTrigger>
                  {sourceChips.map((source) => (
                    <TabsTrigger key={source} value={source}>
                      {labelPulseSource(source, t)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
          ) : null}

          {pending ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-48" />
              ))}
            </div>
          ) : signalsQuery.isError ? (
            <Card padding="none">
              <ErrorState
                title={t("pulse.loadError", "Could not load live signals")}
                body={t("pulse.loadErrorBody", "The market-signals feed is temporarily unavailable. Retry in a moment.")}
                onRetry={() => void signalsQuery.refetch()}
                retryLabel={t("common.retry", "Retry")}
              />
            </Card>
          ) : filteredSignals.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={Landmark}
                title={t("pulse.empty", "No signals yet")}
                body={
                  sourceFilter === "all"
                    ? t(
                        "pulse.emptyBody",
                        "Official registration, transfer, tender, and import-cost signals will appear here after the market-signals sync runs.",
                      )
                    : t(
                        "pulse.emptyFiltered",
                        "No live signals for {source} in the latest batch. Try another source chip.",
                        { source: labelPulseSource(sourceFilter, t) },
                      )
                }
                actionLabel={sourceFilter === "all" ? undefined : t("pulse.allSources", "All sources")}
                onAction={sourceFilter === "all" ? undefined : () => setSourceFilter("all")}
              />
            </Card>
          ) : (
            <>
              <ul key={sourceFilter} className="content-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSignals.map((signal, i) => (
                  <PulseSignalCard key={signal.id} signal={signal} index={i} ctaLabel={t("pulse.openInPlatform", "Open in-platform")} />
                ))}
              </ul>
              {!fullAccess ? (
                <UpgradePrompt
                  className="mt-6"
                  title={freePlanText(t, "pulseTitle")}
                  body={freePlanText(t, "pulseBody")}
                />
              ) : null}
            </>
          )}
        </CineSection>

        {newsItems.length > 0 ? (
          <CineSection
            index="03"
            title={t("pulse.newsTitle", "Vehicle & policy headlines")}
            body={t(
              "pulse.newsDesc",
              "Recent Helakuru Esana items filtered for vehicle, import, fuel, and transport keywords.",
            )}
          >
            <ul className="cine-list border-y border-border">
              {newsItems.map((item, index) => (
                <m.li key={item.id || `${item.title}-${index}`} variants={listItem} custom={index} initial="hidden" animate="show" className="cine-row list-none">
                  <span className="w-28 shrink-0 text-caption font-semibold uppercase tracking-caps text-primary sm:w-36">Helakuru Esana</span>
                  <p className="min-w-0 flex-1 text-footnote font-semibold text-foreground">{item.title}</p>
                </m.li>
              ))}
            </ul>
          </CineSection>
        ) : null}
      </PageBody>
    </PageCanvas>
  );
}
