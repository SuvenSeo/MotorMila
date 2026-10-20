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

const POLL_INTERVAL_MS = 60_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
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
    <div ref={dropdownRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-foreground/[0.03] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Bell className="h-3.5 w-3.5" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground ring-2 ring-background"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[1100] w-80 overflow-hidden rounded-3xl border border-border bg-popover/95 shadow-soft-lg backdrop-blur-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[12px] font-semibold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-bright outline-none transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <Bell className="mb-2 h-5 w-5 text-muted-foreground/40" />
                <p className="text-[12px] text-muted-foreground">No notifications yet</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                  You&apos;ll see alert matches here
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
                        "line-clamp-2 text-[12px] leading-snug",
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
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{notif.body}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">{timeAgo(notif.created_at)}</p>
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
                className="text-[11px] font-medium text-primary-bright outline-none transition-opacity hover:opacity-80"
              >
                View all alerts →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/alerts"); }}
                className="text-[11px] font-medium text-primary-bright outline-none transition-opacity hover:opacity-80"
              >
                Channel center →
              </button>
            )}
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70"
              title={pushOn ? "Web push on — price-drop topics active" : "In-app always delivers; push dormant until enabled"}
            >
              <span
                aria-hidden
                className={cn("h-1.5 w-1.5 rounded-full", pushOn ? "bg-emerald-500" : "bg-muted-foreground/40")}
              />
              {pushOn ? "push" : "in-app"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
