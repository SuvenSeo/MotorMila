import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Info, Link2, Plus, Scale, Search, X } from "lucide-react";
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
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <span className="block text-caption font-normal text-muted-foreground">
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
            <span className="block text-caption font-normal text-muted-foreground">
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
            <span className="block text-caption font-normal text-muted-foreground">
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
            <div className="flex min-w-0 flex-col gap-2">
              {!lowData && l.thumbnail_url ? (
                <img src={l.thumbnail_url} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-lg bg-surface object-cover" />
              ) : null}
              <div className="flex items-start justify-between gap-1">
                <Link to={`/listing/${l.id}`} className="min-w-0 text-footnote font-semibold leading-snug text-foreground no-underline hover:text-primary-bright">
                  {l.year} {l.make} {l.model}
                  {l.variant ? <span className="block text-caption font-normal text-muted-foreground">{l.variant}</span> : null}
                </Link>
                <button
                  type="button"
                  onClick={() => removeId(Number(l.id))}
                  aria-label={t("compareTray.removeAria", "Remove {name} from compare", { name: `${l.make} ${l.model}` })}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <SellSpeedBadge make={l.make} model={l.model} className="self-start" />
            </div>
          ),
          cell: (ctx) => {
            const r = ctx.row.original;
            const isBest = highlight && r.best.has(index);
            return (
              <span className={cn("block", isBest && "font-bold text-deal-good-text")}>
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
  const enough = listings.length >= 2;

  return (
    <PageCanvas ambient="none">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6 flex items-start gap-3">
          <Link
            to="/"
            className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
            aria-label={t("comparePage.back", "Back to listings")}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="font-display text-title2 font-semibold tracking-tight text-foreground md:text-title1">
              {t("comparePage.title", "Compare cars")}
            </h1>
            <p className="mt-1 text-footnote text-muted-foreground">
              {t("comparePage.subtitle", "Side by side, up to {max} cars. Prices are asking prices from the original ads.", { max: MAX_COMPARE })}
            </p>
          </div>
        </div>

        {loading && listings.length === 0 && (
          <div className="space-y-2" aria-busy="true">
            <div className="h-28 animate-pulse rounded-2xl border border-border bg-surface" />
            <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-footnote text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && (!hasIds || !enough) && (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/85 px-6 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary-bright">
              <Scale className="h-7 w-7" aria-hidden />
            </div>
            <h2 className="mb-2 font-display text-title3 font-semibold text-foreground">
              {listings.length === 1 ? t("comparePage.needOneMore", "Add one more car to compare") : t("comparePage.emptyTitle", "No cars selected yet")}
            </h2>
            <p className="mb-6 max-w-sm text-footnote text-muted-foreground">
              {t("comparePage.emptyBody", "Tap “Compare” on any listing to add it here. You can pick up to {max}.", { max: MAX_COMPARE })}
            </p>
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-footnote font-semibold text-foreground no-underline hover:bg-surface">
              <Search className="h-4 w-4" aria-hidden />
              {t("comparePage.browse", "Browse listings")}
            </Link>
          </div>
        )}

        {!error && enough && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 text-caption font-semibold text-foreground">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
                  {t("comparePage.highlight", "Highlight differences")}
                </label>
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 text-caption font-semibold text-foreground">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                  {t("comparePage.onlyDiff", "Hide identical rows")}
                </label>
              </div>
              <div className="flex items-center gap-2">
                {listings.length < MAX_COMPARE ? (
                  <Link to="/" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-caption font-semibold text-foreground no-underline hover:border-primary/40">
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {t("comparePage.addMore", "Add a car")}
                  </Link>
                ) : null}
                <button type="button" onClick={copyLink} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-caption font-semibold text-foreground hover:border-primary/40">
                  <Link2 className="h-3.5 w-3.5" aria-hidden />
                  {t("comparePage.share", "Share")}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full border-separate border-spacing-0 text-left text-footnote">
                <caption className="sr-only">{t("comparePage.caption", "Specification comparison")}</caption>
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header, i) => (
                        <th
                          key={header.id}
                          scope="col"
                          className={cn(
                            "border-b border-border bg-card p-3 align-top font-normal",
                            i === 0
                              ? "sticky left-0 w-[112px] min-w-[112px] sm:w-[160px] sm:min-w-[160px]"
                              : "min-w-[150px] sm:min-w-[180px]",
                          )}
                          style={i === 0 ? { zIndex: "var(--z-base, 1)" as unknown as number } : undefined}
                        >
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
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
                        className={cn("transition-colors duration-short", dim && "text-muted-foreground")}
                      >
                        {row.getVisibleCells().map((cell, i) =>
                          i === 0 ? (
                            <th
                              key={cell.id}
                              scope="row"
                              className={cn(
                                "sticky left-0 border-b border-border/70 bg-card p-3 text-caption font-semibold transition-colors duration-short",
                                tint ? "text-foreground" : "text-muted-foreground",
                              )}
                              style={{ zIndex: "var(--z-base, 1)" as unknown as number }}
                            >
                              {/* Highlight tint fades (opacity) instead of snapping. */}
                              <span aria-hidden className="cmp-tint bg-primary/[0.07]" data-on={tint ? "true" : "false"} />
                              <span className="relative">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                            </th>
                          ) : (
                            <td key={cell.id} className={cn("num relative border-b border-border/70 p-3 align-top", tint ? "text-foreground" : "")}>
                              <span aria-hidden className="cmp-tint bg-primary/[0.04]" data-on={tint ? "true" : "false"} />
                              <span className="relative block">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                            </td>
                          ),
                        )}
                      </motion.tr>
                    );
                  })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-1.5 text-caption text-muted-foreground">
              <p className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {t(
                    "comparePage.fmvNote",
                    "FMV is what similar cars are typically asking, not a sale price or valuation.",
                  )}{" "}
                  <a href={howWePriceHref("fmv")} className="font-semibold text-primary-bright">
                    {t("comparePage.howLink", "How we score prices")}
                    <ArrowUpRight className="ml-0.5 inline h-3 w-3" aria-hidden />
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
          </>
        )}
      </div>
    </PageCanvas>
  );
}
