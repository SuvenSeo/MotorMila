import { motion } from "motion/react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { revealContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

type PageCanvasProps = {
  children: React.ReactNode;
  className?: string;
  /** "none": plain page, no decorative orbs/wash (task pages like Compare). */
  ambient?: "default" | "hero" | "subtle" | "none";
};

export function PageCanvas({ children, className, ambient = "default" }: PageCanvasProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className={cn(
        "page-canvas relative min-h-screen overflow-hidden -mt-[var(--nav-offset)]",
        ambient === "none" && "before:hidden",
        className,
      )}
    >
      {ambient === "none" ? null : <AmbientBackground variant={ambient} />}
      <div className="page-canvas__content relative z-[1] pt-[var(--nav-offset)]">{children}</div>
    </motion.div>
  );
}
