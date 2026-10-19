import {
  type ReactNode,
  type ComponentPropsWithoutRef,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function AnimatedListItem({
  children,
}: {
  children: ReactNode;
}) {
  const animations = {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1, originY: 0 },
    exit: { scale: 0, opacity: 0 },
    transition: { type: "spring" as const, stiffness: 350, damping: 40 },
  };

  return (
    <motion.div {...animations} layout className="mx-auto w-full">
      {children}
    </motion.div>
  );
}

export interface AnimatedListProps
  extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  delay?: number;
}

export const AnimatedList = ({
  children,
  className,
  delay = 1000,
  ...props
}: AnimatedListProps) => {
  const [index, setIndex] = useState(0);
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children],
  );

  useEffect(() => {
    if (index < childrenArray.length - 1) {
      const timeout = setTimeout(() => {
        setIndex((prevIndex) => (prevIndex + 1) % childrenArray.length);
      }, delay);

      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [index, delay, childrenArray.length]);

  const itemsToShow = useMemo(() => {
    const result = childrenArray.slice(0, index + 1).reverse();
    return result;
  }, [index, childrenArray]);

  return (
    <div
      className={cn(`flex flex-col items-center gap-4`, className)}
      aria-live="polite"
      {...props}
    >
      <AnimatePresence>
        {itemsToShow.map((item, itemIndex) => (
          <AnimatedListItem key={itemIndex}>{item}</AnimatedListItem>
        ))}
      </AnimatePresence>
    </div>
  );
};

AnimatedList.displayName = "AnimatedList";
