import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
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
import { Input } from "@/components/ui/input";
import { RevealSection } from "@/components/RevealSection";
import { sendFeedback } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import { revealContainer, revealItem, spring } from "@/lib/motion";

const WAITLIST_KEY = "motormila.mobile_waitlist";

/** Live sideload release — keep in step with android/app/build.gradle.kts + public/app/latest-release.json. */
const APK_VERSION = "1.6.1";
const APK_SIZE = "16.9 MB";
// Public R2 download: the source repo is private, so the APK ships from the
// public motormila-snapshots bucket (published by .github/workflows/android-release.yml).
const APK_URL = `https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app/motormila-${APK_VERSION}.apk`;
const APK_SHA256 = "7e180043cdeb15176f4d1080301a2449fd7d818bba9774c0fcfae498e4de95fc";

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
    key: "now",
    labelKey: "mobile.roadmap.now",
    label: "In progress",
    titleKey: "mobile.roadmap.now.title",
    title: "Internal build hardening",
    bodyKey: "mobile.roadmap.now.body",
    body: "Signed release build, offline cache migrations and alert delivery are being stabilised on Android 8 and above.",
  },
  {
    key: "next",
    labelKey: "mobile.roadmap.next",
    label: "Next",
    titleKey: "mobile.roadmap.next.title",
    title: "Closed beta",
    bodyKey: "mobile.roadmap.next.body",
    body: "A limited group of buyers and dealers gets the APK first and shapes the release before it goes wide.",
  },
  {
    key: "release",
    labelKey: "mobile.roadmap.release",
    label: "Release",
    titleKey: "mobile.roadmap.release.title",
    title: "Public APK download",
    bodyKey: "mobile.roadmap.release.body",
    body: "The APK opens up here on Motormila with a published checksum, so anyone can verify what they installed.",
  },
  {
    key: "later",
    labelKey: "mobile.roadmap.later",
    label: "Later",
    titleKey: "mobile.roadmap.later.title",
    title: "Play Store & iPhone",
    bodyKey: "mobile.roadmap.later.body",
    body: "Store listings follow once the APK release settles, with an iOS build after that. The web app keeps working either way.",
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
    qKey: "mobile.faq.access.q",
    q: "How do I get it when it lands?",
    aKey: "mobile.faq.access.a",
    a: "Join the launch list above. Closed beta invites go out first, then the public APK download opens on this page.",
  },
  {
    key: "install",
    qKey: "mobile.faq.install.q",
    q: "Is sideloading the APK safe?",
    aKey: "mobile.faq.install.a",
    a: "The APK will be signed by Motormila and shipped with a SHA-256 checksum you can verify. We will never ask you to install it from a third-party mirror.",
  },
  {
    key: "ios",
    qKey: "mobile.faq.ios.q",
    q: "What about iPhone?",
    aKey: "mobile.faq.ios.a",
    a: "Android ships first because it covers the widest set of devices in Sri Lanka. iOS follows after the Android release is stable.",
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070c] text-white">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_50%_at_50%_-10%,rgba(10,122,255,0.24),transparent_62%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_20%,black,transparent_78%)]" />
        </div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={revealContainer}
          className="relative z-10 mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]"
        >
          <div>
            <motion.div variants={revealItem} className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#3D94FF]/35 bg-[#0A7AFF]/12 px-3.5 py-1.5 text-caption font-bold uppercase tracking-caps text-[#6CB8FF]">
                <Smartphone className="h-3.5 w-3.5" aria-hidden />
                {t("mobile.eyebrow", "Motormila Mobile")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-deal-good/30 bg-deal-good/10 px-3 py-1.5 text-caption font-semibold text-deal-good-text">
                <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-deal-good/70" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-deal-good" />
                </span>
                {t("mobile.availableNow", "v{version} · Available now", { version: APK_VERSION })}
              </span>
            </motion.div>

            <motion.h1
              variants={revealItem}
              className="mt-7 font-display text-large font-semibold leading-[1.05] tracking-tight text-white sm:text-hero lg:text-hero"
            >
              {t("mobile.title", "The entire market,")}
              <br />
              <span className="italic text-[#3D94FF]">{t("mobile.titleAccent", "in your pocket.")}</span>
            </motion.h1>

            <motion.p variants={revealItem} className="mt-5 max-w-lg text-body leading-relaxed text-white/65">
              {t(
                "mobile.subtitle",
                "The Motormila Android app is in its final build: live listings, deal scores, price-drop alerts and plate scanning — working even when the signal drops.",
              )}
            </motion.p>

            <motion.div variants={revealItem} className="mt-8 flex max-w-md flex-wrap items-center gap-3">
              <motion.a
                href={APK_URL}
                whileTap={{ scale: 0.97 }}
                transition={spring.smooth}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0A7AFF] px-7 text-footnote font-semibold text-white no-underline shadow-e2 transition-colors hover:bg-[#3D94FF]"
              >
                <Download className="h-4 w-4" aria-hidden />
                {t("mobile.downloadCta", "Download for Android · {size}", { size: APK_SIZE })}
              </motion.a>
              <span className="text-caption text-white/40">
                {t("mobile.downloadMeta", "v{version} · Android 8.0+ · free", { version: APK_VERSION })}
              </span>
            </motion.div>

            <motion.div variants={revealItem} className="mt-8 max-w-md">
              {joined ? (
                <div className="flex items-start gap-3 rounded-2xl border border-deal-good/25 bg-deal-good/10 px-4 py-3.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-deal-good-text" aria-hidden />
                  <div>
                    <p className="text-footnote font-semibold text-deal-good-text">
                      {t("mobile.notifyDoneTitle", "You're on the launch list")}
                    </p>
                    <p className="mt-0.5 text-caption leading-relaxed text-deal-good-text/75">
                      {t(
                        "mobile.notifyDoneBody",
                        "We'll email {email} the moment the APK drops — beta invites go out first.",
                        { email },
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleJoin} className="space-y-3">
                  <p className="text-caption font-semibold uppercase tracking-caps text-white/45">
                    {t("mobile.notifyTitle", "Get the launch ping")}
                  </p>
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <Input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t("mobile.notifyPlaceholder", "you@email.lk")}
                      aria-label={t("mobile.notifyEmail", "Email address")}
                      className="h-12 flex-1 rounded-full border-border bg-black/40 text-footnote text-white placeholder:text-white/35 focus:border-[#3D94FF]/60 focus:ring-1 focus:ring-[#3D94FF]/35"
                    />
                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.98 }}
                      transition={spring.smooth}
                      className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0A7AFF] px-6 text-footnote font-semibold text-white shadow-e2 transition-colors hover:bg-[#3D94FF]"
                    >
                      <BellRing className="h-3.5 w-3.5" aria-hidden />
                      {t("mobile.notifyCta", "Notify me")}
                    </motion.button>
                  </div>
                  {error && <p className="text-caption font-medium text-deal-high-text">{error}</p>}
                  <p className="text-caption text-white/40">
                    {t("mobile.notifyFinePrint", "One email at launch. No marketing lists, unsubscribe any time.")}
                  </p>
                </form>
              )}
            </motion.div>

            <motion.div variants={revealItem} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-caption text-white/50">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#3D94FF]" aria-hidden />
                {t("mobile.platformAndroid", "Android 8.0+ · APK")}
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#3D94FF]" aria-hidden />
                {t("mobile.signedBuild", "Signed build · SHA-256 published")}
              </span>
              <span className="inline-flex items-center gap-2">
                <Apple className="h-3.5 w-3.5 text-[#3D94FF]" aria-hidden />
                {t("mobile.platformIos", "iPhone build after Android")}
              </span>
            </motion.div>
          </div>

          {/* Phone mock */}
          <motion.div variants={revealItem} className="relative mx-auto w-full max-w-[330px]">
            <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(10,122,255,0.24),transparent_68%)]" />
            <div className="relative rounded-[2.6rem] border border-border bg-[#0a0f19] p-3 shadow-e3">
              <div className="relative overflow-hidden rounded-[2.1rem] border border-border bg-[#070b13]">
                <div className="flex items-center justify-between px-5 pt-4 text-caption font-medium text-white/45">
                  <span>9:41</span>
                  <span className="h-4 w-16 rounded-full bg-black/70" />
                  <span>{t("mobile.mockSignal", "LTE")}</span>
                </div>
                <div className="px-5 pb-6 pt-5">
                  <p className="text-caption font-bold uppercase tracking-caps text-[#3D94FF]">
                    {t("mobile.mockEyebrow", "Live market")}
                  </p>
                  <p className="mt-1.5 font-display text-title3 font-semibold leading-tight text-white">
                    Toyota Aqua S
                  </p>
                  <p className="mt-1 text-caption text-white/50">2017 · Colombo · Petrol hybrid</p>
                  <div className="mt-4 flex items-end justify-between rounded-2xl border border-border bg-foreground/[0.045] px-4 py-3">
                    <div>
                      <p className="text-caption uppercase tracking-caps text-white/40">
                        {t("mobile.mockAsk", "Asking")}
                      </p>
                      <p className="mt-1 text-callout font-semibold text-white">Rs 8,450,000</p>
                    </div>
                    <span className="rounded-full border border-deal-good/30 bg-deal-good/12 px-2.5 py-1 text-caption font-bold text-deal-good-text">
                      {t("mobile.mockScore", "9.1 deal")}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[
                      t("mobile.mockRow1", "Rs 420,000 below district median"),
                      t("mobile.mockRow2", "Cut 3.5% · 4 days ago"),
                      t("mobile.mockRow3", "Saved to watchlist"),
                    ].map((row) => (
                      <div key={row} className="flex items-center gap-2.5 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2">
                        <Sparkles className="h-3 w-3 shrink-0 text-[#3D94FF]" aria-hidden />
                        <span className="text-caption text-white/60">{row}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-full border border-deal-caution/25 bg-deal-caution/10 px-3.5 py-2.5">
                    <Camera className="h-3.5 w-3.5 shrink-0 text-deal-caution-text" aria-hidden />
                    <span className="text-caption font-medium text-deal-caution-text">
                      {t("mobile.mockScan", "Scan a plate to pull the record")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-5 text-center text-caption text-white/40">
              {t(
                "mobile.mockCaptionIllustrative",
                "Illustrative preview of the release candidate UI.",
              )}
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <RevealSection className="relative border-t border-border px-5 py-20 sm:px-8">
        <div className="mx-auto w-full max-w-[1180px]">
          <div className="max-w-2xl">
            <p className="text-caption font-bold uppercase tracking-caps text-[#3D94FF]">
              {t("mobile.featuresEyebrow", "What ships in the first release")}
            </p>
            <h2 className="mt-4 font-display text-title1 font-semibold leading-tight tracking-tight text-white sm:text-large">
              {t("mobile.featuresTitle", "Built for how Sri Lanka actually buys cars.")}
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.titleKey}
                  className="group rounded-3xl border border-border bg-foreground/[0.035] p-5 transition-colors duration-medium hover:border-[#3D94FF]/35 hover:bg-foreground/[0.055]"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#3D94FF]/25 bg-[#0A7AFF]/12">
                    <Icon className="h-4 w-4 text-[#3D94FF]" />
                  </span>
                  <p className="mt-4 text-body font-semibold text-white">{feature.label}</p>
                  <p className="mt-2 text-footnote leading-relaxed text-white/55">{feature.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </RevealSection>

      {/* ── Roadmap ──────────────────────────────────────────────── */}
      <RevealSection className="relative border-t border-border px-5 py-20 sm:px-8">
        <div className="mx-auto w-full max-w-[1180px]">
          <p className="text-caption font-bold uppercase tracking-caps text-[#3D94FF]">
            {t("mobile.roadmapEyebrow", "Release roadmap")}
          </p>
          <h2 className="mt-4 font-display text-title1 font-semibold leading-tight tracking-tight text-white sm:text-large">
            {t("mobile.roadmapTitle", "Phased, verified, then public.")}
          </h2>

          <ol className="mt-12 grid gap-4 lg:grid-cols-4">
            {ROADMAP.map((step, index) => (
              <li key={step.key} className="relative rounded-3xl border border-border bg-foreground/[0.035] p-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-black/30 px-2.5 py-1 text-caption font-bold uppercase tracking-caps text-white/55">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3D94FF]" />
                  {t(step.labelKey, step.label)}
                </span>
                <p className="mt-4 font-display text-body font-semibold text-white">
                  {t(step.titleKey, step.title)}
                </p>
                <p className="mt-2 text-footnote leading-relaxed text-white/55">{t(step.bodyKey, step.body)}</p>
                <span aria-hidden className="absolute right-5 top-5 font-display text-footnote font-semibold text-white/15">
                  0{index + 1}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-3xl border border-deal-good/20 bg-deal-good/[0.06] px-5 py-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-deal-good/25 bg-deal-good/12">
                <Download className="h-4 w-4 text-deal-good-text" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-white">
                  {t("mobile.downloadTitle", "Motormila v{version} for Android", { version: APK_VERSION })}
                </p>
                <p className="mt-0.5 text-caption text-white/55">
                  {t("mobile.downloadSub", "{size} · Android 8.0+ · installs over older builds, watchlist kept", { size: APK_SIZE })}
                </p>
              </div>
              <motion.a
                href={APK_URL}
                whileTap={{ scale: 0.97 }}
                transition={spring.smooth}
                className="inline-flex h-11 items-center rounded-full bg-[#0A7AFF] px-5 text-footnote font-semibold text-white no-underline transition-colors hover:bg-[#3D94FF]"
              >
                {t("mobile.downloadNow", "Download APK")}
              </motion.a>
            </div>
            <button
              type="button"
              onClick={copyChecksum}
              className="mt-4 flex w-full items-center gap-2 rounded-xl border border-border bg-black/30 px-3.5 py-2.5 text-left transition-colors hover:border-[#3D94FF]/40"
              aria-label={t("mobile.copyChecksum", "Copy SHA-256 checksum")}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#3D94FF]" aria-hidden />
              <code className="min-w-0 flex-1 truncate font-mono text-caption text-white/60">{APK_SHA256}</code>
              {copied ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-deal-good-text" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
              )}
            </button>
            <p className="mt-3 text-caption leading-relaxed text-white/55">
              {t(
                "mobile.downloadVerify",
                "On your phone: open the file, allow “Install unknown apps” once, then open. Verify the SHA-256 above matches if you want proof of origin — we never ask you to install from a third-party mirror.",
              )}
            </p>
          </div>
        </div>
      </RevealSection>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <RevealSection className="relative border-t border-border px-5 py-20 sm:px-8">
        <div className="mx-auto grid w-full max-w-[1180px] gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-caption font-bold uppercase tracking-caps text-[#3D94FF]">
              {t("mobile.faqEyebrow", "Questions")}
            </p>
            <h2 className="mt-4 font-display text-title1 font-semibold leading-tight tracking-tight text-white sm:text-large">
              {t("mobile.faqTitle", "Before you ask.")}
            </h2>
            <p className="mt-4 max-w-sm text-footnote leading-relaxed text-white/55">
              {t(
                "mobile.faqBody",
                "Anything missing? Tell us inside the app's feedback panel once you're in the beta — or from the website footer today.",
              )}
            </p>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-foreground/[0.03]">
            {FAQ.map((item) => (
              <div key={item.key} className="px-5 py-5">
                <p className="text-footnote font-semibold text-white">{t(item.qKey, item.q)}</p>
                <p className="mt-2 text-footnote leading-relaxed text-white/55">{t(item.aKey, item.a)}</p>
              </div>
            ))}
          </div>
        </div>
      </RevealSection>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <section className="relative border-t border-border px-5 py-16 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col items-start justify-between gap-6 rounded-[2.5rem] border border-border bg-[radial-gradient(ellipse_at_top_left,rgba(10,122,255,0.16),transparent_60%)] px-6 py-10 sm:flex-row sm:items-center sm:px-10">
          <div>
            <p className="font-display text-title2 font-semibold tracking-tight text-white">
              {t("mobile.ctaTitle", "The APK has landed.")}
            </p>
            <p className="mt-2 max-w-md text-footnote leading-relaxed text-white/60">
              {t("mobile.ctaBody", "Motormila v{version} for Android is live — market, deal scores, alerts and plate scanning in your pocket.", { version: APK_VERSION })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <motion.a
              href={APK_URL}
              whileTap={{ scale: 0.97 }}
              transition={spring.smooth}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0A7AFF] px-5 text-footnote font-semibold text-white no-underline transition-colors hover:bg-[#3D94FF]"
            >
              <Download className="h-4 w-4" aria-hidden />
              {t("mobile.ctaDownload", "Download APK · {size}", { size: APK_SIZE })}
            </motion.a>
            <PrefetchLink
              to="/"
              className="inline-flex h-11 items-center rounded-full border border-border px-5 text-footnote font-semibold text-white/80 no-underline transition-colors hover:border-[#3D94FF]/45 hover:text-white"
            >
              {t("mobile.ctaMarket", "Open the market")}
            </PrefetchLink>
          </div>
        </div>
      </section>
    </div>
  );
}
