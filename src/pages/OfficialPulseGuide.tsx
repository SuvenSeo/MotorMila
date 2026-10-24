import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { ArrowLeft, Landmark, Lightbulb, ListChecks, Radio, Sparkles } from "lucide-react";
import { revealItem } from "@/lib/motion";
import { QUERY_STALE } from "@/lib/queryPolicy";
import {
  PULSE_SOURCE_GUIDES,
  localizePulseGuide,
  labelPulseSource, labelPulseType,
  matchPulseGuide,
  type PulseSourceGuide,
} from "@/lib/officialPulseContent";
import { getMarketSignals } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { PulseGuideList, PulseSignalCard } from "@/components/data/PulseParts";

function GuideNotFound() {
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
                  {t("pulse.guideNotFound", "Guide not found")}
                </span>
              }
              body={t("pulse.guideNotFoundBody", "That pulse guide key is not in the in-platform catalog.")}
              action={
                <Button asChild>
                  <Link to="/official-pulse">
                    <ArrowLeft aria-hidden />
                    {t("pulse.backToPulse", "Back to Official Pulse")}
                  </Link>
                </Button>
              }
            />
          </Card>
        </m.div>
      </PageBody>
    </PageCanvas>
  );
}

function GuideBody({ guide: sourceGuide }: { guide: PulseSourceGuide }) {
  const { t } = useAppPreferences();
  const guide = localizePulseGuide(sourceGuide, t);
  const signalsQuery = useQuery({
    queryKey: ["market-signals", 48, guide.source, guide.signalType],
    queryFn: () => getMarketSignals(48),
    staleTime: QUERY_STALE.market,
    retry: 1,
  });

  const relatedSignals = (signalsQuery.data ?? []).filter((signal) => {
    const matched = matchPulseGuide(signal.source, signal.signal_type);
    return matched?.key === guide.key;
  });

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
        eyebrow={`${labelPulseSource(guide.source, t)} · ${guide.shortLabel}`}
        eyebrowIcon={Landmark}
        title={`${guide.title}.`}
        description={guide.summary}
      />

      <PageBody className="space-y-14 pt-0 lg:space-y-20 lg:pt-0">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <m.div variants={revealItem}>
              <PulseGuideList icon={Sparkles} title={t("pulse.whyMatters", "Why it matters")} items={guide.whyItMatters} />
            </m.div>
            <m.div variants={revealItem}>
              <PulseGuideList icon={ListChecks} title={t("pulse.howWeRead", "How we read it")} items={guide.howWeReadIt} />
            </m.div>
          </div>
          <m.section variants={revealItem} className="rounded-card border border-primary/25 bg-primary/10 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Lightbulb aria-hidden className="h-4 w-4 text-primary" />
              <h2 className="text-callout font-semibold text-foreground">{t("pulse.dealerTip", "Dealer tip")}</h2>
            </div>
            <p className="max-w-3xl text-body text-foreground">{guide.dealerTip}</p>
          </m.section>
        </div>

        <m.section variants={revealItem}>
          <SectionHeading
            eyebrow={t("pulse.liveRelated", "Live related")}
            title={t("pulse.relatedSignals", "Related {label} signals", {
              label: guide.shortLabel.toLowerCase(),
            })}
            description={t("pulse.relatedDesc", "Recent observations matching {source} · {type}.", {
              source: labelPulseSource(guide.source, t),
              type: labelPulseType(guide.signalType, t),
            })}
          />
          {signalsQuery.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-44" />
              ))}
            </div>
          ) : signalsQuery.isError ? (
            <Card padding="none">
              <ErrorState
                body={t(
                  "pulse.relatedLoadError",
                  "Could not load related live signals. The guide content above remains available offline.",
                )}
                onRetry={() => void signalsQuery.refetch()}
                retryLabel={t("common.retry", "Retry")}
              />
            </Card>
          ) : relatedSignals.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={Radio}
                title={t("pulse.noRelated", "No related live signals yet")}
                body={t(
                  "pulse.noRelatedBody",
                  "When the market-signals sync records {label} activity, those observations will appear here.",
                  { label: guide.shortLabel.toLowerCase() },
                )}
              />
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedSignals.map((signal, i) => (
                <PulseSignalCard
                  key={signal.id}
                  signal={signal}
                  index={i}
                  showMetric={false}
                  ctaLabel={t("pulse.openSignal", "Open signal")}
                />
              ))}
            </ul>
          )}
        </m.section>
      </PageBody>
    </PageCanvas>
  );
}

export default function OfficialPulseGuide() {
  const { key } = useParams<{ key: string }>();
  const guide = PULSE_SOURCE_GUIDES.find((entry) => entry.key === key) ?? null;

  if (!guide) {
    return <GuideNotFound />;
  }

  return <GuideBody guide={guide} />;
}
