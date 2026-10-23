import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppPreferences } from "@/lib/appPreferences";

type ErrorStateProps = {
  title?: React.ReactNode;
  body?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: React.ReactNode;
  className?: string;
};

/** ErrorState — what went wrong in plain words, and one way forward. */
export function ErrorState({ title, body, onRetry, retryLabel, className }: ErrorStateProps) {
  const { t } = useAppPreferences();
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center content-in", className)} role="alert">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-deal-caution/10 text-deal-caution-text">
        <AlertTriangle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-callout font-semibold text-foreground">{title ?? t("ui.error.title", "Something didn't load")}</p>
      <div className="mt-1.5 max-w-md text-body text-label-2">
        {body ?? t("ui.error.body", "Check your connection and try again. Your filters are kept.")}
      </div>
      {onRetry ? (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          <RotateCw aria-hidden />
          {retryLabel ?? t("ui.error.retry", "Try again")}
        </Button>
      ) : null}
    </div>
  );
}
