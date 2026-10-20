import { ShieldAlert } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import type { SafetyResearchResponse } from "@/services/api";

interface SafetyResearchCardProps {
  research?: SafetyResearchResponse | null;
  isLoading?: boolean;
  isError?: boolean;
}

function formatMileage(value: unknown): string | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return `${Math.round(num).toLocaleString()} mi`;
}

export function SafetyResearchCard({
  research,
  isLoading = false,
  isError = false,
}: SafetyResearchCardProps) {
  const { t } = useAppPreferences();
  const safety = research?.safety;
  const reliability = research?.reliability;
  const safetyOn = safety?.available === true && safety.data;
  const reliabilityOn = reliability?.available === true && reliability.data;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="h-4 w-40 animate-pulse rounded bg-surface" />
        <div className="mt-3 h-16 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  if (isError || !research || (!safetyOn && !reliabilityOn)) {
    const limitation =
      safety?.limitation ||
      reliability?.limitation ||
      t(
        "safety.unavailable",
        "US safety and known-issues research is not available for this year, make, and model.",
      );
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-[12px] font-semibold text-muted-foreground">
            {t("safety.title", "Safety & known issues")}
          </h2>
        </div>
        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
          {t("safety.notAvailable", "US research not available.")} {limitation}
        </p>
      </div>
    );
  }

  const rating = safetyOn ? (safety.data as { rating?: { overall?: string | null } }).rating : null;
  const recalls = safetyOn
    ? ((safety.data as { recalls?: Array<{ campaign?: string; component?: string; title?: string; risk?: string; remedy?: string }> }).recalls ?? [])
    : [];
  const complaints = safetyOn
    ? ((safety.data as { complaints?: { count?: number; language?: string } }).complaints)
    : null;
  const scorecard = reliabilityOn
    ? ((reliability.data as { scorecard?: { reliability_score?: number; complaints?: number; top_component?: string } }).scorecard)
    : null;
  const issues = reliabilityOn
    ? ((reliability.data as { known_issues?: Array<{ component?: string; mileage_median?: number; complaints?: number }> }).known_issues ?? [])
    : [];
  const tsb = reliabilityOn
    ? ((reliability.data as { tsb?: { tsb_count?: number; top_category?: string; note?: string } }).tsb)
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-[12px] font-semibold text-muted-foreground">
          {t("safety.title", "Safety & known issues")}
        </h2>
      </div>
      <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
        {safety?.limitation || reliability?.limitation}
      </p>

      {rating?.overall ? (
        <p className="mt-3 text-[13px] font-semibold text-foreground">
          {t("safety.rating", "US NHTSA overall rating")}: {rating.overall}/5
        </p>
      ) : null}

      {recalls.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] font-semibold text-muted-foreground">
            {t("safety.recalls", "US recall campaigns (year/make/model)")}
          </p>
          {recalls.slice(0, 4).map((recall) => (
            <div key={`${recall.campaign}-${recall.component}`} className="rounded-2xl border border-border bg-surface px-3 py-2">
              <p className="text-[11px] font-semibold text-foreground">
                {recall.component || recall.campaign || t("safety.campaign", "Campaign")}
              </p>
              {recall.title ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{recall.title}</p>
              ) : null}
              {recall.remedy ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {t("safety.remedy", "Remedy")}: {recall.remedy}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {complaints?.count ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {t("safety.complaints", "{count} US owner complaints on record for this year/make/model — a trend signal, not a quality score.", {
            count: complaints.count,
          })}
        </p>
      ) : null}

      {scorecard?.reliability_score != null ? (
        <p className="mt-3 text-[11px] font-medium text-foreground">
          {t("safety.reliability", "ProblemsByVin volume score")}: {scorecard.reliability_score}/5
          {scorecard.top_component ? ` · ${t("safety.topIssue", "most reported")}: ${scorecard.top_component}` : ""}
        </p>
      ) : null}

      {issues.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {issues.slice(0, 4).map((issue) => (
            <li key={`${issue.component}-${issue.mileage_median}`} className="text-[11px] text-muted-foreground">
              {issue.component}
              {formatMileage(issue.mileage_median) ? ` · ${t("safety.reportedAround", "reported around")} ${formatMileage(issue.mileage_median)}` : ""}
              {issue.complaints ? ` · ${issue.complaints} ${t("safety.reports", "reports")}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {tsb?.note ? (
        <p className="mt-3 text-[11px] font-medium text-muted-foreground">
          {tsb.tsb_count ? `${tsb.tsb_count} TSBs. ` : ""}
          {tsb.note}
        </p>
      ) : null}

      <p className="mt-3 text-[10px] text-muted-foreground">
        {safety?.provider ? `${t("safety.source", "Source")}: ${safety.provider}` : null}
        {safety?.fetched_at ? ` · ${safety.fetched_at}` : ""}
      </p>
    </div>
  );
}
