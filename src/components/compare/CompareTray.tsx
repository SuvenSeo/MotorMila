import { useState, type CSSProperties } from "react";
import { AnimatePresence, m, motion } from "motion/react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronUp, Scale, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { useAppPreferences } from "@/lib/appPreferences";
import { useLowData } from "@/hooks/useLowData";
import { useCompare } from "./CompareContext";
import { duration, ease, fadeIn, spring, useReducedMotionOrLowData } from "@/lib/motion";

export { useCompare, CompareProvider, toPinnedListing } from "./CompareContext";
export type { CompareApi, PinnedListing } from "./CompareContext";

/**
 * Compact floating compare tray (ui/features).
 *
 * Mount once inside the router (integrator: replace the legacy
 * `@/components/CompareTray` mount in App.tsx with this one). Uses the shared
 * layer tokens from ui/shell (`--z-floating`, `--dock-*`) with fallbacks, so
 * it sits above the mobile bottom nav and below the header/dialogs.
 * Hidden on /compare itself and when nothing is selected.
 */
const TRAY_STYLE: CSSProperties = {
  zIndex: "var(--z-floating, 40)" as unknown as number,
  bottom:
    "calc(var(--dock-bottom, calc(4.75rem + env(safe-area-inset-bottom, 0px))) + var(--dock-extra, 0px) + var(--dock-gap, 0.75rem))",
};

function initials(make: string, model: string): string {
  return `${make?.[0] ?? ""}${model?.[0] ?? ""}`.toUpperCase() || "?";
}

/** Slides the tray up on a spring when the first car is added, down when cleared. */
export function CompareTray({ className }: { className?: string }) {
  const { count } = useCompare();
  const { pathname } = useLocation();
  const calm = useReducedMotionOrLowData();
  const show = count > 0 && pathname !== "/compare" && !pathname.startsWith("/compare/");
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          key="compare-tray"
          initial={calm ? "hidden" : { opacity: 0, y: 96 }}
          animate={calm ? "show" : { opacity: 1, y: 0, transition: spring.smooth }}
          exit={calm ? "exit" : { opacity: 0, y: 96, transition: { duration: duration.medium, ease: ease.accelerate } }}
          variants={fadeIn}
          style={TRAY_STYLE}
          className="fixed inset-x-3 mx-auto max-w-md md:inset-x-auto md:left-6 md:mx-0 md:w-[420px]"
        >
          <CompareTrayPanel className={className} />
        </m.div>
      )}
    </AnimatePresence>
  );
}

function CompareTrayPanel({ className }: { className?: string }) {
  const { items, count, max, remove, clear, href } = useCompare();
  const { lowData } = useLowData();
  const { t } = useAppPreferences();
  const calm = useReducedMotionOrLowData();
  const [expanded, setExpanded] = useState(false);
  const layoutT = calm ? { duration: 0 } : spring.snappy;

  const canCompare = count >= 2;
  const slots = Array.from({ length: max }, (_, i) => items[i] ?? null);

  return (
    <div
      role="region"
      aria-label={t("compareTray.region", "Compare tray")}
      className={cn("rounded-2xl border border-border bg-card shadow-soft-xl", className)}
    >
      {expanded && (
        <ul className="relative max-h-[50vh] space-y-1.5 overflow-auto border-b border-border p-2.5" aria-label={t("compareTray.listAria", "Selected vehicles")}>
          <AnimatePresence mode="popLayout" initial={false}>
          {items.map((p) => (
            <motion.li
              key={p.id}
              layout={!calm}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: duration.short, ease: ease.accelerate } }}
              transition={layoutT}
              className="flex items-center gap-2 rounded-xl bg-surface/60 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <Link to={`/listing/${p.id}`} className="block truncate text-footnote font-semibold text-foreground no-underline hover:text-primary-bright">
                  {p.year ? `${p.year} ` : ""}
                  {p.make} {p.model}
                </Link>
                <p className="num text-caption text-muted-foreground">
                  {p.price_lkr ? formatPriceLkrMillions(p.price_lkr) : t("compareTray.noPrice", "No price")}
                  {p.mileage_km != null ? ` · ${Number(p.mileage_km).toLocaleString()} km` : ""}
                  {p.district ? ` · ${p.district}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={t("compareTray.removeAria", "Remove {name} from compare", { name: `${p.make} ${p.model}` })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </motion.li>
          ))}
          <motion.li key="clear" layout={!calm} transition={layoutT}>
            <button
              type="button"
              onClick={() => {
                clear();
                setExpanded(false);
              }}
              className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl text-caption font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {t("compareTray.clear", "Clear all")}
            </button>
          </motion.li>
          </AnimatePresence>
        </ul>
      )}

      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? t("compareTray.collapse", "Hide selected vehicles") : t("compareTray.expand", "Show selected vehicles")}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-1.5 py-1 text-left hover:bg-accent"
        >
          <span className="relative flex -space-x-2" aria-hidden>
            <AnimatePresence mode="popLayout" initial={false}>
            {slots.map((p, i) =>
              p ? (
                <motion.span
                  key={p.id}
                  layout={!calm}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1, transition: calm ? { duration: 0 } : spring.expressive }}
                  exit={{ opacity: 0, scale: 0.5, transition: { duration: duration.short, ease: ease.accelerate } }}
                  transition={layoutT}
                  className="relative inline-flex"
                >
                {p.thumbnail_url && !lowData ? (
                  <img
                    src={p.thumbnail_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-lg border-2 border-card bg-surface object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-card bg-primary/15 text-caption font-bold text-primary-bright">
                    {initials(p.make, p.model)}
                  </span>
                )}
                </motion.span>
              ) : (
                <motion.span
                  key={`empty-${i}`}
                  layout={!calm}
                  transition={layoutT}
                  className="h-8 w-8 rounded-lg border-2 border-dashed border-border bg-transparent"
                />
              ),
            )}
            </AnimatePresence>
          </span>
          <span className="ml-1 flex min-w-0 items-center gap-1.5 truncate text-caption font-semibold text-foreground">
            {/* Count badge pops on every change. */}
            <m.span
              key={count}
              aria-hidden
              initial={calm ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.expressive}
              className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold text-primary-foreground"
            >
              {count}
            </m.span>
            <span className="truncate">{t("compareTray.count", "{count} of {max} selected", { count, max })}</span>
          </span>
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        </button>
        {canCompare ? (
          <Link
            to={href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-footnote font-bold text-primary-foreground no-underline hover:bg-primary/90"
          >
            <Scale className="h-4 w-4" aria-hidden />
            {t("compareTray.compare", "Compare")}
          </Link>
        ) : (
          <span className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-dashed border-border px-3 text-caption font-semibold text-muted-foreground">
            {t("compareTray.addOneMore", "Add 1 more")}
          </span>
        )}
      </div>
    </div>
  );
}

export default CompareTray;
