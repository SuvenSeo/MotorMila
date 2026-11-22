/**
 * Report studio assembly: one place that turns a desk scope into the export
 * payload. Scope names are product words ("Area profile"), the payload keeps
 * them in `filters` so a reader always knows what they are holding.
 */

import { customizeProReport } from "@/lib/proReportCustomize";
import {
  detailReport,
  districtsTableReport,
  lanesTableReport,
  marketReport,
  sourceReport,
} from "@/lib/proReportBuilders";
import { getProDistrictDetail, getProVehicleLaneDetail } from "@/services/api";
import type {
  ProDistrictProfile,
  ProMarketSnapshot,
  ProReportOptions,
  ProReportPayload,
  ProVehicleLane,
} from "@/types/pro";

export type ReportScope = "market" | "vehicle" | "district" | "source" | "lanes_table" | "districts_table";

export const REPORT_SCOPE_LABELS: Record<ReportScope, string> = {
  market: "Market summary",
  vehicle: "Vehicle lane",
  district: "Area profile",
  source: "Source quality",
  lanes_table: "Vehicle table",
  districts_table: "Area table",
};

export type StudioOptions = {
  scope: ReportScope;
  snapshot: ProMarketSnapshot | null;
  lanes: ProVehicleLane[];
  districts: ProDistrictProfile[];
  /** `make|||model` for the vehicle scope. */
  vehicleKey?: string;
  district?: string;
  source?: string;
  themeLabel?: string;
  listingLimit?: number;
  overrides?: ProReportOptions;
};

async function buildBase(options: StudioOptions): Promise<{ report: ProReportPayload; target: string }> {
  const { scope, snapshot, lanes, districts } = options;
  if (scope === "vehicle") {
    const [make, model] = (options.vehicleKey ?? "").split("|||");
    if (!make || !model) throw new Error("Choose a vehicle lane before building this report.");
    const detail = await getProVehicleLaneDetail({ make, model });
    return { report: detailReport(detail), target: `${make} ${model}` };
  }
  if (scope === "district") {
    if (!options.district) throw new Error("Choose an area before building this report.");
    const detail = await getProDistrictDetail(options.district);
    return { report: detailReport(detail), target: options.district };
  }
  if (scope === "source") {
    if (!snapshot) throw new Error("Source coverage is still loading.");
    const row = snapshot.source_coverage.find((item) => item.label === options.source) ?? snapshot.source_coverage[0];
    if (!row) throw new Error("Choose a source before building this report.");
    return { report: sourceReport(snapshot, row), target: row.label };
  }
  if (scope === "lanes_table") {
    return { report: lanesTableReport(lanes), target: `${lanes.length} vehicle rows` };
  }
  if (scope === "districts_table") {
    return { report: districtsTableReport(districts), target: `${districts.length} area rows` };
  }
  if (!snapshot) throw new Error("The market snapshot is still loading.");
  return { report: marketReport(snapshot, lanes, districts), target: "Full market" };
}

/** Full studio build: base payload, scope metadata, then the reader's overrides. */
export async function customizedReport(options: StudioOptions): Promise<ProReportPayload> {
  const { report, target } = await buildBase(options);
  const scopeLabel = REPORT_SCOPE_LABELS[options.scope];
  return customizeProReport(
    {
      ...report,
      filters: {
        ...report.filters,
        scope: scopeLabel,
        target,
        theme: options.themeLabel ?? "Executive dark",
        listing_limit: options.listingLimit ?? 12,
      },
    },
    {
      ...options.overrides,
      listingLimit: options.listingLimit ?? options.overrides?.listingLimit,
      coverSummary:
        options.overrides?.coverSummary ||
        options.overrides?.notes ||
        report.coverSummary ||
        `${scopeLabel} prepared from the current Motormila Pro desk.`,
    },
  );
}

/** Synchronous payloads for the quick packs (no remote detail fetch). */
export function packReport(
  scope: Extract<ReportScope, "market" | "lanes_table" | "districts_table">,
  snapshot: ProMarketSnapshot | null,
  lanes: ProVehicleLane[],
  districts: ProDistrictProfile[],
  listingLimit = 12,
): ProReportPayload | null {
  if (scope === "lanes_table") return customizeProReport(lanesTableReport(lanes), { listingLimit });
  if (scope === "districts_table") return customizeProReport(districtsTableReport(districts), { listingLimit });
  if (!snapshot) return null;
  return customizeProReport(marketReport(snapshot, lanes, districts), { listingLimit });
}
