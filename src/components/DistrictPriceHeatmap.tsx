import { memo, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, Tooltip } from "react-leaflet";
import { DistrictPrice } from "@/types/car";
import { LazyMapMount } from "@/components/leaflet/LazyMapMount";
import { MapResizeController } from "@/components/leaflet/MapResizeController";
import { DistrictBoundaries, districtKey } from "@/components/leaflet/DistrictBoundaries";
import { formatPriceLkrMillions } from "@/lib/formatting";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

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

type Rgb = [number, number, number];

/** Read an HSL triplet token ("211 100% 45%") from :root and convert to RGB. */
function tokenRgb(name: string, fallback: Rgb): Rgb {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = raw.match(/^(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return fallback;
  const h = Number(m[1]) / 360;
  const sat = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (sat === 0) return [l * 255, l * 255, l * 255].map(Math.round) as Rgb;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const hue = (tt: number) => {
    let x = tt;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255)) as Rgb;
}

function lerpRgb(from: Rgb, to: Rgb, ratio: number) {
  const t = clamp(ratio, 0, 1);
  return `rgb(${Math.round(from[0] + (to[0] - from[0]) * t)}, ${Math.round(from[1] + (to[1] - from[1]) * t)}, ${Math.round(from[2] + (to[2] - from[2]) * t)})`;
}

type Scale = { low: Rgb; mid: Rgb; high: Rgb };

/** Price scale from semantic tokens: low = primary, middle = deal-fair, high = deal-caution. */
function useTokenScale(theme: string): Scale {
  return useMemo(
    () => ({
      low: tokenRgb("--primary", [0, 103, 230]),
      mid: tokenRgb("--deal-fair", [84, 99, 120]),
      high: tokenRgb("--deal-caution", [245, 159, 10]),
    }),
    // Re-read the tokens when the theme flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
}

/** Map price ratio (0–1) onto the token scale. */
function priceColor(price: number, minPrice: number, maxPrice: number, scale: Scale): string {
  if (maxPrice <= minPrice) return lerpRgb(scale.low, scale.low, 0);
  const ratio = clamp((price - minPrice) / (maxPrice - minPrice), 0, 1);
  if (ratio < 0.5) return lerpRgb(scale.low, scale.mid, ratio * 2);
  return lerpRgb(scale.mid, scale.high, (ratio - 0.5) * 2);
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
  const { t, resolvedTheme } = useAppPreferences();
  const scale = useTokenScale(resolvedTheme);
  const points = useMemo(
    () => data.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.avg_price > 0),
    [data],
  );
  const prices = useMemo(() => points.map((p) => p.median_price ?? p.avg_price), [points]);
  const minPrice = useMemo(() => Math.min(...prices), [prices]);
  const maxPrice = useMemo(() => Math.max(...prices), [prices]);
  const highlightKey = highlightDistrict?.trim().toLowerCase();

  // Choropleth fill from the same price scale as the markers.
  const fillByDistrict = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of points) m.set(districtKey(p.district), priceColor(p.median_price ?? p.avg_price, minPrice, maxPrice, scale));
    return m;
  }, [points, minPrice, maxPrice, scale]);
  const styleKey = useMemo(() => Array.from(fillByDistrict.entries()).map((e) => e.join(":")).join(","), [fillByDistrict]);
  const highlightStroke = useMemo(() => lerpRgb(scale.high, scale.high, 0), [scale]);

  if (isLoading) {
    return (
      <div role="status" className="relative">
        <Skeleton className="h-[420px]" />
        <span className="sr-only">{t("districtMap.loading", "Loading price map")}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <Card padding="none" className="flex h-[420px] items-center justify-center">
        <ErrorState
          title={t("districtMap.error", "District price data temporarily unavailable.")}
          onRetry={onRetry}
          retryLabel={t("common.retry", "Retry")}
        />
      </Card>
    );
  }

  if (!points.length) {
    return (
      <Card padding="none" className="flex h-[420px] items-center justify-center">
        <EmptyState
          icon={MapPin}
          title={t("districtMap.emptyTitle", "No district prices yet")}
          body={t("districtMap.empty", "District price data unavailable — no priced listings indexed yet.")}
        />
      </Card>
    );
  }

  const gradient = `linear-gradient(to right, ${lerpRgb(scale.low, scale.low, 0)}, ${lerpRgb(scale.mid, scale.mid, 0)}, ${lerpRgb(scale.high, scale.high, 0)})`;

  return (
    <div className="content-in space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{t("districtMap.colorKey", "Color = avg district price")}</Badge>
        <Badge variant="neutral">{t("districtMap.sizeKey", "Size = relative price level")}</Badge>
        <Badge variant="neutral" className="gap-2">
          <span>{t("districtMap.low", "Low")}</span>
          <span aria-hidden className="h-1.5 w-16 rounded-full" style={{ backgroundImage: gradient }} />
          <span>{t("districtMap.high", "High")}</span>
        </Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption font-semibold tabular-nums text-label-2">
        <span>{t("districtMap.min", "Min: {price}", { price: formatPriceLkrMillions(minPrice) })}</span>
        <span>{t("districtMap.max", "Max: {price}", { price: formatPriceLkrMillions(maxPrice) })}</span>
      </div>

      <LazyMapMount
        className="overflow-hidden rounded-card border border-border shadow-e1"
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
          style={{ height: "100%", width: "100%", background: "hsl(var(--surface-2))" }}
        >
          <MapResizeController bounds={SL_BOUNDS} />
          {/* No raster basemap: CARTO basemaps now return "API KEY REQUIRED" tiles
              without a key. The district boundaries layer is the map. */}
          <DistrictBoundaries
            fillFor={(name) => fillByDistrict.get(districtKey(name)) ?? null}
            highlight={highlightDistrict}
            styleKey={styleKey}
          />

          {points.map((point) => {
            const displayPrice = point.median_price ?? point.avg_price;
            const color = priceColor(displayPrice, minPrice, maxPrice, scale);
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
                  color: isHighlighted ? highlightStroke : color,
                  fillColor: color,
                  weight: isHighlighted ? 2.5 : 1.3,
                  fillOpacity: 0.75,
                }}
              >
                <Tooltip permanent={isHighlighted} direction="top" offset={[0, -(radius + 2)]}>
                  {point.district}
                </Tooltip>
                <Popup autoPan keepInView autoPanPaddingTopLeft={[24, 84]} autoPanPaddingBottomRight={[24, 24]}>
                  <div className="min-w-[200px] space-y-1.5 text-footnote">
                    <p className="text-body font-semibold">{point.district}</p>
                    <p>{t("districtMap.listings", "Listings")}: <span className="tabular-nums">{point.listing_count.toLocaleString()}</span></p>
                    {point.median_price != null && (
                      <p>
                        {t("districtMap.median", "Median")}:{" "}
                        <span className="font-semibold tabular-nums">
                          {formatPriceLkrMillions(point.median_price)}
                        </span>
                      </p>
                    )}
                    <p>
                      {t("districtMap.avg", "Avg")}:{" "}
                      <span className="font-semibold tabular-nums">
                        {formatPriceLkrMillions(point.avg_price)}
                      </span>
                    </p>
                    {point.top_make && point.top_model && (
                      <p className="text-caption text-label-2">
                        {t("districtMap.top", "Top")}: {point.top_make} {point.top_model}
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
