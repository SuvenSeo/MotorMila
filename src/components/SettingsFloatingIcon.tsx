import { Link, useLocation } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";

export function SettingsFloatingIcon() {
  const { t } = useAppPreferences();
  const location = useLocation();
  const isActive = location.pathname === "/settings";

  // Do not render redundant floating settings shortcut on the settings page itself
  if (isActive) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-[99] max-sm:hidden"
      title={t("nav.settings", "Settings")}
    >
      <Link
        to="/settings"
        aria-label={t("nav.settings", "Settings")}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="floating-action-menu-item flex h-12 w-12 items-center justify-center rounded-full border border-border/80 bg-card/90 text-muted-foreground shadow-soft-lg backdrop-blur transition-all duration-200 hover:border-primary/40 hover:text-foreground active:scale-95">
          <Settings2 className="h-5 w-5" />
        </div>
      </Link>
    </div>
  );
}
