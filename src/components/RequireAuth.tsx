import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";

/** Blocks the whole product shell until the visitor has a Motormila session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady } = useAuth();
  const { t } = useAppPreferences();
  const location = useLocation();

  if (!authReady) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background" aria-label={t("authGate.checkingSessionAria", "Checking session")} role="status">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_30%,hsl(var(--primary)/0.10),transparent_65%)]" />
        <div className="relative flex flex-col items-center gap-5">
          <div className="relative h-11 w-11">
            <div className="absolute inset-0 rounded-full border-2 border-foreground/[0.08]" />
            <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-primary" />
          </div>
          <div className="text-center">
            <p className="font-display text-body font-semibold tracking-tight text-foreground">Motormila</p>
            <p className="mt-1 tech-label">{t("authGate.checkingSession", "Checking session")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
