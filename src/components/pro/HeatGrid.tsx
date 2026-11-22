import { useId } from "react";
import { cn } from "@/lib/utils";

export type HeatRow = { key: string; label: string; meta?: string };
export type HeatCell = {
  /** 0–1 intensity; null renders the "no data" cell. */
  value: number | null;
  /** Text announced on hover/focus and used as the tooltip. */
  label: string;
};

/**
 * A rows × columns intensity grid — the Tracker idiom from Tremor (Apache-2.0),
 * rebuilt on theme tokens. Used for district × week supply and district ×
 * source coverage, where a chart would hide the gaps and a table would bury
 * them. Empty cells are drawn as an outline, never as zero intensity, so "no
 * data" can never be mistaken for "nothing happening".
 */
export function HeatGrid({
  rows,
  columns,
  cells,
  className,
  intensityLabel,
  compact = false,
}: {
  rows: HeatRow[];
  columns: { key: string; label: string }[];
  /** Keyed `${rowKey}|${columnKey}`. */
  cells: Record<string, HeatCell>;
  className?: string;
  /** What a filled cell means, for assistive tech: "new listings". */
  intensityLabel: string;
  /** Hides the row labels (used where the rows are already named beside it). */
  compact?: boolean;
}) {
  const titleId = useId();
  return (
    <div className={cn("min-w-0 overflow-x-auto", className)}>
      <table className="w-full border-separate border-spacing-[2px]" aria-labelledby={titleId}>
        <caption id={titleId} className="sr-only">
          {intensityLabel}
        </caption>
        <thead>
          <tr>
            {compact ? null : <th scope="col" className="w-[7.5rem] pr-2 text-left text-caption font-medium text-label-3" />}
            {columns.map((column) => (
              <th key={column.key} scope="col" className="pb-1 text-center text-caption font-medium tabular-nums text-label-3">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {compact ? null : (
                <th scope="row" className="max-w-[7.5rem] truncate pr-2 text-left text-caption font-semibold text-label-2" title={row.label}>
                  {row.label}
                </th>
              )}
              {columns.map((column) => {
                const cell = cells[`${row.key}|${column.key}`];
                const intensity = cell?.value ?? null;
                return (
                  <td key={column.key} className="p-0">
                    <div
                      role="img"
                      aria-label={cell?.label ?? `${row.label}, ${column.label}: no data`}
                      title={cell?.label ?? `${row.label}, ${column.label}: no data`}
                      className={cn(
                        "h-5 w-full min-w-4 rounded-[3px] border transition-colors",
                        intensity == null ? "border-dashed border-border bg-transparent" : "border-transparent",
                      )}
                      style={
                        intensity == null
                          ? undefined
                          : { backgroundColor: `hsl(var(--primary) / ${0.1 + Math.min(1, Math.max(0, intensity)) * 0.72})` }
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-caption text-label-3">
        <span>less</span>
        {[0.12, 0.3, 0.5, 0.7, 0.9].map((step) => (
          <span
            key={step}
            aria-hidden
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ backgroundColor: `hsl(var(--primary) / ${0.12 + step * 0.7})` }}
          />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}
