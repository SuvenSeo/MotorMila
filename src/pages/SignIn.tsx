import { useState } from "react";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { AnimatePresence, m } from "motion/react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import Auth11, { Auth11Item } from "@/components/ui/auth-11";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { fadeIn, scaleIn } from "@/lib/motion";
import { sanitizeSignInRedirect } from "@/lib/signIn";
import { authErrorText } from "@/lib/authErrorText";
import { visuals } from "@/lib/visualAssets";

type FormValues = { email: string; password: string };

/** auth-11 night-drive triptych: coast → tea country → city rain. */
const SLIDES = [visuals.authNightCoast, visuals.authNightHills, visuals.authNightCity];

/** auth-11 field styling (registry comp), brand-blue caret. */
const FIELD =
  "w-full rounded-[14px] border border-white/10 bg-[#0A0A0A] px-4 py-3.5 text-sm text-white caret-[#0A7AFF] transition-colors placeholder:text-neutral-400 focus:border-neutral-500 focus:bg-[#111] focus:outline-none focus:ring-1 focus:ring-neutral-500";

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
    <Auth11
      slides={SLIDES}
      panelTitle={{
        lead: t("auth.visual.titleLead", "Know the price"),
        accent: t("auth.visual.titleAccent", "before you pay."),
      }}
      slideLabel={(n) => t("signin.scene", "Scene {n}", { n })}
    >
      <Auth11Item className="mb-8 flex justify-center">
        <Link
          to="/"
          aria-label="Motormila home"
          className="w-fit rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandLogo size="nav" markClassName="h-7 sm:h-8" showTagline={false} />
        </Link>
      </Auth11Item>

      <Auth11Item className="mb-8 text-center">
        <h1 className="text-balance text-3xl font-medium leading-tight tracking-tight text-white md:text-[40px]">
          {t("signin.welcomeLead", "Welcome")}{" "}
          <em className="italic text-[#6CB8FF]">{t("signin.welcomeAccent", "back.")}</em>
        </h1>
        <p className="mt-3 text-balance text-sm text-neutral-400">
          {t("shell.copy.signinSubtitle", "Sign in to see your saved vehicles and price-drop alerts.")}
        </p>
      </Auth11Item>

      {previewAccessEnabled && (
        <Auth11Item className="mb-6">
          <div className="rounded-2xl border border-white/10 bg-[#141414] p-4">
            <p className="text-[13px] font-semibold text-[#6CB8FF]">{t("signin.previewAvailable", "Preview available")}</p>
            <p className="mt-1 text-[13px] text-neutral-400">{t("signin.previewBody", "Preview the Pro workspace without signing in.")}</p>
            <Button type="button" variant="secondary" size="sm" className="mt-3 w-full border-white/15 bg-[#1F1F1F] text-white hover:bg-[#2A2A2A]" onClick={() => navigate("/pro-preview")}>
              {t("signin.previewPro", "Preview Pro")} <ArrowRight aria-hidden />
            </Button>
          </div>
        </Auth11Item>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <Auth11Item className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-neutral-200">
            {t("signin.email", "Email")}
          </label>
          <input
            id="email"
            type="email"
            placeholder={t("shell.copy.emailPlaceholder", "you@example.com")}
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            {...register("email")}
            className={FIELD}
          />
          <AnimatePresence initial={false}>
            {errors.email && (
              <m.p key="e" variants={fadeIn} initial="hidden" animate="show" exit="exit" className="text-[13px] font-medium text-red-400">
                {errors.email.message}
              </m.p>
            )}
          </AnimatePresence>
        </Auth11Item>

        <Auth11Item className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium text-neutral-200">
              {t("signin.password", "Password")}
            </label>
            <Link
              to="/forgot-password"
              className="rounded text-[13px] font-medium text-[#6CB8FF] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("signin.forgotPassword", "Forgot password?")}
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              {...register("password")}
              className={`${FIELD} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? t("signin.hidePassword", "Hide password") : t("signin.showPassword", "Show password")}
            >
              <AnimatePresence mode="wait" initial={false}>
                <m.span key={showPassword ? "off" : "on"} variants={scaleIn} initial="hidden" animate="show" exit="exit" className="inline-flex">
                  {showPassword ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                </m.span>
              </AnimatePresence>
            </button>
          </div>
          <AnimatePresence initial={false}>
            {errors.password && (
              <m.p key="p" variants={fadeIn} initial="hidden" animate="show" exit="exit" className="text-[13px] font-medium text-red-400">
                {errors.password.message}
              </m.p>
            )}
          </AnimatePresence>
        </Auth11Item>

        <AnimatePresence initial={false}>
          {serverError && (
            <m.p
              key="server"
              role="alert"
              variants={fadeIn}
              initial="hidden"
              animate="show"
              exit="exit"
              className="rounded-[14px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-300"
            >
              {serverError}
            </m.p>
          )}
        </AnimatePresence>
        {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}

        <Auth11Item className="mt-1">
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {t("signin.submit", "Sign in")}
            <ArrowRight aria-hidden />
          </Button>
        </Auth11Item>
      </form>

      <Auth11Item className="mt-8 space-y-2 border-t border-white/10 pt-6 text-center text-[13px] text-neutral-400">
        <p>
          {t("signin.invitePrompt", "Have an invite link?")}{" "}
          <Link to="/sign-up" className="font-semibold text-white underline-offset-4 hover:underline">
            {t("signin.completeSignup", "Complete sign-up")}
          </Link>
        </p>
        <p>
          {t("signin.noInvite", "No invite yet?")}{" "}
          <Link to="/" className="font-semibold text-[#6CB8FF] underline-offset-4 hover:underline">
            {t("signin.browseAnyway", "Browse the live market instead")}
          </Link>
        </p>
      </Auth11Item>
    </Auth11>
  );
}
