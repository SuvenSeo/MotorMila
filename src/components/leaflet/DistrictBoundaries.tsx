import { memo, useEffect, useMemo, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { PathOptions } from "leaflet";

/**
 * Real Sri Lanka 25-district boundaries (geoBoundaries gbOpen LKA ADM2,
 * simplified to ~125 KB, public/geo/lk-districts.json). Fetched lazily once
 * per session, only when a map actually mounts. Fails silently — the map
 * still works with its district markers.
 *
 * Licence: ODbL 1.0 (OpenStreetMap / Wambacher via geoBoundaries) — the
 * attribution is attached to the layer so Leaflet shows it.
 */
export const DISTRICT_BOUNDARY_ATTRIBUTION =
  'Boundaries: <a href="https://www.geoboundaries.org/" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (ODbL, © OpenStreetMap contributors)';

type DistrictProps = { name: string; iso?: string | null };
type DistrictCollection = FeatureCollection<Geometry, DistrictProps>;

let cache: Promise<DistrictCollection | null> | null = null;

export function loadDistrictBoundaries(): Promise<DistrictCollection | null> {
  if (!cache) {
    cache = fetch("/geo/lk-districts.json")
      .then((r) => (r.ok ? (r.json() as Promise<DistrictCollection>) : null))
      .catch(() => null)
      .then((d) => {
        if (!d) cache = null; // allow a retry on next mount
        return d;
      });
  }
  return cache;
}

/** Normalise names for matching ("Moneragala" / "Monaragala", case, spaces). */
export function districtKey(name: string | null | undefined): string {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+district$/, "")
    .replace(/[^a-z]/g, "")
    .replace(/^moneragala$/, "monaragala");
}

interface DistrictBoundariesProps {
  /** Fill colour per district name; return null to leave it unfilled. */
  fillFor?: (district: string) => string | null;
  /** District to outline more strongly. */
  highlight?: string | null;
  /** Changes when the colouring changes so the layer restyles. */
  styleKey?: string;
}

export const DistrictBoundaries = memo(function DistrictBoundaries({
  fillFor,
  highlight,
  styleKey = "",
}: DistrictBoundariesProps) {
  const [data, setData] = useState<DistrictCollection | null>(null);

  useEffect(() => {
    let alive = true;
    void loadDistrictBoundaries().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const highlightKey = useMemo(() => (highlight ? districtKey(highlight) : null), [highlight]);

  if (!data) return null;

  const style = (feature?: Feature<Geometry, DistrictProps>): PathOptions => {
    const name = feature?.properties?.name ?? "";
    const fill = fillFor?.(name) ?? null;
    const isHi = highlightKey != null && districtKey(name) === highlightKey;
    return {
      color: isHi ? "hsl(var(--deal-caution))" : "hsl(var(--label-3) / 0.55)",
      weight: isHi ? 2 : 0.8,
      fillColor: fill ?? "transparent",
      fillOpacity: fill ? 0.28 : 0,
      interactive: false,
    };
  };

  return (
    <GeoJSON
      // GeoJSON does not restyle on prop change — remount when colours change.
      key={`${styleKey}|${highlightKey ?? ""}`}
      data={data}
      style={style as (f?: Feature) => PathOptions}
      attribution={DISTRICT_BOUNDARY_ATTRIBUTION}
      interactive={false}
    />
  );
});
