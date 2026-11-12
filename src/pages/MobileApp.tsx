import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Check,
  Copy,
  Download,
  FileDown,
  Gauge,
  Layers,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { PrefetchLink } from "@/components/PrefetchLink";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { useAppPreferences } from "@/lib/appPreferences";
import { MOBILE_APP_QR_PATH, MOBILE_APP_QR_SIZE } from "@/lib/mobileAppQr";
import { cn } from "@/lib/utils";
import screenHome from "../../assets/mobile-app/screen-home.webp";
import screenDetail from "../../assets/mobile-app/screen-detail.webp";
import screenSearch from "../../assets/mobile-app/screen-search.webp";
import screenCompare from "../../assets/mobile-app/screen-compare.webp";
import screenAlerts from "../../assets/mobile-app/screen-alerts.webp";
import "@/styles/locale-labels.css";
import "@/styles/mobile-app.css";

/**
 * Live sideload release — keep in step with android/app/build.gradle.kts and
 * public/app/latest-release.json (the in-app updater's manifest).
 */
const APK_VERSION = "1.8.0";
const APK_VERSION_CODE = 21;
/** 5,800,279 bytes (published APK Content-Length). */
const APK_BYTES = 5_800_279;
const APK_SIZE = "5.5 MB";
// Public R2 download, published by .github/workflows/android-release.yml.
const APK_URL = `https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app/motormila-${APK_VERSION}.apk`;
const APK_SHA256 = "6d9d417bf837deb6277d387318e88acc79fdcef6f95d6ed401cfd7258732634f";
/** SHA-256 of the release signing certificate (APK Signature Scheme v2/v3), same key since 1.7.0. */
const APK_CERT_SHA256 = "384420c0922cb84ee0e6866ab09b4e47e7012bf21c69e83f934304366f445217";
/** Release date of APK_VERSION (latest-release.json `published_at`), ISO date. */
const APK_UPDATED = "2026-10-30";

/** App screenshots: 1080×2400 emulator captures of the release app (live data), resized to 600×1333. */
const SCREEN_W = 600;
const SCREEN_H = 1333;

type Placement = "hero" | "trust" | "cta";

function onDownload(placement: Placement) {
  trackEvent("app_download_click", { placement, version: APK_VERSION });
}

/* ── Building blocks ─────────────────────────────────────────────────── */

function Phone({ src, alt, eager = false, className }: { src: string; alt: string; eager?: boolean; className?: string }) {
  return (
    <div className={cn("ma-phone", className)}>
      <div className="ma-phone__screen">
        <img src={src} alt={alt} width={SCREEN_W} height={SCREEN_H} loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>
    </div>
  );
}

function QrCode({ label }: { label: string }) {
  const margin = 2;
  const box = MOBILE_APP_QR_SIZE + margin * 2;
  return (
    <div className="ma-qr h-28 w-28 shrink-0">
      <svg viewBox={`${-margin} ${-margin} ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <path d={MOBILE_APP_QR_PATH} fill="currentColor" />
      </svg>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-footnote font-semibold text-primary">{children}</p>;
}

const delay = (n: number) => ({ "--ma-d": n }) as CSSProperties;

function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

/**
 * Scroll reveal for every [data-reveal] inside the page, plus an "in view"
 * flag on the hero so its float animation only runs while it's on screen.
 * One observer each, compositor-only CSS (src/styles/mobile-app.css).
 */
function useReveal(root: React.RefObject<HTMLElement>, hero: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const page = root.current;
    if (!page || typeof IntersectionObserver === "undefined") return;
    page.classList.add("ma-armed");
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.shown = "true";
          reveal.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    page.querySelectorAll("[data-reveal]").forEach((el) => reveal.observe(el));

    const heroEl = hero.current;
    const float = new IntersectionObserver(([entry]) => {
      if (heroEl) heroEl.dataset.inview = entry.isIntersecting ? "true" : "false";
    });
    if (heroEl) float.observe(heroEl);
    return () => {
      reveal.disconnect();
      float.disconnect();
    };
  }, [root, hero]);
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function MobileApp() {
  const { t, language } = useAppPreferences();
  const pageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  useReveal(pageRef, heroRef);
  const apkHash = useCopy(APK_SHA256);

  const locale = language === "si" ? "si-LK" : language === "ta" ? "ta-LK" : "en-LK";
  const updated = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Colombo" }).format(
    new Date(`${APK_UPDATED}T12:00:00+05:30`),
  );
  const bytes = new Intl.NumberFormat("en-LK").format(APK_BYTES);

  const features = [
    {
      key: "verdict",
      icon: Gauge,
      title: t("mapp.feature.verdict.title", "A verdict on every price."),
      body: t(
        "mapp.feature.verdict.body",
        "Each car is checked against what similar cars are asking, so you see “above typical” or “below typical”, the typical price, and the deal ladder before you call the seller.",
      ),
      screen: screenDetail,
      alt: t("mapp.screen.detail", "Motormila app: a listing with its price verdict and typical-price gauge"),
    },
    {
      key: "search",
      icon: Search,
      title: t("mapp.feature.search.title", "The whole market, one search."),
      body: t("mapp.feature.search.body", "Listings from Sri Lanka's big marketplaces in one feed. Filter by make, model, district, fuel, year and price."),
      screen: screenSearch,
      alt: t("mapp.screen.search", "Motormila app: search results for Toyota Aqua"),
    },
    {
      key: "compare",
      icon: Layers,
      title: t("mapp.feature.compare.title", "Compare side by side."),
      body: t("mapp.feature.compare.body", "Put up to three cars next to each other. The better value in each row is highlighted."),
      screen: screenCompare,
      alt: t("mapp.screen.compare", "Motormila app: three cars compared side by side"),
    },
    {
      key: "alerts",
      icon: BellRing,
      title: t("mapp.feature.alerts.title", "Alerts that come to you."),
      body: t("mapp.feature.alerts.body", "Save cars to your watchlist and see price drops at a glance. Set a price alert and get a push notification when a match lands."),
      screen: screenAlerts,
      alt: t("mapp.screen.alerts", "Motormila app: creating a price alert"),
    },
  ];

  const minorFeatures = [
    {
      key: "scan",
      icon: ScanLine,
      title: t("mapp.feature.scan.title", "Scan a number plate."),
      body: t("mapp.feature.scan.body", "Point the camera at a plate. It's read on your phone, then Motormila finds that vehicle's listings."),
    },
    {
      key: "offline",
      icon: WifiOff,
      title: t("mapp.feature.offline.title", "Works on a weak signal."),
      body: t("mapp.feature.offline.body", "The last market data and your watchlist are cached, and the import-duty and lease calculators work offline."),
    },
  ];

  const steps = [
    {
      key: "download",
      icon: FileDown,
      title: t("mapp.step.download.title", "Download the APK"),
      body: t("mapp.step.download.body", "Tap Download on your Android phone. On a computer, scan the QR code to open this page on your phone."),
    },
    {
      key: "allow",
      icon: Smartphone,
      title: t("mapp.step.allow.title", "Allow the install"),
      body: t(
        "mapp.step.allow.body",
        "Open the downloaded file. If Android asks, turn on “Allow from this source” for your browser. You only need to do this once.",
      ),
    },
    {
      key: "protect",
      icon: ShieldCheck,
      title: t("mapp.step.protect.title", "If Play Protect asks"),
      body: t(
        "mapp.step.protect.body",
        "Google Play Protect may warn you because the app isn't from the Play Store yet. Tap “More details”, then “Install anyway”, or let it scan the app first.",
      ),
    },
    {
      key: "open",
      icon: Check,
      title: t("mapp.step.open.title", "Open Motormila"),
      body: t("mapp.step.open.body", "That's it. From now on the app updates itself."),
    },
  ];

  const faq = [
    {
      key: "free",
      q: t("mapp.faq.free.q", "Is the app free?"),
      a: t(
        "mapp.faq.free.a",
        "Yes. Browsing, search, the watchlist and price alerts are free. Pro tools carry over from your Motormila plan when you sign in.",
      ),
    },
    {
      key: "play",
      q: t("mapp.faq.play.q", "Why isn't it on Google Play?"),
      a: t(
        "mapp.faq.play.a",
        "The Android app is in preview, so it's offered here as a direct download. Store listings come after the stable release.",
      ),
    },
    {
      key: "safe",
      q: t("mapp.faq.safe.q", "Is installing an APK safe?"),
      a: t(
        "mapp.faq.safe.a",
        "Only install it from this page. The APK is signed by Motormila, and its SHA-256 checksum is published above so you can check the file you downloaded. We never ask you to install it from a mirror or a chat link.",
      ),
    },
    {
      key: "updates",
      q: t("mapp.faq.updates.q", "How do updates work?"),
      a: t(
        "mapp.faq.updates.a",
        "When the app opens it checks for a new version. Tap “Update now” and it downloads the update, checks its SHA-256, then Android asks you to confirm. Your data stays.",
      ),
    },
    {
      key: "ios",
      q: t("mapp.faq.ios.q", "Is there an iPhone app?"),
      a: t(
        "mapp.faq.ios.a",
        "Not yet. Android comes first because it covers the most phones in Sri Lanka. Until then, use the Motormila website in your iPhone's browser.",
      ),
    },
  ];

  const facts: Array<{ key: string; node: ReactNode }> = [
    { key: "free", node: t("mapp.fact.free", "Free") },
    { key: "size", node: APK_SIZE },
    { key: "android", node: t("mapp.fact.android", "Android 8.0 and up") },
    {
      key: "languages",
      // Language names stay in their own script (the locale-label font subset covers exactly these words).
      node: (
        <>
          English ·{" "}
          <span lang="si" className="locale-script-label">
            සිංහල
          </span>{" "}
          ·{" "}
          <span lang="ta" className="locale-script-label">
            தமிழ்
          </span>
        </>
      ),
    },
  ];

  return (
    <div ref={pageRef} className="ma-page relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section ref={heroRef} data-inview="false" className="relative">
        <div aria-hidden className="ma-hero-glow" data-low-data="hide" />
        <div className="layout-shell relative grid items-center gap-12 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pb-24 lg:pt-20">
          <div className="min-w-0">
            <div className="ma-enter flex items-center gap-3" style={delay(0)}>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-[0.9rem] border border-border bg-card shadow-e1">
                <BrandLogo showWordmark={false} size="compact" className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">{t("mapp.eyebrow", "Motormila for Android")}</p>
                <p className="text-footnote text-label-2">{t("mapp.previewTag", "Preview · version {version}", { version: APK_VERSION })}</p>
              </div>
            </div>

            <h1 className="ma-enter mt-7 font-display text-large font-semibold text-foreground [text-wrap:balance] sm:text-hero" style={delay(1)}>
              {t("mapp.title", "Know the fair price")} <span className="text-primary">{t("mapp.titleAccent", "before you call.")}</span>
            </h1>

            <p className="ma-enter mt-5 max-w-xl text-callout text-label-2 [text-wrap:pretty]" style={delay(2)}>
              {t(
                "mapp.subtitle",
                "Every car for sale in Sri Lanka, checked against what similar cars ask. Search the whole market, compare, and get price alerts, right from your phone.",
              )}
            </p>

            <div className="ma-enter mt-8 flex flex-wrap items-center gap-x-5 gap-y-3" style={delay(3)}>
              <Button asChild size="lg" className="h-14 max-w-full gap-3 px-6">
                <a href={APK_URL} onClick={() => onDownload("hero")}>
                  <Download aria-hidden />
                  <span className="flex flex-col items-start leading-tight">
                    <span>{t("mapp.download", "Download APK")}</span>
                    <span className="text-caption font-medium opacity-85">
                      {t("mapp.downloadMeta", "v{version} · {size}", { version: APK_VERSION, size: APK_SIZE })}
                    </span>
                  </span>
                </a>
              </Button>
              <a
                href="#install"
                className="group inline-flex min-h-11 items-center gap-1.5 rounded-full text-body font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("mapp.howToInstall", "How to install")}
                <ArrowRight className="h-4 w-4 transition-transform duration-short ease-standard group-hover:translate-x-0.5" aria-hidden />
              </a>
            </div>

            <ul className="ma-enter mt-6 flex flex-wrap gap-x-5 gap-y-2 text-footnote text-label-2" style={delay(4)}>
              <li className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-primary" aria-hidden />
                {t("mapp.trust.signed", "Signed by Motormila")}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                {t("mapp.trust.sha", "SHA-256 published")}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4 text-primary" aria-hidden />
                {t("mapp.trust.ota", "Updates itself")}
              </li>
            </ul>

            {/* Desktop only: hand-off to the phone. */}
            <div className="ma-enter mt-10 hidden max-w-md items-center gap-5 rounded-[1.5rem] border border-border bg-card/80 p-4 pr-6 shadow-e1 lg:flex" style={delay(5)}>
              <QrCode label={t("mapp.qrAlt", "QR code that opens this page on your phone")} />
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">{t("mapp.qrTitle", "On a computer?")}</p>
                <p className="mt-1 text-footnote text-label-2">
                  {t("mapp.qrBody", "Scan with your Android phone's camera to open this page there, then tap Download.")}
                </p>
              </div>
            </div>
          </div>

          <div className="ma-enter min-w-0" style={delay(2)}>
            <div className="ma-hero-phones">
              <div className="ma-hero-phones__back" aria-hidden>
                <Phone src={screenDetail} alt="" eager />
              </div>
              <div className="ma-hero-phones__front">
                <Phone src={screenHome} alt={t("mapp.screen.home", "Motormila app home screen: Find a fair price")} eager />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick facts ───────────────────────────────────────────────── */}
      <div className="border-y border-separator">
        <ul className="layout-shell flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-5 text-footnote font-medium text-label-2 sm:justify-between">
          {facts.map((fact) => (
            <li key={fact.key} className="inline-flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary/70" />
              <span>{fact.node}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section aria-labelledby="ma-features" className="py-20 lg:py-28">
        <div className="layout-shell">
          <div data-reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t("mapp.featuresEyebrow", "What's inside")}</Eyebrow>
            <h2 id="ma-features" className="mt-2 font-display text-title1 font-semibold text-foreground [text-wrap:balance] sm:text-large">
              {t("mapp.featuresTitle", "Everything you need when you're out looking at cars.")}
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const wide = index === 0;
              return (
                <article
                  key={feature.key}
                  data-reveal
                  style={delay(index % 3)}
                  className={cn(
                    "ma-feature surface--glass flex min-h-0 flex-col overflow-hidden border",
                    wide && "md:col-span-2 lg:flex-row",
                  )}
                >
                  <div className={cn("p-6 sm:p-7", wide && "lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:p-10")}>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className={cn("mt-4 font-display font-semibold text-foreground [text-wrap:balance]", wide ? "text-title2 lg:text-title1" : "text-title3")}>
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-body text-label-2 [text-wrap:pretty]">{feature.body}</p>
                  </div>
                  <div className={cn("ma-peek", wide && "ma-peek--tall lg:w-1/2")}>
                    <Phone src={feature.screen} alt={feature.alt} />
                  </div>
                </article>
              );
            })}

            <div className="grid gap-4">
              {minorFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.key} data-reveal style={delay(index + 1)} className="surface--glass flex flex-col border p-6 sm:p-7">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 font-display text-title3 font-semibold text-foreground">{feature.title}</h3>
                    <p className="mt-2 text-body text-label-2 [text-wrap:pretty]">{feature.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Install + trust ───────────────────────────────────────────── */}
      <section id="install" aria-labelledby="ma-install" className="scroll-mt-24 border-t border-separator bg-surface-1/40 py-20 lg:py-28">
        <div className="layout-shell grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <div data-reveal>
              <Eyebrow>{t("mapp.installEyebrow", "Install")}</Eyebrow>
              <h2 id="ma-install" className="mt-2 font-display text-title1 font-semibold text-foreground [text-wrap:balance] sm:text-large">
                {t("mapp.installTitle", "Installed in under a minute.")}
              </h2>
              <p className="mt-3 max-w-lg text-body text-label-2">
                {t("mapp.installBody", "Motormila isn't on the Play Store yet, so Android asks for one extra tap. Here's the whole thing.")}
              </p>
            </div>

            <ol className="mt-10 space-y-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.key} data-reveal style={delay(index)} className="flex gap-4 rounded-[1.25rem] border border-border bg-card p-4 sm:p-5">
                    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                      <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold tabular-nums text-primary-foreground">
                        {index + 1}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-foreground">{step.title}</p>
                      <p className="mt-1 text-footnote text-label-2 [text-wrap:pretty]">{step.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div data-reveal className="mt-4 flex gap-3 rounded-[1.25rem] border border-deal-caution/40 bg-deal-caution/10 p-4 sm:p-5">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-deal-caution-text" aria-hidden />
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">{t("mapp.oldKey.title", "Have version 1.6.5 or older?")}</p>
                <p className="mt-1 text-footnote text-label-1 [text-wrap:pretty]">
                  {t(
                    "mapp.oldKey.body",
                    "Uninstall it first, then install this one. Those builds were signed with an older key, so Android can't update them in place. It's a one-time step: every version from 1.7.0 on updates normally.",
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 lg:pt-16">
            <div data-reveal className="surface--glass border p-6 sm:p-8 lg:sticky lg:top-28">
              <div className="flex items-start gap-4">
                <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[1rem] border border-border bg-background">
                  <BrandLogo showWordmark={false} size="compact" className="h-8 w-8" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-title3 font-semibold text-foreground">
                    {t("mapp.trust.title", "Motormila {version}", { version: APK_VERSION })}
                  </p>
                  <p className="mt-0.5 text-footnote text-label-2">{t("mapp.trust.subtitle", "Android preview · direct download")}</p>
                </div>
              </div>

              <dl className="mt-6 divide-y divide-separator border-y border-separator text-footnote">
                {[
                  [t("mapp.trust.version", "Version"), t("mapp.trust.versionValue", "{version} (build {code})", { version: APK_VERSION, code: APK_VERSION_CODE })],
                  [t("mapp.trust.size", "Size"), t("mapp.trust.sizeValue", "{size} ({bytes} bytes)", { size: APK_SIZE, bytes })],
                  [t("mapp.trust.updated", "Updated"), updated],
                  [t("mapp.trust.requires", "Requires"), t("mapp.fact.android", "Android 8.0 and up")],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="text-label-2">{label}</dt>
                    <dd className="text-right font-medium tabular-nums text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6">
                <p className="text-footnote font-semibold text-foreground">{t("mapp.trust.shaLabel", "APK SHA-256")}</p>
                <button
                  type="button"
                  onClick={apkHash.copy}
                  className="press mt-2 flex w-full items-start gap-3 rounded-control border border-border bg-background px-3.5 py-3 text-left transition-colors duration-short ease-standard hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("mapp.copySha", "Copy the APK's SHA-256 checksum")}
                >
                  <code className="min-w-0 flex-1 break-all font-code text-caption text-label-1">{APK_SHA256}</code>
                  {apkHash.copied ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-deal-good-text" aria-hidden />
                  ) : (
                    <Copy className="mt-0.5 h-4 w-4 shrink-0 text-label-2" aria-hidden />
                  )}
                </button>
                <p className="mt-1.5 min-h-4 text-caption text-label-2" aria-live="polite">
                  {apkHash.copied ? t("mapp.copied", "Copied") : t("mapp.trust.shaHint", "Compare it with the file on your device before installing, if you want proof of origin.")}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-footnote font-semibold text-foreground">{t("mapp.trust.certLabel", "Signing certificate (SHA-256)")}</p>
                <code className="mt-2 block break-all rounded-control border border-border bg-background px-3.5 py-3 font-code text-caption text-label-1">
                  {APK_CERT_SHA256}
                </code>
                <p className="mt-1.5 text-caption text-label-2 [text-wrap:pretty]">
                  {t(
                    "mapp.trust.certBody",
                    "Every release from 1.7.0 is signed with this certificate. Android refuses an update signed by anyone else.",
                  )}
                </p>
              </div>

              <div className="mt-5 flex gap-3 rounded-control bg-primary/10 px-4 py-3">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <p className="text-footnote text-label-1 [text-wrap:pretty]">
                  {t(
                    "mapp.trust.otaBody",
                    "Automatic updates: the app checks for new versions when it opens, verifies each download's SHA-256, and asks before installing.",
                  )}
                </p>
              </div>

              <Button asChild size="lg" className="mt-6 w-full">
                <a href={APK_URL} onClick={() => onDownload("trust")}>
                  <Download aria-hidden />
                  {t("mapp.downloadWithSize", "Download APK · {size}", { size: APK_SIZE })}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="ma-faq" className="border-t border-separator py-20 lg:py-28">
        <div className="layout-shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div data-reveal>
            <Eyebrow>{t("mapp.faqEyebrow", "Questions")}</Eyebrow>
            <h2 id="ma-faq" className="mt-2 font-display text-title1 font-semibold text-foreground sm:text-large">
              {t("mapp.faqTitle", "Good to know.")}
            </h2>
            <p className="mt-3 max-w-sm text-body text-label-2">
              {t("mapp.faqBody", "Something else? Send us a note from the app's Feedback screen or the website footer.")}
            </p>
          </div>
          <div data-reveal className="surface--glass divide-y divide-separator border">
            {faq.map((item) => (
              <details key={item.key} className="ma-faq group">
                <summary className="flex items-center justify-between gap-4 px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-7">
                  <span className="text-body font-semibold text-foreground">{item.q}</span>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-label-2">
                    <Plus className="ma-faq__icon h-4 w-4" aria-hidden />
                  </span>
                </summary>
                <div className="ma-faq__body px-5 pb-5 sm:px-7">
                  <p className="max-w-prose text-body text-label-2 [text-wrap:pretty]">{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="layout-shell pb-24">
        <div data-reveal className="premium-surface relative overflow-hidden px-6 py-14 text-center sm:px-10 sm:py-20">
          <div aria-hidden className="ma-hero-glow opacity-80" data-low-data="hide" />
          <div className="relative">
            <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[1.1rem] border border-border bg-card shadow-e1">
              <BrandLogo showWordmark={false} size="default" className="h-9 w-9" />
            </span>
            <h2 className="mx-auto mt-6 max-w-2xl font-display text-title1 font-semibold text-foreground [text-wrap:balance] sm:text-large">
              {t("mapp.ctaTitle", "Take the whole market with you.")}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-body text-label-2">
              {t("mapp.ctaBody", "Free for Android 8.0 and up. Version {version}, {size}.", { version: APK_VERSION, size: APK_SIZE })}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <a href={APK_URL} onClick={() => onDownload("cta")}>
                  <Download aria-hidden />
                  {t("mapp.download", "Download APK")}
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <PrefetchLink to="/">
                  {t("mapp.ctaWeb", "Browse on the web")}
                  <ArrowRight aria-hidden />
                </PrefetchLink>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
