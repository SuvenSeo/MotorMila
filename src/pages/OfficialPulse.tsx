import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { ArrowRight, BookOpen, FileText, Landmark, Radio } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { listItem, revealItem } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Card, cardVariants } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CountValue } from "@/components/ui/stat-tile";
import { PulseSignalCard } from "@/components/data/PulseParts";
import { PULSE_SOURCE_GUIDES, labelPulseSource, localizePulseGuide } from "@/lib/officialPulseContent";
import { cn } from "@/lib/utils";
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

  return (
    <PageCanvas ambient="none">
      <FreePlanBanner />
      <PageHeader
        eyebrow={t("pulse.eyebrow", "Official pulse")}
        eyebrowIcon={Landmark}
        title={t("pulse.title", "Official pulse.")}
        description={t("pulse.description", "Government & import market signals, explained in-platform.")}
        stats={[
          {
            label: t("pulse.signals", "Signals"),
            value: pending ? "—" : <CountValue value={signals.length || null} />,
            hint: t("pulse.signalsHint", "Indexed official metrics"),
          },
          {
            label: t("pulse.sources", "Sources"),
            value: pending ? "—" : <CountValue value={sourceChips.length || null} />,
            hint: t("pulse.sourcesHint", "Government and import feeds"),
          },
          {
            label: t("pulse.guides", "Guides"),
            value: <CountValue value={PULSE_SOURCE_GUIDES.length} />,
            hint: t("pulse.guidesHint", "Explainer cards in-platform"),
          },
        ]}
        actions={
          <>
            <Button asChild>
              <Link to="/docs#official-pulse">
                <BookOpen aria-hidden />
                {t("pulse.readDocs", "Read the docs")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/pricing">{t("common.viewPricing", "View pricing")}</Link>
            </Button>
          </>
        }
      />

      <PageBody className="space-y-14 pt-0 lg:space-y-20 lg:pt-0">
        <m.section variants={revealItem}>
          <SectionHeading
            eyebrow={t("pulse.guidesEyebrow", "How to read it")}
            title={t("pulse.guidesTitle", "Signal guides")}
            description={t("pulse.guidesDesc", "Each source is explained in Motormila so you can act without leaving for a government site first.")}
          />
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PULSE_SOURCE_GUIDES.map((g) => localizePulseGuide(g, t)).map((guide, i) => (
              <m.li key={guide.key} variants={listItem} custom={i} initial="hidden" animate="show" className="list-none">
                <Link
                  to={`/official-pulse/guide/${guide.key}`}
                  className={cn(cardVariants({ variant: "interactive", padding: "md" }), "group flex h-full flex-col no-underline")}
                >
                  <p className="text-caption font-semibold text-primary">{labelPulseSource(guide.source, t)}</p>
                  <h3 className="mt-2 text-callout font-semibold text-foreground">{guide.title}</h3>
                  <p className="mt-2 flex-1 text-footnote text-label-2">{guide.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-footnote font-semibold text-primary">
                    <FileText aria-hidden className="h-4 w-4" />
                    {t("pulse.openGuide", "Open guide")}
                    <ArrowRight aria-hidden className="h-4 w-4 transition-transform duration-short ease-standard group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </m.li>
            ))}
          </ul>
        </m.section>

        <m.section variants={revealItem}>
          <SectionHeading
            eyebrow={t("pulse.feedEyebrow", "Live feed")}
            title={t("pulse.feedTitle", "Recent market signals")}
            description={t("pulse.feedDesc", "Latest DMT, Customs, CBSL FX, CCPI, and import-parity observations synced into Motormila.")}
            actions={
              <Badge variant="neutral">
                <Radio aria-hidden className="text-primary" />
                {fullAccess
                  ? t("pulse.last48", "Last 48 observations")
                  : t("pulse.lastFree", "Latest {n} on Free", { n: FREE_PULSE_LIMIT })}
              </Badge>
            }
          />

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
        </m.section>

        {newsItems.length > 0 ? (
          <m.section variants={revealItem}>
            <SectionHeading
              eyebrow={t("pulse.newsEyebrow", "Policy desk")}
              title={t("pulse.newsTitle", "Vehicle & policy headlines")}
              description={t(
                "pulse.newsDesc",
                "Recent Helakuru Esana items filtered for vehicle, import, fuel, and transport keywords.",
              )}
            />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {newsItems.map((item, index) => (
                <m.li key={item.id || `${item.title}-${index}`} variants={listItem} custom={index} initial="hidden" animate="show" className="list-none">
                  <Card padding="md" className="h-full">
                    <p className="text-caption font-semibold text-primary">Helakuru Esana</p>
                    <p className="mt-2 text-footnote font-semibold text-foreground">{item.title}</p>
                  </Card>
                </m.li>
              ))}
            </ul>
          </m.section>
        ) : null}
      </PageBody>
    </PageCanvas>
  );
}
