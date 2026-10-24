import { cn } from "@/lib/utils";

type PageBodyProps = {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
  wide?: boolean;
};

export function PageBody({ children, className, narrow, wide }: PageBodyProps) {
  return (
    <div
      className={cn(
        "relative z-10 mx-auto w-full px-5 py-12 sm:px-6 lg:px-8 lg:py-16",
        narrow ? "max-w-5xl" : wide ? "max-w-[1560px]" : "max-w-[1320px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
