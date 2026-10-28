import { useEffect, useId, useState, type ReactNode } from "react";
import { tween } from "@/lib/motion";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";

type MorphingDialogProps = {
  /** Unique namespace for the shared-layout morph. Auto-generated when omitted. */
  id?: string;
  /** The visible trigger — morphs into the dialog panel on open. */
  trigger: ReactNode;
  /** Dialog body content. */
  children: ReactNode;
  /** Accessible name for the dialog. */
  ariaLabel: string;
  /** Extra classes for the trigger element. */
  triggerClassName?: string;
  /** Extra classes for the dialog panel. */
  panelClassName?: string;
  /** Corner radius of the trigger in px (default: a 24px-tall pill), so the morph interpolates real radii. */
  triggerRadius?: number;
};

/** One critically damped spring for the morph both ways (~300ms, no overshoot). */
const MORPH = { type: "spring", visualDuration: 0.3, bounce: 0 } as const;
/** Panel corner radius (rounded-3xl) as a motion value, so it isn't stretched mid-morph. */
const PANEL_RADIUS = 24;

/**
 * Motion-Primitives-style morphing dialog. The trigger element physically
 * morphs into the dialog panel through a shared layoutId animation, then
 * the full content crossfades in. Escape / backdrop click closes; body
 * scroll locks while open. Honors prefers-reduced-motion via framer-motion's
 * global reduced-motion handling.
 *
 * Shared-layout morphs scale the box, so everything inside it is counter-scaled
 * (`layout="position"`) and the radius is a motion value: the trigger label and
 * the dialog text used to stretch and squash while the box grew and shrank.
 */
export function MorphingDialog({
  id,
  trigger,
  children,
  ariaLabel,
  triggerClassName,
  panelClassName,
  triggerRadius = 12,
}: MorphingDialogProps) {
  const { t } = useAppPreferences();
  const autoId = useId();
  const namespace = (id ?? autoId).replace(/[^a-zA-Z0-9-_]/g, "");
  const frameId = `morph-${namespace}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <motion.button
        type="button"
        layoutId={frameId}
        onClick={() => setOpen(true)}
        transition={MORPH}
        style={{ visibility: open ? "hidden" : "visible", borderRadius: triggerRadius }}
        className={cn("relative", triggerClassName)}
        aria-haspopup="dialog"
      >
        <motion.span layout="position" transition={MORPH} className="inline-flex items-center gap-[inherit]">
          {trigger}
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tween.short}
            className="fixed inset-0 z-[70] flex items-end justify-center bg-background p-4 sm:items-center"
            onClick={() => setOpen(false)}
            aria-hidden={false}
          >
            <motion.div
              layoutId={frameId}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              onClick={(e) => e.stopPropagation()}
              transition={MORPH}
              style={{ borderRadius: PANEL_RADIUS }}
              className={cn(
                "relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-soft-lg",
                panelClassName,
              )}
            >
              <motion.button
                type="button"
                layout="position"
                onClick={() => setOpen(false)}
                aria-label={t("morphingDialog.close", "Close dialog")}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, layout: MORPH }}
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </motion.button>
              <motion.div
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...tween.short, delay: 0.12, layout: MORPH }}
              >
                {children}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
