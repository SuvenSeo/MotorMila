import BarList from "@tremor/react/dist/components/vis-elements/BarList/BarList.js";
import { useQuery } from "@tanstack/react-query";
import { getDistrictVelocity } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";

/**
 * District sales-velocity breakdown — Tremor BarList (its exact design case),
 * wired to the real district-velocity API. Deep import keeps recharts out of
 * the main chunk.
 */
export function DistrictVelocityList() {
  const { t } = useAppPreferences();
  const { data, isLoading } = useQuery({
    queryKey: ["district-velocity-list"],
    queryFn: getDistrictVelocity,
    staleTime: QUERY_STALE.hub,
  });

  const rows = [...(data?.points ?? [])]
    .sort((a, b) => Number(b.listing_count || 0) - Number(a.listing_count || 0))
    .slice(0, 8)
    .map((p) => ({ name: p.district, value: Number(p.listing_count || 0) }));

  if (!isLoading && rows.length === 0) return null;

  return (
    <div className="apex rounded-2xl border border-border bg-card p-6 shadow-soft">
      <p className="text-[12px] font-semibold text-muted-foreground">
        {t("districtVelocity.eyebrow", "Market pulse")}
      </p>
      <h3 className="mt-1 font-display text-xl font-semibold text-foreground">
        {t("districtVelocity.title", "District sales velocity")}
      </h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t("districtVelocity.sub", "Active listings · top 8 districts")}
      </p>
      {isLoading ? (
        <div className="mt-6 space-y-2.5" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : (
        <BarList
          className="mt-6"
          data={rows}
          color="blue"
          valueFormatter={(v: number) =>
            t("districtVelocity.listings", "{count} listings", { count: v })
          }
        />
      )}
    </div>
  );
}
