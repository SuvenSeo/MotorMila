import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table — sticky header, row hover, numeric alignment (`numeric` cells use
 * tabular figures, right-aligned). Wrap in <TableContainer> for horizontal
 * scroll on small screens.
 */
const TableContainer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("relative w-full overflow-auto rounded-card border border-border bg-surface-1", className)} {...props} />
);

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <table ref={ref} className={cn("w-full caption-bottom border-collapse text-footnote", className)} {...props} />
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("sticky top-0 z-10 bg-surface-2 [&_tr]:border-b [&_tr]:border-separator", className)} {...props} />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />,
);
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn("border-b border-separator transition-colors duration-micro hover:bg-surface-2/60 data-[state=selected]:bg-primary/5", className)}
    {...props}
  />
));
TableRow.displayName = "TableRow";

type CellProps = { numeric?: boolean };

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement> & CellProps>(
  ({ className, numeric, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 px-4 text-left align-middle text-caption font-semibold uppercase tracking-caps text-label-2",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement> & CellProps>(
  ({ className, numeric, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("px-4 py-3 align-middle text-foreground", numeric && "text-right tabular-nums", className)}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = ({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) => (
  <caption className={cn("mt-3 text-caption text-label-2", className)} {...props} />
);

export { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
