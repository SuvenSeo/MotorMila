import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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
};

/**
 * Motion-Primitives-style morphing dialog. The trigger element physically
 * morphs into the dialog panel through a shared layoutId animation, then
 * the full content crossfades in. Escape / backdrop click closes; body
 * scroll locks while open. Honors prefers-reduced-motion via framer-motion's
 * global reduced-motion handling.
 */
export function MorphingDialog({
  id,
  trigger,
  children,
  ariaLabel,
  triggerClassName,
  panelClassName,
}: MorphingDialogProps) {
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
  }, [open ]);

  return (
    <>
      <motion.button
        type="button"
        layoutId={frameId}
        onClick={() => setOpen(true)}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        style={{ visibility: open ? "hidden" : "visible" }}
        className={cn("relative", triggerClassName)}
        aria-haspopup="dialog"
      >
        {trigger}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setOpen(false)}
            aria-hidden={false}
          >
            <motion.div
              layoutId={frameId}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              onClick={(e) => e.stopPropagation()}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className={cn(
                "relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-soft-lg",
                panelClassName,
              )}
            >
              <motion.button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close dialog"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </motion.button>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.22 }}
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
