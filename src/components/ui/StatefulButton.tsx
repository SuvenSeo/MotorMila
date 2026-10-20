import type { ComponentProps, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StatefulButtonState = "idle" | "loading" | "success";

export type StatefulButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  state: StatefulButtonState;
  /** Content for each state. */
  idle: ReactNode;
  loading: ReactNode;
  success: ReactNode;
  className?: string;
};

/**
 * Stateful Button (#10 UI review).
 * Wraps the app Button and crossfades its label between idle / loading /
 * success states with a spring. Loading and success also force the disabled
 * state so double-submits are impossible. Zero new dependencies.
 */
export function StatefulButton({
  state,
  idle,
  loading,
  success,
  className,
  disabled,
  ...buttonProps
}: StatefulButtonProps) {
  const busy = state === "loading" || state === "success";
  return (
    <Button {...buttonProps} disabled={disabled || busy} className={cn("relative overflow-hidden", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className="inline-flex items-center justify-center"
          aria-live="polite"
        >
          {state === "idle" ? idle : state === "loading" ? loading : success}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}
