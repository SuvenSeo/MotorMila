import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Info, Link2, Plus, Scale, Search, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Switch } from "@/components/ui/switch";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { TableContainer, Table, TableHeader, TableBody } from "@/components/ui/table";
import { toast } from "sonner";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { getListingFmv, getListingsBatch } from "@/services/api";
import type { CarListing } from "@/types/car";
import { PageCanvas } from "@/components/PageCanvas";
import { formatLkrFull } from "@/lib/price";
import { useAppPreferences } from "@/lib/appPreferences";
import { buildCompareLink } from "@/lib/compareTray";
import { canonicalComparePath, fromCompareSlug } from "@/lib/compareSlug";
import { formatSourceName } from "@/lib/sourceAttribution";
import { howWePriceHref } from "@/lib/howWePrice";
import { useLowData } from "@/hooks/useLowData";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { useCompare } from "@/components/compare/CompareContext";
import { AnimatePresence, motion } from "motion/react";
import { duration, ease, spring, useReducedMotionOrLowData } from "@/lib/motion";
import "@/styles/listing-motion.css";
import { SellSpeedBadge } from "@/components/SellSpeedBadge";
import {
  COMPARE_ROWS,
  bestIndexes,
  fmvFor,
  monthlyEstimate,
  rowDiffers,
  vsFmvPct,
  askingPrice,
  type CompareFmv,
  type CompareRowDef,
} from "@/components/compare/compareRows";

const MAX_COMPARE = 4;

function lkr(n: number | null | undefined): string {
  return formatLkrFull(n, "—");
}

function token(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

type RowModel = { def: CompareRowDef; values: Array<number | string | null>; differs: boolean; best: Set<number> };

export default function Compare() {
  const { t } = useAppPreferences();
  const { lowData } = useLowData();
  const compare = useCompare();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<CarListing[]>([]);
  const [fmvById, setFmvById] = useState<Record<number, CompareFmv>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const motionCalm = useReducedMotionOrLowData();

  // Canonical slug path (/compare/12-vs-45) wins; legacy ?ids=12,45 still works.
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const rawIds = searchParams.get("ids") ?? "";
  const urlIds = useMemo(() => {
    if (slug) return fromCompareSlug(slug).slice(0, MAX_COMPARE);
    return [...new Set(rawIds.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, MAX_COMPARE);
  }, [rawIds, slug]);
  // Direct visit to /compare (nav, bookmark): fall back to the tray selection.
  const trayKey = compare.items.map((p) => p.id).join(",");
  const ids = useMemo(
    () => (urlIds.length > 0 ? urlIds : trayKey ? trayKey.split(",").map(Number).slice(0, MAX_COMPARE) : []),
    [urlIds, trayKey],
  );
  const idsKey = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      setListings([]);
      return;
    }
    setLoading(true);
    setError(null);
    getListingsBatch(ids)
      .then((rows) => {
        if (cancelled) return;
        // Keep the user's order.
        const byId = new Map(rows.map((r) => [Number(r.id), r]));
        setListings(ids.map((id) => byId.get(id)).filter((r): r is CarListing => Boolean(r)));
      })
      .catch(() => !cancelled && setError(t("comparePage.error", "Couldn't load these listings. Check your connection and try again.")))
      .finally(() => !cancelled && setLoading(false));
    // FMV per listing (live first, snapshot fallback inside getListingFmv).
    ids.forEach((id) => {
      getListingFmv(id)
        .then((d) => {
          if (cancelled) return;
          setFmvById((prev) => ({
            ...prev,
            [id]: { fmv: d.fmv_lkr, confidence: d.confidence ?? null, comps: d.sample_count ?? null },
          }));
        })
        .catch(() => {
          /* FMV unavailable: rows fall back to the listing's market median */
        });
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page title names the cars (not listing ids), in the reader's language.
  const titleNames = listings
    .map((l) => [l.year, l.make, l.model].filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .join(t("comparePage.vs", " vs "));
  useEffect(() => {
    if (listings.length < 2 || !titleNames) return;
    const title = t("seo.compareNamedTitle", "{names} compared — {site}", { names: titleNames, site: BRAND.siteName });
    // Run after RouteMeta's route-level title on the same commit.
    const id = window.setTimeout(() => {
      document.title = title;
      document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    }, 0);
    return () => window.clearTimeout(id);
  }, [titleNames, listings.length, t]);

  const removeId = (id: number) => {
    compare.remove(id);
    const remaining = ids.filter((n) => n !== id);
    if (slug) {
      navigate(remaining.length >= 2 ? canonicalComparePath(remaining) : remaining.length ? `/compare?ids=${remaining.join(",")}` : "/compare", { replace: true });
      return;
    }
    setSearchParams(remaining.length ? { ids: remaining.join(",") } : {}, { replace: true });
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${buildCompareLink(ids)}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else throw new Error("no clipboard");
      toast.success(t("comparePage.linkCopied", "Compare link copied"));
    } catch {
      window.prompt(t("comparePage.copyPrompt", "Copy compare link:"), url);
    }
  };

  const rowLabel = (key: CompareRowDef["key"]): string => {
    const labels: Record<CompareRowDef["key"], string> = {
      price: t("comparePage.row.price", "Asking price"),
      fmv: t("comparePage.row.fmv", "FMV (typical asking)"),
      vsFmv: t("comparePage.row.vsFmv", "Price vs FMV"),
      monthly: t("comparePage.row.monthly", "Monthly est."),
      year: t("comparePage.row.year", "Year"),
      mileage: t("comparePage.row.mileage", "Mileage"),
      condition: t("comparePage.row.condition", "Condition"),
      fuel: t("comparePage.row.fuel", "Fuel"),
      transmission: t("comparePage.row.transmission", "Gearbox"),
      engine: t("comparePage.row.engine", "Engine"),
      body: t("comparePage.row.body", "Body"),
      district: t("comparePage.row.district", "District"),
      seller: t("comparePage.row.seller", "Seller"),
      source: t("comparePage.row.source", "Listed on"),
      listed: t("comparePage.row.listed", "On market"),
    };
    return labels[key];
  };

  const renderCell = (key: CompareRowDef["key"], l: CarListing): ReactNode => {
    const fmv = fmvById[Number(l.id)];
    switch (key) {
      case "price":
        return askingPrice(l) !== null ? lkr(askingPrice(l)) : t("comparePage.priceOnRequest", "Price not listed");
      case "fmv": {
        const v = fmvFor(l, fmv);
        if (v === null) return "—";
        return (
          <span>
            {lkr(v)}
            {fmv?.confidence && fmv.confidence !== "none" ? (
              <span className="block text-caption font-normal text-label-2">
                {t(`comparePage.conf.${fmv.confidence}`, `${token(fmv.confidence)} confidence`)}
              </span>
            ) : null}
          </span>
        );
      }
      case "vsFmv": {
        const pct = vsFmvPct(l, fmv);
        if (pct === null) return "—";
        const gap = Math.abs((askingPrice(l) ?? 0) - (fmvFor(l, fmv) ?? 0));
        const tone = pct <= -5 ? "text-deal-good-text" : pct >= 8 ? "text-deal-high-text" : "text-foreground";
        const label =
          Math.abs(pct) < 0.5
            ? t("comparePage.atFmv", "At FMV")
            : pct < 0
              ? t("comparePage.below", "{amount} below", { amount: lkr(gap) })
              : t("comparePage.above", "{amount} above", { amount: lkr(gap) });
        return (
          <span className={tone}>
            {label}
            <span className="block text-caption font-normal text-label-2">
              {pct > 0 ? "+" : ""}
              {pct.toFixed(1)}%
            </span>
          </span>
        );
      }
      case "monthly": {
        const m = monthlyEstimate(l);
        if (!m) return "—";
        return (
          <span>
            {lkr(m.monthlyLkr)}
            <span className="block text-caption font-normal text-label-2">
              {t("comparePage.monthlyDown", "after {down} down", { down: lkr(m.downLkr) })}
            </span>
          </span>
        );
      }
      case "year":
        return l.year ?? "—";
      case "mileage":
        return l.mileage_km != null ? `${Number(l.mileage_km).toLocaleString("en-LK")} km` : "—";
      case "condition":
        return token(l.condition);
      case "fuel":
        return token(l.fuel_type);
      case "transmission":
        return token(l.transmission);
      case "engine":
        return l.engine_cc ? `${Number(l.engine_cc).toLocaleString()} cc` : "—";
      case "body":
        return token(l.body_type);
      case "district":
        return l.district || "—";
      case "seller":
        return l.is_dealer === true ? t("comparePage.dealer", "Dealer") : l.is_dealer === false ? t("comparePage.private", "Private") : "—";
      case "source":
        return formatSourceName(l.source) || "—";
      case "listed": {
        const v = COMPARE_ROWS.find((r) => r.key === "listed")!.raw(l, fmv);
        return typeof v === "number" ? t("comparePage.days", "{n} days", { n: v }) : "—";
      }
      default:
        return "—";
    }
  };

  const rows: RowModel[] = useMemo(() => {
    return COMPARE_ROWS.map((def) => {
      const values = listings.map((l) => def.raw(l, fmvById[Number(l.id)]));
      return { def, values, differs: rowDiffers(values), best: bestIndexes(values, def.better) };
    });
  }, [listings, fmvById]);

  const visibleRows = useMemo(() => (onlyDiff ? rows.filter((r) => r.differs || r.def.group === "money") : rows), [rows, onlyDiff]);

  const columnHelper = createColumnHelper<RowModel>();
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "spec",
        header: () => <span className="sr-only">{t("comparePage.specCol", "Spec")}</span>,
        cell: (ctx) => (
          <span className="flex items-center gap-1.5">
            {highlight && ctx.row.original.differs ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
            {rowLabel(ctx.row.original.def.key)}
            {highlight && ctx.row.original.differs ? <span className="sr-only">{t("comparePage.differsSr", "(differs)")}</span> : null}
          </span>
        ),
      }),
      ...listings.map((l, index) =>
        columnHelper.display({
          id: `l-${l.id}`,
          header: () => (
            <div className="content-in flex min-w-0 flex-col gap-2.5 normal-case tracking-normal">
              {!lowData && l.thumbnail_url ? (
                <img src={l.thumbnail_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" width={480} height={360} className="aspect-[4/3] w-full rounded-control bg-surface-2 object-cover" />
              ) : null}
              <div className="flex items-start justify-between gap-1">
                <Link to={`/listing/${l.id}`} className="min-w-0 text-body font-semibold leading-snug text-foreground no-underline transition-colors duration-short hover:text-primary">
                  {l.year} {l.make} {l.model}
                  {l.variant ? <span className="block text-footnote font-normal text-label-2">{l.variant}</span> : null}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeId(Number(l.id))}
                  aria-label={t("compareTray.removeAria", "Remove {name} from compare", { name: [l.make, l.model].filter(Boolean).join(" ") })}
                  className="-mr-1 -mt-1 text-label-2"
                >
                  <X aria-hidden />
                </Button>
              </div>
              <SellSpeedBadge make={l.make} model={l.model} className="self-start" />
            </div>
          ),
          cell: (ctx) => {
            const r = ctx.row.original;
            const isBest = highlight && r.best.has(index);
            return (
              <span className={cn("block", isBest && "font-semibold text-deal-good-text")}>
                {renderCell(r.def.key, l)}
                {isBest ? <span className="sr-only"> {t("comparePage.bestSr", "(best)")}</span> : null}
              </span>
            );
          },
        }),
      ),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listings, fmvById, highlight, lowData, t],
  );

  const table = useReactTable({ data: visibleRows, columns, getCoreRowModel: getCoreRowModel() });

  const hasIds = ids.length > 0;
  const [rowsBefore, rowsAfter] = t("comparePage.rowsShown", "{n} rows", { n: "\u0000" }).split("\u0000");
  const enough = listings.length >= 2;

  const switchRow = "inline-flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-footnote font-medium text-foreground sm:min-h-9";

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={
          <Link to="/" className="inline-flex items-center gap-1 text-primary no-underline transition-opacity duration-short hover:opacity-80">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("comparePage.back", "Back to listings")}
          </Link>
        }
        title={t("comparePage.title", "Compare cars")}
        description={t("comparePage.subtitle", "Side by side, up to {max} cars. Prices are asking prices from the original ads.", { max: MAX_COMPARE })}
        actions={
          !error && enough ? (
            <>
              {listings.length < MAX_COMPARE ? (
                <Button asChild variant="secondary">
                  <Link to="/" className="no-underline">
                    <Plus aria-hidden />
                    {t("comparePage.addMore", "Add a car")}
                  </Link>
                </Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={copyLink}>
                <Link2 aria-hidden />
                {t("comparePage.share", "Share")}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="layout-shell pb-16">
        {loading && listings.length === 0 && (
          <div className="space-y-3" aria-busy="true" aria-label={t("comparePage.loading", "Loading cars to compare")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: Math.max(2, ids.length) }).map((_, i) => (
                <Skeleton key={i} shape="card" />
              ))}
            </div>
            <Skeleton shape="chart" className="h-96" />
          </div>
        )}

        {!loading && error && (
          <Card padding="none">
            <ErrorState
              title={t("comparePage.errorTitle", "These cars didn't load")}
              body={error}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </Card>
        )}

        {!loading && !error && (!hasIds || !enough) && (
          <Card padding="none">
            <EmptyState
              icon={Scale}
              title={listings.length === 1 ? t("comparePage.needOneMore", "Add one more car to compare") : t("comparePage.emptyTitle", "No cars selected yet")}
              body={t("comparePage.emptyBody", "Tap “Compare” on any listing to add it here. You can pick up to {max}.", { max: MAX_COMPARE })}
              className="py-16"
              action={
                <Button asChild>
                  <Link to="/" className="no-underline">
                    <Search aria-hidden />
                    {t("comparePage.browse", "Browse listings")}
                  </Link>
                </Button>
              }
            />
          </Card>
        )}

        {!error && enough && (
          <div className="content-in">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <label className={switchRow}>
                  <Switch checked={highlight} onCheckedChange={setHighlight} size="sm" />
                  {t("comparePage.highlight", "Highlight differences")}
                </label>
                <label className={switchRow}>
                  <Switch checked={onlyDiff} onCheckedChange={setOnlyDiff} size="sm" />
                  {t("comparePage.onlyDiff", "Hide identical rows")}
                </label>
              </div>
              <p className="num text-footnote text-label-2" aria-live="polite">
                <span className="sr-only">{t("comparePage.rowsShown", "{n} rows", { n: visibleRows.length })}</span>
                <span aria-hidden>
                  {rowsBefore}
                  <AnimatedNumber value={visibleRows.length} />
                  {rowsAfter}
                </span>
              </p>
            </div>

            <TableContainer className="shadow-e1">
              <Table className="border-separate border-spacing-0 text-left">
                <caption className="sr-only">{t("comparePage.caption", "Specification comparison")}</caption>
                <TableHeader className="static bg-surface-1 [&_tr]:border-0">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header, i) => (
                        <th
                          key={header.id}
                          scope="col"
                          className={cn(
                            "border-b border-separator bg-surface-1 p-3 text-left align-top font-normal sm:p-4",
                            i === 0
                              ? "sticky left-0 z-[1] w-28 min-w-28 sm:w-40 sm:min-w-40"
                              : "min-w-40 sm:min-w-48",
                          )}
                        >
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </TableHeader>
                <TableBody>
                  {/* "Hide identical rows" fades rows out/in; the rest glide into place (layout). */}
                  <AnimatePresence initial={false}>
                  {table.getRowModel().rows.map((row) => {
                    const r = row.original;
                    const dim = highlight && !r.differs;
                    const tint = highlight && r.differs;
                    return (
                      <motion.tr
                        key={r.def.key}
                        layout={motionCalm ? false : "position"}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: motionCalm ? 0 : duration.medium, ease: ease.standard } }}
                        exit={{ opacity: 0, transition: { duration: motionCalm ? 0 : duration.short, ease: ease.accelerate } }}
                        transition={motionCalm ? { duration: 0 } : spring.snappy}
                        className={cn("transition-colors duration-short", dim && "text-label-2")}
                      >
                        {row.getVisibleCells().map((cell, i) =>
                          i === 0 ? (
                            <th
                              key={cell.id}
                              scope="row"
                              className={cn(
                                "sticky left-0 z-[1] border-b border-separator bg-surface-1 p-3 text-left text-footnote font-semibold transition-colors duration-short sm:px-4",
                                tint ? "text-foreground" : "text-label-2",
                              )}
                            >
                              {/* Highlight tint fades (opacity) instead of snapping. */}
                              <span aria-hidden className="cmp-tint bg-primary/[0.07]" data-on={tint ? "true" : "false"} />
                              <span className="relative">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                            </th>
                          ) : (
                            <td key={cell.id} className={cn("num relative border-b border-separator p-3 align-top text-body sm:px-4", tint ? "text-foreground" : "")}>
                              <span aria-hidden className="cmp-tint bg-primary/[0.04]" data-on={tint ? "true" : "false"} />
                              <span className="relative block">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                            </td>
                          ),
                        )}
                      </motion.tr>
                    );
                  })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </TableContainer>

            <div className="mt-4 space-y-1.5 text-footnote text-label-2">
              <p className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {t(
                    "comparePage.fmvNote",
                    "FMV is what similar cars are typically asking, not a sale price or valuation.",
                  )}{" "}
                  <a href={howWePriceHref("fmv")} className="font-semibold text-primary">
                    {t("comparePage.howLink", "How we score prices")}
                    <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5" aria-hidden />
                  </a>
                </span>
              </p>
              <p className="pl-5">
                {t(
                  "comparePage.monthlyNote",
                  "Monthly est. = a bank loan at the CBSL maximum loan-to-value for the car's class (40–60%), 15% a year over 5 years. A planning figure only — lenders set the final terms.",
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </PageCanvas>
  );
}
