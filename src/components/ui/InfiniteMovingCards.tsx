import { useMemo, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MarqueeSpeed = "fast" | "normal" | "slow";
export type MarqueeDirection = "left" | "right";

const SPEEDS: Record<MarqueeSpeed, string> = {
  fast: "22s",
  normal: "45s",
  slow: "80s",
};

interface InfiniteMovingCardsProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyOf: (item: T, index: number) => string | number;
  direction?: MarqueeDirection;
  speed?: MarqueeSpeed;
  pauseOnHover?: boolean;
  className?: string;
  itemClassName?: string;
}

/**
 * InfiniteMovingCards — an endlessly scrolling marquee of cards (Aceternity-style).
 *
 * Renders the item list twice (the second copy is aria-hidden) and translates
 * the track -50% on a loop, so the motion is seamless. Pure CSS animation —
 * no canvas, no scroll-jacking — and it fully stops under
 * prefers-reduced-motion.
 */
export function InfiniteMovingCards<T>({
  items,
  renderItem,
  keyOf,
  direction = "left",
  speed = "normal",
  pauseOnHover = true,
  className,
  itemClassName,
}: InfiniteMovingCardsProps<T>) {
  const copies = useMemo(() => (items.length >= 6 ? 2 : 4), [items.length]);

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "[mask-image:linear-gradient(to_right,transparent,white_8%,white_92%,transparent)]",
        className,
      )}
      style={{ "--marquee-duration": SPEEDS[speed] } as CSSProperties}
    >
      <div
        className={cn(
          "flex w-max min-w-full shrink-0 flex-nowrap py-1",
          "animate-infinite-scroll",
          direction === "right" && "[animation-direction:reverse]",
          pauseOnHover && "hover:[animation-play-state:paused]",
          "motion-reduce:animate-none",
        )}
      >
        {Array.from({ length: copies }).map((_, copy) => (
          <div
            key={copy}
            aria-hidden={copy > 0}
            className="contents"
          >
            {items.map((item, index) => (
              // Padding (not flex gap) so a -50% track shift lands exactly on
              // a copy boundary and the loop is seamless.
              <div
                key={`${keyOf(item, index)}-${copy}`}
                className={cn("w-[240px] shrink-0 pr-2.5 sm:w-[280px]", itemClassName)}
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
