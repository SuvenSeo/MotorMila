import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import {
  Apple,
  BellRing,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Gauge,
  MapPin,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  WifiOff,
} from "lucide-react";
import { PrefetchLink } from "@/components/PrefetchLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sendFeedback } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import { fadeUp, listItem, listStagger, revealContainer, scaleIn } from "@/lib/motion";

const WAITLIST_KEY = "motormila.mobile_waitlist";

/** Live sideload release — keep in step with android/app/build.gradle.kts + public/app/latest-release.json. */
const APK_VERSION = "1.6.5";
const APK_SIZE = "16.9 MB";
// Public R2 download: the source repo is private, so the APK ships from the
// public motormila-snapshots bucket (published by .github/workflows/android-release.yml).
const APK_URL = `https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app/motormila-${APK_VERSION}.apk`;
const APK_SHA256 = "7f4e604375e2b724d95b35ee4ff8b8f9eb1a9f9f8cbc650d70324228e6f6040f";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  title: string;
  bodyKey: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: Gauge,
    titleKey: "mobile.feature.live.title",
    title: "The whole live market",
    bodyKey: "mobile.feature.live.body",
    body: "Every scraped listing from Sri Lanka's big marketplaces — filter by make, district, fuel, year and price in two taps.",
  },
  {
    icon: Star,
    titleKey: "mobile.feature.score.title",
    title: "Deal scores on every car",
    bodyKey: "mobile.feature.score.body",
    body: "Each listing is graded against its district median, so you know it's a good price before you call the seller.",
  },
  {
    icon: ScanLine,
    titleKey: "mobile.feature.scan.title",
    title: "Scan a number plate",
    bodyKey: "mobile.feature.scan.body",
    body: "Point the camera at a plate and Motormila reads it on-device, then pulls the market record for that vehicle.",
  },
  {
    icon: BellRing,
    titleKey: "mobile.feature.alerts.title",
    title: "Price-drop alerts",
    bodyKey: "mobile.feature.alerts.body",
    body: "Save a car or a search and get a push notification the moment a seller cuts the price or a new match lands.",
  },
  {
    icon: WifiOff,
    titleKey: "mobile.feature.offline.title",
    title: "Works without signal",
    bodyKey: "mobile.feature.offline.body",
    body: "Your watchlist, alerts and the last market snapshot are cached on the device — useful at a yard with bad coverage.",
  },
  {
    icon: Calculator,
    titleKey: "mobile.feature.import.title",
    title: "Import & running costs",
    bodyKey: "mobile.feature.import.body",
    body: "Landed cost with CID, excise, VAT and SSCL, plus a full cost-to-own breakdown before you commit.",
  },
  {
    icon: MapPin,
    titleKey: "mobile.feature.map.title",
    title: "District & EV hubs",
    bodyKey: "mobile.feature.map.body",
    body: "See where prices are moving, which districts have the deepest inventory, and where the nearest chargers are.",
  },
  {
    icon: ShieldCheck,
    titleKey: "mobile.feature.trust.title",
    title: "Seller & safety checks",
    bodyKey: "mobile.feature.trust.body",
    body: "Source quality scores, seller profiles and safety research sit next to every listing, not buried in a menu.",
  },
];

const ROADMAP = [
  {
    key: "preview",
    labelKey: "acct.mobile.roadmap.preview",
    label: "Available",
    titleKey: "acct.mobile.roadmap.preview.title",
    title: "Preview APK",
    bodyKey: "acct.mobile.roadmap.preview.body",
    body: "A signed preview build is on this page now, with its SHA-256 checksum published so you can verify it.",
    done: true,
  },
  {
    key: "now",
    labelKey: "acct.mobile.roadmap.now",
    label: "Now",
    titleKey: "acct.mobile.roadmap.now.title",
    title: "Preview feedback",
    bodyKey: "acct.mobile.roadmap.now.body",
    body: "Offline cache, alert delivery and plate scanning are being hardened on Android 8 and above, using feedback from the preview.",
    done: false,
  },
  {
    key: "next",
    labelKey: "acct.mobile.roadmap.next",
    label: "Next",
    titleKey: "acct.mobile.roadmap.next.title",
    title: "Stable release",
    bodyKey: "acct.mobile.roadmap.next.body",
    body: "A stable APK replaces the preview here. It installs over the preview and keeps your watchlist.",
    done: false,
  },
  {
    key: "later",
    labelKey: "mobile.roadmap.later",
    label: "Later",
    titleKey: "mobile.roadmap.later.title",
    title: "Play Store & iPhone",
    bodyKey: "acct.mobile.roadmap.later.body",
    body: "There's no Play Store or App Store listing yet. Store listings come after the stable release, with an iPhone build after that.",
    done: false,
  },
] as const;

const FAQ = [
  {
    key: "cost",
    qKey: "mobile.faq.cost.q",
    q: "Will the app be free?",
    aKey: "mobile.faq.cost.a",
    a: "Yes. Browsing, search, watchlists and price alerts stay free. Pro tools — lane intelligence, exports and deep history — carry over from your existing Motormila plan.",
  },
  {
    key: "access",
    qKey: "acct.mobile.faq.access.q",
    q: "How do I get it?",
    aKey: "acct.mobile.faq.access.a",
    a: "Download the preview APK from this page and open it on your phone. There's no Play Store listing yet.",
  },
  {
    key: "install",
    qKey: "mobile.faq.install.q",
    q: "Is sideloading the APK safe?",
    aKey: "acct.mobile.faq.install.a",
    a: "The APK is signed by Motormila and published with a SHA-256 checksum you can verify. We never ask you to install it from a third-party mirror.",
  },
  {
    key: "ios",
    qKey: "mobile.faq.ios.q",
    q: "What about iPhone?",
    aKey: "acct.mobile.faq.ios.a",
    a: "Android comes first because it covers the widest set of devices in Sri Lanka. An iPhone build follows once the Android release is stable.",
  },
  {
    key: "web",
    qKey: "mobile.faq.web.q",
    q: "Does the app replace the website?",
    aKey: "mobile.faq.web.a",
    a: "No. Motormila on the web stays the full terminal — the app is the fast, offline-friendly companion for when you're out looking at cars.",
  },
] as const;

export default function MobileApp() {
  const { t } = useAppPreferences();
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const copyChecksum = async () => {
    try {
      await navigator.clipboard.writeText(APK_SHA256);
    } catch {
      const area = document.createElement("textarea");
      area.value = APK_SHA256;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WAITLIST_KEY);
      if (stored) {
        setEmail(stored);
        setJoined(true);
      }
    } catch {
      // Storage unavailable — the form still works for this session.
    }
  }, []);

  const features = useMemo(
    () => FEATURES.map((feature) => ({ ...feature, label: t(feature.titleKey, feature.title), detail: t(feature.bodyKey, feature.body) })),
    [t],
  );

  const handleJoin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError(t("mobile.notifyInvalid", "Enter a valid email address."));
      return;
    }
    setError("");
    try {
      localStorage.setItem(WAITLIST_KEY, value);
    } catch {
      // Ignore storage failures — confirmation still shown.
    }
    setJoined(true);
    // Fire-and-forget: the signup also lands in the operator inbox so the
    // waitlist is reachable even when this browser's storage is cleared.
    void sendFeedback({
      category: "idea",
      route: "/mobile-app",
      message: "Motormila mobile launch list signup",
      email: value,
    }).catch(() => {
      // Offline or API unavailable — the local list is the fallback.
    });
  };

  const eyebrow = (text: string) => <p className="text-footnote font-semibold text-primary">{text}</p>;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="layout-shell pb-16 pt-12 sm:pt-16 lg:pb-24 lg:pt-20">
        <m.div
          initial="hidden"
          animate="show"
          variants={revealContainer}
          className="grid w-full items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16"
        >
          <div className="min-w-0">
            <m.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
              <Badge variant="info">
                <Smartphone aria-hidden />
                {t("mobile.eyebrow", "Motormila Mobile")}
              </Badge>
              <Badge variant="warning">
                {t("acct.mobile.previewBadge", "Android preview · v{version}", { version: APK_VERSION })}
              </Badge>
            </m.div>

            <m.h1 variants={fadeUp} className="mt-6 font-display text-large font-semibold text-foreground [text-wrap:balance] sm:text-hero">
              {t("mobile.title", "The entire market,")}{" "}
              <span className="text-primary">{t("mobile.titleAccent", "in your pocket.")}</span>
            </m.h1>

            <m.p variants={fadeUp} className="mt-5 max-w-lg text-callout text-label-2">
              {t(
                "acct.mobile.subtitle",
                "The Motormila Android app is out as a preview download: live listings, deal scores, price-drop alerts and plate scanning, even when the signal drops. It's an early build, so expect a few rough edges.",
              )}
            </m.p>

            <m.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Button asChild size="lg" className="h-auto min-h-12 max-w-full whitespace-normal py-2.5 text-left">
                <a href={APK_URL}>
                  <Download aria-hidden />
                  {t("acct.mobile.downloadCta", "Download the preview · {size}", { size: APK_SIZE })}
                </a>
              </Button>
              <span className="text-footnote text-label-2">
                {t("acct.mobile.downloadMeta", "Preview v{version} · Android 8.0+ · free", { version: APK_VERSION })}
              </span>
            </m.div>

            <m.div variants={fadeUp} className="mt-8 max-w-md">
              <AnimatePresence mode="wait" initial={false}>
                {joined ? (
                  <m.div
                    key="joined"
                    variants={scaleIn}
                    initial="hidden"
                    animate="show"
                    role="status"
                    className="flex items-start gap-3 rounded-card border border-deal-good/30 bg-deal-good/10 px-4 py-3.5"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-deal-good-text" aria-hidden />
                    <div>
                      <p className="text-footnote font-semibold text-deal-good-text">{t("acct.mobile.notifyDoneTitle", "You're on the update list")}</p>
                      <p className="mt-0.5 text-footnote text-label-1">
                        {t("acct.mobile.notifyDoneBody", "We'll email {email} when a new build or a store listing is ready.", { email })}
                      </p>
                    </div>
                  </m.div>
                ) : (
                  <m.form key="form" onSubmit={handleJoin} exit={{ opacity: 0 }} className="space-y-2.5" noValidate>
                    <p className="text-footnote font-semibold text-foreground">{t("acct.mobile.notifyTitle", "Hear when new builds ship")}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={t("mobile.notifyPlaceholder", "you@email.lk")}
                        aria-label={t("mobile.notifyEmail", "Email address")}
                        aria-invalid={error ? true : undefined}
                        className="h-12 flex-1 rounded-full px-4"
                      />
                      <Button type="submit" variant="secondary" size="lg" className="shrink-0">
                        <BellRing aria-hidden />
                        {t("mobile.notifyCta", "Notify me")}
                      </Button>
                    </div>
                    {error && <p className="content-in text-footnote font-medium text-deal-high-text">{error}</p>}
                    <p className="text-caption text-label-2">{t("acct.mobile.notifyFinePrint", "Release emails only. Unsubscribe any time.")}</p>
                  </m.form>
                )}
              </AnimatePresence>
            </m.div>

            <m.ul variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-footnote text-label-2">
              <li className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                {t("mobile.platformAndroid", "Android 8.0+ · APK")}
              </li>
              <li className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                {t("mobile.signedBuild", "Signed build · SHA-256 published")}
              </li>
              <li className="inline-flex items-center gap-2">
                <Apple className="h-4 w-4 text-label-2" aria-hidden />
                {t("mobile.platformIos", "iPhone build after Android")}
              </li>
            </m.ul>
          </div>

          {/* Phone mock — follows the theme like the real app does. */}
          <m.div variants={scaleIn} className="relative mx-auto w-full max-w-[20.5rem]">
            <div className="relative rounded-[2.75rem] border border-border bg-surface-2 p-3 shadow-e3">
              <div className="relative overflow-hidden rounded-[2.25rem] border border-border bg-background">
                <div className="flex items-center justify-between px-5 pt-4 text-caption font-medium text-label-2">
                  <span className="tabular-nums">9:41</span>
                  <span aria-hidden className="h-5 w-20 rounded-full bg-foreground" />
                  <span>{t("mobile.mockSignal", "LTE")}</span>
                </div>
                <div className="px-5 pb-6 pt-5">
                  <p className="text-caption font-semibold text-primary">{t("mobile.mockEyebrow", "Live market")}</p>
                  <p className="mt-1 font-display text-title3 font-semibold text-foreground">Toyota Aqua S</p>
                  <p className="mt-0.5 text-caption text-label-2">2017 · Colombo · Petrol hybrid</p>
                  <div className="mt-4 flex items-end justify-between rounded-card border border-border bg-surface-1 px-4 py-3 shadow-e1">
                    <div>
                      <p className="text-caption text-label-2">{t("mobile.mockAsk", "Asking")}</p>
                      <p className="mt-0.5 text-callout font-semibold tabular-nums text-foreground">Rs 8,450,000</p>
                    </div>
                    <Badge variant="deal-good">{t("mobile.mockScore", "9.1 deal")}</Badge>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {[
                      t("mobile.mockRow1", "Rs 420,000 below district median"),
                      t("mobile.mockRow2", "Cut 3.5% · 4 days ago"),
                      t("mobile.mockRow3", "Saved to watchlist"),
                    ].map((row) => (
                      <li key={row} className="flex items-center gap-2.5 rounded-control bg-surface-2 px-3 py-2">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        <span className="text-caption text-label-1">{row}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center gap-2 rounded-full border border-deal-caution/30 bg-deal-caution/10 px-3.5 py-2.5">
                    <Camera className="h-4 w-4 shrink-0 text-deal-caution-text" aria-hidden />
                    <span className="text-caption font-medium text-deal-caution-text">{t("mobile.mockScan", "Scan a plate to pull the record")}</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-caption text-label-2">
              {t("acct.mobile.mockCaption", "Illustrative preview of the app.")}
            </p>
          </m.div>
        </m.div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <m.section {...{ initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.1 } }} variants={listStagger} className="border-t border-separator py-16 lg:py-24">
        <div className="layout-shell">
          <div className="max-w-2xl">
            {eyebrow(t("acct.mobile.featuresEyebrow", "What's in the preview"))}
            <h2 className="mt-2 font-display text-title1 font-semibold text-foreground [text-wrap:balance]">
              {t("mobile.featuresTitle", "Built for how Sri Lanka actually buys cars.")}
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <m.div key={feature.titleKey} variants={listItem} custom={i}>
                  <Card className="h-full">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-body font-semibold text-foreground">{feature.label}</p>
                    <p className="mt-1.5 text-footnote text-label-2">{feature.detail}</p>
                  </Card>
                </m.div>
              );
            })}
          </div>
        </div>
      </m.section>

      {/* ── Roadmap + download ───────────────────────────────────── */}
      <m.section {...{ initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.1 } }} variants={listStagger} className="border-t border-separator py-16 lg:py-24">
        <div className="layout-shell">
          {eyebrow(t("mobile.roadmapEyebrow", "Release roadmap"))}
          <h2 className="mt-2 font-display text-title1 font-semibold text-foreground">
            {t("acct.mobile.roadmapTitle", "Preview now, stable next.")}
          </h2>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROADMAP.map((step, index) => (
              <m.li key={step.key} variants={listItem} custom={index}>
                <Card className={step.done ? "h-full border-deal-good/30" : "h-full"}>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={step.done ? "success" : "neutral"}>
                      {step.done ? <Check aria-hidden /> : null}
                      {t(step.labelKey, step.label)}
                    </Badge>
                    <span aria-hidden className="font-display text-footnote font-semibold tabular-nums text-label-3">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="mt-4 text-body font-semibold text-foreground">{t(step.titleKey, step.title)}</p>
                  <p className="mt-1.5 text-footnote text-label-2">{t(step.bodyKey, step.body)}</p>
                </Card>
              </m.li>
            ))}
          </ol>

          <m.div variants={fadeUp} className="mt-6">
            <Card className="border-primary/25">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                  <Download className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold text-foreground">
                    {t("acct.mobile.downloadTitle", "Motormila v{version} for Android (preview)", { version: APK_VERSION })}
                  </p>
                  <p className="mt-0.5 text-footnote text-label-2">
                    {t("mobile.downloadSub", "{size} · Android 8.0+ · installs over older builds, watchlist kept", { size: APK_SIZE })}
                  </p>
                </div>
                <Button asChild>
                  <a href={APK_URL}>{t("acct.mobile.downloadNow", "Download preview APK")}</a>
                </Button>
              </div>
              <button
                type="button"
                onClick={copyChecksum}
                className="press mt-4 flex w-full items-center gap-2 rounded-control border border-border bg-surface-2 px-3.5 py-2.5 text-left transition-colors duration-short ease-standard hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("mobile.copyChecksum", "Copy SHA-256 checksum")}
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <code className="min-w-0 flex-1 truncate font-code text-caption text-label-1">{APK_SHA256}</code>
                <AnimatePresence mode="wait" initial={false}>
                  <m.span key={copied ? "y" : "n"} variants={scaleIn} initial="hidden" animate="show" exit="exit" className="inline-flex">
                    {copied ? (
                      <Check className="h-4 w-4 shrink-0 text-deal-good-text" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4 shrink-0 text-label-2" aria-hidden />
                    )}
                  </m.span>
                </AnimatePresence>
              </button>
              <p className="mt-3 text-footnote text-label-2">
                {t(
                  "mobile.downloadVerify",
                  "On your phone: open the file, allow “Install unknown apps” once, then open. Verify the SHA-256 above matches if you want proof of origin — we never ask you to install from a third-party mirror.",
                )}
              </p>
            </Card>
          </m.div>
        </div>
      </m.section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="border-t border-separator py-16 lg:py-24">
        <div className="layout-shell grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            {eyebrow(t("mobile.faqEyebrow", "Questions"))}
            <h2 className="mt-2 font-display text-title1 font-semibold text-foreground">{t("mobile.faqTitle", "Before you ask.")}</h2>
            <p className="mt-3 max-w-sm text-body text-label-2">
              {t("acct.mobile.faqBody", "Anything missing? Tell us from the app's feedback panel or the website footer.")}
            </p>
          </div>
          <Card padding="none" className="divide-y divide-separator">
            {FAQ.map((item) => (
              <div key={item.key} className="px-5 py-5 sm:px-6">
                <p className="text-body font-semibold text-foreground">{t(item.qKey, item.q)}</p>
                <p className="mt-1.5 text-footnote text-label-2">{t(item.aKey, item.a)}</p>
              </div>
            ))}
          </Card>
        </div>
      </section>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <section className="layout-shell pb-20">
        <Card padding="lg" className="flex flex-col items-start justify-between gap-6 border-primary/25 bg-primary/5 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-title2 font-semibold text-foreground">{t("acct.mobile.ctaTitle", "Try the Android preview.")}</p>
            <p className="mt-2 max-w-md text-body text-label-2">
              {t(
                "acct.mobile.ctaBody",
                "Motormila v{version} for Android is an early preview: market, deal scores, alerts and plate scanning in your pocket.",
                { version: APK_VERSION },
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild>
              <a href={APK_URL}>
                <Download aria-hidden />
                {t("mobile.ctaDownload", "Download APK · {size}", { size: APK_SIZE })}
              </a>
            </Button>
            <Button asChild variant="secondary">
              <PrefetchLink to="/">{t("mobile.ctaMarket", "Open the market")}</PrefetchLink>
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
