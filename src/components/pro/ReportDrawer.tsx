import { useMemo, useState } from "react";
import { Download, FileBarChart, FileSpreadsheet, Palette, Settings2, TableProperties } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ExportMenu } from "@/components/pro/ExportMenu";
import { customizedReport, packReport, type ReportScope } from "@/lib/proReportStudio";
import { useAppPreferences } from "@/lib/appPreferences";
import type { ProExportFormat, ProReportSectionId, ProReportTheme } from "@/types/pro";
import type { ProDistrictProfile, ProMarketSnapshot, ProVehicleLane } from "@/types/pro";

const REPORT_SECTION_OPTIONS: Array<{ id: ProReportSectionId; label: string; detail: string }> = [
  { id: "metrics", label: "KPI cards", detail: "Hero metrics and summary indicators" },
  { id: "breakdowns", label: "Mix analysis", detail: "Source and area coverage tables" },
  { id: "trends", label: "Trend points", detail: "Monthly price history where available" },
  { id: "listings", label: "Sample listings", detail: "Live vehicle examples for context" },
  { id: "table", label: "Full table", detail: "Structured rows for the selected pack" },
  { id: "filters", label: "Filters", detail: "Selected scope and report assumptions" },
  { id: "disclaimer", label: "Disclaimer", detail: "Data and valuation disclaimer" },
];

const REPORT_THEME_OPTIONS: Array<{ value: ProReportTheme; label: string; detail: string }> = [
  { value: "executive-dark", label: "Executive dark", detail: "Premium board-pack look with dark cover" },
  { value: "board-light", label: "Board light", detail: "Clean investor memo style for printing" },
  { value: "dealer-slate", label: "Dealer slate", detail: "Sharper blue slate style for operational packs" },
];

const SCOPES: Array<{ value: ReportScope; label: string; detail: string }> = [
  { value: "market", label: "Market summary", detail: "Executive KPIs, coverage and opportunities" },
  { value: "vehicle", label: "Vehicle lane", detail: "One make/model with trend, mix and comparables" },
  { value: "district", label: "Area profile", detail: "One district with source mix and leading models" },
  { value: "source", label: "Source quality", detail: "Coverage, freshness and source opportunities" },
  { value: "lanes_table", label: "Vehicle table", detail: "Current make/model intelligence table" },
  { value: "districts_table", label: "Area table", detail: "District opportunity table" },
];

/**
 * The report studio, as a drawer. Reports are an output of the desk, not a mode
 * beside it: you open this when you have a finding and need it on letterhead,
 * and the desk stays exactly where you left it.
 */
export function ReportDrawer({
  open,
  onOpenChange,
  snapshot,
  lanes,
  districts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: ProMarketSnapshot | null;
  lanes: ProVehicleLane[];
  districts: ProDistrictProfile[];
}) {
  const { t } = useAppPreferences();
  const [scope, setScope] = useState<ReportScope>("market");
  const [vehicleKey, setVehicleKey] = useState("");
  const [district, setDistrict] = useState("");
  const [source, setSource] = useState("");
  const [format, setFormat] = useState<ProExportFormat>("pdf");
  const [theme, setTheme] = useState<ProReportTheme>("executive-dark");
  const [sections, setSections] = useState<ProReportSectionId[]>(["metrics", "breakdowns", "trends", "listings", "table", "filters", "disclaimer"]);
  const [listingLimit, setListingLimit] = useState(12);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [preparedFor, setPreparedFor] = useState("");
  const [notes, setNotes] = useState("");
  const [building, setBuilding] = useState(false);

  const targetLabel = useMemo(() => {
    if (scope === "vehicle") return vehicleKey ? vehicleKey.replace("|||", " ") : t("pro.report.pickLane", "Select a lane");
    if (scope === "district") return district || t("pro.report.pickArea", "Select an area");
    if (scope === "source") return source || t("pro.report.pickSource", "Select a source");
    if (scope === "lanes_table") return t("pro.report.allLanes", "All vehicle rows");
    if (scope === "districts_table") return t("pro.report.allAreas", "All area rows");
    return t("pro.report.fullMarket", "Full market");
  }, [scope, vehicleKey, district, source, t]);

  const canBuild =
    scope === "lanes_table" || scope === "districts_table"
      ? true
      : scope === "vehicle"
        ? Boolean(vehicleKey)
        : scope === "district"
          ? Boolean(district)
          : scope === "source"
            ? Boolean(source || snapshot?.source_coverage?.length)
            : Boolean(snapshot);

  const run = async () => {
    if (!canBuild) {
      toast.error(t("pro.report.notReady", "This scope is still loading"));
      return;
    }
    setBuilding(true);
    try {
      const report = await customizedReport({
        scope,
        snapshot,
        lanes,
        districts,
        vehicleKey,
        district,
        source,
        themeLabel: REPORT_THEME_OPTIONS.find((option) => option.value === theme)?.label ?? theme,
        listingLimit,
        overrides: {
          title: title.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          preparedFor: preparedFor.trim() || undefined,
          notes: notes.trim() || undefined,
          theme,
          sections,
          includeFilters: sections.includes("filters"),
          includeDisclaimer: sections.includes("disclaimer"),
        },
      });
      const { exportProReport } = await import("@/lib/proReports");
      await exportProReport(report, format);
      toast.success(t("proDash.export.started", "{format} export started", { format: format.toUpperCase() }));
      onOpenChange(false);
    } catch (error) {
      toast.error(t("proDash.export.failed", "Export failed"), {
        description: error instanceof Error ? error.message : t("proDash.export.unable", "Unable to create this report."),
      });
    } finally {
      setBuilding(false);
    }
  };

  const quickPacks = useMemo(() => {
    return [
      {
        title: t("pro.report.packMarket", "Executive market pack"),
        detail: t("pro.report.packMarketDetail", "KPIs, coverage, opportunities and the lane table"),
        icon: FileBarChart,
        scope: "market" as ReportScope,
        report: packReport("market", snapshot, lanes, districts, listingLimit),
      },
      {
        title: t("pro.report.packLanes", "Vehicle lane table"),
        detail: t("pro.report.packLanesDetail", "Every make/model lane with counts, median and range"),
        icon: TableProperties,
        scope: "lanes_table" as ReportScope,
        report: packReport("lanes_table", snapshot, lanes, districts, listingLimit),
      },
      {
        title: t("pro.report.packAreas", "Area opportunity pack"),
        detail: t("pro.report.packAreasDetail", "Area price bands, leading models and source mix"),
        icon: FileSpreadsheet,
        scope: "districts_table" as ReportScope,
        report: packReport("districts_table", snapshot, lanes, districts, listingLimit),
      },
    ];
  }, [snapshot, lanes, districts, listingLimit, t]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(52rem,98vw)] overflow-y-auto sm:max-w-[52rem]">
        <SheetHeader className="space-y-1 pr-8">
          <SheetTitle className="text-title2 font-semibold tracking-tight">{t("pro.report.title", "Report studio")}</SheetTitle>
          <SheetDescription className="text-footnote leading-relaxed text-label-2">
            {t("pro.report.body", "Assemble a brief from the live desk: choose a scope, the sections that matter, and how it should look on the page.")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="tech-label text-label-2" htmlFor="report-scope">{t("pro.report.scope", "Scope")}</label>
            <Select value={scope} onValueChange={(value) => setScope(value as ReportScope)}>
              <SelectTrigger id="report-scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-label-3">{SCOPES.find((option) => option.value === scope)?.detail}</p>
          </div>

          <div className="space-y-1.5">
            <span className="tech-label text-label-2">{t("pro.report.target", "Target")}</span>
            {scope === "vehicle" ? (
              <Select value={vehicleKey} onValueChange={setVehicleKey}>
                <SelectTrigger aria-label={t("pro.report.pickLane", "Select a lane")}><SelectValue placeholder={t("pro.report.pickLane", "Select a lane")} /></SelectTrigger>
                <SelectContent>
                  {lanes.slice(0, 120).map((lane) => (
                    <SelectItem key={`${lane.make}|||${lane.model}`} value={`${lane.make}|||${lane.model}`}>
                      {lane.make} {lane.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : scope === "district" ? (
              <Select value={district} onValueChange={setDistrict}>
                <SelectTrigger aria-label={t("pro.report.pickArea", "Select an area")}><SelectValue placeholder={t("pro.report.pickArea", "Select an area")} /></SelectTrigger>
                <SelectContent>
                  {districts.map((item) => (
                    <SelectItem key={item.district} value={item.district}>{item.district}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : scope === "source" ? (
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger aria-label={t("pro.report.pickSource", "Select a source")}><SelectValue placeholder={t("pro.report.pickSource", "Select a source")} /></SelectTrigger>
                <SelectContent>
                  {(snapshot?.source_coverage ?? []).map((item) => (
                    <SelectItem key={item.label} value={item.label}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-10 items-center rounded-control border border-border bg-surface-2 px-3 text-body font-semibold text-foreground">{targetLabel}</div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="tech-label text-label-2" htmlFor="report-format">{t("pro.report.format", "Format")}</label>
            <Select value={format} onValueChange={(value) => setFormat(value as ProExportFormat)}>
              <SelectTrigger id="report-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="docx">Word</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="print">{t("pro.report.print", "Print")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="tech-label text-label-2" htmlFor="report-theme">{t("pro.report.design", "Design")}</label>
            <Select value={theme} onValueChange={(value) => setTheme(value as ProReportTheme)}>
              <SelectTrigger id="report-theme"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="tech-label text-label-2" htmlFor="report-title">{t("pro.report.docTitle", "Title")}</label>
            <Input id="report-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("pro.report.docTitlePlaceholder", "Motormila Pro market brief")} />
          </div>
          <div className="space-y-1.5">
            <label className="tech-label text-label-2" htmlFor="report-prepared">{t("pro.report.preparedFor", "Prepared for")}</label>
            <Input id="report-prepared" value={preparedFor} onChange={(event) => setPreparedFor(event.target.value)} placeholder={t("pro.report.preparedPlaceholder", "Client, board, lender")} />
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <label className="tech-label text-label-2" htmlFor="report-subtitle">{t("pro.report.subtitle", "Subtitle")}</label>
          <Input id="report-subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder={t("pro.report.subtitlePlaceholder", "Professional Sri Lanka vehicle market intelligence")} />
        </div>

        <div className="mt-3 space-y-1.5">
          <label className="tech-label text-label-2" htmlFor="report-notes">{t("pro.report.notes", "Analyst note")}</label>
          <Textarea
            id="report-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("pro.report.notesPlaceholder", "Optional context or recommendation for the cover")}
            className="h-auto min-h-20"
          />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <h3 className="tech-label mb-2 inline-flex items-center gap-1.5 text-label-2">
              <Settings2 aria-hidden className="h-3.5 w-3.5" />
              {t("pro.report.sections", "Sections")}
            </h3>
            <ul className="grid gap-1 sm:grid-cols-2">
              {REPORT_SECTION_OPTIONS.map((section) => {
                const checked = sections.includes(section.id);
                return (
                  <li key={section.id}>
                    <label htmlFor={`section-${section.id}`} className="flex cursor-pointer items-start gap-2 rounded-control px-1 py-1.5 hover:bg-surface-2">
                      <Checkbox
                        id={`section-${section.id}`}
                        checked={checked}
                        onCheckedChange={(value) =>
                          setSections((current) => (value ? Array.from(new Set([...current, section.id])) : current.filter((item) => item !== section.id)))
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className={checked ? "block text-footnote font-semibold text-foreground" : "block text-footnote font-semibold text-label-2"}>{section.label}</span>
                        <span className="block text-caption leading-snug text-label-3">{section.detail}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="tech-label text-label-2" htmlFor="report-rows">{t("pro.report.rows", "Listing rows")}</label>
              <Input
                id="report-rows"
                type="number"
                min={1}
                max={80}
                value={listingLimit}
                onChange={(event) => setListingLimit(Math.max(1, Math.min(80, Number(event.target.value) || 1)))}
                className="w-24"
              />
            </div>
            <div className="rounded-card border border-border bg-surface-2 p-3">
              <p className="inline-flex items-center gap-1.5 text-caption font-semibold text-label-2">
                <Palette aria-hidden className="h-3.5 w-3.5" />
                {t("pro.report.preview", "Building")}
              </p>
              <p className="mt-1 truncate text-footnote font-semibold text-foreground">{targetLabel}</p>
              <p className="mt-1 text-caption text-label-3">
                {sections.length} {t("pro.report.sectionsOn", "sections")} · {REPORT_THEME_OPTIONS.find((option) => option.value === theme)?.label}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-separator pt-4">
          <Button type="button" onClick={() => void run()} loading={building} disabled={!canBuild}>
            <Download aria-hidden />
            {t("pro.report.download", "Download report")}
          </Button>
          <span className="text-caption text-label-3">
            {t("pro.report.downloadHint", "Built from the current snapshot — filters and counts travel with the file.")}
          </span>
        </div>

        <section className="mt-6">
          <h3 className="tech-label mb-2 text-label-2">{t("pro.report.quickPacks", "Quick packs")}</h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {quickPacks.map((pack) => {
              const Icon = pack.icon;
              return (
                <li key={pack.title} className="flex flex-col justify-between gap-3 rounded-card border border-border bg-surface-1 p-3">
                  <div>
                    <Icon aria-hidden className="h-4 w-4 text-label-3" />
                    <p className="mt-2 text-footnote font-semibold text-foreground">{pack.title}</p>
                    <p className="mt-0.5 text-caption leading-snug text-label-3">{pack.detail}</p>
                  </div>
                  {pack.report ? (
                    <ExportMenu report={pack.report} label={t("pro.report.export", "Export")} variant="secondary" size="sm" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </SheetContent>
    </Sheet>
  );
}
