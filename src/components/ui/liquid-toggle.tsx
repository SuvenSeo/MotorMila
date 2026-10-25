import { MoonStar, SunMedium } from "lucide-react";
import { cn } from "@/lib/utils";

export function LiquidToggle({
  checked,
  onCheckedChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("liquid-toggle-card", className)}>
      <div className="min-w-0">
        <p className="text-footnote font-bold text-foreground">{label}</p>
        {description ? <p className="mt-1 text-caption leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "liquid-toggle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked && "is-on"
        )}
      >
        <span className="liquid-toggle__track" aria-hidden="true">
          <span className="liquid-toggle__thumb">
            {checked ? <MoonStar className="h-3.5 w-3.5" /> : <SunMedium className="h-3.5 w-3.5" />}
          </span>
        </span>
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
