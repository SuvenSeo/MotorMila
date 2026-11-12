import { useEffect, useId, useSyncExternalStore } from "react";

/**
 * One stale-data banner per page (ui/shell).
 *
 * Several components can each decide data is behind (the snapshot-mode notice,
 * the freshness banner on the market grid, the one inside the intelligence
 * panel). Each claims this slot while it wants to show; only the highest
 * priority claim (ties: first mounted) actually renders.
 */

type Claim = { id: string; priority: number; order: number };

let claims: Claim[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function winner(): string | null {
  if (!claims.length) return null;
  return [...claims].sort((a, b) => b.priority - a.priority || a.order - b.order)[0].id;
}

/** Returns true when this caller should render its banner. */
export function useStaleBannerSlot(wantsToShow: boolean, priority = 0): boolean {
  const id = useId();

  useEffect(() => {
    if (!wantsToShow) return;
    claims = [...claims, { id, priority, order: counter++ }];
    emit();
    return () => {
      claims = claims.filter((c) => c.id !== id);
      emit();
    };
  }, [id, priority, wantsToShow]);

  const current = useSyncExternalStore(subscribe, winner, () => null);
  return wantsToShow && current === id;
}

/** Test helper. */
export function __resetStaleBannerSlot() {
  claims = [];
  counter = 0;
  emit();
}
