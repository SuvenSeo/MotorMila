import { useState, type CSSProperties } from "react";
import { AnimatePresence, m, motion } from "motion/react";
import { Link, useLocation } from "react-router-dom";
import { ChevronUp, Scale, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { useAppPreferences } from "@/lib/appPreferences";
import { useLowData } from "@/hooks/useLowData";
import { useCompare } from "./CompareContext";
import { useDockExtra } from "@/lib/dock";
import { duration, ease, fadeIn, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";

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
  const dockExtra = useDockExtra();
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
          style={{ ...TRAY_STYLE, ["--dock-extra" as string]: `${dockExtra}px` }}
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
  const [countBefore, countAfter] = t("compareTray.count", "{count} of {max} selected", { count: "\u0000", max }).split("\u0000");
  const slots = Array.from({ length: max }, (_, i) => items[i] ?? null);

  return (
    <div
      role="region"
      aria-label={t("compareTray.region", "Compare tray")}
      className={cn("overflow-hidden rounded-card border border-border bg-popover text-popover-foreground shadow-e3", className)}
    >
      {expanded && (
        <ul className="relative max-h-[50vh] space-y-1 overflow-auto border-b border-separator p-2" aria-label={t("compareTray.listAria", "Selected vehicles")}>
          <AnimatePresence mode="popLayout" initial={false}>
          {items.map((p) => (
            <motion.li
              key={p.id}
              layout={!calm}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: duration.short, ease: ease.accelerate } }}
              transition={layoutT}
              className="flex items-center gap-2 rounded-control px-2.5 py-1.5 transition-colors duration-short hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <Link to={`/listing/${p.id}`} className="block truncate text-body font-semibold text-foreground no-underline transition-colors duration-short hover:text-primary">
                  {p.year ? `${p.year} ` : ""}
                  {p.make} {p.model}
                </Link>
                <p className="num truncate text-caption text-label-2">
                  {p.price_lkr ? formatPriceLkrMillions(p.price_lkr) : t("compareTray.noPrice", "No price")}
                  {p.mileage_km != null ? ` · ${Number(p.mileage_km).toLocaleString()} km` : ""}
                  {p.district ? ` · ${p.district}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(p.id)}
                aria-label={t("compareTray.removeAria", "Remove {name} from compare", { name: [p.make, p.model].filter(Boolean).join(" ") })}
                className="text-label-2"
              >
                <X aria-hidden />
              </Button>
            </motion.li>
          ))}
          <motion.li key="clear" layout={!calm} transition={layoutT}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                clear();
                setExpanded(false);
              }}
              className="w-full text-label-2"
            >
              <Trash2 aria-hidden />
              {t("compareTray.clear", "Clear all")}
            </Button>
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
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-control px-1.5 py-1 text-left transition-colors duration-short hover:bg-surface-2 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    referrerPolicy="no-referrer"
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-control border-2 border-popover bg-surface-2 object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-control border-2 border-popover bg-primary/15 text-caption font-semibold text-primary">
                    {initials(p.make, p.model)}
                  </span>
                )}
                </motion.span>
              ) : (
                <motion.span
                  key={`empty-${i}`}
                  layout={!calm}
                  transition={layoutT}
                  className="hidden h-8 w-8 rounded-control border-2 border-dashed border-border bg-transparent sm:block"
                />
              ),
            )}
            </AnimatePresence>
          </span>
          <span className="ml-1.5 flex min-w-0 items-center gap-1.5 truncate text-footnote font-semibold text-foreground">
            {/* Same sentence; the count digit rolls on every change. */}
            <span className="sr-only">{t("compareTray.count", "{count} of {max} selected", { count, max })}</span>
            <span aria-hidden className="truncate">
              {countBefore}
              <AnimatedNumber value={count} />
              {countAfter}
            </span>
          </span>
          <ChevronUp
            className={cn("h-4 w-4 shrink-0 text-label-2 transition-transform duration-medium ease-standard", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
        {canCompare ? (
          <Button asChild className="h-11 shrink-0 px-4">
            <Link to={href} className="no-underline">
              <Scale aria-hidden />
              {t("compareTray.compare", "Compare")}
            </Link>
          </Button>
        ) : (
          <span className="inline-flex h-11 shrink-0 items-center rounded-full border border-dashed border-border px-4 text-footnote font-semibold text-label-2">
            {t("compareTray.addOneMore", "Add 1 more")}
          </span>
        )}
      </div>
    </div>
  );
}

export default CompareTray;
