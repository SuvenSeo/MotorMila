import { useState, useEffect } from "react";
import { Sparkles, Check, ChevronUp, ChevronDown, Layers } from "lucide-react";

export interface FontPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  displayFamily: string;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: "satoshi-inter",
    name: "Satoshi + Inter",
    badge: "Top Pick • 2026 Standard",
    description: "Satoshi 500 headings (-2% tracking) + Inter 400 UI. Polestar, Rivian, and Lucid vibes.",
    displayFamily: "'Satoshi', sans-serif",
  },
  {
    id: "general-sans-inter",
    name: "General Sans + Inter",
    badge: "Mobility / Marketplace",
    description: "Squared terminals, high x-height, engineered automotive stance.",
    displayFamily: "'General Sans', sans-serif",
  },
  {
    id: "sora-inter",
    name: "Sora + Inter",
    badge: "Modern EV / Tesla OS",
    description: "Sora 500 geometric display + Inter 400 UI. Crisp in-car telemetry look.",
    displayFamily: "'Sora', sans-serif",
  },
  {
    id: "satoshi-pure",
    name: "Pure Satoshi",
    badge: "Single-Family OEM",
    description: "Display 500 + Text 400. One single brand font system like Uber Move and Polestar.",
    displayFamily: "'Satoshi', sans-serif",
  },
  {
    id: "general-sans-pure",
    name: "Pure General Sans",
    badge: "Fleet & Logistics",
    description: "Industrial strength sans from hero banner to dashboard table cell.",
    displayFamily: "'General Sans', sans-serif",
  },
  {
    id: "clash-display",
    name: "Clash Display + Inter",
    badge: "Supercar Showroom",
    description: "High-contrast geometric neo-grotesque for exotic performance cars.",
    displayFamily: "'Clash Display', sans-serif",
  },
  {
    id: "azonix",
    name: "Azonix + Inter",
    badge: "Aerodynamic Concept",
    description: "Futuristic geometric uppercase headings with razor-sharp geometry.",
    displayFamily: "'Azonix', sans-serif",
  },
  {
    id: "nofex",
    name: "Nofex + Inter",
    badge: "Heavy Drag-Race",
    description: "Ultra-heavy drag racing display titles paired with clean Inter UI.",
    displayFamily: "'Nofex', sans-serif",
  },
];

export function FontStudioBar() {
  const [currentFont, setCurrentFont] = useState<string>("satoshi-inter");
  const [currentScope, setCurrentScope] = useState<"hybrid" | "full">("hybrid");
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    const savedFont = localStorage.getItem("motormila_font_choice") || "satoshi-inter";
    const savedScope = (localStorage.getItem("motormila_font_scope") as "hybrid" | "full") || "hybrid";
    setCurrentFont(savedFont);
    setCurrentScope(savedScope);
    document.documentElement.setAttribute("data-theme-font", savedFont);
    document.documentElement.setAttribute("data-font-scope", savedScope);
  }, []);

  const handleSelectFont = (id: string) => {
    setCurrentFont(id);
    localStorage.setItem("motormila_font_choice", id);
    document.documentElement.setAttribute("data-theme-font", id);
  };

  const handleToggleScope = (scope: "hybrid" | "full") => {
    setCurrentScope(scope);
    localStorage.setItem("motormila_font_scope", scope);
    document.documentElement.setAttribute("data-font-scope", scope);
  };

  const activePreset = FONT_PRESETS.find((p) => p.id === currentFont) || FONT_PRESETS[0];

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-5 left-5 z-[9999] flex flex-col items-start gap-2 print:hidden font-sans">
      {/* Floating control dock */}
      <div
        className={`overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          isExpanded ? "w-[360px] p-4" : "p-1.5"
        }`}
        style={{
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.7), 0 0 1px 1px rgba(255,255,255,0.1)",
        }}
      >
        {/* Collapsed Pill Button */}
        {!isExpanded ? (
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] px-3 py-2 text-xs font-semibold text-white transition-colors"
            title="Open Font Studio"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[10px] uppercase tracking-wider">Font:</span>
              <span className="font-bold text-white tracking-wide" style={{ fontFamily: activePreset.displayFamily }}>
                {activePreset.name}
              </span>
            </span>
            <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-400 border border-blue-500/20">
              {currentScope === "hybrid" ? "Hybrid" : "100% Full"}
            </span>
            <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        ) : (
          /* Expanded Panel */
          <div className="flex flex-col gap-3.5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">Font Studio</h4>
                  <p className="text-[10px] text-zinc-400">Click any font to preview live</p>
                </div>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                title="Collapse"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Scope Mode Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                <Layers className="h-3 w-3" /> Application Scope
              </label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/[0.04] p-1 border border-white/[0.06]">
                <button
                  onClick={() => handleToggleScope("hybrid")}
                  className={`flex flex-col items-center justify-center rounded-lg py-1.5 px-2 text-center transition-all ${
                    currentScope === "hybrid"
                      ? "bg-blue-600 text-white shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="text-[11px] font-medium leading-tight">Pro Hybrid</span>
                  <span className="text-[9px] opacity-75 leading-tight">Display + Clean Data</span>
                </button>
                <button
                  onClick={() => handleToggleScope("full")}
                  className={`flex flex-col items-center justify-center rounded-lg py-1.5 px-2 text-center transition-all ${
                    currentScope === "full"
                      ? "bg-blue-600 text-white shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="text-[11px] font-medium leading-tight">Full Systemwide</span>
                  <span className="text-[9px] opacity-75 leading-tight">100% of Entire App</span>
                </button>
              </div>
            </div>

            {/* Font Options List */}
            <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-1">
              {FONT_PRESETS.map((preset) => {
                const isSelected = preset.id === currentFont;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectFont(preset.id)}
                    className={`group flex items-center justify-between rounded-xl p-2.5 text-left transition-all border ${
                      isSelected
                        ? "border-blue-500/50 bg-blue-500/10 text-white shadow-sm"
                        : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.06] text-zinc-300 hover:text-white"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-bold tracking-wide"
                          style={{ fontFamily: preset.displayFamily }}
                        >
                          {preset.name}
                        </span>
                        <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-medium text-zinc-300 uppercase">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1">{preset.description}</p>
                    </div>
                    {isSelected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
