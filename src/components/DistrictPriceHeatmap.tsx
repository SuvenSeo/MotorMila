import { memo, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import { DistrictPrice } from "@/types/car";
import { LazyMapMount } from "@/components/leaflet/LazyMapMount";
import { MapResizeController } from "@/components/leaflet/MapResizeController";
import { formatPriceLkrMillions } from "@/lib/formatting";
import "leaflet/dist/leaflet.css";

interface DistrictPriceHeatmapProps {
  data: DistrictPrice[];
  highlightDistrict?: string;
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

/** Map price ratio (0–1) to a cool-blue → warm-amber gradient. */
function priceColor(price: number, minPrice: number, maxPrice: number): string {
  if (maxPrice <= minPrice) return "rgb(99, 102, 241)";
  const ratio = clamp((price - minPrice) / (maxPrice - minPrice), 0, 1);
  if (ratio < 0.5) return lerpColor("#4f46e5", "#14b8a6", ratio * 2);
  return lerpColor("#14b8a6", "#f59e0b", (ratio - 0.5) * 2);
}

function priceRadius(price: number, minPrice: number, maxPrice: number): number {
  if (maxPrice <= minPrice) return 10;
  const ratio = clamp((price - minPrice) / (maxPrice - minPrice), 0, 1);
  return clamp(8 + ratio * 14, 8, 22);
}

export const DistrictPriceHeatmap = memo(function DistrictPriceHeatmap({
  data,
  highlightDistrict,
  isLoading,
  isError,
  onRetry,
}: DistrictPriceHeatmapProps) {
  const points = useMemo(
    () => data.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.avg_price > 0),
    [data],
  );

  const prices = useMemo(() => points.map((p) => p.median_price ?? p.avg_price), [points]);
  const minPrice = useMemo(() => Math.min(...prices), [prices]);
  const maxPrice = useMemo(() => Math.max(...prices), [prices]);

  const highlightKey = highlightDistrict?.trim().toLowerCase();

  if (isLoading) {
    return (
      <div className="h-[420px] rounded-xl border border-border bg-card overflow-hidden flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-tight text-primary/80">Loading price map</p>
        <p className="text-xs text-muted-foreground font-medium">Mapping district price levels…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 text-center">
        <p className="text-sm text-muted-foreground">
          District price data temporarily unavailable.
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
        District price data unavailable — no priced listings indexed yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[12px] font-semibold">
        <div className="rounded-2xl border border-border bg-surface px-3 py-1.5 text-foreground">
          Color = avg district price
        </div>
        <div className="rounded-2xl border border-border bg-surface px-3 py-1.5 text-foreground">
          Size = relative price level
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-1.5 text-muted-foreground">
          <span className="text-indigo-500 dark:text-indigo-400">Low</span>
          <div className="h-1.5 w-20 rounded-full bg-gradient-to-r from-[#4f46e5] via-[#14b8a6] to-[#f59e0b]" />
          <span className="text-amber-500">High</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
        <span className="num">Min: {formatPriceLkrMillions(minPrice)}</span>
        <span className="num">Max: {formatPriceLkrMillions(maxPrice)}</span>
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
            const displayPrice = point.median_price ?? point.avg_price;
            const color = priceColor(displayPrice, minPrice, maxPrice);
            const radius = priceRadius(displayPrice, minPrice, maxPrice);
            const isHighlighted =
              highlightKey != null &&
              point.district.toLowerCase() === highlightKey;

            return (
              <CircleMarker
                key={point.district}
                center={[point.lat, point.lng]}
                radius={radius}
                pathOptions={{
                  color: isHighlighted ? "#fbbf24" : color,
                  fillColor: color,
                  weight: isHighlighted ? 2.5 : 1.3,
                  fillOpacity: 0.75,
                }}
              >
                <Tooltip permanent={isHighlighted} direction="top" offset={[0, -(radius + 2)]}>
                  {point.district}
                </Tooltip>
                <Popup autoPan keepInView autoPanPaddingTopLeft={[24, 84]} autoPanPaddingBottomRight={[24, 24]}>
                  <div className="min-w-[200px] text-sm space-y-1.5">
                    <p className="font-bold text-base">{point.district}</p>
                    <p>Listings: <span className="num">{point.listing_count.toLocaleString()}</span></p>
                    {point.median_price != null && (
                      <p>
                        Median:{" "}
                        <span className="num font-semibold">
                          {formatPriceLkrMillions(point.median_price)}
                        </span>
                      </p>
                    )}
                    <p>
                      Avg:{" "}
                      <span className="num font-semibold">
                        {formatPriceLkrMillions(point.avg_price)}
                      </span>
                    </p>
                    {point.top_make && point.top_model && (
                      <p className="text-muted-foreground text-xs">
                        Top: {point.top_make} {point.top_model}
                        {point.top_model_count != null ? ` (${point.top_model_count})` : ""}
                      </p>
                    )}
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

DistrictPriceHeatmap.displayName = "DistrictPriceHeatmap";
