/**
 * Guards against scrape artifacts in engine capacity.
 *
 * We observed listings whose manufacture year had leaked into the engine-cc
 * field (e.g. a 2016 car showing "2,016 cc"). A recorded capacity that equals
 * the listing's manufacture year (or is otherwise implausible) is treated as
 * unknown so we never compute import duty on garbage data.
 */
export function plausibleEngineCc(
  engineCc: unknown,
  year: unknown,
): number | undefined {
  if (typeof engineCc !== "number" || !Number.isFinite(engineCc)) return undefined;
  if (engineCc < 300 || engineCc > 8000) return undefined;
  if (typeof year === "number" && engineCc === year) return undefined;
  return engineCc;
}
