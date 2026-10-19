import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Landmark,
  Lightbulb,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { revealContainer, revealItem, springSoft } from "@/lib/motion";
import { QUERY_STALE } from "@/lib/queryPolicy";
import {
  PULSE_SOURCE_GUIDES,
  formatPulsePeriod,
  formatPulseValue,
  labelPulseMetric,
  labelPulseSource,
  matchPulseGuide,
  type PulseSourceGuide,
} from "@/lib/officialPulseContent";
import { getMarketSignals } from "@/services/api";
import type { MarketSignal } from "@/types/car";
import { useAppPreferences } from "@/lib/appPreferences";

function GuideNotFound() {
  const { t } = useAppPreferences();
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="page-canvas relative flex min-h-screen items-center justify-center overflow-hidden px-5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[8%] h-[450px] w-[450px] rounded-full bg-primary/5 blur-[110px]"
      />
      <motion.div variants={revealItem} className="relative z-10 max-w-md text-center">
        <Landmark aria-hidden className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="section-eyebrow mt-4 text-primary-bright">
          {t("nav.statusUnavailable", "Unavailable")}
        </p>
        <h1 className="mt-3 font-display text-xl font-semibold text-foreground">
          {t("pulse.guideNotFound", "Guide not found")}
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {t("pulse.guideNotFoundBody", "That pulse guide key is not in the in-platform catalog.")}
        </p>
        <Link
          to="/official-pulse"
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[12px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          {t("pulse.backToPulse", "Back to Official Pulse")}
        </Link>
      </motion.div>
    </motion.div>
  );
}

function RelatedSignalCard({ signal }: { signal: MarketSignal }) {
  const { t } = useAppPreferences();
  const guide = matchPulseGuide(signal.source, signal.signal_type);
  const title =
    guide?.title ||
    labelPulseMetric(signal.category || signal.metric) ||
    t("pulse.marketSignal", "Market signal");
  const period = formatPulsePeriod(signal.period_year, signal.period_month);
  const value = formatPulseValue(signal.value_numeric, signal.unit, signal.metric);

  return (
    <motion.article
      variants={revealItem}
      whileHover={{ y: -2 }}
      transition={springSoft}
      className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/30"
    >
      <Link to={`/official-pulse/${signal.id}`} className="flex h-full flex-col no-underline">
        <p className="text-[12px] font-medium text-primary/70">
          {labelPulseSource(signal.source)} · {signal.signal_type.replace(/_/g, " ")}
        </p>
        <h3 className="mt-2 text-sm font-semibold text-foreground group-hover:text-primary">{title}</h3>
        <p className="num mt-4 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {period
            ? t("pulse.period", "Period {period}", { period })
            : t("pulse.latest", "Latest official pulse")}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          {t("pulse.openSignal", "Open signal")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </motion.article>
  );
}

function GuideBody({ guide }: { guide: PulseSourceGuide }) {
  const { t } = useAppPreferences();
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
    <motion.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="page-canvas relative min-h-screen overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[8%] h-[450px] w-[450px] rounded-full bg-primary/5 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[18%] left-[-15%] h-[400px] w-[400px] rounded-full bg-primary/5 blur-[100px]"
      />

      <motion.section variants={revealItem} className="relative z-10 border-b border-border">
        <div className="mx-auto max-w-[1320px] px-5 pb-14 pt-16 sm:px-6 lg:pb-20 lg:pt-24">
          <Link
            to="/official-pulse"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            {t("pulse.eyebrow", "Official pulse")}
          </Link>
          <div className="section-eyebrow mb-5 mt-6 inline-flex items-center gap-2">
            <Landmark aria-hidden className="h-3.5 w-3.5" />
            {labelPulseSource(guide.source)} · {guide.shortLabel}
          </div>
          <h1 className="display-hero max-w-3xl text-foreground">{guide.title}.</h1>
          <p className="text-body-lg mt-6 max-w-xl">{guide.summary}</p>
        </div>
      </motion.section>

      <div className="relative z-10 mx-auto max-w-[1320px] space-y-14 px-5 py-14 sm:px-6 lg:space-y-20 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-2">
          <motion.section variants={revealItem} className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles aria-hidden className="h-4 w-4 text-primary" />
              <h2 className="font-display text-[15px] font-bold text-foreground">
                {t("pulse.whyMatters", "Why it matters")}
              </h2>
            </div>
            <ul className="space-y-3.5">
              {guide.whyItMatters.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{item}</p>
                </li>
              ))}
            </ul>
          </motion.section>

          <motion.section variants={revealItem} className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <ListChecks aria-hidden className="h-4 w-4 text-primary" />
              <h2 className="font-display text-[15px] font-bold text-foreground">
                {t("pulse.howWeRead", "How we read it")}
              </h2>
            </div>
            <ul className="space-y-3.5">
              {guide.howWeReadIt.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{item}</p>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>

        <motion.section
          variants={revealItem}
          className="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-soft sm:p-7"
        >
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb aria-hidden className="h-4 w-4 text-primary" />
            <h2 className="font-display text-[15px] font-bold text-foreground">
              {t("pulse.dealerTip", "Dealer tip")}
            </h2>
          </div>
          <p className="max-w-3xl text-[14px] font-medium leading-relaxed text-foreground/90">
            {guide.dealerTip}
          </p>
        </motion.section>

        <motion.section variants={revealItem}>
          <SectionHeader
            eyebrow={t("pulse.liveRelated", "Live related")}
            title={t("pulse.relatedSignals", "Related {label} signals", {
              label: guide.shortLabel.toLowerCase(),
            })}
            description={t("pulse.relatedDesc", "Recent observations matching {source} · {type}.", {
              source: labelPulseSource(guide.source),
              type: guide.signalType.replace(/_/g, " "),
            })}
            className="mb-8"
          />

          {signalsQuery.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-2xl border border-border bg-card"
                />
              ))}
            </div>
          ) : signalsQuery.isError ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-[13px] text-muted-foreground">
              {t(
                "pulse.relatedLoadError",
                "Could not load related live signals. The guide content above remains available offline.",
              )}
            </div>
          ) : relatedSignals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-foreground">
                {t("pulse.noRelated", "No related live signals yet")}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[12px] text-muted-foreground">
                {t(
                  "pulse.noRelatedBody",
                  "When the market-signals sync records {label} activity, those observations will appear here.",
                  { label: guide.shortLabel.toLowerCase() },
                )}
              </p>
            </div>
          ) : (
            <motion.div
              variants={revealContainer}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {relatedSignals.map((signal) => (
                <RelatedSignalCard key={signal.id} signal={signal} />
              ))}
            </motion.div>
          )}
        </motion.section>
      </div>
    </motion.div>
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
