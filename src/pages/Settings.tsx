import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import {
  ArrowUpRight,
  Bug,
  Check,
  ChevronRight,
  Coins,
  Globe,
  Info,
  Laptop,
  MessageSquare,
  Moon,
  Scale,
  SlidersHorizontal,
  Sun,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAppPreferences, type Language } from "@/lib/appPreferences";
import { MAX_PINNED, useCompareTray } from "@/lib/compareTray";
import { LowDataSettingsCard } from "@/components/lowData/LowDataSettingsCard";
import { openFeedbackDialog } from "@/lib/feedbackEvents";
import { PageCanvas } from "@/components/PageCanvas";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, cardVariants } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { listItem, listStagger, scaleIn, tween } from "@/lib/motion";
import { HOW_WE_PRICE_PATH } from "@/lib/howWePrice";
import { cn } from "@/lib/utils";
import { loadScriptFonts } from "@/lib/scriptFonts";
import "@/styles/locale-labels.css";

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

type ThemeMode = "dark" | "light" | "system";

/** Card header used by every settings group. */
function GroupHeader({ icon: Icon, title, hint, aside }: { icon: typeof Moon; title: string; hint?: string; aside?: React.ReactNode }) {
  return (
    // flex-wrap: a long status badge (si/ta) drops under the title on phones instead of running off-screen.
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 className="text-callout font-semibold text-foreground">{title}</h2>
          {hint ? <p className="mt-0.5 text-footnote text-label-2">{hint}</p> : null}
        </div>
      </div>
      {aside}
    </div>
  );
}

/** Selected tick that springs in. */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-short ease-standard",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
      )}
      aria-hidden
    >
      <AnimatePresence initial={false}>
        {on ? (
          <m.span key="tick" variants={scaleIn} initial="hidden" animate="show" exit="exit" className="inline-flex">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </m.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function LinkRow({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-12 items-center justify-between gap-3 px-1 py-3 text-body text-foreground no-underline transition-colors duration-short ease-standard hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <ChevronRight className="h-4 w-4 text-label-3" aria-hidden />
    </Link>
  );
}

export default function Settings() {
  const { language, setLanguage, themeMode, setThemeMode, resolvedTheme, t } = useAppPreferences();
  const { pinned, clear } = useCompareTray();

  // The picker shows each language in its own script; without these faces a
  // device with no Sinhala/Tamil system font renders the rows blank.
  useEffect(() => {
    void loadScriptFonts("si");
    void loadScriptFonts("ta");
  }, []);

  const handleClearCompare = () => {
    clear();
    toast.success(t("settings.compareCleared", "Compare tray cleared"));
  };

  const THEMES: { mode: ThemeMode; label: string; hint: string; icon: typeof Moon }[] = [
    { mode: "light", label: t("theme.light", "Light"), hint: t("acct.settings.themeLightHint", "Bright and high-contrast for daylight."), icon: Sun },
    { mode: "dark", label: t("theme.dark", "Dark"), hint: t("acct.settings.themeDarkHint", "Easy on the eyes at night."), icon: Moon },
    { mode: "system", label: t("theme.auto", "Auto"), hint: t("acct.settings.themeAutoHint", "Follows your device's setting."), icon: Laptop },
  ];

  const group = "h-full";

  return (
    <PageCanvas ambient="none">
      <PageHeader
        size="compact"
        eyebrow={t("settings.eyebrow", "Preferences")}
        eyebrowIcon={SlidersHorizontal}
        title={t("settings.title", "Personalize Motormila")}
        description={t("acct.settings.description", "Appearance, language, your compare tray and low-data mode. Saved on this device.")}
      />

      <div className="layout-shell pb-20">
        <m.div variants={listStagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Appearance */}
          <m.div variants={listItem} custom={0} className="lg:col-span-7">
            <Card className={group}>
              <GroupHeader
                icon={Moon}
                title={t("ui.theme", "Theme")}
                hint={t("settings.themeHint", "Choose visual style for the entire app")}
                aside={
                  <Badge variant="info">
                    {resolvedTheme === "dark" ? t("acct.settings.darkActive", "Dark on") : t("acct.settings.lightActive", "Light on")}
                  </Badge>
                }
              />
              <div role="radiogroup" aria-label={t("ui.theme", "Theme")} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {THEMES.map((item) => {
                  const Icon = item.icon;
                  const active = themeMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setThemeMode(item.mode)}
                      className={cn(
                        cardVariants({ variant: "interactive", padding: "sm" }),
                        "flex flex-col text-left shadow-none",
                        active && "border-primary ring-1 ring-primary",
                      )}
                    >
                      {/* Theme preview: the dark half re-scopes the real dark tokens; the light half is a literal day swatch. */}
                      <span aria-hidden className="mb-4 flex h-16 w-full overflow-hidden rounded-control border border-border">
                        {(item.mode === "system" ? (["light", "dark"] as const) : [item.mode]).map((mode) =>
                          mode === "dark" ? (
                            <span key={mode} className="theme-dark flex flex-1 flex-col justify-between bg-background p-2">
                              <span className="h-1.5 w-8 rounded-full bg-foreground/25" />
                              <span className="space-y-1">
                                <span className="block h-2 w-12 rounded-full bg-foreground/60" />
                                <span className="block h-1.5 w-8 rounded-full bg-primary" />
                              </span>
                            </span>
                          ) : (
                            <span key={mode} className="flex flex-1 flex-col justify-between bg-white p-2">
                              <span className="h-1.5 w-8 rounded-full bg-black/15" />
                              <span className="space-y-1">
                                <span className="block h-2 w-12 rounded-full bg-black/50" />
                                <span className="block h-1.5 w-8 rounded-full bg-primary" />
                              </span>
                            </span>
                          ),
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-body font-semibold text-foreground">
                          <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-label-2")} aria-hidden />
                          {item.label}
                        </span>
                        <Tick on={active} />
                      </span>
                      <span className="mt-1.5 text-footnote text-label-2">{item.hint}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </m.div>

          {/* Language */}
          <m.div variants={listItem} custom={1} className="lg:col-span-5">
            <Card className={group}>
              <GroupHeader icon={Globe} title={t("ui.language", "Language")} hint={t("settings.languageHint", "Set display language for navigation and labels")} />
              <div role="radiogroup" aria-label={t("ui.language", "Language")} className="space-y-2.5">
                {LANGS.map((item) => {
                  const active = language === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setLanguage(item.value)}
                      className={cn(
                        cardVariants({ variant: "interactive", padding: "none" }),
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left shadow-none",
                        active && "border-primary ring-1 ring-primary",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span
                            lang={item.value}
                            className={cn("text-body font-semibold text-foreground", item.value !== "en" && "locale-script-label")}
                          >
                            {item.native}
                          </span>
                          {item.native !== item.fallback ? <span className="text-footnote text-label-2">{item.fallback}</span> : null}
                        </span>
                        <span
                          lang={item.value}
                          className={cn("mt-0.5 block text-footnote text-label-2", item.value !== "en" && "locale-script-text")}
                        >
                          {item.hint}
                        </span>
                      </span>
                      <Tick on={active} />
                    </button>
                  );
                })}
              </div>
            </Card>
          </m.div>

          {/* Compare tray */}
          <m.div variants={listItem} custom={2} className="lg:col-span-6">
            <Card className={group}>
              <GroupHeader
                icon={Scale}
                title={t("acct.settings.compareTitle", "Compare tray")}
                hint={t("acct.settings.compareHint", "Cars you've pinned to compare side by side.")}
                aside={
                  <Badge variant="neutral" className="tabular-nums">
                    <AnimatedNumber value={pinned.length} /> / {MAX_PINNED}
                  </Badge>
                }
              />
              <AnimatePresence mode="popLayout" initial={false}>
                {pinned.length === 0 ? (
                  <m.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween.enter }} exit={{ opacity: 0, transition: tween.exit }} className="rounded-control bg-surface-2 p-4 text-footnote text-label-2">
                    {t("acct.settings.compareEmpty", "Nothing pinned yet. Pin up to {max} cars from search results to compare them.", { max: String(MAX_PINNED) })}
                  </m.p>
                ) : (
                  <m.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween.enter }} exit={{ opacity: 0, transition: tween.exit }}>
                    <ul className="flex flex-wrap gap-2">
                      {pinned.map((car) => (
                        <li key={car.id}>
                          <Badge variant="outline" className="h-8 px-3 text-footnote font-medium">
                            {car.make} {car.model}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </m.div>
                )}
              </AnimatePresence>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-separator pt-4">
                <Button asChild variant="tertiary" size="sm" className="-ml-3">
                  <Link to="/compare">
                    {t("acct.settings.openCompare", "Open Compare")}
                    <ArrowUpRight aria-hidden />
                  </Link>
                </Button>
                {pinned.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={handleClearCompare} className="text-deal-high-text">
                    <Trash2 aria-hidden />
                    {t("acct.settings.clearCompare", "Clear tray")}
                  </Button>
                ) : null}
              </div>
            </Card>
          </m.div>

          {/* Units */}
          <m.div variants={listItem} custom={3} className="lg:col-span-6">
            <Card className={group}>
              <GroupHeader icon={Coins} title={t("acct.settings.unitsTitle", "Units and prices")} hint={t("acct.settings.unitsHint", "How prices and distances are shown across Motormila.")} />
              <dl className="divide-y divide-separator">
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-body text-foreground">{t("acct.settings.currency", "Currency")}</dt>
                  <dd className="text-footnote text-label-2">{t("acct.settings.currencyValue", "Sri Lankan rupees, in millions (Rs 14.5 Mn)")}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-body text-foreground">{t("acct.settings.distance", "Distance")}</dt>
                  <dd className="text-footnote text-label-2">{t("acct.settings.distanceValue", "Kilometres (km)")}</dd>
                </div>
              </dl>
              <div className="mt-2 border-t border-separator pt-4">
                <Button asChild variant="tertiary" size="sm" className="-ml-3 h-auto min-h-9 whitespace-normal text-left">
                  <Link to={HOW_WE_PRICE_PATH}>
                    {t("acct.settings.howWePrice", "How we score prices")}
                    <ArrowUpRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </Card>
          </m.div>

          {/* Low-data mode */}
          <m.div variants={listItem} custom={4} className="lg:col-span-12">
            <LowDataSettingsCard />
          </m.div>

          {/* Feedback */}
          <m.div variants={listItem} custom={5} className="lg:col-span-7">
            <Card className={cn(group, "flex flex-col")}>
              <GroupHeader icon={Bug} title={t("acct.settings.feedbackTitle", "Feedback or a bug?")} hint={t("acct.settings.feedbackHint", "Goes straight to the Motormila team.")} />
              <p className="flex-1 text-body text-label-1">
                {t(
                  "acct.settings.feedbackBody",
                  "Spotted a wrong price, a missing listing or something that looks off? Send it from here. We include the page you were on so we can find it quickly.",
                )}
              </p>
              <div className="mt-5 border-t border-separator pt-4">
                <Button type="button" onClick={() => openFeedbackDialog()}>
                  <MessageSquare aria-hidden />
                  {t("acct.settings.sendFeedback", "Send feedback")}
                </Button>
              </div>
            </Card>
          </m.div>

          {/* About */}
          <m.div variants={listItem} custom={6} className="lg:col-span-5">
            <Card className={group}>
              <GroupHeader icon={Info} title={t("acct.settings.aboutTitle", "About and your data")} />
              <nav className="-my-1 divide-y divide-separator">
                <LinkRow to="/docs" label={t("acct.settings.docs", "How Motormila works")} />
                <LinkRow to="/privacy" label={t("acct.legal.link.privacy", "Privacy Policy")} />
                <LinkRow to="/delete-account" label={t("acct.legal.link.delete", "Delete my account")} />
              </nav>
            </Card>
          </m.div>
        </m.div>
      </div>
    </PageCanvas>
  );
}
