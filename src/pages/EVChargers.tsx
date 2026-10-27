import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { ArrowRight, ExternalLink, MapPin, Zap } from "lucide-react";
import { getChargingStations } from "@/services/api";
import type { ChargingStation } from "@/services/api";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { CineHeader } from "@/components/CineHeader";
import { CineSection } from "@/components/CineSection";
import { SegmentedControl } from "@/components/ui/segmented-control";
import "@/styles/cinematic-pages.css";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listItem } from "@/lib/motion";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { SRI_LANKA_DISTRICTS, SL_DISTRICT_COORDS, districtCoords, normalizeDistrictName } from "@/data/districts";

const DEFAULT_DISTRICT = "Colombo";
const RADIUS_OPTIONS = [10, 25, 50, 100] as const;

function osmStationUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

function connectorLabel(station: ChargingStation): string {
  const parts = (station.connectors || [])
    .map((connector) => {
      const type = connector.type ? String(connector.type) : "";
      const power = connector.power_kw != null ? `${connector.power_kw} kW` : "";
      return [type, power].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  if (parts.length) return parts.join(" · ");
  if (station.power_kw != null) return `${station.power_kw} kW`;
  return "";
}

/**
 * Schematic radius plot: the district centre, rings at half and full radius,
 * and each cached station placed at its real offset (equirectangular, good
 * enough at district scale). Not a street map: it shows spread, not roads.
 */
function RadiusPlot({ center, radiusKm, stations, label }: { center: { lat: number; lng: number }; radiusKm: number; stations: ChargingStation[]; label: string }) {
  const R = 44;
  const kmPerLng = 111.32 * Math.cos((center.lat * Math.PI) / 180);
  const points = stations
    .map((st) => {
      const dx = (st.lng - center.lng) * kmPerLng;
      const dy = (st.lat - center.lat) * 110.57;
      const d = Math.hypot(dx, dy);
      const k = d > radiusKm ? radiusKm / d : 1;
      return { id: st.ocm_id, x: 50 + (dx * k * R) / radiusKm, y: 50 - (dy * k * R) / radiusKm };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return (
    <svg viewBox="0 0 100 100" className="cine-radar" role="img" aria-label={label}>
      <line x1="50" y1="2" x2="50" y2="98" className="cine-radar__axis" />
      <line x1="2" y1="50" x2="98" y2="50" className="cine-radar__axis" />
      <circle cx="50" cy="50" r={R / 2} className="cine-radar__ring" />
      <circle cx="50" cy="50" r={R} className="cine-radar__ring cine-radar__ring--edge" />
      <text x="50" y={50 - R - 1.5} textAnchor="middle" fontSize="3.2" fill="hsl(0 0% 100% / 0.55)">{radiusKm} km</text>
      <g className="cine-radar__dots">
        {points.map((p) => (
          <circle key={p.id} cx={p.x} cy={p.y} r="1.9" className="cine-radar__dot" />
        ))}
      </g>
      <circle cx="50" cy="50" r="1.4" className="cine-radar__center" />
    </svg>
  );
}

export default function EVChargers() {
  const { t } = useAppPreferences();
  const [params, setParams] = useSearchParams();
  const requestedDistrict = params.get("district") || DEFAULT_DISTRICT;
  const normalizedDistrict = normalizeDistrictName(requestedDistrict);
  const district =
    normalizedDistrict && SRI_LANKA_DISTRICTS.includes(normalizedDistrict)
      ? normalizedDistrict
      : DEFAULT_DISTRICT;
  const radiusRaw = Number(params.get("radius_km"));
  const radiusKm = (RADIUS_OPTIONS as readonly number[]).includes(radiusRaw) ? radiusRaw : 25;
  const center = districtCoords(district) ?? SL_DISTRICT_COORDS[DEFAULT_DISTRICT];

  const stationsQuery = useQuery({
    queryKey: ["ev-charging-stations", center.lat, center.lng, radiusKm],
    queryFn: () => getChargingStations({ lat: center.lat, lng: center.lng, radius_km: radiusKm }),
    staleTime: QUERY_STALE.market,
  });

  const stations = stationsQuery.data?.stations ?? [];
  const attribution =
    stationsQuery.data?.attribution || "Data © Open Charge Map contributors and original data providers.";
  const limitation =
    stationsQuery.data?.limitation ||
    "Cached Sri Lanka Open Charge Map points. Status may be stale; confirm before you travel.";

  const districtOptions = useMemo(
    () => SRI_LANKA_DISTRICTS.filter((name) => Boolean(SL_DISTRICT_COORDS[name])),
    [],
  );

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const count = stationsQuery.data?.count ?? stations.length;
  const nextRadius = RADIUS_OPTIONS.find((km) => km > radiusKm);

  const hasCount = !stationsQuery.isPending && count > 0;
  // Loaded, no error, nothing cached here: one empty state, on the panel.
  const emptyHere = !stationsQuery.isPending && !stationsQuery.isError && stations.length === 0;

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("ev.chargersEyebrow", "EV charging")}
        lead={t("ev.cine.chargersLead", "Public chargers")}
        accent={t("ev.cine.chargersAccent", "in Sri Lanka.")}
        body={t(
          "ev.chargersDescription",
          "Cached Open Charge Map points for Sri Lanka. This is not live occupancy — confirm a stall before you travel.",
        )}
      >
        <Button asChild variant="secondary">
          <Link to="/ev-hub">
            {t("ev.backToHub", "EV Hub")} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CineHeader>

      <PageBody className="space-y-12 pt-8 lg:space-y-14 lg:pt-12">
        {/* Dark map panel: the controls live on it, beside the radius plot. */}
        <section className="cine-panel theme-dark grid gap-8 p-5 text-foreground sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-center" aria-label={t("ev.chargersRadius", "Radius")}>
          <div className="min-w-0 space-y-6">
            <div aria-live="polite">
              {hasCount ? (
                <>
                  <p className="cine-eyebrow text-white/60">{t("ev.chargersCountLabel", "Stations in radius")}</p>
                  <p className="cine-display mt-3 text-[clamp(2.25rem,1.8rem+2vw,3.25rem)] leading-none tabular-nums text-white">{count.toLocaleString("en-US")}</p>
                  <p className="mt-2 text-footnote text-white/65">{t("ev.chargersCountHint", "{radius} km of {district}", { radius: radiusKm, district })}</p>
                </>
              ) : (
                <p className="cine-eyebrow text-white/60">{t("ev.chargersCountHint", "{radius} km of {district}", { radius: radiusKm, district })}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-1 xl:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="ev-district" className="mb-1.5 block text-footnote font-medium text-white/70">
                  {t("common.district", "District")}
                </label>
                <Select value={district} onValueChange={(value) => updateParam("district", value)}>
                  <SelectTrigger id="ev-district" aria-label={t("common.district", "District")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {districtOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <p id="ev-radius-label" className="mb-1.5 block text-footnote font-medium text-white/70">
                  {t("ev.chargersRadius", "Radius")}
                </p>
                <SegmentedControl
                  semantics="radio"
                  value={String(radiusKm)}
                  onValueChange={(value) => updateParam("radius_km", value)}
                  aria-label={t("ev.chargersRadius", "Radius")}
                  options={RADIUS_OPTIONS.map((km) => ({ value: String(km), label: `${km} km` }))}
                />
              </div>
            </div>
            {emptyHere ? (
              <div className="border-t border-border pt-5">
                <p className="flex items-center gap-2 text-callout font-semibold text-white">
                  <MapPin aria-hidden className="h-4 w-4 text-white/70" />
                  {t("ev.chargersEmpty", "No cached chargers in this radius")}
                </p>
                <p className="mt-1.5 max-w-lg text-footnote text-white/65">
                  {t(
                    "ev.chargersEmptyHint",
                    "We refresh the Sri Lanka charger map from Open Charge Map every week, and this area has no points yet. Try a wider radius, or check back soon.",
                  )}
                </p>
                {nextRadius ? (
                  <Button type="button" className="mt-4" onClick={() => updateParam("radius_km", String(nextRadius))}>
                    {t("ev.chargersWiden", "Widen to {km} km", { km: nextRadius })}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <p className="text-caption text-white/55">
              {t("ev.chargersSourceValue", "Open Charge Map")} · {t("ev.chargersSourceHint", "Weekly cache, Sri Lanka only")}
            </p>
          </div>
          <div className="mx-auto w-full max-w-[16rem] lg:max-w-[20rem]">
            <RadiusPlot
              center={center}
              radiusKm={radiusKm}
              stations={stationsQuery.isPending ? [] : stations}
              label={t("ev.cine.plotLabel", "Stations plotted around {district}, within {radius} km", { district, radius: radiusKm })}
            />
          </div>
        </section>

        {emptyHere ? null : (
        <CineSection index="01" title={t("ev.chargersNearby", "Nearby stations")}>
          {stationsQuery.isPending ? (
            <div className="grid gap-3" aria-hidden>
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
          ) : stationsQuery.isError ? (
            <Card padding="none">
              <ErrorState
                title={t("ev.chargersError", "Chargers didn't load")}
                onRetry={() => void stationsQuery.refetch()}
              />
            </Card>
          ) : (
            <ul key={`${district}-${radiusKm}`} className="cine-list content-in border-y border-border">
              {stations.map((station, i) => {
                const connectors = connectorLabel(station) || t("ev.chargersConnectorUnlisted", "Connector type unlisted");
                return (
                  <m.li key={station.ocm_id} variants={listItem} custom={i} initial="hidden" animate="show" className="list-none">
                    <div className="flex flex-col gap-3 px-1 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <span className="w-14 shrink-0 font-display text-callout font-semibold tabular-nums text-foreground">
                          {station.distance_km.toFixed(1)}
                          <span className="ml-0.5 text-caption font-normal text-label-2">km</span>
                        </span>
                        <div className="min-w-0">
                          <p className="text-callout font-semibold text-foreground">
                            {station.name || t("ev.chargersUnnamed", "Unnamed station")}
                          </p>
                          {[station.operator, station.address || station.town].filter(Boolean).length ? (
                            <p className="mt-0.5 text-footnote text-label-2">
                              {[station.operator, station.address || station.town].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                          <p className="mt-2 inline-flex items-center gap-1.5 text-footnote text-foreground">
                            <Zap aria-hidden className="h-4 w-4 text-primary" />
                            {connectors}
                          </p>
                          {station.status ? <p className="mt-1 text-caption text-label-2">{station.status}</p> : null}
                        </div>
                      </div>
                      <Button asChild variant="tertiary" size="sm" className="ml-[4.5rem] self-start sm:ml-0">
                        <a href={osmStationUrl(station.lat, station.lng)} target="_blank" rel="noopener noreferrer">
                          {t("ev.chargersOpenMap", "Open in OpenStreetMap")}
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    </div>
                  </m.li>
                );
              })}
            </ul>
          )}
        </CineSection>
        )}

        <p className="text-caption text-label-2">
          {limitation} {attribution}
        </p>
      </PageBody>
    </PageCanvas>
  );
}
