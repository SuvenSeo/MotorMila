import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  BarChart3,
  Calculator,
  Car,
  ChevronRight,
  Home,
  Scale,
  Search,
  Sparkles,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getMakes, getModelIndex } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { COMMAND_PALETTE_OPEN_EVENT } from "@/lib/commandPalette";

type PaletteAction = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  to: string;
};

const ACTIONS: PaletteAction[] = [
  { id: "market", label: "Market", hint: "Browse listings", icon: Home, to: "/#market" },
  { id: "trends", label: "Trends & Price Index", hint: "Market analytics", icon: BarChart3, to: "/trends" },
  { id: "best-picks", label: "Best Picks", hint: "Top deals", icon: Sparkles, to: "/best-picks" },
  { id: "calculator", label: "Import Calculator", hint: "Landed cost", icon: Calculator, to: "/calculator" },
  { id: "valuation", label: "Valuation", hint: "Estimate value", icon: Scale, to: "/estimate" },
  { id: "afford", label: "What can I afford?", hint: "Budget search", icon: Calculator, to: "/afford" },
  { id: "safe-transfer", label: "Safe-Transfer Kit", hint: "Ownership transfer", icon: Tag, to: "/safe-transfer" },
  { id: "ev-hub", label: "EV Hub", hint: "Electric vehicles", icon: Zap, to: "/ev-hub" },
  { id: "sell", label: "Sell Your Car", hint: "List a vehicle", icon: Tag, to: "/sell" },
];

const MAX_MODELS_PER_MAKE = 15;
const MAX_MODEL_ITEMS = 500;
const MAX_MAKE_ITEMS = 60;

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useAppPreferences();

  // ── Open / close ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open ]);

  // Close whenever the route changes (selection navigated).
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search, location.hash]);

  // ── Data (shared react-query caches — no duplicate fetching) ──
  const makesQuery = useQuery({
    queryKey: ["makes"],
    queryFn: getMakes,
    staleTime: QUERY_STALE.market,
  });
  const modelsQuery = useQuery({
    queryKey: ["model-index"],
    queryFn: getModelIndex,
    staleTime: QUERY_STALE.market,
    enabled: open,
  });

  const makes = useMemo(
    () => (makesQuery.data ?? []).slice(0, MAX_MAKE_ITEMS),
    [makesQuery.data],
  );

  const models = useMemo(() => {
    const rows = modelsQuery.data ?? [];
    const perMake = new Map<string, number>();
    const out: { make: string; model: string; count: number }[] = [];
    for (const row of rows) {
      if (out.length >= MAX_MODEL_ITEMS) break;
      const used = perMake.get(row.make) ?? 0;
      if (used >= MAX_MODELS_PER_MAKE) continue;
      perMake.set(row.make, used + 1);
      out.push(row);
    }
    return out;
  }, [modelsQuery.data]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
    if (!to.includes("#")) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("palette.label", "Search")}
    >
      <div
        className="animate-palette-backdrop-in absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="animate-palette-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover text-foreground shadow-soft-xl">
        <Command label={t("palette.label", "Search Motormila")}>
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              autoFocus
              placeholder={t("palette.placeholder", "Search makes, models, or go to…")}
              className="w-full bg-transparent py-3.5 text-body outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 rounded-md border border-border bg-foreground/[0.04] px-1.5 py-0.5 text-caption font-semibold text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[62vh] overflow-y-auto overscroll-contain p-2">
            <Command.Empty className="px-4 py-8 text-center text-footnote text-muted-foreground">
              {t("palette.empty", "No matches. Try a make like Toyota or a model like Corolla.")}
            </Command.Empty>

            {makes.length > 0 && (
              <Command.Group
                heading={t("palette.makes", "Makes")}
                className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-caps text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {makes.map((m) => (
                  <Command.Item
                    key={`make:${m.make}`}
                    value={`make ${m.make}`}
                    keywords={[`${m.count} listings`]}
                    onSelect={() => go(`/cars/${encodeURIComponent(m.make)}`)}
                    className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-footnote outline-none data-[selected=true]:bg-primary/10"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground/[0.04] text-muted-foreground group-data-[selected=true]:border-primary/30 group-data-[selected=true]:text-primary">
                      <Car className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{m.make}</span>
                    <span className="shrink-0 text-caption text-muted-foreground">
                      {formatCount(m.count)}
                    </span>
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100"
                      aria-hidden
                    />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {models.length > 0 && (
              <Command.Group
                heading={t("palette.models", "Models")}
                className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-caps text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {models.map((m) => (
                  <Command.Item
                    key={`model:${m.make}:${m.model}`}
                    value={`${m.make} ${m.model}`}
                    keywords={[m.make, `${m.count} listings`]}
                    onSelect={() =>
                      go(`/cars/${encodeURIComponent(m.make)}/${encodeURIComponent(m.model)}`)
                    }
                    className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-footnote outline-none data-[selected=true]:bg-primary/10"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{m.model}</span>
                      <span className="text-muted-foreground"> · {m.make}</span>
                    </span>
                    <span className="shrink-0 text-caption text-muted-foreground">
                      {formatCount(m.count)}
                    </span>
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100"
                      aria-hidden
                    />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading={t("palette.actions", "Go to")}
              className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-caps text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
            >
              {ACTIONS.map((a) => (
                <Command.Item
                  key={`action:${a.id}`}
                  value={`go to ${a.label} ${a.hint}`}
                  onSelect={() => go(a.to)}
                  className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-footnote outline-none data-[selected=true]:bg-primary/10"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground/[0.04] text-muted-foreground group-data-[selected=true]:border-primary/30 group-data-[selected=true]:text-primary">
                    <a.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{a.label}</span>
                  <span className="hidden shrink-0 text-caption text-muted-foreground sm:inline">
                    {a.hint}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-caption text-muted-foreground sm:flex">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-foreground/[0.04] px-1">↑↓</kbd>
              {t("palette.navigate", "navigate")}
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-foreground/[0.04] px-1">↵</kbd>
              {t("palette.select", "select")}
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-foreground/[0.04] px-1">esc</kbd>
              {t("palette.close", "close")}
            </span>
          </div>
        </Command>
      </div>
    </div>,
    document.body,
  );
}

// Re-export for tree-shaking clarity in App.tsx.
export default CommandPalette;
