import { useEffect, useState } from "react";
import { fetchSnapshotJSON } from "@/services/api";
import type { SparklineIndex } from "@/lib/priceHistory";

/**
 * Snapshot index of per-listing price paths (~160 KB brotli, ~5.8k listings
 * with ≥2 observations), shared by every card through a module-level cache.
 *
 * Deliberately not React Query: ListingCard renders in places (tests, isolated
 * embeds) without a QueryClientProvider, and one shared promise is all we need.
 *
 * `defer` waits for browser idle before fetching so result grids never compete
 * with first paint; listing detail passes `defer: false`.
 */
let cache: SparklineIndex | null = null;
let inflight: Promise<SparklineIndex> | null = null;
const listeners = new Set<(index: SparklineIndex) => void>();

function load(): Promise<SparklineIndex> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchSnapshotJSON<{ sparklines?: SparklineIndex }>("price-sparklines.json")
      .then((data) => {
        cache = data?.sparklines ?? {};
        listeners.forEach((fn) => fn(cache!));
        return cache;
      })
      .catch(() => {
        cache = {};
        return cache;
      });
  }
  return inflight;
}

export function usePriceSparklines({ defer = true }: { defer?: boolean } = {}): SparklineIndex | null {
  const [index, setIndex] = useState<SparklineIndex | null>(cache);

  useEffect(() => {
    if (cache) {
      setIndex(cache);
      return;
    }
    let cancelled = false;
    const onLoad = (value: SparklineIndex) => {
      if (!cancelled) setIndex(value);
    };
    listeners.add(onLoad);

    const start = () => {
      void load().then(onLoad);
    };
    let cleanupTimer: (() => void) | undefined;
    if (!defer) {
      start();
    } else {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof w.requestIdleCallback === "function") {
        const id = w.requestIdleCallback(start, { timeout: 4000 });
        cleanupTimer = () => w.cancelIdleCallback?.(id);
      } else {
        const t = window.setTimeout(start, 2500);
        cleanupTimer = () => window.clearTimeout(t);
      }
    }
    return () => {
      cancelled = true;
      listeners.delete(onLoad);
      cleanupTimer?.();
    };
  }, [defer]);

  return index;
}
