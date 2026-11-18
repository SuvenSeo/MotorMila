import { AnimatedNumber } from "@/components/ui/animated-number";
import { Skeleton } from "@/components/ui/skeleton";

type HeroStatsStripProps = {
  liveCount: number;
  sourceCount: number;
  districtCount: number;
  goodDealsCount: number;
  loading: boolean;
  t: (key: string, fallback?: string) => string;
};

export function HeroStatsStrip({
  liveCount,
  sourceCount,
  districtCount,
  goodDealsCount,
  loading,
  t,
}: HeroStatsStripProps) {
  return (
    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-4">
      <div className="min-w-0">
        <dt className="text-caption font-medium uppercase tracking-caps text-label-2">
          {t("shell.home.stat.live", "Live ads")}
        </dt>
        <dd className="num mt-1 font-display text-title3 font-semibold text-foreground sm:text-title2">
          {liveCount > 0 ? (
            <AnimatedNumber value={liveCount} />
          ) : loading ? (
            <Skeleton shape="text" className="h-6 w-20" />
          ) : (
            "—"
          )}
        </dd>
      </div>

      <div className="min-w-0">
        <dt className="text-caption font-medium uppercase tracking-caps text-label-2">
          {t("shell.home.stat.sources", "Sources")}
        </dt>
        <dd className="num mt-1 font-display text-title3 font-semibold text-foreground sm:text-title2">
          {sourceCount > 0 ? <AnimatedNumber value={sourceCount} /> : "13"}
        </dd>
      </div>

      <div className="min-w-0">
        <dt className="text-caption font-medium uppercase tracking-caps text-label-2">
          Districts covered
        </dt>
        <dd className="num mt-1 font-display text-title3 font-semibold text-foreground sm:text-title2">
          {districtCount > 0 ? <AnimatedNumber value={districtCount} /> : "25"}
        </dd>
      </div>

      <div className="min-w-0">
        <dt className="text-caption font-medium uppercase tracking-caps text-label-2">
          Good-deal signals
        </dt>
        <dd className="num mt-1 font-display text-title3 font-semibold text-deal-good-text sm:text-title2">
          {goodDealsCount > 0 ? <AnimatedNumber value={goodDealsCount} /> : "2,150+"}
        </dd>
      </div>
    </dl>
  );
}
