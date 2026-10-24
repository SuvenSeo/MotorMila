import { useAppPreferences } from "@/lib/appPreferences";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, unstable_HistoryRouter as HistoryRouter, useLocation } from "react-router-dom";
import { createViewTransitionHistory } from "@/lib/viewTransition";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { RouteFallback } from "@/components/RouteFallback";
import { RouteTransition } from "@/components/RouteTransition";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { prefetchAppShellRoutes, registerRouteLoaders } from "@/lib/routePrefetch";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/Navbar";
import { CommandPaletteHost } from "@/components/CommandPaletteHost";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { AppFooter } from "@/components/AppFooter";
import { ScrollProgressBar } from "@/components/ScrollProgressBar";
import { RouteMeta } from "@/components/RouteMeta";
import { MobileAppPromo } from "@/components/MobileAppPromo";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireAuth } from "@/components/RequireAuth";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useDockTypingFlag } from "@/lib/dock";

const FeedbackWidget = lazyWithRetry(() =>
  import("@/components/FeedbackWidget").then((m) => ({ default: m.FeedbackWidget }))
);
import { CompareTray, CompareProvider } from "@/components/compare/CompareTray";
// Trial banner lives in Pricing to avoid a new chunk; lazy keeps it out of first paint.
const TrialCountdownBanner = lazyWithRetry(() =>
  import("./pages/Pricing").then((m) => ({ default: m.TrialCountdownBanner }))
);

// Lazy load heavy page chunks
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const DealerDashboard = lazyWithRetry(() => import("./pages/DealerDashboard"));
const ListingDetail = lazyWithRetry(() => import("./pages/ListingDetail"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const Trends = lazyWithRetry(() => import("./pages/Trends"));
const Estimate = lazyWithRetry(() => import("./pages/Estimate"));
const Calculator = lazyWithRetry(() => import("./pages/Calculator"));
const EVHub = lazyWithRetry(() => import("./pages/EVHub"));
const EVChargers = lazyWithRetry(() => import("./pages/EVChargers"));

const BestPicks = lazyWithRetry(() => import("./pages/BestPicks"));
const SellYourCar = lazyWithRetry(() => import("./pages/SellYourCar"));
const SignIn = lazyWithRetry(() => import("./pages/SignIn"));
const SignUp = lazyWithRetry(() => import("./pages/SignUp"));
const ProDashboard = lazyWithRetry(() => import("./pages/ProDashboard"));
const ProPreview = lazyWithRetry(() => import("./pages/ProPreview"));
const AdminConsole = lazyWithRetry(() => import("./pages/AdminConsole"));
const MobileApp = lazyWithRetry(() => import("./pages/MobileApp"));
const MakeModelHub = lazyWithRetry(() => import("./pages/MakeModelHub"));
const MakeHub = lazyWithRetry(() => import("./pages/MakeHub"));
const DistrictHub = lazyWithRetry(() => import("./pages/DistrictHub"));
const Alerts = lazyWithRetry(() => import("./pages/Alerts"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));

const Docs = lazyWithRetry(() => import("./pages/Docs"));
const Pricing = lazyWithRetry(() => import("./pages/Pricing"));
const OfficialPulse = lazyWithRetry(() => import("./pages/OfficialPulse"));
const OfficialPulseDetail = lazyWithRetry(() => import("./pages/OfficialPulseDetail"));
const OfficialPulseGuide = lazyWithRetry(() => import("./pages/OfficialPulseGuide"));
const HeroLab = lazyWithRetry(() => import("./pages/HeroLab"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyWithRetry(() => import("./pages/TermsOfService"));
const Permits = lazyWithRetry(() => import("./pages/Permits"));
const Compare = lazyWithRetry(() => import("./pages/Compare"));
const Afford = lazyWithRetry(() => import("./pages/Afford"));
const SafeTransfer = lazyWithRetry(() => import("./pages/SafeTransfer"));
// overhaul/money-legal: lead capture, legal requests, PayHere return
const LeadRequest = lazyWithRetry(() => import("./pages/LeadRequest"));
const RemovalRequest = lazyWithRetry(() => import("./pages/RemovalRequest"));
const AccountDeletion = lazyWithRetry(() => import("./pages/AccountDeletion"));
const CookieNotice = lazyWithRetry(() => import("./pages/CookieNotice"));
const CheckoutReturn = lazyWithRetry(() => import("./pages/CheckoutReturn"));
// ui/features: methodology explainer
const HowWePrice = lazyWithRetry(() => import("./pages/HowWePrice"));
const BotInfo = lazyWithRetry(() => import("./pages/BotInfo"));

// Hover / focus / idle prefetch targets (lib/routePrefetch.ts imports no pages,
// so the map lives here beside the lazy routes; same specifiers → same chunks).
registerRouteLoaders({
  "/": () => import("./pages/Dashboard"),
  "/trends": () => import("./pages/Trends"),
  "/price-index": () => import("./pages/Trends"), // redirects to /trends
  "/estimate": () => import("./pages/Estimate"),
  "/calculator": () => import("./pages/Calculator"),
  "/ev-hub": () => import("./pages/EVHub"),
  "/ev-chargers": () => import("./pages/EVChargers"),
  "/best-picks": () => import("./pages/BestPicks"),
  "/official-pulse": () => import("./pages/OfficialPulse"),
  "/docs": () => import("./pages/Docs"),
  "/pricing": () => import("./pages/Pricing"),
  "/compare": () => import("./pages/Compare"),
  "/permits": () => import("./pages/Permits"),
  "/alerts": () => import("./pages/Alerts"),
  "/settings": () => import("./pages/Settings"),
  "/dealer": () => import("./pages/DealerDashboard"),
  "/mobile-app": () => import("./pages/MobileApp"),
  "/pro": () => import("./pages/ProDashboard"),
  "/pro-preview": () => import("./pages/ProPreview"),
  "/sign-in": () => import("./pages/SignIn"),
  "/sign-up": () => import("./pages/SignUp"),
  "/privacy": () => import("./pages/PrivacyPolicy"),
  "/terms": () => import("./pages/TermsOfService"),
  "listing-detail": () => import("./pages/ListingDetail"),
  "pulse-guide": () => import("./pages/OfficialPulseGuide"),
  "pulse-detail": () => import("./pages/OfficialPulseDetail"),
  "district-hub": () => import("./pages/DistrictHub"),
  "make-hub": () => import("./pages/MakeHub"),
  "make-model-hub": () => import("./pages/MakeModelHub"),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default leans toward market-style freshness; live listing queries
      // override with QUERY_STALE.listings (10s) at the call site.
      staleTime: QUERY_STALE.stats,
      gcTime: QUERY_STALE.market,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Browser history whose route swaps run through a View Transition. */
const appHistory = createViewTransitionHistory();

const MinimalLoader = () => <RouteFallback />;

/**
 * Internal hero A/B lab. It is a design tool, not a product surface: dev
 * builds only. Production has no route for it (falls through to 404) and no
 * `?heroLab=1` escape hatch.
 */
function HeroLabGate() {
  return import.meta.env.DEV ? <HeroLab /> : <Navigate to="/" replace />;
}

function TrialBannerSlot() {  const { user } = useAuth();
  // Defer the Pricing chunk until the banner can actually render: anonymous
  // and paid users always render null, so skip the dynamic import entirely.
  if (!user) return null;
  // Only an actual trial gets a site-wide line; free users aren't nagged on every page.
  if (user.subscriptionStatus !== "trialing") return null;
  return (
    <div className="mx-auto w-full max-w-[1560px] px-5 pt-3 sm:px-6">
      <Suspense fallback={null}>
        <TrialCountdownBanner />
      </Suspense>
    </div>
  );
}

/** Scrolls to the URL hash after navigation (e.g. Market -> /#market from another page). */
function HashScroller() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    // Wait for the lazy route to mount before looking for the anchor.
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [hash]);
  return null;
}

function SkipLink() {
  const { t } = useAppPreferences();
  return <a href="#main-content" className="skip-to-content">{t("shell.skipToContent", "Skip to main content")}</a>;
}

function AppShell() {
  // Floating buttons step aside while a text field is focused (mobile keyboard).
  useDockTypingFlag();
  return (
    // app-shell-dock-pad: content and footer always clear the bottom dock
    // (mobile nav + compare tray). See src/styles/layers.css.
    <div className="min-h-screen app-shell app-shell-dock-pad selection:bg-primary/20 bg-background">
      <SkipLink />
      <HashScroller />
      <Navbar />
      <CommandPaletteHost />
      {/* Feedback is a dialog opened from the menu / footer — no floating button. */}
      <Suspense fallback={null}>
        <FeedbackWidget />
      </Suspense>
      <main id="main-content" className="relative z-base pt-[var(--nav-offset)]">
          <TrialBannerSlot />
        <RouteErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <RouteTransition />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <AppFooter />
      {/* Bottom dock — one area, stacked: app promo strip → compare tray → bottom nav. */}
      <MobileAppPromo />
      <CompareTray />
      <MobileBottomNav />
      {/* Height = the promo strip's claim (lib/dock.ts setDockExtra), phones only. */}
      <div data-dock-spacer aria-hidden className="md:hidden" />
    </div>
  );
}

// Public browse shell: no session required.
function PublicLayout() {
  return <AppShell />;
}

// Gated shell: sign-in required (invite-only signup unchanged).
function ProtectedLayout() {
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  );
}

const App = () => {
  // Route chunks prefetch on idle; nothing is gated behind an artificial loader.
  useEffect(() => {
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(() => prefetchAppShellRoutes(), { timeout: 2500 });
    } else {
      timeoutHandle = window.setTimeout(() => prefetchAppShellRoutes(), 1200);
    }
    return () => {
      if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {/* `m` components load only the domAnimation feature set; reduced
              motion follows the OS setting app-wide. */}
          <LazyMotion features={domAnimation}>
          <MotionConfig reducedMotion="user">
            <ScrollProgressBar />
            {/* Toasts sit under the header, clear of the bottom dock (nav, compare). */}
            <Sonner position="top-center" offset={76} mobileOffset={{ top: 72 }} />
            <HistoryRouter history={appHistory} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <ScrollRestoration />
              <RouteMeta />
              <CompareProvider>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/trends" element={<Trends />} />
                  <Route path="/estimate" element={<Estimate />} />
                  <Route path="/calculator" element={<Calculator />} />
                  <Route path="/ev-hub" element={<EVHub />} />
                  {/* EV chargers: Open Charge Map cache is empty — redirect to EV Hub until real data exists. */}
                  <Route path="/ev-chargers" element={<EVChargers />} />
                  <Route path="/best-picks" element={<BestPicks />} />
                  <Route path="/sell" element={<SellYourCar />} />
                  <Route path="/listing/:id" element={<ListingDetail />} />
                  <Route path="/cars/:make/:model/:year" element={<MakeModelHub />} />
                  <Route path="/cars/:make/:model" element={<MakeModelHub />} />
                  <Route path="/cars/:make" element={<MakeHub />} />
                  <Route path="/locations/:district" element={<DistrictHub />} />
                  {/* Price index: needs months of history before it's meaningful — redirect to Trends meanwhile. */}
                  <Route path="/price-index" element={<Navigate to="/trends" replace />} />
                  <Route path="/official-pulse" element={<OfficialPulse />} />
                  <Route path="/official-pulse/guide/:key" element={<OfficialPulseGuide />} />
                  <Route path="/official-pulse/:id" element={<OfficialPulseDetail />} />
                  <Route path="/docs" element={<Docs />} />
                  <Route path="/bot" element={<BotInfo />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/cookies" element={<CookieNotice />} />
                  <Route path="/removal" element={<RemovalRequest />} />
                  <Route path="/delete-account" element={<AccountDeletion />} />
                  <Route path="/finance" element={<LeadRequest kind="finance" />} />
                  <Route path="/leasing" element={<Navigate to="/finance" replace />} />
                  <Route path="/inspection" element={<LeadRequest kind="inspection" />} />
                  <Route path="/insurance" element={<LeadRequest kind="insurance" />} />
                  <Route path="/checkout/return" element={<CheckoutReturn />} />
                  <Route path="/compare" element={<Compare />} />
                  <Route path="/compare/:slug" element={<Compare />} />
                  <Route path="/how-we-price" element={<HowWePrice />} />
                  {/** Legacy valuation path: header/footer now point at /estimate. */}
                  <Route path="/valuation" element={<Navigate to="/estimate" replace />} />
                  <Route path="/permits" element={<Permits />} />
                  <Route path="/mobile-app" element={<MobileApp />} />
                  <Route path="/afford" element={<Afford />} />
                  <Route path="/safe-transfer" element={<SafeTransfer />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route element={<ProtectedLayout />}>
                  <Route path="/dealer" element={<DealerDashboard />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>
                <Route path="/sign-in" element={
                  <Suspense fallback={<MinimalLoader />}>
                    <SignIn />
                  </Suspense>
                } />
                <Route path="/sign-up" element={
                  <Suspense fallback={<MinimalLoader />}>
                    <SignUp />
                  </Suspense>
                } />
                {import.meta.env.DEV ? (
                  <Route path="/hero-lab" element={
                    <Suspense fallback={<MinimalLoader />}>
                      <HeroLabGate />
                    </Suspense>
                  } />
                ) : null}
                {/**
                 * Admin console: unlisted, credential-gated, and deliberately
                 * outside the marketing shell — no navbar, no footer, no links
                 * from anywhere on the public site.
                 */}
                <Route path="/motormila/admin" element={
                  <Suspense fallback={<MinimalLoader />}>
                    <AdminConsole />
                  </Suspense>
                } />
                {/** Legacy path kept as a bare redirect so old bookmarks still land. */}
                <Route path="/admin" element={<Navigate to="/motormila/admin" replace />} />
                <Route path="/pro-preview" element={
                  <Suspense fallback={<MinimalLoader />}>
                    <ProPreview />
                  </Suspense>
                } />
                <Route path="/pro" element={
                  <Suspense fallback={<MinimalLoader />}>
                    <RequireAuth><ProtectedRoute><ProDashboard /></ProtectedRoute></RequireAuth>
                  </Suspense>
                } />
              </Routes>
              </CompareProvider>
            </HistoryRouter>
          </MotionConfig>
          </LazyMotion>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
