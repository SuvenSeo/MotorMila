import { memo } from "react";
import { useAppPreferences } from "@/lib/appPreferences";

export interface SourceCreditItem {
  source: string;
  listings: number;
}

function prettySourceName(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("ikman")) return "ikman";
  if (s.includes("riyasewana")) return "Riyasewana";
  if (s.includes("patpat")) return "Patpat";
  return source;
}

/**
 * Static credit line for the marketplaces listings come from (replaces the
 * scrolling marquee). Real counts only; renders nothing until we have them.
 */
export const SourceCredits = memo(function SourceCredits({ items }: { items: SourceCreditItem[] }) {
  const { t } = useAppPreferences();
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => b.listings - a.listings);
  return (
    <section aria-labelledby="source-credits-title" className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1560px] px-5 py-8 sm:px-6">
        <h2 id="source-credits-title" className="text-footnote font-medium text-muted-foreground">
          {t("shell.home.sourcesTitle", "Listings come from these Sri Lankan sites")}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {sorted.map((i) => (
            <li key={i.source} className="inline-flex items-baseline gap-2 text-footnote">
              <span className="font-semibold text-foreground">{prettySourceName(i.source)}</span>
              <span className="num text-muted-foreground">
                {t("shell.home.sourceCount", "{n} ads", { n: i.listings.toLocaleString() })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
});
