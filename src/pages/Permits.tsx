import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { ArrowRight, Calculator, FileText, Info, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { getPermits } from "@/services/api";
import type { PermitInfo } from "@/services/api";
import { revealItem, staggerDelay } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, cardVariants } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { CountValue } from "@/components/ui/stat-tile";
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

function PermitRow({ permit, index }: { permit: PermitInfo; index: number }) {
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
      <TableCell numeric className="font-semibold">
        {formatLkr(permit.market_price_lkr)}
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

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={t("permits.eyebrow", "Permit tracker")}
        eyebrowIcon={FileText}
        title={t("permits.title", "Vehicle Permit Market")}
        description={t(
          "permits.description",
          "Indicative black-market and transferable permit prices in the Sri Lankan vehicle import market. Data is admin-seeded and updated by scraper.",
        )}
        stats={[
          {
            label: t("permits.highlightPrices", "Market prices"),
            value: t("permits.indicative", "Indicative"),
            hint: t("permits.researchBased", "Research-doc baselines + live scrape"),
          },
          {
            label: t("permits.highlightTypes", "Permit types"),
            value: isLoading ? "—" : <CountValue value={typeCount || null} />,
            hint: t("permits.typesHint", "Duty-free, EV"),
          },
          {
            label: t("permits.highlightCount", "Entries"),
            value: isLoading ? "—" : <CountValue value={permits.length || null} />,
            hint: t("permits.entriesHint", "Admin + scraper seeded"),
          },
        ]}
      />

      <PageBody className="space-y-8 pt-0 lg:pt-0">
        <m.section variants={revealItem}>
          <SectionHeading
            eyebrow={t("permits.sectionEyebrow", "Live data")}
            title={t("permits.sectionTitle", "Permit price index")}
            actions={
              <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                <RefreshCw className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
                {t("common.refresh", "Refresh")}
              </Button>
            }
          />

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
            <TableContainer className="shadow-e1">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("permits.colName", "Permit name")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("permits.colType", "Type")}</TableHead>
                    <TableHead numeric>{t("permits.colPrice", "Market price")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permits.map((p, i) => (
                    <PermitRow key={p.id} permit={p} index={i} />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </m.section>

        {/* Contextual note */}
        <m.div variants={revealItem}>
          <Card padding="md" className="flex gap-3">
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
          </Card>
        </m.div>

        {/* Cross-link to Calculator */}
        <m.div variants={revealItem}>
          <Link
            to="/calculator?tab=permits"
            className={cn(cardVariants({ variant: "interactive", padding: "md" }), "group flex items-center justify-between gap-3 no-underline")}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Calculator aria-hidden className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-callout font-semibold text-foreground">
                  {t("permits.calcLink", "Import & Landed Cost Calculator")}
                </span>
                <span className="block text-footnote text-label-2">
                  {t("permits.calcLinkHint", "Factor permit costs into your total import estimate")}
                </span>
              </span>
            </span>
            <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-primary transition-transform duration-short ease-standard group-hover:translate-x-0.5" />
          </Link>
        </m.div>
      </PageBody>
    </PageCanvas>
  );
}
