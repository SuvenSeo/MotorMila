import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileText, Info, RefreshCw, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { getPermits } from "@/services/api";
import type { PermitInfo } from "@/services/api";
import { revealContainer, revealItem } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { useAppPreferences } from "@/lib/appPreferences";
import { QUERY_STALE } from "@/lib/queryPolicy";

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

function formatLkr(value: number): string {
  if (value >= 1_000_000) {
    return `LKR ${(value / 1_000_000).toFixed(2)}M`;
  }
  return `LKR ${value.toLocaleString()}`;
}

function PermitRow({ permit }: { permit: PermitInfo }) {
  const typeLabel = permitTypeLabel(permit.permit_type);
  return (
    <motion.tr
      variants={revealItem}
      className="group border-b border-border last:border-0 hover:bg-surface transition-colors"
    >
      <td className="py-3.5 pl-5 pr-4">
        <p className="text-[13px] font-semibold text-foreground leading-snug">{permit.permit_name}</p>
      </td>
      <td className="py-3.5 px-4 hidden sm:table-cell">
        <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
          {typeLabel}
        </span>
      </td>
      <td className="py-3.5 pl-4 pr-5 text-right">
        <span className="num text-[13px] font-bold text-foreground tabular-nums">{formatLkr(permit.market_price_lkr)}</span>
      </td>
    </motion.tr>
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

  return (
    <PageCanvas>
      <PageHero
        theme="default"
        eyebrow={t("permits.eyebrow", "Permit tracker")}
        eyebrowIcon={FileText}
        watermarkIcon={TrendingUp}
        title={t("permits.title", "Vehicle Permit Market")}
        description={t(
          "permits.description",
          "Indicative black-market and transferable permit prices in the Sri Lankan vehicle import market. Data is admin-seeded and updated by scraper.",
        )}
        highlights={[
          {
            label: t("permits.highlightPrices", "Market prices"),
            value: t("permits.indicative", "Indicative"),
            hint: t("permits.researchBased", "Research-doc baselines + live scrape"),
          },
          {
            label: t("permits.highlightTypes", "Permit types"),
            value: String(new Set(permits.map((p) => p.permit_type)).size || "—"),
            hint: [...new Set(permits.map((p) => p.permit_type).filter(Boolean))].join(", ") || t("permits.typesHint", "Duty-free, EV"),
          },
          {
            label: t("permits.highlightCount", "Entries"),
            value: String(permits.length || "—"),
            hint: t("permits.entriesHint", "Admin + scraper seeded"),
          },
        ]}
      />

      <PageBody className="space-y-12">
        <motion.section variants={revealItem}>
          <div className="flex items-center justify-between mb-6">
            <SectionHeader
              eyebrow={t("permits.sectionEyebrow", "Live data")}
              title={t("permits.sectionTitle", "Permit price index")}
            />
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
              aria-label={t("common.refresh", "Refresh")}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
              {t("common.refresh", "Refresh")}
            </button>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl border border-border bg-surface animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-[13px] font-medium text-muted-foreground">
                {t("permits.loadError", "Could not load permit data. Please try again.")}
              </p>
            </div>
          )}

          {!isLoading && !isError && permits.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <FileText aria-hidden className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-[14px] font-semibold text-foreground mb-1">
                {t("permits.emptyTitle", "No permit data yet")}
              </p>
              <p className="text-[12px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {t(
                  "permits.emptyDesc",
                  "Permit prices are seeded by administrators or the permitsale scraper. Check back later or visit the Calculator for estimates.",
                )}
              </p>
            </div>
          )}

          {!isLoading && !isError && permits.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <motion.table variants={revealContainer} className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="py-3 pl-5 pr-4 text-[12px] font-semibold text-muted-foreground">
                      {t("permits.colName", "Permit name")}
                    </th>
                    <th className="py-3 px-4 text-[12px] font-semibold text-muted-foreground hidden sm:table-cell">
                      {t("permits.colType", "Type")}
                    </th>
                    <th className="py-3 pl-4 pr-5 text-right text-[12px] font-semibold text-muted-foreground">
                      {t("permits.colPrice", "Market price")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p) => (
                    <PermitRow key={p.id} permit={p} />
                  ))}
                </tbody>
              </motion.table>
            </div>
          )}
        </motion.section>

        {/* Contextual note */}
        <motion.div
          variants={revealItem}
          className="flex gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-[12px] font-bold text-foreground">
              {t("permits.disclaimerTitle", "Indicative prices only")}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t(
                "permits.disclaimerBody",
                "Permit prices fluctuate based on demand, regulatory changes, and foreign-exchange rates. These figures are research-document baselines and may not reflect current black-market rates. Always verify with a licensed importer.",
              )}
            </p>
          </div>
        </motion.div>

        {/* Cross-link to Calculator */}
        <motion.div variants={revealItem}>
          <Link
            to="/calculator?tab=permits"
            className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft-lg no-underline"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface transition-colors group-hover:border-primary/30 group-hover:bg-primary/10">
                <FileText aria-hidden className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-foreground">
                  {t("permits.calcLink", "Import & Landed Cost Calculator")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("permits.calcLinkHint", "Factor permit costs into your total import estimate")}
                </p>
              </div>
            </div>
            <TrendingUp aria-hidden className="h-4 w-4 shrink-0 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
          </Link>
        </motion.div>
      </PageBody>
    </PageCanvas>
  );
}
