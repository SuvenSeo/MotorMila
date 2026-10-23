import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Eye, EyeOff, Fingerprint, KeyRound, Lock, ShieldCheck, Timer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminDashboard from "@/pages/AdminDashboard";
import {
  adminSessionMinutesLeft,
  clearAdminSession,
  shouldAutoUnlockAdminConsole,
  readAdminSession,
  verifyLocalAdminCredential,
  writeAdminSession,
  type AdminSession,
} from "@/lib/adminAuth";
import { BACKEND_AUTH_ENABLED, readStoredAuthUser, useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { spring } from "@/lib/motion";

/**
 * `/motormila/admin` — the only way in to the operations console.
 *
 * Nothing on the public site links here. The console needs an admin username
 * and password (see `src/lib/adminAuth.ts`), and when backend auth is enabled
 * every panel below runs on the admin's own server-issued session.
 */
export default function AdminConsole() {
  const { t } = useAppPreferences();
  const { login, logout, isAdmin, isAuthenticated, authReady, user } = useAuth();
  const [session, setSession] = useState<AdminSession | null>(() => readAdminSession());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [attempting, setAttempting] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);
  // "Lock console" must stick for this visit even when the session is an admin.
  const [manuallyLocked, setManuallyLocked] = useState(false);

  // A server-verified admin session (role re-read via /auth/me) unlocks the
  // console on its own — no separate console password for admins/owners. The
  // backend still gates every admin API with require_admin_access.
  const sessionAdmin = shouldAutoUnlockAdminConsole({
    backendAuthEnabled: BACKEND_AUTH_ENABLED,
    authReady,
    isAuthenticated,
    isAdmin,
  });
  const autoUnlocked = sessionAdmin && !manuallyLocked;

  // A console session alone is not enough when the API owns identity: the
  // signed-in account must still be an admin (the backend enforces this too).
  const passwordUnlocked = Boolean(
    session && (BACKEND_AUTH_ENABLED ? isAuthenticated && isAdmin : true),
  );
  const unlocked = autoUnlocked || passwordUnlocked;
  const consoleUser = session?.username || user?.email || "";

  useEffect(() => {
    if (!BACKEND_AUTH_ENABLED) return;
    if (session && authReady && !(isAuthenticated && isAdmin)) {
      clearAdminSession();
      setSession(null);
    }
  }, [authReady, isAdmin, isAuthenticated, session]);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockSeconds((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockSeconds]);

  const minutesLeft = useMemo(() => adminSessionMinutesLeft(session), [session]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (attempting || lockSeconds > 0) return;

      const trimmedUser = username.trim();
      if (!trimmedUser || !password) {
        setError(t("adminLogin.missing", "Enter both a username and a password."));
        return;
      }

      setAttempting(true);
      setError("");

      try {
        if (BACKEND_AUTH_ENABLED) {
          const result = await login(trimmedUser, password);
          if (!result.success) {
            setError(result.error || t("adminLogin.invalid", "Invalid username or password."));
            return;
          }
          const stored = readStoredAuthUser();
          if (stored?.role !== "admin") {
            // Never leave a non-admin session behind after a failed gate.
            logout();
            setError(t("adminLogin.notAdmin", "That account is not a Motormila administrator."));
            return;
          }
          setSession(writeAdminSession(stored.email));
          setManuallyLocked(false);
          setPassword("");
          return;
        }

        const local = verifyLocalAdminCredential(trimmedUser, password);
        if (local.ok) {
          setManuallyLocked(false);
          setSession(writeAdminSession(trimmedUser));
          setPassword("");
          return;
        }
        if (local.lockedForSeconds) {
          setLockSeconds(local.lockedForSeconds);
          setError(
            t("adminLogin.lockout", "Too many attempts. Try again in {seconds}s.", {
              seconds: local.lockedForSeconds,
            }),
          );
          return;
        }
        setError(t("adminLogin.invalid", "Invalid username or password."));
      } finally {
        setAttempting(false);
      }
    },
    [attempting, lockSeconds, login, logout, password, t, username],
  );

  const lockConsole = useCallback(() => {
    clearAdminSession();
    setSession(null);
    setManuallyLocked(true);
    setPassword("");
    setError("");
  }, []);

  // ── Session established: the console itself ──────────────────────
  if (unlocked) {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <div>
                <p className="text-footnote font-semibold tracking-tight text-foreground">
                  {t("adminLogin.console", "Admin console")}
                </p>
                <p className="text-caption text-muted-foreground">
                  {t("adminLogin.signedInAs", "Unlocked as {user}", { user: consoleUser })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {minutesLeft > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-caption font-medium text-muted-foreground">
                  <Timer className="h-3 w-3" aria-hidden />
                  {t("adminLogin.sessionChip", "{minutes}m left", { minutes: minutesLeft })}
                </span>
              )}
              <button
                type="button"
                onClick={lockConsole}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-caption font-medium text-foreground outline-none transition-colors hover:border-destructive/35 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Lock className="h-3 w-3" aria-hidden />
                {t("adminLogin.lock", "Lock console")}
              </button>
            </div>
          </div>
        </div>
        <AdminDashboard />
      </div>
    );
  }

  // ── The gate ─────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070c] px-5 py-14 text-white sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_-5%,rgba(10,122,255,0.22),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:46px_46px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent_75%)]" />
        <div className="absolute left-1/2 top-1/3 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(10,122,255,0.16),transparent_68%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[70vh] w-full max-w-[440px] flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
          className="rounded-[2rem] border border-border bg-foreground/[0.045] p-6 shadow-e3 sm:p-8"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#3D94FF]/35 bg-[#0A7AFF]/15">
              <Fingerprint className="h-5 w-5 text-[#3D94FF]" aria-hidden />
            </span>
            <div>
              <p className="text-caption font-bold uppercase tracking-caps text-[#3D94FF]">
                {t("adminLogin.eyebrow", "Restricted access")}
              </p>
              <p className="mt-1 text-caption font-medium text-white/55">
                {t("adminLogin.path", "/motormila/admin")}
              </p>
            </div>
          </div>

          <h1 className="mt-6 font-display text-title1 font-semibold leading-tight tracking-tight text-white">
            {t("adminLogin.title", "Motormila control.")}
          </h1>
          <p className="mt-2.5 text-footnote leading-relaxed text-white/60">
            {t(
              "adminLogin.subtitle",
              "Administrators only. Enter your console username and password to continue.",
            )}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-username" className="text-caption font-semibold text-white/55">
                {BACKEND_AUTH_ENABLED
                  ? t("adminLogin.email", "Admin email")
                  : t("adminLogin.username", "Username")}
              </Label>
              <Input
                id="admin-username"
                name="username"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t("adminLogin.usernamePlaceholder", "Administrator")}
                className="h-11 rounded-xl border-border bg-black/40 text-footnote text-white placeholder:text-white/35 focus:border-[#3D94FF]/60 focus:ring-1 focus:ring-[#3D94FF]/35"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-password" className="text-caption font-semibold text-white/55">
                {t("adminLogin.password", "Password")}
              </Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl border-border bg-black/40 pr-11 text-footnote text-white placeholder:text-white/35 focus:border-[#3D94FF]/60 focus:ring-1 focus:ring-[#3D94FF]/35"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
                  aria-label={
                    showPassword
                      ? t("adminLogin.hidePassword", "Hide password")
                      : t("adminLogin.showPassword", "Show password")
                  }
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-deal-high/30 bg-deal-high/10 px-3.5 py-2.5 text-caption font-medium text-deal-high-text"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={attempting || lockSeconds > 0}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0A7AFF] text-footnote font-semibold text-white shadow-e2 transition-ui hover:bg-[#3D94FF] disabled:opacity-50"
            >
              {attempting ? (
                t("adminLogin.checking", "Verifying credentials…")
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  <span>{t("adminLogin.submit", "Unlock console")}</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-black/25 px-3.5 py-3">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3D94FF]" aria-hidden />
            <p className="text-caption leading-relaxed text-white/55">
              {BACKEND_AUTH_ENABLED
                ? t(
                    "adminLogin.sessionNote",
                    "Sessions are issued by the Motormila API, expire on their own, and are throttled after repeated failed attempts.",
                  )
                : t(
                    "adminLogin.previewNote",
                    "This build runs without the admin API, so credentials are checked locally. Enable backend auth in production.",
                  )}
            </p>
          </div>

          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1.5 text-caption font-semibold text-white/60 no-underline transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t("adminLogin.backHome", "Back to Motormila")}
          </Link>
        </motion.div>

        <p aria-hidden className="mt-6 text-center text-caption font-medium tracking-caps text-white/25">
          {t("adminLogin.brandWhisper", "Motormila operations · Sri Lanka")}
        </p>
      </div>
    </div>
  );
}
