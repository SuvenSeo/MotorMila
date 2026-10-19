import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileText,
  Landmark,
  Loader2,
  Radio,
  RefreshCw,
} from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { AnimatedTabs } from "@/components/ui/AnimatedTabs";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { revealContainer, revealItem, springSoft } from "@/lib/motion";
import { visuals } from "@/lib/visualAssets";
import {
  PULSE_SOURCE_GUIDES,
  formatPulsePeriod,
  formatPulseValue,
  labelPulseMetric,
  labelPulseSource,
  matchPulseGuide,
} from "@/lib/officialPulseContent";
import { cn } from "@/lib/utils";
import { getMarketSignals, getVehicleNews } from "@/services/api";
import type { MarketSignal } from "@/types/car";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { FREE_PULSE_LIMIT, freePlanCopy, hasFullPlatformAccess } from "@/lib/planLimits";

type SourceFilter = "all" | string;

function signalTitle(signal: MarketSignal, marketSignalLabel: string): string {
  const guide = matchPulseGuide(signal.source, signal.signal_type);
  return guide?.title || labelPulseMetric(signal.category || signal.metric) || marketSignalLabel;
}

function SignalCard({ signal }: { signal: MarketSignal }) {
  const { t } = useAppPreferences();
  const title = signalTitle(signal, t("pulse.marketSignal", "Market signal"));
  const period = formatPulsePeriod(signal.period_year, signal.period_month);
  const value = formatPulseValue(signal.value_numeric, signal.unit, signal.metric);
  const hasSourceUrl = Boolean(signal.source_url?.trim());

  return (
    <motion.article
      variants={revealItem}
      whileHover={{ y: -2 }}
      transition={springSoft}
      className="group flex flex-col rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl transition-all hover:border-primary/30 hover:shadow-soft-lg"
    >
      <Link to={`/official-pulse/${signal.id}`} className="flex flex-1 flex-col no-underline">
        <p className="text-[12px] font-medium text-primary/70">
          {labelPulseSource(signal.source)} · {signal.signal_type.replace(/_/g, " ")}
        </p>
        <h3 className="mt-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="num mt-4 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {period ? t("pulse.period", "Period {period}", { period }) : t("pulse.latest", "Latest official pulse")}
          {signal.metric ? ` · ${signal.metric.replace(/_/g, " ")}` : null}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          {t("pulse.openInPlatform", "Open in-platform")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      {hasSourceUrl ? (
        <a
          href={signal.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 self-start text-[10px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <ExternalLink aria-hidden className="h-3 w-3" />
          {t("pulse.viewOriginal", "View original source")}
        </a>
      ) : null}
    </motion.article>
  );
}

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

  return (
    <PageCanvas>
      <FreePlanBanner />
      <PageHero
        theme="official"
        eyebrow={t("pulse.eyebrow", "Official pulse")}
        eyebrowIcon={Landmark}
        watermarkIcon={Radio}
        title={<>{t("pulse.title", "Official pulse.")}</>}
        description={t("pulse.description", "Government & import market signals, explained in-platform.")}
        media={visuals.alt2BlogTeaPlantation}
        mediaPosition="center 40%"
        mediaTone="brand"
        highlights={[
          {
            label: t("pulse.signals", "Signals"),
            value: signalsQuery.isPending ? "…" : String(signals.length),
            hint: t("pulse.signalsHint", "Indexed official metrics"),
          },
          {
            label: t("pulse.sources", "Sources"),
            value: String(sourceChips.length || "—"),
            hint: t("pulse.sourcesHint", "Government and import feeds"),
          },
          {
            label: t("pulse.guides", "Guides"),
            value: String(PULSE_SOURCE_GUIDES.length),
            hint: t("pulse.guidesHint", "Explainer cards in-platform"),
          },
        ]}
        actions={
          <>
            <Link
              to="/docs#official-pulse"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <BookOpen aria-hidden className="h-4 w-4" />
              {t("pulse.readDocs", "Read the docs")}
            </Link>
            <Link
              to="/pricing"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-6 text-[13px] font-semibold text-foreground no-underline transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("common.viewPricing", "View pricing")}
            </Link>
          </>
        }
      />

      <PageBody className="space-y-16 lg:space-y-24">
        <motion.section variants={revealItem}>
          <SectionHeader
            eyebrow={t("pulse.guidesEyebrow", "How to read it")}
            title={t("pulse.guidesTitle", "Signal guides")}
            description={t("pulse.guidesDesc", "Each source is explained in Motormila so you can act without leaving for a government site first.")}
            className="mb-8"
          />
          <motion.div
            variants={revealContainer}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {PULSE_SOURCE_GUIDES.map((guide) => (
              <motion.div key={guide.key} variants={revealItem}>
                <Link
                  to={`/official-pulse/guide/${guide.key}`}
                  className="group flex h-full flex-col rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl no-underline transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg"
                >
                  <p className="text-[12px] font-medium text-primary/70">
                    {labelPulseSource(guide.source)}
                  </p>
                  <h3 className="mt-2 font-display text-[15px] font-bold text-foreground group-hover:text-primary transition-colors">
                    {guide.title}
                  </h3>
                  <p className="mt-3 flex-1 text-[12px] font-medium leading-relaxed text-muted-foreground">
                    {guide.summary}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                    <FileText aria-hidden className="h-3.5 w-3.5" />
                    {t("pulse.openGuide", "Open guide")}
                    <ArrowRight
                      aria-hidden
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        <motion.section variants={revealItem}>
          <SectionHeader
            eyebrow={t("pulse.feedEyebrow", "Live feed")}
            title={t("pulse.feedTitle", "Recent market signals")}
            description={t("pulse.feedDesc", "Latest DMT, Customs, CBSL FX, CCPI, and import-parity observations synced into Motormila.")}
            className="mb-8"
            actions={
              <div className="inline-flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <Radio aria-hidden className="h-3.5 w-3.5 text-primary" />
                {fullAccess
                  ? t("pulse.last48", "Last 48 observations")
                  : t("pulse.lastFree", "Latest {n} on Free", { n: FREE_PULSE_LIMIT })}
              </div>
            }
          />

          {sourceChips.length > 0 ? (
            <div className="mb-6">
              {/* Animated Tabs — sliding active pill (#9 UI review) */}
              <AnimatedTabs
                ariaLabel={t("pulse.filterAria", "Filter by source")}
                tabs={[
                  { id: "all", label: t("pulse.allSources", "All sources") },
                  ...sourceChips.map((source) => ({ id: source, label: labelPulseSource(source) })),
                ]}
                activeId={sourceFilter}
                onChange={setSourceFilter}
              />
            </div>
          ) : null}

          {signalsQuery.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-3xl border border-border/80 bg-card/85 backdrop-blur-xl"
                />
              ))}
            </div>
          ) : signalsQuery.isError ? (
            <div className="flex flex-col items-start gap-3 rounded-3xl border border-rose-500/25 bg-rose-500/5 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <Loader2 aria-hidden className="h-4 w-4 text-rose-500" />
                <p className="text-[13px] font-semibold text-foreground">{t("pulse.loadError", "Could not load live signals")}</p>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {t("pulse.loadErrorBody", "The market-signals feed is temporarily unavailable. Retry in a moment.")}
              </p>
              <button
                type="button"
                onClick={() => void signalsQuery.refetch()}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/85 px-5 py-2 text-[11px] font-bold text-foreground transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.97]"
              >
                <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                {t("common.retry", "Retry")}
              </button>
            </div>
          ) : filteredSignals.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 px-6 py-14 text-center backdrop-blur-xl">
              <Landmark aria-hidden className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-[14px] font-semibold text-foreground">{t("pulse.empty", "No signals yet")}</p>
              <p className="mx-auto mt-2 max-w-md text-[12px] text-muted-foreground">
                {sourceFilter === "all"
                  ? t(
                      "pulse.emptyBody",
                      "Official registration, transfer, tender, and import-cost signals will appear here after the market-signals sync runs.",
                    )
                  : t(
                      "pulse.emptyFiltered",
                      "No live signals for {source} in the latest batch. Try another source chip.",
                      { source: labelPulseSource(sourceFilter) },
                    )}
              </p>
            </div>
          ) : (
            <>
              <motion.div
                variants={revealContainer}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {visibleSignals.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}
              </motion.div>
              {!fullAccess ? (
                <UpgradePrompt
                  className="mt-6"
                  title={freePlanCopy.pulseTitle}
                  body={freePlanCopy.pulseBody}
                />
              ) : null}
            </>
          )}
        </motion.section>

        {newsItems.length > 0 ? (
          <motion.section variants={revealItem} className="mt-14">
            <SectionHeader
              eyebrow={t("pulse.newsEyebrow", "Policy desk")}
              title={t("pulse.newsTitle", "Vehicle & policy headlines")}
              description={t(
                "pulse.newsDesc",
                "Recent Helakuru Esana items filtered for vehicle, import, fuel, and transport keywords.",
              )}
              className="mb-6"
            />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {newsItems.map((item, index) => (
                <li
                  key={item.id || `${item.title}-${index}`}
                  className="rounded-3xl border border-border/80 bg-card/85 p-5 shadow-soft backdrop-blur-xl"
                >
                  <p className="text-[12px] font-medium text-primary/70">
                    Helakuru Esana
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-snug text-foreground">{item.title}</p>
                </li>
              ))}
            </ul>
          </motion.section>
        ) : null}
      </PageBody>
    </PageCanvas>
  );
}
