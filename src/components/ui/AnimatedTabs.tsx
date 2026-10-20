import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type AnimatedTab = {
  id: string;
  label: string;
};

export type AnimatedTabsProps = {
  tabs: AnimatedTab[];
  activeId: string;
  onChange: (id: string) => void;
  /** Shared layout id — keep unique per instance on the page. */
  layoutId?: string;
  className?: string;
  ariaLabel?: string;
};

/**
 * Animated Tabs (#9 UI review).
 * A segmented pill group where the active background glides between tabs
 * via a shared framer-motion layoutId. Zero new dependencies.
 * Keyboard friendly: real buttons in a tablist with aria-selected.
 */
export function AnimatedTabs({
  tabs,
  activeId,
  onChange,
  layoutId = "animated-tabs-pill",
  className,
  ariaLabel,
}: AnimatedTabsProps) {
  if (tabs.length === 0) return null;
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border/80 bg-surface/70 p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative rounded-full px-4 py-2 text-[11px] font-semibold transition-colors active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full border border-primary/40 bg-primary/10 shadow-soft"
              />
            ) : null}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
