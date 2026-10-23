import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { getSnapshotModelComps } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { computeModelSellSpeed, sellSpeedFromStats, type ModelSellSpeed } from "@/lib/modelSellSpeed";

/**
 * "Likely to sell fast" badge — per-model liquidity, NEVER merged with the
 * deal score (render it next to the deal badge, not inside it).
 *
 * Give it either `stats` (median days on market + sample size from an API)
 * or `make` + `model` (reads the snapshot comps for that model, cached per
 * model for the session). Renders nothing unless there is enough data and
 * the model is in the fast band.
 */
const cache = new Map<string, Promise<ModelSellSpeed | null>>();

function modelSellSpeed(make: string, model: string): Promise<ModelSellSpeed | null> {
  const key = `${make}`.toLowerCase() + "|" + `${model}`.toLowerCase();
  let hit = cache.get(key);
  if (!hit) {
    hit = getSnapshotModelComps(make, model, { allowFullCatalog: false })
      .then((rows) => computeModelSellSpeed(rows))
      .catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

/** Test hook: drop cached model results. */
export function __resetSellSpeedCache() {
  cache.clear();
}

export interface SellSpeedBadgeProps {
  make?: string | null;
  model?: string | null;
  stats?: { medianDomDays: number | null | undefined; sample: number | null | undefined } | null;
  className?: string;
}

export function SellSpeedBadge({ make, model, stats, className }: SellSpeedBadgeProps) {
  const { t } = useAppPreferences();
  const fromStats = stats ? sellSpeedFromStats(stats.medianDomDays, stats.sample) : null;
  const [fromComps, setFromComps] = useState<ModelSellSpeed | null>(null);

  useEffect(() => {
    if (stats || !make || !model) return;
    let alive = true;
    void modelSellSpeed(make, model).then((r) => alive && setFromComps(r));
    return () => {
      alive = false;
    };
  }, [make, model, stats]);

  const result = fromStats ?? fromComps;
  if (!result || !result.fast) return null;

  const detail = t(
    "sellFast.detail",
    "Half of the {n} live ads for this model were posted in the last {days} days, so it tends to sell quickly. Based on ad age, not confirmed sales.",
    { n: result.sample, days: Math.max(1, result.medianAgeDays) },
  );

  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary",
        className,
      )}
    >
      <Zap className="h-3 w-3" aria-hidden />
      {t("sellFast.label", "Likely to sell fast")}
      <span className="sr-only">. {detail}</span>
    </span>
  );
}
