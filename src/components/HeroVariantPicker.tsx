import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppPreferences } from "@/lib/appPreferences";
import { HERO_VARIANTS, type HeroVariantId } from "@/lib/heroVariants";
import { cn } from "@/lib/utils";

export function HeroVariantPicker({
  activeId,
  onSelect,
}: {
  activeId: HeroVariantId;
  onSelect: (id: HeroVariantId) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [copiedId, setCopiedId] = useState<HeroVariantId | null>(null);
  const { resolvedTheme, setThemeMode } = useAppPreferences();
  const active = HERO_VARIANTS.find((v) => v.id === activeId) ?? HERO_VARIANTS[0];

  const copyShareUrl = (id: HeroVariantId) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.searchParams.set("hero", id);
    navigator.clipboard?.writeText(url.toString()).then(
      () => {
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
      },
      () => {
        /* ignore clipboard restrictions */
      },
    );
  };

  if (collapsed) {
    return (
      <div className="pointer-events-none fixed bottom-20 right-4 z-devtools flex justify-end md:bottom-5">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-caption font-semibold text-foreground shadow-e3 transition-colors hover:border-primary/40"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span>Hero preview: {active.code}</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-caption font-semibold text-primary">
            Switch
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-20 left-4 right-4 z-devtools flex justify-end md:bottom-4 md:left-auto md:right-4">
      <div className="pointer-events-auto w-full max-w-md rounded-card border border-border bg-card/95 p-3.5 shadow-e3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-caption font-semibold uppercase tracking-caps text-primary">
              Hero Preview Switcher
            </p>
            <p className="mt-0.5 text-caption text-label-2">
              5 redesign concepts + baseline · Preview only
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setThemeMode(resolvedTheme === "dark" ? "light" : "dark")}
              title={`Switch site to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch theme (currently ${resolvedTheme})`}
              className="inline-flex h-8 items-center gap-1 rounded-control border border-border bg-surface-2 px-2.5 text-caption font-medium text-foreground transition-colors hover:border-primary/40"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-3.5 w-3.5 text-primary" aria-hidden />
              ) : (
                <Moon className="h-3.5 w-3.5 text-primary" aria-hidden />
              )}
              <span>{resolvedTheme === "dark" ? "Dark" : "Light"}</span>
            </button>

            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Minimize hero switcher"
              className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface-2 text-label-2 transition-colors hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="mt-2.5 grid max-h-[38vh] gap-1.5 overflow-y-auto pr-1">
          {HERO_VARIANTS.map((v) => {
            const isActive = v.id === activeId;
            return (
              <div
                key={v.id}
                className={cn(
                  "flex items-stretch gap-1 rounded-control border p-1 transition-colors",
                  isActive
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-surface-1/60 hover:border-primary/30 hover:bg-surface-2/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(v.id)}
                  className="min-w-0 flex-1 rounded-control px-2.5 py-1.5 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-caption font-semibold text-foreground">
                      {v.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-caption font-medium text-label-2">
                      {v.tag}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-caption text-label-2">{v.blurb}</p>
                </button>

                <button
                  type="button"
                  onClick={() => copyShareUrl(v.id)}
                  title={`Copy direct link to ${v.label}`}
                  aria-label={`Copy link for ${v.label}`}
                  className="inline-flex w-8 shrink-0 items-center justify-center rounded-control text-label-2 transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {copiedId === v.id ? (
                    <Check className="h-3.5 w-3.5 text-deal-good-text" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
          <span className="text-caption text-label-3">
            URL param: <code className="text-foreground">?hero={active.id}</code>
          </span>
          <Link
            to={`/hero-lab?hero=${active.id}`}
            className="inline-flex items-center gap-1 text-caption font-semibold text-primary no-underline hover:underline"
          >
            Compare all <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
