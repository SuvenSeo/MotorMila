import type { ReactNode } from "react";
import { EmptyState as UiEmptyState } from "@/components/ui/empty-state";

type EmptyStateProps = {
  headline: string;
  body?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  hint?: ReactNode;
  className?: string;
};

/** Older API (headline) over the kit's EmptyState (components/ui/empty-state). */
export function EmptyState({ headline, ...rest }: EmptyStateProps) {
  return <UiEmptyState title={headline} {...rest} />;
}
