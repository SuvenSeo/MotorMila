import { Check, ChevronDown, Globe } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import "@/styles/locale-labels.css";

type Locale = "en" | "si" | "ta";

type LocaleOption = {
  value: Locale;
  /** Language name in its own script. */
  label: string;
  /** Short code shown on the trigger. */
  shortLabel: string;
  /** English name, for screen readers / tooltips. */
  english: string;
  script: boolean;
};

export const LOCALE_OPTIONS: LocaleOption[] = [
  { value: "en", label: "English", shortLabel: "EN", english: "English", script: false },
  { value: "si", label: "සිංහල", shortLabel: "සිං", english: "Sinhala", script: true },
  { value: "ta", label: "தமிழ்", shortLabel: "தமி", english: "Tamil", script: true },
];

/** Warm the tiny label subsets on intent so the menu never flashes small glyphs. */
function warmLabelFonts() {
  try {
    void document.fonts?.load('600 14px "MM Locale Label"', "සිංහලதமிழ்");
  } catch {
    /* fonts API missing: system fallback renders */
  }
}

type Props = {
  /** Kept for API compatibility; the switcher is always a compact dropdown now. */
  compact?: boolean;
  className?: string;
  /** Show the language name instead of the short code on the trigger. */
  showName?: boolean;
};

/** One compact language dropdown: globe + code; menu lists each language in its own script. */
export function LocaleSwitcher({ className, showName = false }: Props) {
  const { language, setLanguage, t } = useAppPreferences();
  const current = LOCALE_OPTIONS.find((o) => o.value === language) ?? LOCALE_OPTIONS[0];

  return (
    <DropdownMenu onOpenChange={(open) => open && warmLabelFonts()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onPointerEnter={warmLabelFonts}
          onFocus={warmLabelFonts}
          className={cn("nav-control gap-1.5 px-2.5", className)}
          aria-label={`${t("shell.nav.language", "Language")}: ${current.english}`}
          title={t("shell.nav.language", "Language")}
        >
          <Globe className="h-4 w-4 shrink-0" aria-hidden />
          <span
            lang={current.value}
            className={cn("text-footnote font-semibold tracking-tight", current.script && "locale-script-label")}
          >
            {showName ? current.label : current.shortLabel}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-48">
        {LOCALE_OPTIONS.map((opt) => {
          const active = opt.value === language;
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => setLanguage(opt.value)}
              aria-checked={active}
              role="menuitemradio"
              className="flex items-center gap-2.5 py-2"
            >
              <span lang={opt.value} className={cn("flex-1 text-body font-medium", opt.script && "locale-script-label")}>
                {opt.label}
              </span>
              {opt.script ? <span className="text-caption text-muted-foreground">{opt.english}</span> : null}
              <Check className={cn("h-3.5 w-3.5 text-primary", active ? "opacity-100" : "opacity-0")} aria-hidden />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
