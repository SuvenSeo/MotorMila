import { Globe } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";

type Locale = "en" | "si" | "ta";

type LocaleOption = {
  value: Locale;
  label: string;
  shortLabel: string;
};

const LOCALE_OPTIONS: LocaleOption[] = [
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "si", label: "සිංහල", shortLabel: "සි" },
  { value: "ta", label: "தமிழ்", shortLabel: "த" },
];

type Props = {
  /** When true renders only the short flag-like code, useful inside compact navbars. */
  compact?: boolean;
};

export function LocaleSwitcher({ compact = false }: Props) {
  const { language, setLanguage } = useAppPreferences();

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Language switcher">
      <Globe className="mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {LOCALE_OPTIONS.map((opt) => {
        const active = language === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLanguage(opt.value)}
            aria-pressed={active}
            aria-label={opt.label}
            title={opt.label}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              active
                ? "bg-primary/15 text-primary-bright"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            }`}
          >
            {compact ? opt.shortLabel : opt.label}
          </button>
        );
      })}
    </div>
  );
}
