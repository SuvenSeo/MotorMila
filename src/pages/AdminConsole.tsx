import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { ArrowLeft, Eye, EyeOff, Fingerprint, KeyRound, Lock, ShieldCheck, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { fadeIn, scaleIn } from "@/lib/motion";

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
        <div className="border-b border-separator bg-surface-1">
          <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-body font-semibold text-foreground">{t("adminLogin.console", "Admin console")}</p>
                <p className="text-caption text-label-2">{t("adminLogin.signedInAs", "Unlocked as {user}", { user: consoleUser })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {minutesLeft > 0 && (
                <Badge variant="neutral" className="h-8 px-3">
                  <Timer aria-hidden />
                  {t("adminLogin.sessionChip", "{minutes}m left", { minutes: minutesLeft })}
                </Badge>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={lockConsole}>
                <Lock aria-hidden />
                {t("adminLogin.lock", "Lock console")}
              </Button>
            </div>
          </div>
        </div>
        <AdminDashboard />
      </div>
    );
  }

  // ── The gate ─────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-5 py-14 text-foreground sm:px-8">
      <div className="w-full max-w-[27.5rem]">
        <m.div variants={scaleIn} initial="hidden" animate="show">
          <Card padding="lg">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-control bg-primary/10 text-primary">
                <Fingerprint className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-footnote font-semibold text-primary">{t("adminLogin.eyebrow", "Restricted access")}</p>
                <p className="mt-0.5 font-code text-caption text-label-2">{t("adminLogin.path", "/motormila/admin")}</p>
              </div>
            </div>

            <h1 className="mt-6 font-display text-title1 font-semibold text-foreground">{t("adminLogin.title", "Motormila control.")}</h1>
            <p className="mt-2 text-body text-label-2">
              {t("adminLogin.subtitle", "Administrators only. Enter your console username and password to continue.")}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-username">
                  {BACKEND_AUTH_ENABLED ? t("adminLogin.email", "Admin email") : t("adminLogin.username", "Username")}
                </Label>
                <Input
                  id="admin-username"
                  name="username"
                  autoComplete="username"
                  spellCheck={false}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={t("adminLogin.usernamePlaceholder", "Administrator")}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password">{t("adminLogin.password", "Password")}</Label>
                <div className="relative">
                  <Input
                    id="admin-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-12 pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-label-2 active:scale-95"
                    aria-label={showPassword ? t("adminLogin.hidePassword", "Hide password") : t("adminLogin.showPassword", "Show password")}
                  >
                    {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </Button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {error && (
                  <m.p
                    key="err"
                    role="alert"
                    variants={fadeIn}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    className="rounded-control border border-deal-high/30 bg-deal-high/10 px-3 py-2 text-footnote font-medium text-deal-high-text"
                  >
                    {error}
                  </m.p>
                )}
              </AnimatePresence>

              <Button type="submit" size="lg" className="w-full" loading={attempting} disabled={lockSeconds > 0}>
                <KeyRound aria-hidden />
                {t("adminLogin.submit", "Unlock console")}
              </Button>
            </form>

            <div className="mt-6 flex items-start gap-2 rounded-control bg-surface-2 px-3.5 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <p className="text-footnote text-label-2">
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

            <Button asChild variant="tertiary" size="sm" className="-ml-3 mt-5">
              <Link to="/">
                <ArrowLeft aria-hidden />
                {t("adminLogin.backHome", "Back to Motormila")}
              </Link>
            </Button>
          </Card>
        </m.div>

        <p aria-hidden className="mt-6 text-center text-caption text-label-2">
          {t("adminLogin.brandWhisper", "Motormila operations · Sri Lanka")}
        </p>
      </div>
    </div>
  );
}
