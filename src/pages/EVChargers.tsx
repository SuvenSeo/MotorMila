import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { ArrowRight, ExternalLink, MapPin, PlugZap, Zap } from "lucide-react";
import { getChargingStations } from "@/services/api";
import type { ChargingStation } from "@/services/api";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { CountValue } from "@/components/ui/stat-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listItem, revealItem } from "@/lib/motion";
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

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={t("ev.chargersEyebrow", "EV charging")}
        eyebrowIcon={PlugZap}
        title={t("ev.chargersTitle", "Public chargers in Sri Lanka.")}
        description={t(
          "ev.chargersDescription",
          "Cached Open Charge Map points for Sri Lanka. This is not live occupancy — confirm a stall before you travel.",
        )}
        stats={[
          {
            label: t("ev.chargersCountLabel", "Stations in radius"),
            // An empty cache is "not loaded yet", not a real zero: never headline "0".
            value: stationsQuery.isPending ? "—" : <CountValue value={count > 0 ? count : null} />,
            hint:
              !stationsQuery.isPending && !(count > 0)
                ? t("ev.chargersCountPendingHint", "Charger map updating")
                : t("ev.chargersCountHint", "{radius} km of {district}", { radius: radiusKm, district }),
          },
          {
            label: t("ev.chargersSourceLabel", "Source"),
            value: t("ev.chargersSourceValue", "Open Charge Map"),
            hint: t("ev.chargersSourceHint", "Weekly cache, Sri Lanka only"),
          },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link to="/ev-hub">
              {t("ev.backToHub", "EV Hub")} <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-8 pt-0 lg:space-y-10 lg:pt-0">
        <m.section variants={revealItem}>
          <Card padding="md" className="flex flex-wrap items-end gap-4">
            <div className="min-w-[12rem] flex-1 sm:flex-none">
              <label htmlFor="ev-district" className="mb-1.5 block text-footnote font-medium text-label-2">
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
            <div className="min-w-[10rem] flex-1 sm:flex-none">
              <label htmlFor="ev-radius" className="mb-1.5 block text-footnote font-medium text-label-2">
                {t("ev.chargersRadius", "Radius")}
              </label>
              <Select value={String(radiusKm)} onValueChange={(value) => updateParam("radius_km", value)}>
                <SelectTrigger id="ev-radius" aria-label={t("ev.chargersRadius", "Radius")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map((km) => (
                    <SelectItem key={km} value={String(km)}>
                      {km} km
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
        </m.section>

        <m.section variants={revealItem}>
          <SectionHeading title={t("ev.chargersNearby", "Nearby stations")} />
          {stationsQuery.isPending ? (
            <div className="grid gap-3" aria-hidden>
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-32" />
              ))}
            </div>
          ) : stationsQuery.isError ? (
            <Card padding="none">
              <ErrorState
                title={t("ev.chargersError", "Chargers didn't load")}
                onRetry={() => void stationsQuery.refetch()}
              />
            </Card>
          ) : stations.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={MapPin}
                title={t("ev.chargersEmpty", "No cached chargers in this radius")}
                body={t(
                  "ev.chargersEmptyHint",
                  "We refresh the Sri Lanka charger map from Open Charge Map every week, and this area has no points yet. Try a wider radius, or check back soon.",
                )}
                actionLabel={nextRadius ? t("ev.chargersWiden", "Widen to {km} km", { km: nextRadius }) : undefined}
                onAction={nextRadius ? () => updateParam("radius_km", String(nextRadius)) : undefined}
              />
            </Card>
          ) : (
            <ul key={`${district}-${radiusKm}`} className="content-in grid gap-3">
              {stations.map((station, i) => {
                const connectors = connectorLabel(station) || t("ev.chargersConnectorUnlisted", "Connector type unlisted");
                return (
                  <m.li key={station.ocm_id} variants={listItem} custom={i} initial="hidden" animate="show" className="list-none">
                    <Card padding="md">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-callout font-semibold text-foreground">
                            {station.name || t("ev.chargersUnnamed", "Unnamed station")}
                          </p>
                          <p className="mt-1 text-footnote text-label-2">
                            {[station.operator, station.address || station.town].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Badge variant="neutral" className="tabular-nums">
                          {station.distance_km.toFixed(1)} km
                        </Badge>
                      </div>
                      <p className="mt-3 inline-flex items-center gap-1.5 text-footnote text-foreground">
                        <Zap aria-hidden className="h-4 w-4 text-primary" />
                        {connectors}
                      </p>
                      {station.status ? <p className="mt-1 text-caption text-label-2">{station.status}</p> : null}
                      <Button asChild variant="tertiary" size="sm" className="-ml-3 mt-3">
                        <a href={osmStationUrl(station.lat, station.lng)} target="_blank" rel="noopener noreferrer">
                          {t("ev.chargersOpenMap", "Open in OpenStreetMap")}
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    </Card>
                  </m.li>
                );
              })}
            </ul>
          )}
        </m.section>

        <p className="text-caption text-label-2">
          {limitation} {attribution}
        </p>
      </PageBody>
    </PageCanvas>
  );
}
