import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Calculator, FileText, Info, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { getPermits } from "@/services/api";
import type { PermitInfo } from "@/services/api";
import { staggerDelay } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CineHeader } from "@/components/CineHeader";
import { CineFigure, CineSection } from "@/components/CineSection";
import { visuals } from "@/lib/visualAssets";
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useAppPreferences } from "@/lib/appPreferences";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { formatLkrCompact } from "@/lib/price";

const PERMIT_TYPE_LABELS: Record<string, string> = {
  assembled: "Assembled Vehicle",
  full_import: "Full Import",
  retirement_cat1: "Retirement Cat. I",
  retirement_cat2: "Retirement Cat. II",
  retirement_cat3: "Retirement Cat. III",
  duty_free: "Duty-Free",
  ev: "EV / Remittance",
  general: "General",
};

function permitTypeLabel(raw: string): string {
  return PERMIT_TYPE_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Known permit names (as seeded by the permitsale scraper / admin) -> locale key.
 * Matched case- and whitespace-insensitively; unknown names render as-is.
 */
const PERMIT_NAME_KEYS: Record<string, string> = {
  "assembled vehicle permit (general)": "permits.name.assembled_general",
  "full import permit": "permits.name.full_import",
  "category i retirement permit": "permits.name.retirement_cat1",
  "category ii retirement permit": "permits.name.retirement_cat2",
  "category iii retirement permit": "permits.name.retirement_cat3",
  "government doctor permit": "permits.name.gov_doctor",
  "government mp / state officer permit": "permits.name.gov_mp_state_officer",
  "special ev import permit (remittance)": "permits.name.special_ev_remittance",
  "foreign employment ev permit": "permits.name.foreign_employment_ev",
};

function permitNameKey(raw: string): string | undefined {
  return PERMIT_NAME_KEYS[String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase()];
}

function formatLkr(value: number): string {
  return formatLkrCompact(value);
}

function PermitRow({ permit, index, top }: { permit: PermitInfo; index: number; top: number }) {
  const { t } = useAppPreferences();
  const typeLabel = t(`permits.type.${permit.permit_type}`, permitTypeLabel(permit.permit_type));
  const nameKey = permitNameKey(permit.permit_name);
  const name = nameKey ? t(nameKey, permit.permit_name) : permit.permit_name;
  return (
    // Rows fade in once (opacity only), stagger capped at 8 rows.
    <TableRow className="content-in" style={{ animationDelay: `${staggerDelay(index)}s` }}>
      <TableCell>
        <p className="text-footnote font-semibold text-foreground">{name}</p>
        <Badge variant="neutral" className="mt-1.5 sm:hidden">{typeLabel}</Badge>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant="neutral">{typeLabel}</Badge>
      </TableCell>
      <TableCell numeric className="w-36 font-semibold sm:w-48">
        <span className="cine-card__price block text-callout tabular-nums">{formatLkr(permit.market_price_lkr)}</span>
        {top > 0 && permit.market_price_lkr > 0 ? (
          <span aria-hidden className="cine-rule ml-auto mt-2 w-full max-w-[10rem]">
            <span style={{ "--w": Math.min(1, permit.market_price_lkr / top) } as CSSProperties} />
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export default function Permits() {
  const { t } = useAppPreferences();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["permits-public"],
    queryFn: getPermits,
    staleTime: QUERY_STALE.stats,
    retry: 2,
  });

  const permits = data ?? [];
  const typeCount = new Set(permits.map((p) => p.permit_type)).size;
  // Headline: the highest listed permit price in the index (real rows only).
  const topPermit = permits.reduce<PermitInfo | null>(
    (best, p) => (Number(p.market_price_lkr) > 0 && (!best || p.market_price_lkr > best.market_price_lkr) ? p : best),
    null,
  );
  const topPrice = topPermit?.market_price_lkr ?? 0;
  const topName = topPermit ? (permitNameKey(topPermit.permit_name) ? t(permitNameKey(topPermit.permit_name)!, topPermit.permit_name) : topPermit.permit_name) : "";

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("permits.eyebrow", "Permit tracker")}
        lead={t("permits.cine.lead", "Vehicle permit")}
        accent={t("permits.cine.accent", "market.")}
        body={t(
          "permits.description",
          "Indicative black-market and transferable permit prices in the Sri Lankan vehicle import market. Data is admin-seeded and updated by scraper.",
        )}
        image={visuals.alt2PageInsuranceFinance}
        imagePosition="60% 50%"
      >
        <div className="min-h-[5.5rem]" aria-live="polite">
          {isLoading ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton shape="text" className="h-3 w-40 bg-foreground/10" />
              <Skeleton shape="text" className="h-10 w-48 bg-foreground/10" />
            </div>
          ) : topPermit ? (
            <CineFigure
              label={t("permits.cine.topKicker", "Top permit price")}
              value={formatLkr(topPrice)}
              caption={t("permits.cine.topCaption", "{name} · {types} permit types, {n} entries tracked", { name: topName, types: typeCount, n: permits.length })}
            />
          ) : null}
        </div>
      </CineHeader>

      <PageBody className="space-y-12 pt-8 lg:pt-12">
        <CineSection
          index="01"
          title={t("permits.sectionTitle", "Permit price index")}
          body={t("permits.researchBased", "Research-doc baselines + live scrape")}
          actions={
            <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
              {t("common.refresh", "Refresh")}
            </Button>
          }
        >
          {isLoading ? (
            <div className="space-y-2" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} shape="row" className="h-12" />
              ))}
            </div>
          ) : isError ? (
            <Card padding="none">
              <ErrorState
                title={t("permits.loadErrorTitle", "Permit prices didn't load")}
                body={t("permits.loadError", "Could not load permit data. Please try again.")}
                onRetry={() => void refetch()}
              />
            </Card>
          ) : permits.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={FileText}
                title={t("permits.emptyTitle", "No permit data yet")}
                body={t(
                  "permits.emptyDesc",
                  "Permit prices are seeded by administrators or the permitsale scraper. Check back later or visit the Calculator for estimates.",
                )}
                action={
                  <Button asChild variant="secondary">
                    <Link to="/calculator?tab=permits">{t("permits.calcLink", "Import & Landed Cost Calculator")}</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="cine-panel theme-dark p-2 text-foreground sm:p-4">
              <TableContainer className="border-0 bg-transparent shadow-none">
                <Table>
                  <TableHeader className="bg-transparent">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("permits.colName", "Permit name")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("permits.colType", "Type")}</TableHead>
                      <TableHead numeric>{t("permits.colPrice", "Market price")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permits.map((p, i) => (
                      <PermitRow key={p.id} permit={p} index={i} top={topPrice} />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          )}
        </CineSection>

        <div className="grid gap-6 border-t border-separator pt-6 lg:grid-cols-2">
          {/* Contextual note */}
          <div className="flex gap-3">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-footnote font-semibold text-foreground">{t("permits.disclaimerTitle", "Indicative prices only")}</p>
              <p className="text-footnote text-label-2">
                {t(
                  "permits.disclaimerBody",
                  "Permit prices fluctuate based on demand, regulatory changes, and foreign-exchange rates. These figures are research-document baselines and may not reflect current black-market rates. Always verify with a licensed importer.",
                )}
              </p>
            </div>
          </div>

          {/* Cross-link to Calculator */}
          <Link to="/calculator?tab=permits" className="cine-row group -my-1 items-center rounded-control">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Calculator aria-hidden className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-callout font-semibold text-foreground transition-colors duration-short group-hover:text-primary">
                {t("permits.calcLink", "Import & Landed Cost Calculator")}
              </span>
              <span className="block text-footnote text-label-2">
                {t("permits.calcLinkHint", "Factor permit costs into your total import estimate")}
              </span>
            </span>
            <ArrowRight aria-hidden className="cine-row__arrow h-4 w-4 text-primary" />
          </Link>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
