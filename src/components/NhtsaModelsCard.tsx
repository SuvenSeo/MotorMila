import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getNhtsaModels } from "@/services/api";
import type { NhtsaModel } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";

interface NhtsaModelsCardProps {
  make: string;
  /** When provided the card header says "Catalog models for {make} matching {model}". */
  model?: string;
  /** Compact variant — used on ListingDetail sidebar. */
  compact?: boolean;
}

export function NhtsaModelsCard({ make, model, compact = false }: NhtsaModelsCardProps) {
  const { t } = useAppPreferences();
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["nhtsa-models", make],
    queryFn: () => getNhtsaModels(make),
    enabled: Boolean(make) && open,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const allModels: NhtsaModel[] = data?.models ?? [];
  const matchedModels = model
    ? allModels.filter(
        (m) =>
          m.model.toLowerCase().includes(model.toLowerCase()) ||
          model.toLowerCase().includes(m.model.toLowerCase()),
      )
    : allModels;
  const displayModels = matchedModels.length > 0 ? matchedModels : allModels;

  const label = model
    ? t("nhtsa.cardLabelModel", "NHTSA catalog — {make} · {model}", { make, model })
    : t("nhtsa.cardLabel", "NHTSA catalog — {make} models", { make });

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <BookOpen aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-[12px] font-semibold text-muted-foreground truncate">
            {label}
          </span>
        </div>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="nhtsa-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 pb-5 pt-4">
              {isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
                    <div key={i} className="h-7 rounded-2xl bg-surface animate-pulse" />
                  ))}
                </div>
              )}

              {isError && (
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t("nhtsa.loadError", "Could not load NHTSA catalog. NHTSA may be temporarily unavailable.")}
                </p>
              )}

              {!isLoading && !isError && displayModels.length === 0 && (
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t("nhtsa.empty", "No catalog entries found for this make.")}
                </p>
              )}

              {!isLoading && !isError && displayModels.length > 0 && (
                <>
                  <p className="mb-3 text-[10px] font-semibold text-muted-foreground">
                    {t("nhtsa.sourceNote", "Source: NHTSA vPIC · {count} models", {
                      count: data?.count ?? displayModels.length,
                    })}
                  </p>
                  <div
                    className={`grid gap-1.5 ${compact ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}
                  >
                    {displayModels.slice(0, compact ? 8 : 60).map((m) => (
                      <div
                        key={`${m.make_id}-${m.model_id}`}
                        className="rounded-2xl border border-border bg-surface px-2.5 py-1.5"
                      >
                        <p className="text-[11px] font-semibold text-foreground leading-snug">{m.model}</p>
                        {!compact && m.model_id && (
                          <p className="text-[9px] font-medium text-muted-foreground/70">ID {m.model_id}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {displayModels.length > (compact ? 8 : 60) && (
                    <p className="mt-3 text-[10px] font-medium text-muted-foreground">
                      {t("nhtsa.moreModels", "+{n} more in catalog", {
                        n: displayModels.length - (compact ? 8 : 60),
                      })}
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
