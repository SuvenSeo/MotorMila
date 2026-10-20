import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink, MapPin, PlugZap, Zap } from "lucide-react";
import { getChargingStations } from "@/services/api";
import type { ChargingStation } from "@/services/api";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { revealItem } from "@/lib/motion";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { visuals } from "@/lib/visualAssets";
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
  return "Connector type unlisted";
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

  return (
    <PageCanvas ambient="subtle">
      <PageHero
        theme="ev"
        eyebrow={t("ev.chargersEyebrow", "EV charging")}
        eyebrowIcon={PlugZap}
        watermarkIcon={Zap}
        title={<>{t("ev.chargersTitle", "Public chargers in Sri Lanka.")}</>}
        description={t(
          "ev.chargersDescription",
          "Cached Open Charge Map points for Sri Lanka. This is not live occupancy — confirm a stall before you travel.",
        )}
        media={visuals.alt2HeroUltrawidePanorama}
        mediaPosition="center 45%"
        mediaTone="brand"
        highlights={[
          {
            label: t("ev.chargersCountLabel", "Stations in radius"),
            value: stationsQuery.isPending ? "…" : String(stationsQuery.data?.count ?? 0),
            hint: t("ev.chargersCountHint", "{radius} km of {district}", {
              radius: radiusKm,
              district,
            }),
          },
          {
            label: t("ev.chargersSourceLabel", "Source"),
            value: t("ev.chargersSourceValue", "Open Charge Map"),
            hint: t("ev.chargersSourceHint", "Weekly cache, Sri Lanka only"),
          },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link to="/ev-hub">
              {t("ev.backToHub", "EV Hub")} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-10 lg:space-y-14">
        <motion.section variants={revealItem} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[12rem]">
            <p className="mb-2 text-[12px] font-semibold text-muted-foreground">
              {t("common.district", "District")}
            </p>
            <Select value={district} onValueChange={(value) => updateParam("district", value)}>
              <SelectTrigger aria-label={t("common.district", "District")}>
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
          <div className="min-w-[10rem]">
            <p className="mb-2 text-[12px] font-semibold text-muted-foreground">
              {t("ev.chargersRadius", "Radius")}
            </p>
            <Select value={String(radiusKm)} onValueChange={(value) => updateParam("radius_km", value)}>
              <SelectTrigger aria-label={t("ev.chargersRadius", "Radius")}>
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
        </motion.section>

        <motion.section variants={revealItem}>
          <SectionHeader title={t("ev.chargersNearby", "Nearby stations")} className="mb-6" />
          {stationsQuery.isPending ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="data-card h-28 animate-pulse p-5" />
              ))}
            </div>
          ) : stations.length === 0 ? (
            <div className="data-card p-8 text-center">
              <MapPin className="mx-auto mb-3 h-5 w-5 text-muted-foreground/50" aria-hidden />
              <p className="text-[14px] font-semibold text-foreground">
                {t("ev.chargersEmpty", "No cached chargers in this radius")}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[13px] text-muted-foreground">
                {t(
                  "ev.chargersEmptyHint",
                  "The Sri Lanka Open Charge Map cache is empty or this district has no points yet. Widen the radius, or ask an admin to refresh the cache.",
                )}
              </p>
            </div>
          ) : (
            <ul className="grid gap-3">
              {stations.map((station) => (
                <li key={station.ocm_id} className="data-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-foreground">
                        {station.name || t("ev.chargersUnnamed", "Unnamed station")}
                      </p>
                      <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                        {[station.operator, station.address || station.town].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="num shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-foreground">
                      {station.distance_km.toFixed(1)} km
                    </span>
                  </div>
                  <p className="mt-3 text-[12px] font-medium text-foreground">{connectorLabel(station)}</p>
                  {station.status ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{station.status}</p>
                  ) : null}
                  <a
                    href={osmStationUrl(station.lat, station.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary no-underline hover:underline"
                  >
                    {t("ev.chargersOpenMap", "Open in OpenStreetMap")}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        <p className="text-[12px] font-medium leading-relaxed text-muted-foreground">
          {limitation} {attribution}
        </p>
      </PageBody>
    </PageCanvas>
  );
}
