import { useState, type CSSProperties } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { AnimatePresence, m } from "motion/react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { fadeIn, scaleIn } from "@/lib/motion";
import { sanitizeSignInRedirect } from "@/lib/signIn";
import { authErrorText } from "@/lib/authErrorText";

type FormValues = { email: string; password: string };

export default function SignIn() {
  const { login, isAuthenticated, previewAccessEnabled } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set when the API answers 403 email_unverified: offer to resend the link.
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const from = sanitizeSignInRedirect(
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname,
  );

  const schema = z.object({
    email: z.string().email(t("signin.invalidEmail", "Invalid email")),
    password: z.string().min(1, t("signin.required", "Required")),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    setServerError("");
    setUnverifiedEmail("");
    const result = await login(values.email, values.password);
    setLoading(false);
    if (result.success) {
      navigate(from, { replace: true });
      return;
    }
    if (result.code === "email_unverified") setUnverifiedEmail(values.email.trim().toLowerCase());
    setServerError(authErrorText(result, t("signin.failed", "Login failed"), t));
  };

  if (isAuthenticated) return <Navigate to={from} replace />;

  return (
    <AuthShell>
      <p className="cine-overline cine-in text-caption font-semibold text-primary" style={{ "--i": 1, "--cine-t0": "0.25s" } as CSSProperties}>
        <Lock aria-hidden className="h-3.5 w-3.5" />
        {t("signin.secureAccess", "Secure access")}
      </p>
      <h1 className="cine-auth-heading cine-in mt-4 text-foreground" style={{ "--i": 2, "--cine-t0": "0.25s" } as CSSProperties}>
        {t("signin.title", "Sign in")}
      </h1>
      <p className="cine-in mt-3 text-body text-label-2" style={{ "--i": 2, "--cine-t0": "0.3s" } as CSSProperties}>
        {t("shell.copy.signinSubtitle", "Sign in to see your saved vehicles and price-drop alerts.")}
      </p>

      {previewAccessEnabled && (
        <Card padding="sm" className="cine-in mt-8 bg-surface-2 shadow-none" style={{ "--i": 3, "--cine-t0": "0.25s" } as CSSProperties}>
          <p className="text-footnote font-semibold text-primary">{t("signin.previewAvailable", "Preview available")}</p>
          <p className="mt-1 text-footnote text-label-2">{t("signin.previewBody", "Preview the Pro workspace without signing in.")}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-3 w-full" onClick={() => navigate("/pro-preview")}>
            {t("signin.previewPro", "Preview Pro")} <ArrowRight aria-hidden />
          </Button>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="cine-in mt-8 space-y-4" style={{ "--i": 4, "--cine-t0": "0.25s" } as CSSProperties} noValidate>
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
            <Link
              to="/forgot-password"
              className="rounded-control text-footnote font-medium text-primary transition-colors duration-short hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("signin.forgotPassword", "Forgot password?")}
            </Link>
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
        {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {t("signin.submit", "Sign in")}
          <ArrowRight aria-hidden />
        </Button>
      </form>

      <div className="cine-in mt-9 space-y-2 border-t border-separator pt-6 text-center" style={{ "--i": 5, "--cine-t0": "0.25s" } as CSSProperties}>
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
    </AuthShell>
  );
}
