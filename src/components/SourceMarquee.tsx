import { memo } from "react";
import { Marquee } from "@/components/ui/Marquee";

export interface SourceMarqueeItem {
  source: string;
  listings: number;
}

interface SourceMarqueeProps {
  items: SourceMarqueeItem[];
}

/**
 * SourceMarquee — Marquee (#11) as a marketplace trust strip: every live
 * source with its current listing count, scrolling on a slow CSS loop.
 * Pure decoration around real numbers; screen readers get the same list
 * once via the aria label.
 */
function prettySourceName(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("ikman")) return "ikman";
  if (s.includes("riyasewana")) return "Riyasewana";
  if (s.includes("patpat")) return "Patpat";
  return source;
}

export const SourceMarquee = memo(function SourceMarquee({ items }: SourceMarqueeProps) {
  if (!items.length) return null;
  const summary = items.map((i) => `${prettySourceName(i.source)} ${i.listings.toLocaleString()}`).join(", ");
  return (
    <section aria-label={`Live sources: ${summary}`} className="border-b border-border bg-background">
      <p className="pt-5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Live across Sri Lanka's marketplaces
      </p>
      <Marquee duration={55} className="py-4" ariaLabel={`Live sources: ${summary}`}>
        {items.map((i) => (
          <span
            key={i.source}
            className="mx-6 inline-flex items-baseline gap-2 whitespace-nowrap text-[13px]"
          >
            <span className="font-display font-semibold tracking-tight text-foreground">
              {prettySourceName(i.source)}
            </span>
            <span className="num text-muted-foreground">{i.listings.toLocaleString()} live</span>
            <span aria-hidden className="ml-4 inline-block h-1 w-1 rounded-full bg-primary/50" />
          </span>
        ))}
      </Marquee>
    </section>
  );
});
