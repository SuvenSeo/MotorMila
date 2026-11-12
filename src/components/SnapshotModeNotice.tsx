import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { API_BASE, SNAPSHOT_ONLY, fetchSnapshotJSON } from "@/services/api";
import { relativeAgo, parseFlexibleTime } from "@/lib/parseTime";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { useStaleBannerSlot } from "@/lib/staleBannerSlot";

interface SnapshotState {
  /** True when the live API is unreachable/degraded (or the build is snapshot-only). */
  snapshotMode: boolean;
  generatedAt: string | null;
}

let statePromise: Promise<SnapshotState> | null = null;

/** One health probe + manifest read per page load, shared by every notice. */
function loadSnapshotState(): Promise<SnapshotState> {
  if (statePromise) return statePromise;
  statePromise = (async () => {
    const manifestPromise = fetchSnapshotJSON<{ generated_at?: string }>("manifest.json").catch(() => null);
    let healthy = false;
    if (!SNAPSHOT_ONLY) {
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(new URL(`${API_BASE}/health`, window.location.origin).toString(), {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        window.clearTimeout(timer);
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { db?: string; status?: string };
          healthy = body?.db !== "down" && body?.status !== "degraded";
        }
      } catch {
        healthy = false;
      }
    }
    const manifest = await manifestPromise;
    return { snapshotMode: SNAPSHOT_ONLY || !healthy, generatedAt: manifest?.generated_at ?? null };
  })();
  return statePromise;
}

/**
 * "Showing saved market data, last updated X" — rendered only when the live
 * backend is down, so visitors understand why counts or new ads may lag.
 */
export function SnapshotModeNotice({ className }: { className?: string }) {
  const { t } = useAppPreferences();
  const [state, setState] = useState<SnapshotState | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSnapshotState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Shares the page's single stale-data banner slot; outranks the freshness banner.
  const ownsBannerSlot = useStaleBannerSlot(Boolean(state?.snapshotMode), 1);

  if (!state?.snapshotMode || !ownsBannerSlot) return null;
  const ago = relativeAgo(state.generatedAt);
  const ts = parseFlexibleTime(state.generatedAt);
  const absolute =
    ts !== null
      ? new Date(ts).toLocaleString("en-GB", {
          timeZone: "Asia/Colombo",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-border bg-muted/50 px-3.5 py-2.5 text-footnote text-muted-foreground",
        className,
      )}
    >
      <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <p className="leading-relaxed">
        {ago
          ? t("snapshot.noticeAgo", "Showing saved market data from {ago}{abs}. Live updates are paused, so very new ads and price changes may be missing.", {
              ago,
              abs: absolute ? ` (${absolute} SLT)` : "",
            })
          : t("snapshot.notice", "Showing saved market data. Live updates are paused, so very new ads and price changes may be missing.")}
      </p>
    </div>
  );
}
