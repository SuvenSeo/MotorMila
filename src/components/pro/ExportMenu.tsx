import { Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRO_EXPORTS_ENFORCED, useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { exportProReport } from "@/lib/proReports";
import type { ProExportFormat, ProReportPayload } from "@/types/pro";

const PRO_EXPORT_FORMATS: Array<{ format: ProExportFormat; label: string; detail: string }> = [
  { format: "pdf", label: "PDF", detail: "Board-ready brief" },
  { format: "docx", label: "Word", detail: "Editable document" },
  { format: "csv", label: "CSV", detail: "Rows for a spreadsheet" },
  { format: "json", label: "JSON", detail: "Raw payload" },
  { format: "print", label: "Print", detail: "Open the print dialog" },
];

/**
 * One export control for the whole desk. The format list is the product's
 * promise (PDF, Word, CSV, JSON), so it stays in a menu rather than five
 * buttons fighting the table for space.
 */
export function ExportMenu({
  report,
  label,
  align = "end",
  variant = "secondary",
  size = "sm",
  className,
}: {
  report: ProReportPayload;
  label?: string;
  align?: "start" | "end";
  variant?: "secondary" | "ghost" | "default";
  size?: "sm" | "md";
  className?: string;
}) {
  const { hasProAccess, isAuthenticated } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();

  const runExport = async (format: ProExportFormat) => {
    if (PRO_EXPORTS_ENFORCED && (!isAuthenticated || !hasProAccess)) {
      toast.error(t("proDash.export.proRequired", "Pro subscription required"), {
        description: t("proDash.export.signInPro", "Sign in with a Pro account to download reports."),
        action: { label: t("proDash.export.signIn", "Sign in"), onClick: () => navigate("/sign-in") },
      });
      return;
    }
    try {
      await exportProReport(report, format);
      toast.success(t("proDash.export.started", "{format} export started", { format: format.toUpperCase() }));
    } catch (error) {
      toast.error(t("proDash.export.failed", "Export failed"), {
        description: error instanceof Error ? error.message : t("proDash.export.unable", "Unable to create this report."),
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          <Download aria-hidden />
          {label ?? t("pro.export", "Export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel>{t("pro.exportFormat", "Export format")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRO_EXPORT_FORMATS.map((item) => (
          <DropdownMenuItem key={item.format} onSelect={() => void runExport(item.format)} className="flex items-center justify-between gap-4">
            <span className="font-semibold">{item.label}</span>
            <span className="text-caption text-label-3">{item.detail}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
