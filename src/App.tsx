import { useAppPreferences } from "@/lib/appPreferences";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { Suspense, useEffect } from "react";
import { Navigate, Outlet, Route, Routes, unstable_HistoryRouter as HistoryRouter } from "react-router-dom";
import { createViewTransitionHistory } from "@/lib/viewTransition";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { RouteFallback } from "@/components/RouteFallback";
import { RouteTransition } from "@/components/RouteTransition";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { pageRoute } from "@/lib/lazyPage";
import { prefetchAppShellRoutes } from "@/lib/routePrefetch";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/Navbar";
import { CommandPaletteHost } from "@/components/CommandPaletteHost";
import { MobileBottomNav } from "@/components/MobileBottomNav";
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
const MotormilaTearFooter = lazyWithRetry(() => import("@/components/MotormilaTearFooter"));
import { CompareTray, CompareProvider } from "@/components/compare/CompareTray";
// Trial banner lives in Pricing to avoid a new chunk; lazy keeps it out of first paint.
const TrialCountdownBanner = lazyWithRetry(() =>
  import("./pages/Pricing").then((m) => ({ default: m.TrialCountdownBanner }))
);

// Lazy load heavy page chunks. pageRoute also awaits the deferred English
// dictionary chunks the page renders (locales/chunks), so a route never paints
// a key that has not arrived; the key prefetches both on hover/idle.
const Dashboard = pageRoute(["market"], () => import("./pages/Dashboard"), "/");
const DealerDashboard = pageRoute(["rest", "account"], () => import("./pages/DealerDashboard"), "/dealer");
const ListingDetail = pageRoute(["market", "rest"], () => import("./pages/ListingDetail"), "listing-detail");
const NotFound = pageRoute(["rest"], () => import("./pages/NotFound"));
const Settings = pageRoute(["account"], () => import("./pages/Settings"), "/settings");
// /price-index redirects to /trends, so it warms the same chunks.
const Trends = pageRoute(["rest", "market"], () => import("./pages/Trends"), ["/trends", "/price-index"]);
const Estimate = pageRoute(["tools"], () => import("./pages/Estimate"), "/estimate");
const Calculator = pageRoute(["tools"], () => import("./pages/Calculator"), "/calculator");
const EVHub = pageRoute(["content", "rest"], () => import("./pages/EVHub"), "/ev-hub");
const EVChargers = pageRoute(["content", "rest"], () => import("./pages/EVChargers"), "/ev-chargers");

const BestPicks = pageRoute(["content", "market", "account"], () => import("./pages/BestPicks"), "/best-picks");
const SellYourCar = pageRoute(["content", "tools"], () => import("./pages/SellYourCar"));
const SignIn = pageRoute(["account"], () => import("./pages/SignIn"), "/sign-in");
const SignUp = pageRoute(["account"], () => import("./pages/SignUp"), "/sign-up");
const VerifyEmail = pageRoute(["account"], () => import("./pages/VerifyEmail"));
const ForgotPassword = pageRoute(["account"], () => import("./pages/ForgotPassword"));
const ResetPassword = pageRoute(["account"], () => import("./pages/ResetPassword"));
const ProDashboard = pageRoute(["account", "rest"], () => import("./pages/ProDashboard"), "/pro");
const ProPreview = pageRoute(["account", "rest"], () => import("./pages/ProPreview"), "/pro-preview");
const AdminConsole = pageRoute(["account", "rest"], () => import("./pages/AdminConsole"));
const AdminSection = lazyWithRetry(() => import("./pages/admin/AdminSection").then((m) => ({ default: m.AdminSection })));
const AdminIndex = lazyWithRetry(() => import("./pages/admin/AdminSection").then((m) => ({ default: m.AdminIndex })));
const MobileApp = pageRoute(["content"], () => import("./pages/MobileApp"), "/mobile-app");
const MakeModelHub = pageRoute(["rest", "market"], () => import("./pages/MakeModelHub"), "make-model-hub");
const MakeHub = pageRoute(["rest", "market"], () => import("./pages/MakeHub"), "make-hub");
const DistrictHub = pageRoute(["rest", "market"], () => import("./pages/DistrictHub"), "district-hub");
const Alerts = pageRoute(["market", "account"], () => import("./pages/Alerts"), "/alerts");
const Profile = pageRoute(["account"], () => import("./pages/Profile"));

const Docs = pageRoute(["content"], () => import("./pages/Docs"), "/docs");
const Pricing = pageRoute(["rest", "account"], () => import("./pages/Pricing"), "/pricing");
const OfficialPulse = pageRoute(["rest"], () => import("./pages/OfficialPulse"), "/official-pulse");
const OfficialPulseDetail = pageRoute(["rest"], () => import("./pages/OfficialPulseDetail"), "pulse-detail");
const OfficialPulseGuide = pageRoute(["rest"], () => import("./pages/OfficialPulseGuide"), "pulse-guide");
const HeroLab = lazyWithRetry(() => import("./pages/HeroLab"));
const PrivacyPolicy = pageRoute([], () => import("./pages/PrivacyPolicy"), "/privacy");
const TermsOfService = pageRoute([], () => import("./pages/TermsOfService"), "/terms");
const Permits = pageRoute(["tools"], () => import("./pages/Permits"), "/permits");
const Compare = pageRoute(["tools", "market"], () => import("./pages/Compare"), "/compare");
const Afford = pageRoute(["tools"], () => import("./pages/Afford"));
const SafeTransfer = pageRoute(["tools"], () => import("./pages/SafeTransfer"));
// overhaul/money-legal: lead capture, legal requests, PayHere return
const LeadRequest = pageRoute(["tools", "account"], () => import("./pages/LeadRequest"));
const RemovalRequest = pageRoute(["tools"], () => import("./pages/RemovalRequest"));
const AccountDeletion = pageRoute(["account"], () => import("./pages/AccountDeletion"));
const CookieNotice = pageRoute([], () => import("./pages/CookieNotice"));
const CheckoutReturn = pageRoute(["account"], () => import("./pages/CheckoutReturn"));
// ui/features: methodology explainer
const HowWePrice = pageRoute(["tools"], () => import("./pages/HowWePrice"));
const BotInfo = pageRoute(["content"], () => import("./pages/BotInfo"));

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
      <Suspense fallback={<div aria-hidden className="min-h-[620px] bg-background" />}>
        <MotormilaTearFooter />
      </Suspense>
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

/**
 * Auth screens render without the marketing chrome, so they need their own
 * main landmark — otherwise the whole page sits outside any landmark and
 * "skip to content" has nowhere to land.
 */
function AuthShell() {
  return (
    <main id="main-content" className="min-h-screen bg-background">
      <Outlet />
    </main>
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

  // One element for both Pro paths: the desk keeps its mode in the URL
  // (/pro, /pro/lanes) but reads it from params, so the tree never remounts.
  const proDeskRoute = (
    <RouteErrorBoundary>
      <Suspense fallback={<MinimalLoader />}>
        <RequireAuth><ProtectedRoute><ProDashboard /></ProtectedRoute></RequireAuth>
      </Suspense>
    </RouteErrorBoundary>
  );

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
                  {/* Pro preview lives in the site shell (navbar + footer); /pro keeps its own workspace chrome. */}
                  <Route path="/pro-preview" element={<ProPreview />} />
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
                  {/* Common typed paths → the page they mean (also 301s in public/_redirects). */}
                  <Route path="/prices" element={<Navigate to="/trends" replace />} />
                  <Route path="/price" element={<Navigate to="/trends" replace />} />
                  <Route path="/tools" element={<Navigate to="/calculator" replace />} />
                  <Route path="/calculators" element={<Navigate to="/calculator" replace />} />
                  <Route path="/tax-calculator" element={<Navigate to="/calculator" replace />} />
                  <Route path="/import-calculator" element={<Navigate to="/calculator" replace />} />
                  <Route path="/value" element={<Navigate to="/estimate" replace />} />
                  <Route path="/saved" element={<Navigate to="/alerts" replace />} />
                  <Route path="/watchlist" element={<Navigate to="/alerts" replace />} />
                  <Route path="/sell-my-car" element={<Navigate to="/sell" replace />} />
                  <Route path="/plans" element={<Navigate to="/pricing" replace />} />
                  <Route path="/deals" element={<Navigate to="/best-picks" replace />} />
                  <Route path="/app" element={<Navigate to="/mobile-app" replace />} />
                  <Route path="/login" element={<Navigate to="/sign-in" replace />} />
                  <Route path="/signin" element={<Navigate to="/sign-in" replace />} />
                  <Route path="/signup" element={<Navigate to="/sign-up" replace />} />
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
                <Route element={<AuthShell />}>
                <Route path="/sign-in" element={
                  <RouteErrorBoundary>
                    <Suspense fallback={<MinimalLoader />}>
                      <SignIn />
                    </Suspense>
                  </RouteErrorBoundary>
                } />
                <Route path="/sign-up" element={
                  <RouteErrorBoundary>
                    <Suspense fallback={<MinimalLoader />}>
                      <SignUp />
                    </Suspense>
                  </RouteErrorBoundary>
                } />
                <Route path="/verify-email" element={
                  <RouteErrorBoundary>
                    <Suspense fallback={<MinimalLoader />}>
                      <VerifyEmail />
                    </Suspense>
                  </RouteErrorBoundary>
                } />
                <Route path="/forgot-password" element={
                  <RouteErrorBoundary>
                    <Suspense fallback={<MinimalLoader />}>
                      <ForgotPassword />
                    </Suspense>
                  </RouteErrorBoundary>
                } />
                <Route path="/reset-password" element={
                  <RouteErrorBoundary>
                    <Suspense fallback={<MinimalLoader />}>
                      <ResetPassword />
                    </Suspense>
                  </RouteErrorBoundary>
                } />
                {import.meta.env.DEV ? (
                  <Route path="/hero-lab" element={
                    <RouteErrorBoundary>
                      <Suspense fallback={<MinimalLoader />}>
                        <HeroLabGate />
                      </Suspense>
                    </RouteErrorBoundary>
                  } />
                ) : null}
                </Route>
                {/**
                 * Admin console: unlisted, credential-gated, and deliberately
                 * outside the marketing shell — no navbar, no footer, no links
                 * from anywhere on the public site.
                 */}
                <Route path="/motormila/admin" element={
                  <RouteErrorBoundary>
                    <Suspense fallback={<MinimalLoader />}>
                      <AdminConsole />
                    </Suspense>
                  </RouteErrorBoundary>
                }>
                  <Route index element={
                    <RouteErrorBoundary>
                      <Suspense fallback={<MinimalLoader />}>
                        <AdminIndex />
                      </Suspense>
                    </RouteErrorBoundary>
                  } />
                  <Route path="analytics" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="analytics" /></Suspense></RouteErrorBoundary>} />
                  <Route path="users" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="users" /></Suspense></RouteErrorBoundary>} />
                  <Route path="leads" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="leads" /></Suspense></RouteErrorBoundary>} />
                  <Route path="feedback" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="feedback" /></Suspense></RouteErrorBoundary>} />
                  <Route path="logs" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="logs" /></Suspense></RouteErrorBoundary>} />
                  <Route path="health" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="health" /></Suspense></RouteErrorBoundary>} />
                  <Route path="data-requests" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="data-requests" /></Suspense></RouteErrorBoundary>} />
                  <Route path="invites" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="invites" /></Suspense></RouteErrorBoundary>} />
                  <Route path="pipeline" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="pipeline" /></Suspense></RouteErrorBoundary>} />
                  <Route path="dealers" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="dealers" /></Suspense></RouteErrorBoundary>} />
                  <Route path="permits" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="permits" /></Suspense></RouteErrorBoundary>} />
                  <Route path="moderation" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="moderation" /></Suspense></RouteErrorBoundary>} />
                  <Route path="system" element={<RouteErrorBoundary><Suspense fallback={<MinimalLoader />}><AdminSection section="system" /></Suspense></RouteErrorBoundary>} />
                  <Route path="*" element={<Navigate to="/motormila/admin" replace />} />
                </Route>
                {/** Legacy path kept as a bare redirect so old bookmarks still land. */}
                <Route path="/admin" element={<Navigate to="/motormila/admin" replace />} />
                <Route path="/pro" element={proDeskRoute} />
                <Route path="/pro/:mode" element={proDeskRoute} />
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
