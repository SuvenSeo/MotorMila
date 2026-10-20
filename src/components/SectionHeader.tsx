import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  titleClassName,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end", className)}>
      <div className="max-w-2xl animate-fade-up">
        {eyebrow ? (
          <p className="mb-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
            {eyebrow}
          </p>
        ) : null}
        <h2 className={cn("display-2 text-foreground", titleClassName)}>
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground sm:text-base">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="shrink-0 animate-fade-up" style={{ animationDelay: "60ms" }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
