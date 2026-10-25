import { Link } from "react-router-dom";
import { m } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { MarketSignal } from "@/types/car";
import { listItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  formatPulsePeriod,
  formatPulseValue,
  labelPulseMetric,
  labelPulseType,
  labelPulseSource,
  localizePulseGuide,
  matchPulseGuide,
} from "@/lib/officialPulseContent";
import { Card, cardVariants } from "@/components/ui/card";
import { safeExternalUrl } from "@/lib/safeExternalUrl";

/** Bulleted guide card ("Why it matters", "How we read it"). */
export function PulseGuideList({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items: string[] }) {
  return (
    <Card padding="md" className="h-full">
      <div className="mb-4 flex items-center gap-2">
        <Icon aria-hidden className="h-4 w-4 text-primary" />
        <h2 className="text-callout font-semibold text-foreground">{title}</h2>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <p className="text-body text-label-2">{item}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * One official signal as an interactive kit card (hover lift, press, focus),
 * capped first-load stagger via `index`.
 */
export function PulseSignalCard({
  signal,
  index = 0,
  ctaLabel,
  showMetric = true,
}: {
  signal: MarketSignal;
  index?: number;
  ctaLabel: string;
  showMetric?: boolean;
}) {
  const { t } = useAppPreferences();
  const guide = localizePulseGuide(matchPulseGuide(signal.source, signal.signal_type), t);
  const title = guide?.title || labelPulseMetric(signal.category || signal.metric, t) || t("pulse.marketSignal", "Market signal");
  const period = formatPulsePeriod(signal.period_year, signal.period_month);
  const value = formatPulseValue(signal.value_numeric, signal.unit, signal.metric);
  // Backend data: only http(s) URLs may become a link (no javascript:/data:).
  const sourceHref = safeExternalUrl(signal.source_url);
  const hasSourceUrl = Boolean(sourceHref);

  return (
    <m.li variants={listItem} custom={index} initial="hidden" animate="show" className="list-none">
      <article className={cn(cardVariants({ variant: "interactive", padding: "md" }), "group flex h-full cursor-default flex-col")}>
        <Link
          to={`/official-pulse/${signal.id}`}
          className="flex flex-1 flex-col rounded-control no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-caption font-semibold text-primary">
            {labelPulseSource(signal.source, t)} · {labelPulseType(signal.signal_type, t)}
          </p>
          <h3 className="mt-2 text-callout font-semibold text-foreground">{title}</h3>
          <p className="mt-4 font-display text-title2 font-semibold tabular-nums text-foreground [overflow-wrap:anywhere]">{value}</p>
          <p className="mt-1 text-caption text-label-2">
            {period ? t("pulse.period", "Period {period}", { period }) : t("pulse.latest", "Latest official pulse")}
            {showMetric && signal.metric ? ` · ${labelPulseMetric(signal.metric, t)}` : null}
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-footnote font-semibold text-primary">
            {ctaLabel}
            <ArrowRight aria-hidden className="h-4 w-4 transition-transform duration-short ease-standard group-hover:translate-x-0.5" />
          </span>
        </Link>
        {hasSourceUrl ? (
          <a
            href={sourceHref ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 self-start text-caption font-medium text-label-2 no-underline transition-colors duration-short hover:text-foreground"
          >
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            {t("pulse.viewOriginal", "View original source")}
          </a>
        ) : null}
      </article>
    </m.li>
  );
}
