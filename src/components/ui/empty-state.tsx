import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: React.ReactNode;
  body?: React.ReactNode;
  actionLabel?: React.ReactNode;
  onAction?: () => void;
  /** A link/button element instead of onAction. */
  action?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
};

/** EmptyState — icon, title, body, one action. Calm, centred, no illustration. */
export function EmptyState({ icon: Icon = Inbox, title, body, actionLabel, onAction, action, hint, className }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center px-6 py-14 text-center content-in", className)}
      role="status"
      aria-live="polite"
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-label-2">
        <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-callout font-semibold text-foreground">{title}</p>
      {body ? <div className="mt-1.5 max-w-md text-body text-label-2">{body}</div> : null}
      {action ? (
        <div className="mt-5">{action}</div>
      ) : actionLabel && onAction ? (
        <Button variant="secondary" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {hint ? <div className="mt-3 max-w-md text-caption text-label-2">{hint}</div> : null}
    </div>
  );
}
