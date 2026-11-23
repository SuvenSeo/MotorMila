import { ArrowRight, ChevronRight, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppPreferences } from "@/lib/appPreferences";
import { visuals } from "@/lib/visualAssets";

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
      <DialogContent className="max-w-[26rem] gap-0 bg-surface-1 p-0 sm:max-w-[44rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
        <div aria-hidden className="relative isolate h-28 overflow-hidden bg-black sm:h-auto">
          <AtmosphericImage
            src={visuals.authNightCoast.src}
            srcSm={visuals.authNightCoast.srcSm}
            className="absolute inset-0 h-full w-full object-cover object-[50%_70%] sm:object-center"
            sizes="(min-width: 640px) 266px, (min-width: 448px) 416px, 100vw"
          />
          <div className="absolute inset-0 bg-black/25" />
          <div className="theme-dark absolute left-5 top-5 sm:left-6 sm:top-6">
            <BrandLogo size="compact" />
          </div>
        </div>

        <div className="min-w-0 px-5 pb-4 pt-5 sm:px-8 sm:pb-6 sm:pt-12">
          <DialogHeader className="gap-2 space-y-0 text-left">
            <DialogTitle className="font-display text-title1 leading-tight">
              {t("signInPortal.title", "Sign in to Motormila")}
            </DialogTitle>
            <DialogDescription className="text-body text-label-2">
              {t(
                "shell.copy.signInPortalBody",
                "Your account keeps your saved vehicles and price-drop alerts. Browsing never needs an account.",
              )}
            </DialogDescription>
          </DialogHeader>

          <Button
            type="button"
            size="lg"
            onClick={() => go("/sign-in")}
            className="mt-6 h-auto min-h-12 w-full justify-between whitespace-normal px-5 py-2.5 text-left text-body"
          >
            {t("signInPortal.signIn", "Sign in with email and password")}
            <ArrowRight aria-hidden />
          </Button>

          <div className="mt-4 border-t border-separator pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => go("/sign-up")}
              className="h-auto min-h-11 w-full justify-start gap-2.5 whitespace-normal rounded-control bg-surface-2 px-3 py-2 text-left text-footnote text-foreground hover:bg-surface-3"
            >
              <Ticket className="text-primary" aria-hidden />
              <span className="flex-1">{t("signInPortal.create", "Complete an invite or start a trial")}</span>
              <ChevronRight className="text-label-2" aria-hidden />
            </Button>
          </div>

          <Button
            type="button"
            variant="link"
            onClick={() => go("/")}
            className="mt-1 h-auto min-h-11 max-w-full justify-start whitespace-normal px-0 text-left text-footnote font-medium text-label-2 hover:text-foreground"
          >
            {t("signInPortal.browse", "Keep browsing without signing in")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
