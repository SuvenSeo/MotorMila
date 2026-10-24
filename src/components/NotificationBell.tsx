import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  UserNotification,
} from "@/services/api";
import { useAuth } from "@/lib/authContext";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";
import type { TranslateFn } from "@/lib/translate";

const POLL_INTERVAL_MS = 60_000;

function timeAgo(iso: string, t: TranslateFn): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return t("common.justNow", "just now");
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t("notifications.minutesAgo", "{n}m ago", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("common.hoursAgo", "{n}h ago", { n: hrs });
  return t("common.daysAgo", "{n}d ago", { n: Math.floor(hrs / 24) });
}

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch {
      // fail silently — notifications are non-critical
    }
  }, [isAuthenticated]);

  // Initial fetch + polling
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((prev) => !prev);
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    } catch {
      // fail silently
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  const pushOn = (() => {
    try {
      return window.localStorage?.getItem("motormila.push_subscribed") === "1";
    } catch {
      return false;
    }
  })();

  const handleNotifClick = async (notif: UserNotification) => {
    if (!notif.read) {
      await handleMarkRead(notif.id);
    }
    trackEvent("listing_view", { notification_id: notif.id, link: notif.link });
    if (notif.link) {
      setOpen(false);
      navigate(notif.link);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div ref={dropdownRef} className="relative hidden sm:flex">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? t("notifications.ariaUnread", "Notifications, {n} unread", { n: unreadCount }) : t("notifications.title", "Notifications")}
        aria-expanded={open}
        className="nav-control nav-control--icon relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-0.5 text-caption font-bold text-primary-foreground ring-2 ring-background"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="mm-pop-in absolute right-0 top-11 z-10 w-80 origin-top-right overflow-hidden rounded-2xl border border-border bg-popover shadow-soft-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-caption font-semibold text-foreground">{t("notifications.title", "Notifications")}</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading}
                className="inline-flex items-center gap-1 text-caption font-medium text-primary-bright outline-none transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <CheckCheck className="h-3 w-3" />
                {t("notifications.markAllRead", "Mark all read")}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <Bell className="mb-2 h-5 w-5 text-muted-foreground/40" />
                <p className="text-caption text-muted-foreground">{t("notifications.empty", "No notifications yet")}</p>
                <p className="mt-0.5 text-caption text-muted-foreground/60">
                  {t("notifications.emptyHint", "You'll see alert matches here")}
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleNotifClick(notif)}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                    !notif.read && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "line-clamp-2 text-caption leading-snug",
                        notif.read ? "font-medium text-muted-foreground" : "font-semibold text-foreground",
                      )}
                    >
                      {!notif.read && (
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                      )}
                      {notif.title}
                    </p>
                    {notif.link && (
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
                    )}
                  </div>
                  {notif.body && (
                    <p className="line-clamp-2 text-caption text-muted-foreground">{notif.body}</p>
                  )}
                  <p className="text-caption text-muted-foreground/60">{timeAgo(notif.created_at, t)}</p>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            {notifications.length > 0 ? (
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/alerts"); }}
                className="text-caption font-medium text-primary-bright outline-none transition-opacity hover:opacity-80"
              >
                {t("notifications.viewAll", "View all alerts →")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/alerts"); }}
                className="text-caption font-medium text-primary-bright outline-none transition-opacity hover:opacity-80"
              >
                {t("notifications.channelCenter", "Channel center →")}
              </button>
            )}
            <span
              className="inline-flex items-center gap-1 text-caption text-muted-foreground/70"
              title={pushOn ? t("notifications.pushOnHint", "Web push on — price-drop topics active") : t("notifications.pushOffHint", "In-app always delivers; push dormant until enabled")}
            >
              <span
                aria-hidden
                className={cn("h-1.5 w-1.5 rounded-full", pushOn ? "bg-deal-good" : "bg-muted-foreground/40")}
              />
              {pushOn ? t("notifications.push", "push") : t("notifications.inApp", "in-app")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
