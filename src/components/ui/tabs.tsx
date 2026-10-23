import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { m } from "motion/react";

import { cn } from "@/lib/utils";
import { spring, usePrefersReducedMotionOrLowData } from "@/lib/motion";

/**
 * Tabs (Radix) with a sliding selected pill (motion `layoutId`). The pill
 * springs between triggers; reduced motion snaps it. Value is tracked here so
 * the indicator can render inside the active trigger.
 */
const TabsIndicatorContext = React.createContext<{ value?: string; id: string }>({ id: "tabs" });

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const id = React.useId();
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  return (
    <TabsIndicatorContext.Provider value={{ value: current, id }}>
      <TabsPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(v) => {
          setInner(v);
          onValueChange?.(v);
        }}
        {...props}
      />
    </TabsIndicatorContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center gap-0.5 rounded-full bg-surface-2 p-1 text-label-2",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const ctx = React.useContext(TabsIndicatorContext);
  const calm = usePrefersReducedMotionOrLowData();
  const active = ctx.value === value;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full px-3.5 text-footnote font-semibold transition-colors duration-short ease-standard hover:text-foreground data-[state=active]:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {active ? (
        <m.span
          layoutId={`${ctx.id}-tab-pill`}
          aria-hidden
          className="absolute inset-0 rounded-full bg-background shadow-e1 dark:bg-surface-3"
          transition={calm ? { duration: 0 } : spring.snappy}
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-3 data-[state=active]:animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
