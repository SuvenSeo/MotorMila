/**
 * Card ⇄ listing View Transition guards (web/listing-motion-fix): one running
 * transition at a time (a newer navigation ends the running one cleanly), and
 * a second tap during an open never starts a second transition or a second
 * navigation. (Name hygiene is checked in the browser: jsdom drops the
 * `view-transition-name` property.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelActiveTransition, trackTransition, transitionActive } from "@/lib/viewTransition";
import { listingOpenInFlight, navigateWithHeroTransition } from "@/components/listing/listingMotion";

type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("transition registry", () => {
  afterEach(() => {
    cancelActiveTransition();
  });

  it("cancels the running transition synchronously and never settles it", async () => {
    const finished = deferred();
    const skip = vi.fn();
    const cleanup = vi.fn();
    const settled = vi.fn();
    trackTransition({ finished: finished.promise, skipTransition: skip }, cleanup, settled);
    expect(transitionActive()).toBe(true);

    expect(cancelActiveTransition()).toBe(true);
    expect(skip).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(transitionActive()).toBe(false);

    finished.resolve();
    await finished.promise;
    await Promise.resolve();
    // The late `finished` runs the (idempotent) cleanup again but is not a landing.
    expect(settled).not.toHaveBeenCalled();
    expect(cancelActiveTransition()).toBe(false);
  });

  it("settles a transition that runs to its end", async () => {
    const finished = deferred();
    const settled = vi.fn();
    trackTransition({ finished: finished.promise }, () => {}, settled);
    finished.resolve();
    await finished.promise;
    await Promise.resolve();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(transitionActive()).toBe(false);
  });
});

describe("navigateWithHeroTransition", () => {
  const doc = document as Document & { startViewTransition?: unknown };
  let finished: Deferred;
  let start: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    finished = deferred();
    start = vi.fn((cb: () => Promise<void> | void) => {
      void Promise.resolve().then(cb);
      return { finished: finished.promise, ready: Promise.resolve(), skipTransition: vi.fn() };
    });
    doc.startViewTransition = start;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(async () => {
    finished.resolve();
    await finished.promise;
    await Promise.resolve();
    delete doc.startViewTransition;
    document.documentElement.removeAttribute("data-listing-vt");
  });

  it("swallows a second tap while the first open is in flight", async () => {
    const navigate = vi.fn();
    expect(navigateWithHeroTransition(navigate, null)).toBe(true);
    expect(listingOpenInFlight()).toBe(true);
    // Second tap: handled (caller cancels the click), but nothing new starts.
    expect(navigateWithHeroTransition(navigate, null)).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledTimes(1);

    finished.resolve();
    await finished.promise;
    await Promise.resolve();
    expect(listingOpenInFlight()).toBe(false);
    expect(document.documentElement.hasAttribute("data-listing-vt")).toBe(false);
  });

  it("does nothing (plain navigation) under reduced motion", () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const navigate = vi.fn();
    expect(navigateWithHeroTransition(navigate, null)).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
