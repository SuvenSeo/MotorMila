import { ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppPreferences } from "@/lib/appPreferences";

type SignInPortalModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Lightweight entry point for the sign-in flow. The real form lives on
 * `/sign-in`; this dialog only routes people there (or into the public market)
 * so there is one place where credentials are ever handled.
 */
export function SignInPortalModal({ open, onOpenChange }: SignInPortalModalProps) {
  const navigate = useNavigate();
  const { t } = useAppPreferences();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl border-border bg-card p-7 text-foreground sm:p-8">
        <DialogHeader className="space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/35 bg-primary/12 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle className="font-display text-2xl tracking-tight">
            {t("signInPortal.title", "Sign in to Motormila")}
          </DialogTitle>
          <DialogDescription className="leading-relaxed text-muted-foreground">
            {t(
              "signInPortal.body",
              "Your Motormila account unlocks saved searches, price-drop alerts and the Pro terminal. Browsing the live market never needs an account.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-3">
          <Button
            type="button"
            onClick={() => go("/sign-in")}
            className="h-12 rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.99]"
          >
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            {t("signInPortal.signIn", "Sign in with email and password")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => go("/sign-up")}
            className="h-12 rounded-xl border-border bg-surface text-foreground transition-colors hover:bg-accent active:scale-[0.99]"
          >
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
            {t("signInPortal.create", "Complete an invite or start a trial")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => go("/")}
            className="h-12 rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.99]"
          >
            <UserRound className="mr-2 h-4 w-4" aria-hidden />
            {t("signInPortal.browse", "Keep browsing without signing in")}
          </Button>
        </div>

        <p className="mt-1 text-center text-[12px] text-muted-foreground">
          {t("signInPortal.hint", "Administrators sign in at the console URL directly.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
