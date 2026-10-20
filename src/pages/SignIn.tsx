import { useState } from "react";
import { sendFeedback } from "@/services/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
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
import { revealContainer, revealItem, springSoft } from "@/lib/motion";
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
      className="relative min-h-screen overflow-hidden bg-[#07080a] text-white"
    >
      {/* Full-bleed cinematic garage — car/light stay on the right */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <AtmosphericImage
          src={visuals.darkGarageSilhouette.src}
          srcSm={visuals.darkGarageSilhouette.srcSm}
          className="h-full w-full object-cover object-[72%_center] sm:object-[68%_center] lg:object-[62%_center]"
          priority
          sizes="100vw"
        />
        {/* Left negative-space wash for the auth panel; keep right luminous */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/72 to-black/25 sm:via-black/65 sm:to-black/15 lg:from-black/90 lg:via-black/45 lg:to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40 lg:from-black/50 lg:to-black/25" />
        {/* Mobile: dim the whole frame so the panel stays readable */}
        <div className="absolute inset-0 bg-black/35 sm:bg-black/20 lg:bg-transparent" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center px-5 py-12 sm:px-8 lg:px-12 xl:px-16">
        <motion.div
          variants={revealItem}
          className="w-full max-w-[420px] rounded-[2rem] border border-white/12 bg-white/[0.07] p-6 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:p-8"
        >
          <div>
            <Link to="/" className="mb-8 inline-flex items-center gap-2.5 group">
              <div className="h-9 w-9 overflow-hidden rounded-2xl ring-1 ring-white/20 transition-all group-hover:ring-primary/50">
                <img src="/logo.png" alt="" className="h-full w-full object-cover" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
                Motormila
              </span>
            </Link>

            {/* The auth page is permanently dark, so it uses fixed brand blues
                rather than theme tokens — `--primary-bright` drops to a dark navy
                in light theme and disappears against this backdrop. */}
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[#3D94FF]/35 bg-[#0A7AFF]/15 px-3 py-1">
              <Lock className="h-3 w-3 text-[#6CB8FF]" aria-hidden />
              <span className="text-[12px] font-semibold text-[#6CB8FF]">
                {t("signin.secureAccess", "Secure access")}
              </span>
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-[2.15rem]">
              {t("signin.title", "Sign in")}
            </h1>
            <p className="mt-3 text-[15px] font-medium leading-relaxed text-white/65">
              {t("signin.subtitle", "Enter your Motormila credentials to open the intelligence cockpit.")}
            </p>
          </div>

          {previewAccessEnabled && (
            <div className="mt-7 rounded-xl border border-white/12 bg-white/[0.05] p-4">
              <p className="text-[11px] font-bold text-[#6CB8FF]">
                {t("signin.previewAvailable", "Preview available")}
              </p>
              <p className="mt-1 text-xs font-medium text-white/55">
                {t("signin.previewBody", "Preview the Pro workspace without signing in.")}
              </p>
              <motion.button
                type="button"
                onClick={() => navigate("/pro-preview")}
                whileTap={{ scale: 0.98 }}
                transition={springSoft}
                className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] text-[11px] font-bold text-white transition-all hover:border-primary/40 hover:bg-white/[0.12]"
              >
                {t("signin.previewPro", "Preview Pro")} <ArrowRight className="h-3 w-3" aria-hidden />
              </motion.button>
            </div>
          )}

          {DEMO_AUTH_ENABLED && (
            <div className="mt-7 space-y-2 rounded-xl border border-white/12 bg-white/[0.05] p-4">
              <p className="text-[11px] font-bold text-[#6CB8FF]">
                {t("signin.reviewAccounts", "Review accounts")}
              </p>
              {DEMO_ACCOUNT_SUMMARY.map((acc) => (
                <motion.button
                  key={acc.email}
                  type="button"
                  onClick={() => { setValue("email", acc.email); setServerError(""); }}
                  whileTap={{ scale: 0.99 }}
                  transition={springSoft}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-left transition-all hover:border-primary/35"
                >
                  <div>
                    <p className="text-xs font-bold text-white">{acc.name}</p>
                    <p className="text-[11px] font-medium text-white/50">{acc.email}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      acc.subscriptionStatus === "active"
                        ? "border-[#3D94FF]/35 bg-[#0A7AFF]/15 text-[#6CB8FF]"
                        : "border-white/15 text-white/50"
                    }`}
                  >
                    {acc.plan}
                  </span>
                </motion.button>
              ))}
              <p className="text-[11px] font-medium text-white/45">
                {t("signin.reviewHint", "Selecting an account fills the email — enter its password to sign in.")}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[12px] font-semibold text-white/50">
                {t("signin.email", "Email")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t("signin.emailPlaceholder", "you@company.lk")}
                autoComplete="email"
                {...register("email")}
                className="h-11 rounded-xl border-white/15 bg-black/35 text-sm text-white placeholder:text-white/35 focus:border-primary/40 focus:ring-1 focus:ring-primary/30"
              />
              {errors.email && (
                <p className="text-[11px] font-semibold text-rose-300">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[12px] font-semibold text-white/50">
                {t("signin.password", "Password")}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register("password")}
                  className="h-11 rounded-xl border-white/15 bg-black/35 pr-10 text-sm text-white placeholder:text-white/35 focus:border-primary/40 focus:ring-1 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition-all hover:text-white"
                  aria-label={showPassword ? t("signin.hidePassword", "Hide password") : t("signin.showPassword", "Show password")}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] font-semibold text-rose-300">{errors.password.message}</p>
              )}
              <div className="mt-1.5 text-right">
                <button
                  type="button"
                  onClick={() => { setShowReset(true); setResetDone(false); }}
                  className="text-[12px] font-medium text-white/55 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white"
                >
                  {t("signin.forgotPassword", "Forgot password?")}
                </button>
              </div>
            </div>
            {serverError && (
              <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-200">
                {serverError}
              </p>
            )}
            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              transition={springSoft}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0A7AFF] text-[12px] font-semibold text-white shadow-[0_12px_40px_-16px_rgba(10,122,255,0.85)] transition-all hover:bg-[#3D94FF] disabled:opacity-50"
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

          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-center">
            <p className="text-[12px] font-medium text-white/50">
              {t("signin.invitePrompt", "Have an invite link?")}{" "}
              <Link
                to="/sign-up"
                className="font-semibold text-white underline decoration-[#3D94FF]/50 underline-offset-4 transition-colors hover:text-[#6CB8FF]"
              >
                {t("signin.completeSignup", "Complete sign-up")}
              </Link>
            </p>
            <p className="text-[12px] font-medium text-white/40">
              {t("signin.noInvite", "No invite yet?")}{" "}
              <Link
                to="/"
                className="font-semibold text-white/80 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white"
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
            onClick={() => setShowReset(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101014] p-6 shadow-soft-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center gap-2">
                <KeyRound aria-hidden className="h-4 w-4 text-primary-bright" />
                <h2 className="text-[15px] font-bold text-white">
                  {t("signin.resetTitle", "Reset your password")}
                </h2>
              </div>
              {resetDone ? (
                <p className="text-[13px] leading-relaxed text-white/70">
                  {t(
                    "signin.resetDone",
                    "Request received — we'll email you a reset link once support verifies the account. Check your inbox within a day.",
                  )}
                </p>
              ) : (
                <>
                  <p className="text-[13px] leading-relaxed text-white/60">
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
                      className="h-11 rounded-xl border-white/15 bg-black/35 text-sm text-white placeholder:text-white/35 focus:border-primary/40"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowReset(false)}
                        className="h-10 flex-1 rounded-full border border-white/15 text-[12px] font-semibold text-white/70 transition-colors hover:text-white"
                      >
                        {t("common.cancel", "Cancel")}
                      </button>
                      <button
                        type="submit"
                        disabled={resetSending}
                        className="h-10 flex-1 rounded-full bg-[#0A7AFF] text-[12px] font-semibold text-white transition-all hover:bg-[#3D94FF] disabled:opacity-50"
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
                  className="mt-4 h-10 w-full rounded-full border border-white/15 text-[12px] font-semibold text-white/70 transition-colors hover:text-white"
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
          className="pointer-events-none absolute bottom-8 right-8 hidden max-w-xs text-right text-[11px] font-medium tracking-[0.08em] text-white/35 lg:block xl:right-14"
        >
          {t("signin.brandWhisper", "Sri Lanka vehicle intelligence")}
        </p>
      </div>
    </motion.div>
  );
}
