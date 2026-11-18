import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { districtKey } from "@/components/leaflet/DistrictBoundaries";
import { SRI_LANKA_DISTRICT_SHAPES } from "@/components/hero/sriLankaDistrictPaths";
import { formatPrice, getDistrictPrices } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { cn } from "@/lib/utils";
import type { DistrictVelocityPoint } from "@/types/car";

const QUICK_DISTRICTS = ["Colombo", "Gampaha", "Kurunegala", "Kandy", "Galle", "Matara"] as const;
const PIN_LABELS = new Set(["Colombo", "Kandy", "Galle", "Kurunegala", "Jaffna"]);

type TelemetryMapHeroPanelProps = {
  velocityPoints: DistrictVelocityPoint[];
  onFilterDistrict: (district: string) => void;
};

function districtFillToken(medianLkr: number | null, selected: boolean): string {
  if (selected) return "hsl(var(--primary))";
  if (!medianLkr || medianLkr <= 0) return "hsl(var(--foreground) / 0.08)";
  if (medianLkr >= 6_500_000) return "hsl(var(--primary) / 0.62)";
  if (medianLkr >= 4_200_000) return "hsl(var(--primary) / 0.36)";
  return "hsl(var(--primary) / 0.18)";
}

export function TelemetryMapHeroPanel({
  velocityPoints,
  onFilterDistrict,
}: TelemetryMapHeroPanelProps) {
  const [selectedName, setSelectedName] = useState<string>("Colombo");

  const { data: districtPrices = [] } = useQuery({
    queryKey: ["district-prices"],
    queryFn: getDistrictPrices,
    staleTime: QUERY_STALE.market,
  });

  const statsByDistrictKey = useMemo(() => {
    const map = new Map<
      string,
      {
        district: string;
        count: number;
        medianLkr: number | null;
        avgLkr: number | null;
        topLabel: string | null;
        new7d: number | null;
      }
    >();

    for (const row of districtPrices) {
      if (!row.district || row.district.toLowerCase() === "sri lanka") continue;
      const key = districtKey(row.district);
      const prev = map.get(key);
      if (!prev || row.listing_count > prev.count) {
        const topParts = [row.top_make, row.top_model].filter(Boolean).join(" ");
        map.set(key, {
          district: row.district,
          count: row.listing_count,
          medianLkr: row.median_price ?? row.avg_price ?? null,
          avgLkr: row.avg_price ?? null,
          topLabel: topParts || null,
          new7d: prev?.new7d ?? null,
        });
      }
    }

    for (const v of velocityPoints) {
      const key = districtKey(v.district);
      const existing = map.get(key);
      if (existing) {
        existing.new7d = v.new_7d_count;
        if (!existing.count && v.listing_count > 0) existing.count = v.listing_count;
      } else {
        map.set(key, {
          district: v.district,
          count: v.listing_count,
          medianLkr: null,
          avgLkr: null,
          topLabel: null,
          new7d: v.new_7d_count,
        });
      }
    }

    return map;
  }, [districtPrices, velocityPoints]);

  const activeShape = useMemo(
    () =>
      SRI_LANKA_DISTRICT_SHAPES.find((d) => districtKey(d.name) === districtKey(selectedName)) ??
      SRI_LANKA_DISTRICT_SHAPES[0],
    [selectedName],
  );

  const activeStats = statsByDistrictKey.get(districtKey(activeShape.name));
  const districtSlug = activeShape.name.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Major districts">
        {QUICK_DISTRICTS.map((name) => {
          const isOn = districtKey(name) === districtKey(activeShape.name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelectedName(name)}
              aria-pressed={isOn}
              className={cn(
                "rounded-full border px-3 py-1 text-caption font-semibold transition-colors",
                isOn
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-1/80 text-label-2 hover:text-foreground",
              )}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-5 rounded-card border border-border bg-surface-1 p-5 shadow-e3 sm:flex-row sm:items-stretch">
        <div className="mx-auto w-full max-w-[240px] shrink-0">
          <svg
            viewBox="0 0 300 480"
            className="h-auto w-full"
            role="img"
            aria-label="Sri Lanka 25-district vehicle median asking price map"
          >
            {SRI_LANKA_DISTRICT_SHAPES.map((shape) => {
              const key = districtKey(shape.name);
              const stat = statsByDistrictKey.get(key);
              const isSelected = key === districtKey(activeShape.name);
              const fill = districtFillToken(stat?.medianLkr ?? null, isSelected);
              return (
                <path
                  key={shape.name}
                  d={shape.d}
                  fill={fill}
                  stroke={isSelected ? "hsl(var(--foreground))" : "hsl(var(--background) / 0.65)"}
                  strokeWidth={isSelected ? 1.5 : 0.8}
                  className="mm-sl-district"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${shape.name} district`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedName(shape.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedName(shape.name);
                    }
                  }}
                />
              );
            })}

            {SRI_LANKA_DISTRICT_SHAPES.filter((s) => PIN_LABELS.has(s.name)).map((s) => {
              const isSelected = districtKey(s.name) === districtKey(activeShape.name);
              return (
                <circle
                  key={`pin-${s.name}`}
                  cx={s.cx}
                  cy={s.cy}
                  r={isSelected ? 5 : 3}
                  fill={isSelected ? "hsl(var(--deal-good))" : "hsl(var(--foreground))"}
                  className="pointer-events-none"
                />
              );
            })}
          </svg>
        </div>

        <div className="flex w-full flex-1 flex-col justify-between gap-4 rounded-card border border-border bg-surface-2/50 p-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-caps text-primary">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> District Pulse
              </span>
              <span className="h-2 w-2 rounded-full bg-deal-good" aria-hidden />
            </div>
            <h2 className="mt-1.5 font-display text-title2 font-semibold text-foreground">
              {activeShape.name}
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3">
              <div>
                <p className="text-caption text-label-2">Median ask</p>
                <p className="num mt-0.5 text-callout font-semibold text-foreground">
                  {activeStats?.medianLkr ? formatPrice(activeStats.medianLkr) : "—"}
                </p>
              </div>
              <div>
                <p className="text-caption text-label-2">Active ads</p>
                <p className="num mt-0.5 text-callout font-semibold text-foreground">
                  {activeStats?.count ? activeStats.count.toLocaleString() : "—"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-caption text-label-2">Most listed</p>
                <p className="mt-0.5 text-footnote font-semibold text-foreground">
                  {activeStats?.topLabel || "Mixed local stock"}
                </p>
              </div>
              {activeStats?.new7d ? (
                <div className="text-right">
                  <p className="text-caption text-label-2">New (7d)</p>
                  <p className="num mt-0.5 text-footnote font-semibold text-deal-good-text">
                    +{activeStats.new7d.toLocaleString()}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onFilterDistrict(activeShape.name)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-caption font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Browse {activeShape.name} stock <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
            <Link
              to={`/locations/${districtSlug}`}
              className="text-center text-caption font-medium text-label-2 no-underline transition-colors hover:text-primary"
            >
              Open {activeShape.name} market page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
