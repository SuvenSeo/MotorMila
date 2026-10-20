import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  headline: string;
  body?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  hint?: ReactNode;
  className?: string;
};

/** Illustration-less empty state: headline + body + optional action + hint. */
export function EmptyState({ headline, body, actionLabel, onAction, hint, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[2rem] border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-[14px] font-bold tracking-tight text-foreground">{headline}</p>
      {body ? <div className="max-w-md text-[13px] font-medium text-muted-foreground">{body}</div> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 rounded-full border border-border bg-card px-5 py-3 text-[13px] font-bold text-foreground transition-all hover:bg-surface active:scale-[0.97]"
        >
          {actionLabel}
        </button>
      ) : null}
      {hint ? <div className="max-w-md text-[11px] font-medium text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
