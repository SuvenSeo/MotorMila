import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Landmark,
  Lightbulb,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { revealItem } from "@/lib/motion";
import { QUERY_STALE } from "@/lib/queryPolicy";
import {
  formatPulsePeriod,
  formatPulseValue,
  labelPulseMetric,
  labelPulseType,
  labelPulseSource,
  localizePulseGuide,
  matchPulseGuide,
} from "@/lib/officialPulseContent";
import { formatRelativeTime } from "@/lib/formatting";
import { getMarketSignal } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { safeExternalUrl } from "@/lib/safeExternalUrl";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PulseGuideList } from "@/components/data/PulseParts";

function NotFoundState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useAppPreferences();
  return (
    <PageCanvas ambient="none">
      <PageBody narrow className="flex min-h-[70vh] items-center justify-center">
        <m.div variants={revealItem} className="w-full max-w-lg">
          <Card padding="none">
            <EmptyState
              icon={Landmark}
              title={
                <span role="heading" aria-level={1}>
                  {t("pulse.signalNotFound", "Signal not found")}
                </span>
              }
              body={message}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild>
                    <Link to="/official-pulse">
                      <ArrowLeft aria-hidden />
                      {t("pulse.backToPulse", "Back to Official Pulse")}
                    </Link>
                  </Button>
                  {onRetry ? (
                    <Button type="button" variant="secondary" onClick={onRetry}>
                      {t("common.retry", "Retry")}
                    </Button>
                  ) : null}
                  <Button asChild variant="secondary">
                    <Link to="/official-pulse/guide/dmt_registrations">{t("pulse.readGuides", "Read signal guides")}</Link>
                  </Button>
                </div>
              }
            />
          </Card>
        </m.div>
      </PageBody>
    </PageCanvas>
  );
}

export default function OfficialPulseDetail() {
  const { t } = useAppPreferences();
  const { id: idParam } = useParams<{ id: string }>();
  const signalId = Number(idParam);
  const idIsValid = Number.isFinite(signalId) && signalId > 0 && String(signalId) === String(idParam).trim();
  const [sourceOpen, setSourceOpen] = useState(false);

  const signalQuery = useQuery({
    queryKey: ["market-signal", signalId],
    queryFn: () => getMarketSignal(signalId),
    enabled: idIsValid,
    staleTime: QUERY_STALE.market,
    retry: false,
  });

  if (!idIsValid) {
    return (
      <NotFoundState
        message={t(
          "pulse.invalidSignal",
          "That signal ID is not valid. Pick a live signal from the Official pulse hub.",
        )}
      />
    );
  }

  if (signalQuery.isPending) {
    return (
      <PageCanvas ambient="none">
        <div className="layout-shell space-y-4 pb-6 pt-8 sm:pt-10" aria-busy="true">
          <Skeleton shape="text" className="h-4 w-32" />
          <Skeleton shape="title" className="h-9 max-w-xl" />
          <Skeleton shape="text" className="max-w-lg" />
        </div>
        <PageBody className="space-y-6 pt-0 lg:pt-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} shape="kpi" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </PageBody>
      </PageCanvas>
    );
  }

  if (signalQuery.isError || !signalQuery.data) {
    return (
      <NotFoundState
        message={t(
          "pulse.missingSignal",
          "This market signal is missing or no longer in the live index. Open the pulse hub for the latest signals, or retry if the API was cold-starting.",
        )}
        onRetry={() => void signalQuery.refetch()}
      />
    );
  }

  const signal = signalQuery.data;
  const guide = localizePulseGuide(matchPulseGuide(signal.source, signal.signal_type), t);
  const title =
    guide?.title ||
    labelPulseMetric(signal.category || signal.metric, t) ||
    t("pulse.marketSignal", "Market signal");
  const period = formatPulsePeriod(signal.period_year, signal.period_month);
  const value = formatPulseValue(signal.value_numeric, signal.unit, signal.metric);
  // Backend data: only http(s) URLs may become a link (no javascript:/data:).
  const sourceHref = safeExternalUrl(signal.source_url);
  const hasSourceUrl = Boolean(sourceHref);
  const observedLabel = signal.observed_at ? formatRelativeTime(signal.observed_at) : null;

  const facts = [
    {
      label: t("pulse.value", "Value"),
      value,
      note: signal.unit
        ? t("pulse.unitNote", "Unit · {unit}", { unit: signal.unit })
        : t("pulse.observedValue", "Observed value"),
    },
    {
      label: t("pulse.periodLabel", "Period"),
      value: period || "—",
      note: t("pulse.reportingWindow", "Reporting window"),
    },
    {
      label: t("pulse.metricLabel", "Metric"),
      value: signal.metric ? labelPulseMetric(signal.metric, t) : "—",
      note: t("pulse.trackedField", "Tracked field"),
    },
    {
      label: t("pulse.observedLabel", "Observed"),
      value: observedLabel || "—",
      note: signal.category
        ? t("pulse.categoryNote", "Category · {category}", { category: labelPulseMetric(signal.category, t) })
        : t("pulse.syncTimestamp", "Sync timestamp"),
    },
  ];

  return (
    <PageCanvas ambient="none">
      <div className="layout-shell pt-6 sm:pt-8">
        <Button asChild variant="tertiary" size="sm" className="-ml-3">
          <Link to="/official-pulse">
            <ArrowLeft aria-hidden />
            {t("pulse.eyebrow", "Official pulse")}
          </Link>
        </Button>
      </div>
      <PageHeader
        className="pt-3 sm:pt-4"
        eyebrow={`${labelPulseSource(signal.source, t)} · ${labelPulseType(signal.signal_type, t)}`}
        eyebrowIcon={Landmark}
        title={title}
        description={
          guide?.summary ||
          t("pulse.summaryFallback", "Government and import market signal observed by Motormila, with in-platform context.")
        }
      />

      <PageBody className="space-y-6 pt-0 lg:pt-0">
        <m.dl variants={revealItem} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((card) => (
            <Card key={card.label} padding="md" className="min-w-0">
              <dt className="text-footnote font-medium text-label-2">{card.label}</dt>
              <dd className="mt-1.5 font-display text-title2 font-semibold tabular-nums text-foreground [overflow-wrap:anywhere]">
                {card.value}
              </dd>
              <dd className="mt-1 text-caption text-label-2">{card.note}</dd>
            </Card>
          ))}
        </m.dl>

        {guide ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <m.div variants={revealItem}>
              <PulseGuideList icon={Sparkles} title={t("pulse.whyMatters", "Why it matters")} items={guide.whyItMatters} />
            </m.div>
            <m.div variants={revealItem}>
              <PulseGuideList icon={ListChecks} title={t("pulse.howWeRead", "How we read it")} items={guide.howWeReadIt} />
            </m.div>
            <m.section variants={revealItem} className="rounded-card border border-primary/25 bg-primary/10 p-5 sm:p-6 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb aria-hidden className="h-4 w-4 text-primary" />
                <h2 className="text-callout font-semibold text-foreground">{t("pulse.dealerTip", "Dealer tip")}</h2>
              </div>
              <p className="text-body text-foreground">{guide.dealerTip}</p>
              <Button asChild variant="tertiary" size="sm" className="-ml-3 mt-3">
                <Link to={`/official-pulse/guide/${guide.key}`}>
                  {t("pulse.fullGuide", "Full {label} guide", { label: guide.shortLabel.toLowerCase() })}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </m.section>
          </div>
        ) : (
          <m.div variants={revealItem}>
            <Card padding="md" className="border-dashed shadow-none">
              <p className="text-body text-label-2">
                {t(
                  "pulse.noGuide",
                  "No matching in-platform guide for this source yet. The live values above are still valid observations from the market-signals sync.",
                )}
              </p>
            </Card>
          </m.div>
        )}

        {hasSourceUrl ? (
          <m.div variants={revealItem}>
            <Card padding="none">
              <button
                type="button"
                onClick={() => setSourceOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 rounded-card px-5 py-4 text-left transition-colors duration-short hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={sourceOpen}
              >
                <span className="text-footnote font-semibold text-foreground">{t("pulse.originalSource", "Original source")}</span>
                <ChevronDown
                  aria-hidden
                  className={cn("h-4 w-4 text-label-2 transition-transform duration-medium ease-standard", sourceOpen && "rotate-180")}
                />
              </button>
              {sourceOpen ? (
                <div className="content-in border-t border-separator px-5 py-4">
                  <p className="text-caption text-label-2">
                    {t("pulse.originalSourceHint", "Optional external reference. Primary explanation stays in Motormila above.")}
                  </p>
                  <a
                    href={sourceHref ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-footnote font-semibold text-primary no-underline hover:underline"
                  >
                    <ExternalLink aria-hidden className="h-4 w-4" />
                    {t("pulse.openOriginal", "Open original source")}
                  </a>
                </div>
              ) : null}
            </Card>
          </m.div>
        ) : null}
      </PageBody>
    </PageCanvas>
  );
}
