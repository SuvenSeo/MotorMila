import { memo, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import { DistrictVelocityPoint } from "@/types/car";
import { LazyMapMount } from "@/components/leaflet/LazyMapMount";
import { MapResizeController } from "@/components/leaflet/MapResizeController";
import "leaflet/dist/leaflet.css";

interface DistrictVelocityMapProps {
  data: DistrictVelocityPoint[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

const SL_BOUNDS: [[number, number], [number, number]] = [[5.7, 79.2], [10.35, 82.15]];
const SL_CENTER: [number, number] = [7.8731, 80.7718];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function lerpColor(from: string, to: string, ratio: number) {
  const s = toRgb(from);
  const e = toRgb(to);
  const t = clamp(ratio, 0, 1);
  return `rgb(${Math.round(s.r + (e.r - s.r) * t)}, ${Math.round(s.g + (e.g - s.g) * t)}, ${Math.round(s.b + (e.b - s.b) * t)})`;
}

function velocityColor(score: number, maxScore: number): string {
  if (maxScore <= 0) return "rgb(55, 65, 81)";
  const ratio = clamp(score / maxScore, 0, 1);
  // cool slate → vivid emerald-teal at high velocity
  if (ratio < 0.5) return lerpColor("#374151", "#14b8a6", ratio * 2);
  return lerpColor("#14b8a6", "#10b981", (ratio - 0.5) * 2);
}

function velocityRadius(listingCount: number, maxCount: number): number {
  if (maxCount <= 0) return 8;
  return clamp(8 + (listingCount / maxCount) * 14, 8, 22);
}

function formatVelocityPct(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

export const DistrictVelocityMap = memo(function DistrictVelocityMap({
  data,
  isLoading,
  isError,
  onRetry,
}: DistrictVelocityMapProps) {
  const points = useMemo(
    () => data.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [data],
  );

  const maxScore = useMemo(
    () => Math.max(0.001, ...points.map((p) => p.velocity_score)),
    [points],
  );
  const maxCount = useMemo(
    () => Math.max(1, ...points.map((p) => p.listing_count)),
    [points],
  );

  const topFive = useMemo(
    () =>
      new Set(
        [...points].sort((a, b) => b.velocity_score - a.velocity_score).slice(0, 5).map((p) => p.district),
      ),
    [points],
  );

  if (isLoading) {
    return (
      <div className="h-[420px] rounded-xl border border-border bg-card overflow-hidden flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-tight text-primary/80">Loading velocity data</p>
        <p className="text-xs text-muted-foreground font-medium">Calculating demand momentum across districts…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Velocity data temporarily unavailable — market API returned an error.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-2xl border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary-bright"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="h-[420px] rounded-xl border border-border bg-surface flex items-center justify-center text-muted-foreground text-sm">
        Velocity data unavailable — listings not yet indexed with district timestamps.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[12px] font-semibold">
        <div className="rounded-2xl border border-border bg-surface px-3 py-1.5 text-foreground transition-colors">
          Color = new listings / total (7-day velocity)
        </div>
        <div className="rounded-2xl border border-border bg-surface px-3 py-1.5 text-foreground transition-colors">
          Size = total volume
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-1.5 text-muted-foreground transition-colors">
          <span>Low</span>
          <div className="h-1.5 w-20 rounded-full bg-gradient-to-r from-[#374151] via-[#14b8a6] to-[#10b981]" />
          <span className="text-emerald-600 dark:text-emerald-400">High</span>
        </div>
      </div>

      <LazyMapMount
        className="overflow-hidden rounded-xl border border-border shadow-soft"
        style={{ height: 420 }}
      >
        <MapContainer
          center={SL_CENTER}
          zoom={7.5}
          minZoom={7}
          maxZoom={12}
          maxBounds={SL_BOUNDS}
          maxBoundsViscosity={0.75}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <MapResizeController bounds={SL_BOUNDS} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            noWrap
          />

          {points.map((point) => {
            const color = velocityColor(point.velocity_score, maxScore);
            const radius = velocityRadius(point.listing_count, maxCount);
            const isTop = topFive.has(point.district);

            return (
              <CircleMarker
                key={point.district}
                center={[point.lat, point.lng]}
                radius={radius}
                pathOptions={{
                  color: isTop ? "#a7f3d0" : color,
                  fillColor: color,
                  weight: isTop ? 2 : 1.3,
                  fillOpacity: 0.72,
                }}
              >
                <Tooltip permanent={isTop} direction="top" offset={[0, -(radius + 2)]}>
                  {point.district}
                </Tooltip>
                <Popup autoPan keepInView autoPanPaddingTopLeft={[24, 84]} autoPanPaddingBottomRight={[24, 24]}>
                  <div className="min-w-[200px] text-sm space-y-1.5">
                    <p className="font-bold text-base">{point.district}</p>
                    <p>Total Listings: <span className="num">{point.listing_count.toLocaleString()}</span></p>
                    <p>New (7d): <span className="num">{point.new_7d_count.toLocaleString()}</span></p>
                    <p>
                      Velocity:{" "}
                      <span className="num font-semibold text-emerald-600">{formatVelocityPct(point.velocity_score)}</span>
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </LazyMapMount>
    </div>
  );
});

DistrictVelocityMap.displayName = "DistrictVelocityMap";
