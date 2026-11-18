import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, Map, Moon, Sun } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { BrandLogo } from "@/components/BrandLogo";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  HERO_VARIANTS,
  PREVIEW_DEFAULT_HERO_VARIANT_ID,
  getHeroVariant,
  isHeroVariantId,
  storeHeroVariantId,
  type HeroVariantId,
} from "@/lib/heroVariants";
import { cn } from "@/lib/utils";

export default function HeroLab() {
  const [params, setParams] = useSearchParams();
  const { resolvedTheme, setThemeMode } = useAppPreferences();
  const paramId = params.get("hero");
  const [activeId, setActiveId] = useState<HeroVariantId>(
    isHeroVariantId(paramId) ? paramId : PREVIEW_DEFAULT_HERO_VARIANT_ID,
  );
  const variant = useMemo(() => getHeroVariant(activeId), [activeId]);

  const select = (id: HeroVariantId) => {
    setActiveId(id);
    storeHeroVariantId(id);
    const next = new URLSearchParams(params);
    next.set("hero", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 px-4 py-3.5 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link to={`/?hero=${activeId}`} className="no-underline">
              <BrandLogo size="compact" showTagline={false} />
            </Link>
            <div>
              <p className="text-caption font-semibold uppercase tracking-caps text-primary">
                MotorMila Hero Gallery
              </p>
              <p className="text-footnote text-label-2">
                Compare all 5 redesigned directions + current baseline on live pages
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setThemeMode(resolvedTheme === "dark" ? "light" : "dark")}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-1 px-3 py-2 text-caption font-semibold text-foreground transition-colors hover:border-primary/40"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-3.5 w-3.5 text-primary" aria-hidden />
              ) : (
                <Moon className="h-3.5 w-3.5 text-primary" aria-hidden />
              )}
              <span>{resolvedTheme === "dark" ? "Dark theme" : "Light theme"}</span>
            </button>

            <Link
              to={`/?hero=${activeId}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-caption font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
            >
              Open live site with {variant.code} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-card border border-border bg-surface-1 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-caption font-semibold text-primary">
                {variant.tag}
              </span>
              <h1 className="mt-2 font-display text-title1 font-semibold text-foreground">
                {variant.label}
              </h1>
              <p className="mt-2 text-body text-label-2">{variant.rationale}</p>
            </div>
            <Link
              to={`/?hero=${variant.id}`}
              className="inline-flex items-center gap-1.5 rounded-control border border-primary/40 bg-primary/10 px-4 py-2.5 text-footnote font-semibold text-primary no-underline transition-colors hover:bg-primary/20"
            >
              Preview live (`?hero={variant.id}`) <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HERO_VARIANTS.map((v) => {
            const selected = v.id === activeId;
            return (
              <div
                key={v.id}
                className={cn(
                  "flex flex-col overflow-hidden rounded-card border bg-surface-1 transition-ui",
                  selected ? "border-primary ring-2 ring-primary/25 shadow-e2" : "border-border shadow-e1",
                )}
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-2">
                  {v.image ? (
                    <AtmosphericImage
                      src={v.image.srcSm}
                      alt={v.label}
                      className="h-full w-full object-cover"
                      sizes="420px"
                    />
                  ) : v.id === "evidence" ? (
                    <div className="flex h-full flex-col justify-between bg-surface-2 p-4">
                      <div className="flex items-center justify-between text-caption text-label-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                          <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Fair-Price Histogram
                        </span>
                        <span className="rounded-full bg-deal-good/15 px-2 py-0.5 font-semibold text-deal-good-text">
                          Zero AI Image
                        </span>
                      </div>
                      <div className="flex h-16 items-end gap-1.5">
                        {[24, 48, 80, 100, 74, 45, 22].map((h, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 rounded-t-control",
                              i <= 2 ? "bg-deal-good" : i === 3 ? "bg-primary" : "bg-foreground/20",
                            )}
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-between bg-surface-2 p-4">
                      <div className="flex items-center justify-between text-caption text-label-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                          <Map className="h-3.5 w-3.5" aria-hidden /> 25-District Choropleth
                        </span>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
                          Real GeoJSON
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-caption">
                        <div className="rounded-control border border-border bg-surface-1 p-2">
                          <span className="block text-label-3">Colombo</span>
                          <span className="num font-semibold text-foreground">Rs 9.6M</span>
                        </div>
                        <div className="rounded-control border border-border bg-surface-1 p-2">
                          <span className="block text-label-3">Gampaha</span>
                          <span className="num font-semibold text-foreground">Rs 6.2M</span>
                        </div>
                        <div className="rounded-control border border-border bg-surface-1 p-2">
                          <span className="block text-label-3">Kandy</span>
                          <span className="num font-semibold text-foreground">Rs 4.7M</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full border border-border bg-background/85 px-2.5 py-0.5 text-caption font-semibold text-foreground">
                    {v.code} · {v.tag}
                  </span>
                </div>

                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <h2 className="font-display text-callout font-semibold text-foreground">
                      {v.label}
                    </h2>
                    <p className="mt-1 text-caption leading-relaxed text-label-2">{v.blurb}</p>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => select(v.id)}
                      className={cn(
                        "flex-1 rounded-control border px-3 py-2 text-caption font-semibold transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-surface-2 text-foreground hover:border-primary/40",
                      )}
                    >
                      {selected ? "Selected" : "Inspect notes"}
                    </button>
                    <Link
                      to={`/?hero=${v.id}`}
                      className="inline-flex items-center gap-1 rounded-control bg-primary px-3 py-2 text-caption font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
                    >
                      Live preview <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
