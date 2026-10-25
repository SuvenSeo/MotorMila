import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";

export function ErrorFallback({
  onReload,
  errorMessage,
}: {
  onReload: () => void;
  errorMessage: string | null;
}) {
  const { t } = useAppPreferences();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-soft-lg"
      >
        <p className="text-caption font-medium text-muted-foreground">
          {t("errorBoundary.eyebrow", "Motormila")}
        </p>
        <h1 className="mt-3 font-display text-title3 font-semibold text-foreground">
          {t("errorBoundary.title", "Something went wrong.")}
        </h1>
        <p className="mt-2 text-caption text-muted-foreground">
          {t("errorBoundary.body", "Check the browser console for the runtime error.")}
        </p>
        {errorMessage && (
          <p className="mt-3 break-all rounded-2xl border border-border bg-surface px-3 py-2 font-mono text-caption text-muted-foreground">
            {errorMessage}
          </p>
        )}
        <motion.button
          type="button"
          onClick={onReload}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={spring.snappy}
          className="mt-5 h-9 rounded-2xl bg-primary px-5 text-caption font-semibold text-white hover:bg-primary/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t("errorBoundary.reload", "Reload App")}
        </motion.button>
      </motion.div>
    </div>
  );
}
