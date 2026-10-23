import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

/**
 * shadcn/ui "combobox" pattern — searchable select, hand-rolled (no cmdk dep).
 * Button trigger + filterable listbox popover. Keyboard: arrows + Enter + Esc.
 * Apex M tokens.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = "Select…",
  allLabel = "All",
  hideLabel = false,
}: {
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  allLabel?: string;
  /** Keep the label for screen readers only (when a parent group already shows a heading). */
  hideLabel?: boolean;
}) {
  const ALL_VALUE = "__all__";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const items: ComboboxOption[] = [{ value: ALL_VALUE, label: allLabel }, ...options];
  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open ]);

  useEffect(() => setActive(0), [query]);

  const pick = (item: ComboboxOption) => {
    onChange(item.value === ALL_VALUE ? null : item.value);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && filtered[active]) {
      e.preventDefault();
      pick(filtered[active]);
    }
  };

  const selectedLabel = value ? items.find((i) => i.value === value)?.label : undefined;

  return (
    // Keyboard handling is delegated from the trigger button / search input inside.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <label className={hideLabel ? "sr-only" : "mb-1.5 block text-caption font-semibold uppercase tracking-caps text-muted-foreground"}>
        {label}
      </label>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3.5 text-left text-body text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-muted-foreground/50",
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-soft-lg">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              // Focus moves into the list's search field when the popup opens (combobox pattern).
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label}`}
              className="h-11 w-full bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={label} className="max-h-56 overflow-auto py-1.5">
            {filtered.length === 0 && (
              <li className="px-3.5 py-2.5 text-footnote text-muted-foreground">No matches.</li>
            )}
            {filtered.map((item, i) => {
              const selected = (value ?? ALL_VALUE) === item.value;
              return (
                <li key={item.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(item)}
                    className={cn(
                      "flex min-h-[40px] w-full items-center gap-2 px-3.5 text-left text-body",
                      i === active ? "bg-primary/10 text-foreground" : "text-foreground",
                      selected && "font-semibold",
                    )}
                  >
                    <Check
                      className={cn("h-4 w-4 shrink-0 text-primary", !selected && "invisible")}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
