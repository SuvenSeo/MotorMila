import { cn } from "@/lib/utils";
import { Condition } from "@/types/car";

interface ConditionBadgeProps {
  condition: Condition | string | null | undefined;
  className?: string;
}

const conditionConfig: Record<Condition, { label: string; className: string }> = {
  brand_new: { label: "Brand New (0 Mileage)", className: "bg-primary/20 text-primary border border-primary/30" },
  reconditioned: { label: "Unregistered (Recon)", className: "bg-primary/15 text-primary border border-primary/25" },
  used: { label: "Registered / Pre-owned", className: "bg-secondary text-foreground border border-border" },
};

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  const config = condition ? conditionConfig[condition as Condition] : undefined;
  if (!config) {
    return (
      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold bg-muted text-muted-foreground", className)}>
        Unknown
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold", config.className, className)}>
      {config.label}
    </span>
  );
}
