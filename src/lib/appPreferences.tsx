import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DICTIONARIES,
  LOCALE_TAGS,
  interpolate,
  type Language,
} from "@/locales";

type ThemeMode = "system" | "dark" | "light";

type TranslateVars = Record<string, string | number | null | undefined>;

type AppPreferencesContextValue = {
  themeMode: ThemeMode;
  resolvedTheme: "dark" | "light";
  setThemeMode: (mode: ThemeMode) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  localeTag: string;
  t: (key: string, fallback?: string, vars?: TranslateVars) => string;
};

const THEME_STORAGE_KEY = "motormila_theme_mode";
const LANGUAGE_STORAGE_KEY = "motormila_language";
const DEFAULT_THEME_MODE: ThemeMode = "dark";

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  // Both themes are now first-class: components route through semantic tokens
  // that adapt across :root (light) and .theme-dark. Dark stays the default.
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemPrefersDark() ? "dark" : "light"; // "system"
}

function readStorage(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    const storage = window.localStorage;
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(key, value);
  } catch {
    // Ignore storage errors (e.g. privacy mode, test mocks, blocked storage)
  }
}

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "si" || value === "ta";
}

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [language, setLanguageState] = useState<Language>("en");
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = (readStorage(THEME_STORAGE_KEY) as ThemeMode | null) || DEFAULT_THEME_MODE;
    const savedLanguageRaw = readStorage(LANGUAGE_STORAGE_KEY);
    const savedLanguage = isLanguage(savedLanguageRaw) ? savedLanguageRaw : "en";
    setThemeModeState(savedTheme);
    setLanguageState(savedLanguage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const next = resolveTheme(themeMode);
      setResolvedTheme(next);
      root.classList.toggle("theme-light", next === "light");
      root.classList.toggle("theme-dark", next === "dark");
      root.style.colorScheme = next;
    };

    applyTheme();

    if (themeMode !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme();
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    writeStorage(THEME_STORAGE_KEY, mode);
  };

  // Keep <html lang> in sync so screen readers and search engines see the
  // selected language, not a hardcoded "en".
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    writeStorage(LANGUAGE_STORAGE_KEY, nextLanguage);
  };

  const localeTag = LOCALE_TAGS[language];

  const t = useMemo(() => {
    return (key: string, fallback?: string, vars?: TranslateVars) => {
      const selected = DICTIONARIES[language][key];
      const english = DICTIONARIES.en[key];
      const raw = selected || english || fallback || key;
      return interpolate(raw, vars);
    };
  }, [language]);

  const value = useMemo(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      language,
      setLanguage,
      localeTag,
      t,
    }),
    [language, localeTag, resolvedTheme, t, themeMode],
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

const FALLBACK_PREFERENCES: AppPreferencesContextValue = {
  themeMode: DEFAULT_THEME_MODE,
  resolvedTheme: "dark",
  setThemeMode: () => {},
  language: "en",
  setLanguage: () => {},
  localeTag: LOCALE_TAGS.en,
  t: (key, fallback, vars) => {
    const raw = DICTIONARIES.en[key] || fallback || key;
    return interpolate(raw, vars);
  },
};

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  // Fall back to English defaults outside the provider (unit tests that mount
  // pages/components directly). Production always wraps via main.tsx.
  return context ?? FALLBACK_PREFERENCES;
}

export type { Language };
