import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { sendFeedback } from "@/services/api";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ArrowRight, Lock, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { DEMO_ACCOUNT_SUMMARY, DEMO_AUTH_ENABLED, useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { revealContainer, revealItem, spring } from "@/lib/motion";
import { sanitizeSignInRedirect } from "@/lib/signIn";
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
    else setServerError(result.error || t("signin.failed", "Login failed"));
  };

  if (isAuthenticated) return <Navigate to={from} replace />;

  return (
    <motion.div
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/20" />
        </div>
      </div>

      <div className="relative z-10 order-1 flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <motion.div
          variants={revealItem}
          className="w-full max-w-[400px]"
        >
          <div>
            <Link to="/" className="mb-10 inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Motormila home">
              <BrandLogo size="nav" showTagline={false} />
            </Link>

            <div className="mb-4 inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5">
              <Lock className="h-3 w-3 text-primary" aria-hidden />
              <span className="text-caption font-semibold text-primary">
                {t("signin.secureAccess", "Secure access")}
              </span>
            </div>

            <h1 className="font-display text-title1 font-bold tracking-tight text-foreground sm:text-title1">
              {t("signin.title", "Sign in")}
            </h1>
            <p className="mt-3 text-body font-medium leading-relaxed text-label-2">
              {t("shell.copy.signinSubtitle", "Sign in to see your saved vehicles and price-drop alerts.")}
            </p>
          </div>

          {previewAccessEnabled && (
            <div className="mt-7 rounded-xl border border-border bg-foreground/[0.05] p-4">
              <p className="text-caption font-bold text-primary">
                {t("signin.previewAvailable", "Preview available")}
              </p>
              <p className="mt-1 text-caption font-medium text-label-2">
                {t("signin.previewBody", "Preview the Pro workspace without signing in.")}
              </p>
              <motion.button
                type="button"
                onClick={() => navigate("/pro-preview")}
                whileTap={{ scale: 0.98 }}
                transition={spring.smooth}
                className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-foreground/[0.08] text-caption font-bold text-foreground transition-ui hover:border-primary/40 hover:bg-foreground/[0.12]"
              >
                {t("signin.previewPro", "Preview Pro")} <ArrowRight className="h-3 w-3" aria-hidden />
              </motion.button>
            </div>
          )}

          {DEMO_AUTH_ENABLED && (
            <div className="mt-7 space-y-2 rounded-xl border border-border bg-foreground/[0.05] p-4">
              <p className="text-caption font-bold text-primary">
                {t("signin.reviewAccounts", "Review accounts")}
              </p>
              {DEMO_ACCOUNT_SUMMARY.map((acc) => (
                <motion.button
                  key={acc.email}
                  type="button"
                  onClick={() => { setValue("email", acc.email); setServerError(""); }}
                  whileTap={{ scale: 0.99 }}
                  transition={spring.smooth}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-1 px-3 py-2.5 text-left transition-ui hover:border-primary/35"
                >
                  <div>
                    <p className="text-caption font-bold text-foreground">{acc.name}</p>
                    <p className="text-caption font-medium text-label-2">{acc.email}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-caption font-medium ${
                      acc.subscriptionStatus === "active"
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border text-label-2"
                    }`}
                  >
                    {acc.plan}
                  </span>
                </motion.button>
              ))}
              <p className="text-caption font-medium text-label-2">
                {t("signin.reviewHint", "Selecting an account fills the email — enter its password to sign in.")}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-caption font-semibold text-label-2">
                {t("signin.email", "Email")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t("shell.copy.emailPlaceholder", "you@example.com")}
                autoComplete="email"
                {...register("email")}
                className="h-11"
              />
              {errors.email && (
                <p className="text-caption font-semibold text-deal-high-text">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-caption font-semibold text-label-2">
                {t("signin.password", "Password")}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register("password")}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-label-2 transition-ui hover:text-foreground"
                  aria-label={showPassword ? t("signin.hidePassword", "Hide password") : t("signin.showPassword", "Show password")}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-caption font-semibold text-deal-high-text">{errors.password.message}</p>
              )}
              <div className="mt-1.5 text-right">
                <button
                  type="button"
                  onClick={() => { setShowReset(true); setResetDone(false); }}
                  className="text-caption font-medium text-label-2 underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground"
                >
                  {t("signin.forgotPassword", "Forgot password?")}
                </button>
              </div>
            </div>
            {serverError && (
              <p className="rounded-xl border border-deal-high/25 bg-deal-high/10 px-3 py-2 text-caption font-medium text-deal-high-text">
                {serverError}
              </p>
            )}
            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              transition={spring.smooth}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-body font-semibold text-primary-foreground shadow-e1 transition-ui hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50"
            >
              {loading ? (
                t("signin.loading", "Signing in...")
              ) : (
                <>
                  <span>{t("signin.submit", "Sign in")}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </>
              )}
            </motion.button>
          </form>

          <div className="mt-8 space-y-3 border-t border-border pt-6 text-center">
            <p className="text-caption font-medium text-label-2">
              {t("signin.invitePrompt", "Have an invite link?")}{" "}
              <Link
                to="/sign-up"
                className="font-semibold text-foreground underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary"
              >
                {t("signin.completeSignup", "Complete sign-up")}
              </Link>
            </p>
            <p className="text-caption font-medium text-label-2">
              {t("signin.noInvite", "No invite yet?")}{" "}
              <Link
                to="/"
                className="font-semibold text-foreground/90 underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground"
              >
                {t("signin.browseAnyway", "Browse the live market instead")}
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Password reset — routed to support until a self-serve endpoint exists */}
        {showReset && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("signin.resetTitle", "Reset your password")}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
            onClick={() => setShowReset(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl border border-border bg-popover p-6 shadow-e3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center gap-2">
                <KeyRound aria-hidden className="h-4 w-4 text-primary-bright" />
                <h2 className="text-body font-bold text-foreground">
                  {t("signin.resetTitle", "Reset your password")}
                </h2>
              </div>
              {resetDone ? (
                <p className="text-footnote leading-relaxed text-foreground/90">
                  {t(
                    "signin.resetDone",
                    "Request received — we'll email you a reset link once support verifies the account. Check your inbox within a day.",
                  )}
                </p>
              ) : (
                <>
                  <p className="text-footnote leading-relaxed text-label-2">
                    {t(
                      "signin.resetBody",
                      "Enter your account email and we'll have support send you a password reset link.",
                    )}
                  </p>
                  <form
                    className="mt-4 space-y-3"
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
                      className="h-11"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowReset(false)}
                        className="h-10 flex-1 rounded-full border border-border text-caption font-semibold text-foreground/90 transition-colors hover:text-foreground"
                      >
                        {t("common.cancel", "Cancel")}
                      </button>
                      <button
                        type="submit"
                        disabled={resetSending}
                        className="h-10 flex-1 rounded-full bg-primary text-footnote font-semibold text-primary-foreground transition-ui hover:bg-primary/90 disabled:opacity-50"
                      >
                        {resetSending
                          ? t("signin.resetSending", "Sending...")
                          : t("signin.resetSubmit", "Request reset")}
                      </button>
                    </div>
                  </form>
                </>
              )}
              {resetDone && (
                <button
                  type="button"
                  onClick={() => setShowReset(false)}
                  className="mt-4 h-10 w-full rounded-full border border-border text-caption font-semibold text-foreground/90 transition-colors hover:text-foreground"
                >
                  {t("common.close", "Close")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Desktop-only brand whisper in the luminous right field — never overpowers Motormila mark */}
        <p
          aria-hidden
          className="pointer-events-none absolute bottom-8 right-8 hidden max-w-xs text-right text-caption font-medium tracking-caps text-label-2 lg:block xl:right-14"
        >
          {t("signin.brandWhisper", "Sri Lanka vehicle intelligence")}
        </p>
      </div>
    </motion.div>
  );
}
