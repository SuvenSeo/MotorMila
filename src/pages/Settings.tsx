import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bug,
  Check,
  Coins,
  Database,
  Globe,
  Laptop,
  MessageSquare,
  Moon,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAppPreferences, type Language } from "@/lib/appPreferences";
import { useCompareTray } from "@/lib/compareTray";
import { openFeedbackDialog } from "@/lib/feedbackEvents";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { revealContainer, revealItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

type LangOpt = {
  value: Language;
  key: string;
  native: string;
  fallback: string;
  hint: string;
};

const LANGS: LangOpt[] = [
  {
    value: "en",
    key: "language.en",
    native: "English",
    fallback: "English",
    hint: "Default product language & market search",
  },
  {
    value: "si",
    key: "language.si",
    native: "සිංහල",
    fallback: "Sinhala",
    hint: "ප්‍රාදේශීයකරණය කළ සිංහල ලේබල හා මෙවලම්",
  },
  {
    value: "ta",
    key: "language.ta",
    native: "தமிழ்",
    fallback: "Tamil",
    hint: "உள்ளூர்மயமாக்கப்பட்ட தமிழ் லேபிள்கள்",
  },
];

type ThemeOpt = {
  mode: "dark" | "light" | "system";
  label: string;
  hint: string;
  icon: typeof Moon;
};

const THEMES: ThemeOpt[] = [
  {
    mode: "dark",
    label: "Dark",
    hint: "Deep charcoal palette optimized for low-light vehicle analysis",
    icon: Moon,
  },
  {
    mode: "light",
    label: "Light",
    hint: "High-contrast day palette for bright daylight environments",
    icon: Sun,
  },
  {
    mode: "system",
    label: "Auto (System)",
    hint: "Dynamically synchronizes with your device operating system theme",
    icon: Laptop,
  },
];

export default function Settings() {
  const { language, setLanguage, themeMode, setThemeMode, resolvedTheme, t } = useAppPreferences();
  const { pinned, clear } = useCompareTray();

  const handleClearCompare = () => {
    clear();
    toast.success(t("settings.compareCleared", "Compare tray cleared"));
  };

  const themeDisplay =
    themeMode === "system"
      ? t("theme.auto", "Auto")
      : themeMode === "dark"
        ? t("theme.dark", "Dark")
        : t("theme.light", "Light");

  const langDisplay =
    language === "en" ? "English" : language === "si" ? "සිංහල" : "தமிழ்";

  return (
    <PageCanvas ambient="subtle">
      <PageHero
        theme="settings"
        eyebrow={t("settings.eyebrow", "Preferences")}
        eyebrowIcon={SlidersHorizontal}
        title={t("settings.title", "Personalize Motormila")}
        description={t(
          "settings.description",
          "Fine-tune visual appearance, language, market valuation defaults, and session storage.",
        )}
        highlights={[
          { label: t("settings.highlightTheme", "Theme"), value: themeDisplay, hint: `Active: ${resolvedTheme}` },
          { label: t("settings.highlightLanguage", "Language"), value: langDisplay, hint: "3 Localized Locales" },
          { label: t("settings.highlightEngine", "Market Engine"), value: "Live", hint: "25 Districts Syncing" },
        ]}
      />

      <PageBody>
        <motion.div
          variants={revealContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        >
          {/* Card 1: Appearance & Theme Mode */}
          <motion.div
            variants={revealItem}
            className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl sm:p-8 lg:col-span-7"
          >
            <div>
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-surface/80 text-primary">
                    <Moon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-foreground">
                      {t("ui.theme", "Theme & Appearance")}
                    </h2>
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("settings.themeHint", "Choose visual style for the entire app")}
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                  {resolvedTheme === "dark" ? "Dark Active" : "Light Active"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {THEMES.map((item) => {
                  const Icon = item.icon;
                  const active = themeMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => setThemeMode(item.mode)}
                      aria-pressed={active}
                      className={cn(
                        "group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.98]",
                        active
                          ? "border-primary/50 bg-primary/12 text-foreground shadow-soft ring-1 ring-primary/40"
                          : "border-border/80 bg-surface/60 text-muted-foreground hover:border-primary/30 hover:bg-surface hover:text-foreground",
                      )}
                    >
                      {/* Theme Preview Thumbnail */}
                      <div
                        className={cn(
                          "mb-4 flex h-20 w-full flex-col justify-between rounded-xl border p-2.5 transition-colors",
                          item.mode === "dark"
                            ? "border-border bg-[#0b0f17] text-white"
                            : item.mode === "light"
                              ? "border-border bg-slate-100 text-slate-900"
                              : "border-border bg-gradient-to-r from-[#0b0f17] via-[#0b0f17]/80 to-slate-100 text-white",
                        )}
                        aria-hidden="true"
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className={cn(
                              "h-2 w-8 rounded-full",
                              item.mode === "light" ? "bg-slate-300" : "bg-white/20",
                            )}
                          />
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              active ? "bg-primary" : "bg-muted-foreground/30",
                            )}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div
                            className={cn(
                              "h-2.5 w-14 rounded-full",
                              item.mode === "light" ? "bg-slate-400" : "bg-white/30",
                            )}
                          />
                          <div
                            className={cn(
                              "h-1.5 w-10 rounded-full",
                              item.mode === "light" ? "bg-slate-300" : "bg-white/15",
                            )}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                          <span className="text-xs font-bold">{item.label}</span>
                        </div>
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-transparent",
                          )}
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {item.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="mt-6 text-[11px] font-medium text-muted-foreground/80">
              System mode automatically matches your operating system&apos;s day/night schedule.
            </p>
          </motion.div>

          {/* Card 2: Language & Localization */}
          <motion.div
            variants={revealItem}
            className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl sm:p-8 lg:col-span-5"
          >
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-surface/80 text-primary">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-foreground">
                    {t("ui.language", "Display Language")}
                  </h2>
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("settings.languageHint", "Set display language for navigation and labels")}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {LANGS.map((item) => {
                  const active = language === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setLanguage(item.value)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.98]",
                        active
                          ? "border-primary/45 bg-primary/12 text-foreground shadow-soft ring-1 ring-primary/30"
                          : "border-border/80 bg-surface/60 text-muted-foreground hover:border-primary/30 hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{item.fallback}</span>
                          <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {item.native}
                          </span>
                        </div>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground font-medium">
                          {item.hint}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-transparent",
                        )}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="mt-6 text-[11px] font-medium text-muted-foreground/80">
              Language selections synchronize instantly across listings, calculator metrics, and filters.
            </p>
          </motion.div>

          {/* Card 3: Regional Standards & Currency */}
          <motion.div
            variants={revealItem}
            className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl sm:p-8 lg:col-span-6"
          >
            <div>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-surface/80 text-primary">
                    <Coins className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-foreground">
                      Market Standards & Currency
                    </h2>
                    <p className="text-xs font-medium text-muted-foreground">
                      Conventions applied to vehicle prices and depreciation
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-surface/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">Base Currency</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Sri Lankan Rupee (LKR) formatted in Millions (e.g. Rs 14.5M)
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-mono font-bold text-primary">
                      LKR (Rs)
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-surface/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">Price Baseline</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Fair Market Value (FMV) algorithm trained on Sri Lankan market sales
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-mono font-bold text-emerald-400">
                      FMV v2.4
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-surface/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">Odometer Standard</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Metric Kilometers (km) with verified odometer checks
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-mono font-bold text-foreground">
                      KM
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="text-[11px] font-medium text-muted-foreground">
                Want to calculate custom loan lease terms?
              </span>
              <Link
                to="/calculator"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                Loan Calculator
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>

          {/* Card 4: Compare Tray & Local Session */}
          <motion.div
            variants={revealItem}
            className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl sm:p-8 lg:col-span-6"
          >
            <div>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-surface/80 text-primary">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-foreground">
                      Compare Tray & Local Storage
                    </h2>
                    <p className="text-xs font-medium text-muted-foreground">
                      Pinned vehicles and offline local preferences
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-mono font-bold text-foreground">
                  {pinned.length} / 3 Pinned
                </span>
              </div>

              <div className="rounded-2xl border border-border/70 bg-surface/50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-foreground">Active Compare Tray</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {pinned.length === 0
                        ? "No vehicles are currently pinned. Pin up to 3 cars from search or market results to compare side-by-side."
                        : `You have ${pinned.length} vehicle${pinned.length > 1 ? "s" : ""} saved in your comparison session.`}
                    </p>
                  </div>
                  {pinned.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearCompare}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20 active:scale-95"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  )}
                </div>

                {pinned.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-border/40">
                    {pinned.map((car) => (
                      <span
                        key={car.id}
                        className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground"
                      >
                        {car.make} {car.model}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-border/70 bg-surface/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-foreground">Browser Local Storage</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Preferences and pinned listings are stored securely on this device without tracking cookies.
                    </p>
                  </div>
                  <Database className="h-5 w-5 text-muted-foreground/60 shrink-0 ml-3" />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="text-[11px] font-medium text-muted-foreground">
                Side-by-side spec comparison
              </span>
              <Link
                to="/compare"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                Go to Compare Page
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>

          {/* Card 5: Feedback & Issue Reporting Hub */}
          <motion.div
            variants={revealItem}
            className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl sm:p-8 lg:col-span-7"
          >
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-surface/80 text-primary">
                  <Bug className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-foreground">
                    Have Feedback or Found a Bug?
                  </h2>
                  <p className="text-xs font-medium text-muted-foreground">
                    Direct community feedback pipeline to the engineering team
                  </p>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Found a pricing anomaly, scraper discrepancy, or visual overlap? Use our built-in feedback tool.
                It automatically includes your browser route context and is reviewed by the Motormila team.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {["Bug Report", "Feature Idea", "Data Discrepancy", "UI / UX Polish", "General"].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
              <span className="text-[11px] font-medium text-muted-foreground">
                Offline queue supported • Encrypted transit
              </span>
              <button
                type="button"
                onClick={() => openFeedbackDialog()}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-soft transition-all duration-200 hover:opacity-95 active:scale-95"
              >
                <MessageSquare className="h-4 w-4" />
                Send Feedback
              </button>
            </div>
          </motion.div>

          {/* Card 6: Platform & System Status */}
          <motion.div
            variants={revealItem}
            className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft backdrop-blur-xl sm:p-8 lg:col-span-5"
          >
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-surface/80 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-foreground">
                    System & Security
                  </h2>
                  <p className="text-xs font-medium text-muted-foreground">
                    Platform telemetry and active runtime
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface/50 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-xs font-bold text-foreground">Market Scrapers & DB</span>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-400">Operational</span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface/50 px-4 py-3">
                  <span className="text-xs font-bold text-foreground">Client Build</span>
                  <span className="text-[11px] font-mono text-muted-foreground">v1.4.2 Production</span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface/50 px-4 py-3">
                  <span className="text-xs font-bold text-foreground">Telemetry & Sentry</span>
                  <span className="text-[11px] font-mono text-muted-foreground">Anonymous Errors Only</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="text-[11px] font-medium text-muted-foreground">
                Read documentation & API guides
              </span>
              <Link
                to="/docs"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                Docs
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </PageBody>
    </PageCanvas>
  );
}
