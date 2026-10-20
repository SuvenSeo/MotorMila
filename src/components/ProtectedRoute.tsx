import { type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Lock, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { revealContainer, revealItem, springSnappy } from "@/lib/motion";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { hasProAccess, isAuthenticated, logout, user } = useAuth();
  const { t } = useAppPreferences();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (!hasProAccess) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-8%,hsl(var(--primary)/0.12),transparent_55%)]" />
        <div className="relative mx-auto grid min-h-screen max-w-[1100px] items-center gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSnappy}
            className="premium-surface p-8 shadow-soft-lg md:p-10"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary-bright">
              <Lock className="h-3 w-3" /> Subscription required
            </span>
            <h1 className="mt-5 font-display text-[2.1rem] font-semibold tracking-tight text-foreground md:text-[2.55rem]">
              {t("proGate.title", "Pro is locked.")}
            </h1>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
              {user?.name || "This account"} is on the {user?.plan || "free"} plan.{" "}
              {t("proGate.body", "Lane intelligence, district profiles, and exports unlock with an active Pro subscription.")}
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <Link
                to="/pricing"
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-[12px] font-semibold tracking-tight text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/95"
              >
                <Crown className="h-3.5 w-3.5" /> View plans
              </Link>
              <Link
                to="/pro-preview"
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-foreground no-underline transition-all hover:border-primary/35"
              >
                <Sparkles className="h-3.5 w-3.5" /> {t("proGate.preview", "Preview Pro")}
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-4 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" /> {t("nav.signOut", "Sign out")}
              </button>
            </div>
          </motion.div>

          <motion.aside
            variants={revealContainer}
            initial="hidden"
            animate="show"
            className="space-y-3"
          >
            {["Vehicle and district drill-downs", "Trend studio with exportable history", "Source coverage and quality signals", "PDF, Word, CSV, JSON exports"].map((item) => (
              <motion.div
                key={item}
                variants={revealItem}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card/70 p-4 shadow-soft backdrop-blur-sm transition-colors hover:border-primary/25"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">{item}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{t("proGate.lockedHint", "Locked until Pro subscription is active.")}</p>
                </div>
              </motion.div>
            ))}
          </motion.aside>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
