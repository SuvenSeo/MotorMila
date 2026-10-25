import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { sendFeedback } from "@/services/api";
import { toast } from "sonner";
import { AnimatePresence, m } from "motion/react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ArrowRight, Lock, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { DEMO_ACCOUNT_SUMMARY, DEMO_AUTH_ENABLED, useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { fadeIn, revealContainer, scaleIn } from "@/lib/motion";
import { sanitizeSignInRedirect } from "@/lib/signIn";
import { authErrorText } from "@/lib/authErrorText";
import { visuals } from "@/lib/visualAssets";

type FormValues = { email: string; password: string };

export default function SignIn() {
  const { login, isAuthenticated, previewAccessEnabled } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const from = sanitizeSignInRedirect(
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname,
  );

  const schema = z.object({
    email: z.string().email(t("signin.invalidEmail", "Invalid email")),
    password: z.string().min(1, t("signin.required", "Required")),
  });

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    setServerError("");
    const result = await login(values.email, values.password);
    setLoading(false);
    if (result.success) navigate(from, { replace: true });
    else setServerError(authErrorText(result, t("signin.failed", "Login failed"), t));
  };

  if (isAuthenticated) return <Navigate to={from} replace />;

  return (
    <m.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="relative grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
    >
      {/* Photo panel (desktop): rounded, inset, with a scrim so it reads the
          same in light and dark. The form side follows the theme. */}
      <div aria-hidden className="pointer-events-none relative order-2 hidden p-3 lg:block">
        <div className="relative h-full overflow-hidden rounded-sheet">
          <AtmosphericImage
            src={visuals.darkGarageSilhouette.src}
            srcSm={visuals.darkGarageSilhouette.srcSm}
            className="h-full w-full object-cover object-[62%_center]"
            priority
            sizes="55vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />
          <p className="absolute bottom-8 left-8 text-footnote font-medium text-white/80">
            {t("signin.brandWhisper", "Sri Lanka vehicle intelligence")}
          </p>
        </div>
      </div>

      <div className="relative z-10 order-1 flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <m.div variants={scaleIn} className="w-full max-w-[25rem]">
          <Link
            to="/"
            className="mb-10 flex w-fit rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Motormila home"
          >
            <BrandLogo size="nav" showTagline={false} />
          </Link>

          <Badge variant="info" className="mb-4">
            <Lock aria-hidden />
            {t("signin.secureAccess", "Secure access")}
          </Badge>
          <h1 className="font-display text-title1 font-semibold text-foreground">{t("signin.title", "Sign in")}</h1>
          <p className="mt-2 text-body text-label-2">
            {t("shell.copy.signinSubtitle", "Sign in to see your saved vehicles and price-drop alerts.")}
          </p>

          {previewAccessEnabled && (
            <Card padding="sm" className="mt-7 bg-surface-2 shadow-none">
              <p className="text-footnote font-semibold text-primary">{t("signin.previewAvailable", "Preview available")}</p>
              <p className="mt-1 text-footnote text-label-2">{t("signin.previewBody", "Preview the Pro workspace without signing in.")}</p>
              <Button type="button" variant="secondary" size="sm" className="mt-3 w-full" onClick={() => navigate("/pro-preview")}>
                {t("signin.previewPro", "Preview Pro")} <ArrowRight aria-hidden />
              </Button>
            </Card>
          )}

          {DEMO_AUTH_ENABLED && (
            <Card padding="sm" className="mt-7 space-y-2 bg-surface-2 shadow-none">
              <p className="text-footnote font-semibold text-primary">{t("signin.reviewAccounts", "Review accounts")}</p>
              {DEMO_ACCOUNT_SUMMARY.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setValue("email", acc.email);
                    setServerError("");
                  }}
                  className="press flex w-full items-center justify-between gap-3 rounded-control border border-border bg-surface-1 px-3 py-2.5 text-left transition-colors duration-short ease-standard hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-footnote font-semibold text-foreground">{acc.name}</span>
                    <span className="block truncate text-caption text-label-2">{acc.email}</span>
                  </span>
                  <Badge variant={acc.subscriptionStatus === "active" ? "info" : "neutral"}>{acc.plan}</Badge>
                </button>
              ))}
              <p className="text-caption text-label-2">
                {t("signin.reviewHint", "Selecting an account fills the email — enter its password to sign in.")}
              </p>
            </Card>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t("signin.email", "Email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("shell.copy.emailPlaceholder", "you@example.com")}
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                {...register("email")}
                className="h-12"
              />
              <AnimatePresence initial={false}>
                {errors.email && (
                  <m.p key="e" variants={fadeIn} initial="hidden" animate="show" exit="exit" className="text-footnote font-medium text-deal-high-text">
                    {errors.email.message}
                  </m.p>
                )}
              </AnimatePresence>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="password">{t("signin.password", "Password")}</Label>
                <button
                  type="button"
                  onClick={() => {
                    setShowReset(true);
                    setResetDone(false);
                  }}
                  className="rounded-control text-footnote font-medium text-primary transition-colors duration-short hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t("signin.forgotPassword", "Forgot password?")}
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={errors.password ? true : undefined}
                  {...register("password")}
                  className="h-12 pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-label-2 active:scale-95"
                  aria-label={showPassword ? t("signin.hidePassword", "Hide password") : t("signin.showPassword", "Show password")}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <m.span key={showPassword ? "off" : "on"} variants={scaleIn} initial="hidden" animate="show" exit="exit" className="inline-flex">
                      {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </m.span>
                  </AnimatePresence>
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {errors.password && (
                  <m.p key="p" variants={fadeIn} initial="hidden" animate="show" exit="exit" className="text-footnote font-medium text-deal-high-text">
                    {errors.password.message}
                  </m.p>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence initial={false}>
              {serverError && (
                <m.p
                  key="server"
                  role="alert"
                  variants={fadeIn}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="rounded-control border border-deal-high/30 bg-deal-high/10 px-3 py-2 text-footnote font-medium text-deal-high-text"
                >
                  {serverError}
                </m.p>
              )}
            </AnimatePresence>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {t("signin.submit", "Sign in")}
              <ArrowRight aria-hidden />
            </Button>
          </form>

          <div className="mt-8 space-y-2 border-t border-separator pt-6 text-center">
            <p className="text-footnote text-label-2">
              {t("signin.invitePrompt", "Have an invite link?")}{" "}
              <Link to="/sign-up" className="font-semibold text-primary underline-offset-4 hover:underline">
                {t("signin.completeSignup", "Complete sign-up")}
              </Link>
            </p>
            <p className="text-footnote text-label-2">
              {t("signin.noInvite", "No invite yet?")}{" "}
              <Link to="/" className="font-semibold text-foreground underline-offset-4 hover:underline">
                {t("signin.browseAnyway", "Browse the live market instead")}
              </Link>
            </p>
          </div>
        </m.div>

        {/* Password reset — routed to support until a self-serve endpoint exists */}
        <Dialog open={showReset} onOpenChange={setShowReset}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound aria-hidden className="h-4 w-4 text-primary" />
                {t("signin.resetTitle", "Reset your password")}
              </DialogTitle>
              <DialogDescription className="text-body text-label-2">
                {resetDone
                  ? t(
                      "signin.resetDone",
                      "Request received — we'll email you a reset link once support verifies the account. Check your inbox within a day.",
                    )
                  : t("signin.resetBody", "Enter your account email and we'll have support send you a password reset link.")}
              </DialogDescription>
            </DialogHeader>
            {resetDone ? (
              <Button type="button" variant="secondary" className="w-full" onClick={() => setShowReset(false)}>
                {t("common.close", "Close")}
              </Button>
            ) : (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const address = resetEmail.trim();
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
                    toast.error(t("signin.resetInvalid", "Enter a valid email address."));
                    return;
                  }
                  setResetSending(true);
                  try {
                    await sendFeedback({
                      category: "general",
                      route: "/sign-in",
                      message: `Password reset requested for ${address}`,
                      email: address,
                    });
                    setResetDone(true);
                  } catch {
                    toast.error(t("signin.resetFailed", "Couldn't send the request — try again."));
                  } finally {
                    setResetSending(false);
                  }
                }}
              >
                <Input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder={t("signin.emailPlaceholder", "you@example.com")}
                  aria-label={t("signin.emailPlaceholder", "you@example.com")}
                  className="h-12"
                />
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowReset(false)}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                  <Button type="submit" className="flex-1" loading={resetSending}>
                    {t("signin.resetSubmit", "Request reset")}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </m.div>
  );
}
