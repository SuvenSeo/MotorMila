import { Suspense, useEffect, useState } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { COMMAND_PALETTE_OPEN_EVENT } from "@/lib/commandPalette";

const loadPalette = () => import("@/components/CommandPalette");
const CommandPalette = lazyWithRetry(() => loadPalette().then((m) => ({ default: m.CommandPalette })));

/**
 * Keeps cmdk + the palette (and its makes/model-index queries) out of the
 * entry chunk: listens for ⌘K / the open event and only then mounts the
 * lazy palette, already open. After that the palette owns its own shortcuts.
 */
export function CommandPaletteHost() {
  const [armed, setArmed] = useState(false);

  // Warm the chunk once the page is idle so the first ⌘K opens instantly.
  useEffect(() => {
    const ric = window.requestIdleCallback;
    if (typeof ric !== "function") return;
    const handle = ric(() => void loadPalette().catch(() => {}), { timeout: 6000 });
    return () => window.cancelIdleCallback?.(handle);
  }, []);

  useEffect(() => {
    if (armed) return;
    const arm = () => setArmed(true);
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      arm();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, arm);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, arm);
    };
  }, [armed]);

  if (!armed) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette defaultOpen />
    </Suspense>
  );
}
